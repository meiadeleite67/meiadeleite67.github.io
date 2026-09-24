/**
 * Uma mesa de poker, viva, com gente ligada a ela ao mesmo tempo.
 *
 * O blackjack é cada um por si: chega um pedido, responde-se, e acabou. Uma
 * mesa de poker não é assim. Há cinco pessoas à espera umas das outras, há uma
 * vez de cada um, e há um relógio a andar. Isso precisa de um sítio onde o
 * estado da mesa esteja num lugar só e onde dois pedidos ao mesmo tempo não se
 * pisem: é para isso que existe um Durable Object.
 *
 * O armazenamento normal do Worker não servia para isto. Ele é consistente
 * "com o tempo": duas pessoas a jogar ao mesmo tempo podiam ler a mesa como
 * ela estava há um instante e gravar duas versões diferentes por cima uma da
 * outra. Aqui não: cada mesa é um objecto só, num sítio só, a atender um
 * pedido de cada vez.
 *
 * As ligações são WebSockets, que é o que deixa a mesa avisar toda a gente mal
 * alguém joga, sem ninguém andar a perguntar de cinco em cinco segundos. E são
 * WebSockets a dormir: entre jogadas a mesa é arrumada e não conta tempo
 * nenhum, o que é o que a torna barata mesmo com gente a ver sem jogar.
 *
 * As cartas de cada um nunca saem daqui: cada ligação recebe a mesa vista do
 * lugar dela, e a vista corta o resto. Quem estiver a ver o que passa na rede
 * vê o que veria sentado à mesa, e mais nada.
 */
import { DurableObject } from 'cloudflare:workers';
import { passeBate } from './chaves.js';
import {
  CEGO_GRANDE,
  CEGO_PEQUENO,
  FICHAS_INICIAIS,
  MAX_LUGARES,
  MINIMO_PARA_JOGAR,
  jogar,
  maoNova,
  vista
} from './poker.js';

/** Quanto tempo cada um tem para jogar antes de a mesa jogar por ele. */
const PRAZO = 30_000;
/** E quanto tem quem já deixou passar a vez uma vez. */
const PRAZO_AUSENTE = 10_000;
/** A pausa no fim da mão, para se ver quem ganhou o quê. */
const PAUSA = 8_000;
/** O tempo entre haver gente que chegue e a mão começar. */
const ESPERA = 5_000;
/** Um lugar de quem se desligou fica à espera dele este tempo. */
const GUARDA_O_LUGAR = 60_000;
/* Quem deixa passar a vez três vezes seguidas perde o lugar. Uma mesa de cinco
   não pode ficar tomada por quem se esqueceu do separador aberto: o lugar não
   é de quem lá chegou primeiro, é de quem está a jogar. */
const FALTAS_PARA_SAIR = 3;
/* E quem se senta e não faz nada durante este tempo também sai, mesmo sem
   nenhuma mão ter acontecido. É o caso de quem se senta sozinho a uma mesa e
   fica à espera que apareça alguém, e depois vai-se embora sem sair. */
const PARADO_DEMAIS = 8 * 60_000;
const MAX_LIGACOES = 30;
/* Ninguem a jogar manda mais do que isto num minuto. Quem manda e um cliente
   estragado a responder aos proprios recados em ciclo, e ficava a gastar tempo
   de servidor sem dar por isso. */
const MAX_POR_MINUTO = 120;
const MAX_NARRACAO = 7;
/** O quadro de honra lido do armazenamento fica válido este tempo. */
const QUADRO_DURA = 30_000;

const nomeLimpo = (v) => (typeof v === 'string' ? v.trim().slice(0, 24) : '');

export class MesaDePoker extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.quadro = null;
    this.quadroDe = 0;
    /* Quantas mensagens cada ligacao ja mandou. Vive so na memoria: quando a
       mesa adormece e porque ninguem esta a mandar nada. */
    this.contagens = new Map();

    ctx.blockConcurrencyWhile(async () => {
      this.dados = (await ctx.storage.get('mesa')) || {
        lugares: [],
        mao: null,
        ultimoBotao: -1,
        numero: 0,
        comecaEm: 0,
        fimEm: 0,
        narracao: []
      };
    });

    /* O "olá" de manter a ligação viva é respondido sem acordar a mesa: de
       outra forma um separador aberto numa janela atrás pagava tempo de
       servidor a não fazer nada. */
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ola', 'ok'));
  }

  /* ========================= a porta de entrada ========================= */

  async fetch(request) {
    const url = new URL(request.url);

    if (url.pathname.endsWith('/quantos')) {
      return Response.json({
        sentados: this.dados.lugares.length,
        aJogar: this.dados.mao ? this.dados.mao.jogadores.length : 0,
        maos: this.dados.numero
      });
    }

    if (request.headers.get('Upgrade') !== 'websocket')
      return new Response('Isto é uma mesa, não uma página.', { status: 426 });

    if (this.ctx.getWebSockets().length >= MAX_LIGACOES)
      return new Response('A mesa está cheia de gente a ver.', { status: 503 });

    /* Rede de seguranca: quem chega arruma a mesa. O alarme e que trata disto
       de costume, mas se algum dia se perder um, basta alguem abrir a pagina
       para os lugares de quem ja la nao esta voltarem a ficar livres. */
    if (!this.dados.mao) {
      const antes = this.dados.lugares.length;
      this.arrumarLugares();
      if (this.dados.lugares.length !== antes) await this.gravarEEspalhar();
    }

    const par = new WebSocketPair();
    this.ctx.acceptWebSocket(par[1]);
    par[1].serializeAttachment({ nome: '' });
    // a primeira mesa vai já, para quem chega não ficar a olhar para o vazio
    this.mandar(par[1]);
    return new Response(null, { status: 101, webSocket: par[0] });
  }

  /* ====================== o que chega de cada um ====================== */

  async webSocketMessage(ws, cru) {
    if (typeof cru !== 'string' || cru.length > 400) return;
    if (this.demasiadas(ws)) return;
    let veio;
    try {
      veio = JSON.parse(cru);
    } catch {
      return;
    }

    const quem = ws.deserializeAttachment() || { nome: '' };

    if (veio.a === 'entrar') {
      const nome = nomeLimpo(veio.nome);
      if (!(await this.eMesmoEle(nome, veio.passe)))
        return this.recado(ws, 'Escreve outra vez o teu PIN no blackjack.');
      ws.serializeAttachment({ nome });
      const lugar = this.lugarDe(nome);
      if (lugar) {
        lugar.ligado = true;
        lugar.caiuEm = 0;
      }
      return this.gravarEEspalhar();
    }

    if (!quem.nome) return this.recado(ws, 'Diz primeiro quem és.');

    /* Quem esta a ver a mesa sem jogar pode dizer que ainda ali esta, e o
       relogio de quem esta parado volta ao principio. Um separador esquecido
       nao carrega em nada, que e o que se quer. */
    if (veio.a === 'aqui') {
      this.deuSinal(quem.nome);
      return this.gravarEEspalhar();
    }
    if (veio.a === 'sentar') return this.sentar(ws, quem.nome, veio.lugar);
    if (veio.a === 'levantar') return this.levantar(ws, quem.nome);
    if (veio.a === 'comprar') return this.comprar(ws, quem.nome);
    if (veio.a === 'jogada') return this.jogada(ws, quem.nome, veio);
  }

  demasiadas(ws) {
    const agora = Date.now();
    const c = this.contagens.get(ws) || { desde: agora, quantas: 0 };
    if (agora - c.desde > 60_000) {
      c.desde = agora;
      c.quantas = 0;
    }
    c.quantas++;
    this.contagens.set(ws, c);
    return c.quantas > MAX_POR_MINUTO;
  }

  /* O fecho tem de ser esperado: uma gravacao deixada a meio quando o
     atendimento acaba pode nunca chegar a acontecer. */
  async webSocketClose(ws) {
    return this.aoSair(ws);
  }

  async webSocketError(ws) {
    return this.aoSair(ws);
  }

  async aoSair(ws) {
    this.contagens.delete(ws);
    const quem = ws.deserializeAttachment() || { nome: '' };
    if (!quem.nome) return;
    /* A mesma pessoa pode ter dois separadores abertos: o lugar só fica
       desligado quando o último se for embora. */
    const aindaLa = this.ctx
      .getWebSockets()
      .some((o) => o !== ws && (o.deserializeAttachment() || {}).nome === quem.nome);
    if (aindaLa) return;

    const lugar = this.lugarDe(quem.nome);
    if (!lugar) return;
    lugar.ligado = false;
    lugar.caiuEm = Date.now();
    return this.gravarEEspalhar();
  }

  /* ======================= quem é quem à mesa ======================= */

  /**
   * O passe é o mesmo do quadro de honra: quem não tiver escrito o PIN daquele
   * nome não se senta com ele. Era o buraco de sempre, e não se abre aqui.
   */
  async eMesmoEle(nome, passe) {
    if (nome.length < 2 || !/^[a-f0-9]{32}$/.test(String(passe || ''))) return false;
    /* A lista de nomes fica em memória uns segundos para não se ir buscá-la a
       cada ligação. Quem acabou de escrever o PIN noutro separador ainda não
       estaria nela, por isso, se não bater, vale a pena ir ver outra vez antes
       de lhe dizer que o nome não é dele. */
    const tinhaGuardada = this.quadro && Date.now() - this.quadroDe <= QUADRO_DURA;
    if (await this.confere(nome, passe, false)) return true;
    return tinhaGuardada ? this.confere(nome, passe, true) : false;
  }

  async confere(nome, passe, outraVez) {
    const agora = Date.now();
    if (outraVez || !this.quadro || agora - this.quadroDe > QUADRO_DURA) {
      const guardado = await this.env.QUADRO.get('quadro');
      this.quadro = guardado ? JSON.parse(guardado) : {};
      this.quadroDe = agora;
    }
    const linha = this.quadro[nome];
    return linha ? passeBate(passe, linha) : false;
  }

  lugarDe(nome) {
    return this.dados.lugares.find((l) => l.nome === nome) || null;
  }

  naMaoAgora(nome) {
    const m = this.dados.mao;
    if (!m || m.fase === 'acabou') return null;
    return m.jogadores.find((j) => j.nome === nome && j.estado !== 'passou') || null;
  }

  /* ========================== as jogadas ========================== */

  sentar(ws, nome, onde) {
    const lugar = Math.trunc(Number(onde));
    if (!(lugar >= 0 && lugar < MAX_LUGARES)) return this.recado(ws, 'Esse lugar não existe.');
    if (this.lugarDe(nome)) return this.recado(ws, 'Já estás sentado.');
    if (this.dados.lugares.some((l) => l.lugar === lugar))
      return this.recado(ws, 'Esse lugar já é de alguém.');

    this.dados.lugares.push({
      lugar,
      nome,
      fichas: FICHAS_INICIAIS,
      ligado: true,
      caiuEm: 0,
      ultimoSinal: Date.now(),
      faltas: 0
    });
    this.dados.lugares.sort((a, b) => a.lugar - b.lugar);
    this.contar(`${nome} sentou-se com ${FICHAS_INICIAIS} torrões.`);
    return this.gravarEEspalhar();
  }

  levantar(ws, nome) {
    const lugar = this.lugarDe(nome);
    if (!lugar) return this.recado(ws, 'Não estás sentado.');
    /* Com uma mão a meio, quem se levanta deita as cartas fora: sair da mesa
       não pode ser maneira de fugir a uma aposta. */
    const naMao = this.naMaoAgora(nome);
    if (naMao) {
      jogar(this.dados.mao, naMao.lugar, 'desistir');
      this.depoisDaJogada(`${nome} levantou-se e desistiu.`);
    }
    this.dados.lugares = this.dados.lugares.filter((l) => l.nome !== nome);
    this.contar(`${nome} levantou-se.`);
    return this.gravarEEspalhar();
  }

  comprar(ws, nome) {
    const lugar = this.lugarDe(nome);
    if (!lugar) return this.recado(ws, 'Não estás sentado.');
    if (lugar.fichas > 0) return this.recado(ws, 'Ainda tens fichas.');
    if (this.dados.mao && this.dados.mao.fase !== 'acabou')
      return this.recado(ws, 'Espera que esta mão acabe.');
    lugar.fichas = FICHAS_INICIAIS;
    this.deuSinal(nome);
    this.contar(`${nome} comprou mais ${FICHAS_INICIAIS} torrões.`);
    return this.gravarEEspalhar();
  }

  jogada(ws, nome, veio) {
    const m = this.dados.mao;
    if (!m || m.fase === 'acabou') return this.recado(ws, 'Não há nenhuma mão a decorrer.');
    const j = m.jogadores.find((x) => x.nome === nome);
    if (!j) return this.recado(ws, 'Não estás nesta mão.');

    /* O passo é o número da jogada. Se não bater certo é porque o pedido vem
       repetido ou fora de horas, e uma jogada a mais era uma jogada a mais. */
    if (Math.trunc(Number(veio.passo)) !== m.passo)
      return this.recado(ws, 'Essa jogada já foi feita.');

    const queixa = jogar(m, j.lugar, String(veio.acao || ''), veio.valor);
    if (queixa) return this.recado(ws, queixa);
    this.deuSinal(nome);

    this.depoisDaJogada(this.contarJogada(nome, veio, m));
    return this.gravarEEspalhar();
  }

  /** Quem joga, compra ou se senta está ali. O relógio de quem está parado
   *  volta ao princípio, e as faltas perdoam-se. */
  deuSinal(nome) {
    const lugar = this.lugarDe(nome);
    if (!lugar) return;
    lugar.ultimoSinal = Date.now();
    lugar.faltas = 0;
  }

  contarJogada(nome, veio, m) {
    if (veio.acao === 'desistir') return `${nome} desistiu.`;
    if (veio.acao === 'passar') return `${nome} passou.`;
    if (veio.acao === 'igualar') return `${nome} igualou.`;
    const j = m.jogadores.find((x) => x.nome === nome);
    if (j && j.estado === 'tudo') return `${nome} foi com tudo, ${j.posto}.`;
    return `${nome} subiu para ${m.aposta}.`;
  }

  /** O relógio anda sempre que a vez muda, e a mão que acaba abre a pausa. */
  depoisDaJogada(linha) {
    const m = this.dados.mao;
    if (linha) this.contar(linha);
    if (!m) return;

    if (m.fase === 'acabou') {
      m.prazo = 0;
      // as fichas voltam do sítio da mão para o lugar de cada um
      for (const j of m.jogadores) {
        const l = this.dados.lugares.find((x) => x.nome === j.nome);
        if (l) l.fichas = j.fichas;
      }
      /* Os bolos que vão para os mesmos donos contam-se como um só: quem está
         a ver quer saber quanto ganhou, e não como as camadas ficaram. */
      const juntos = [];
      for (const b of m.bolos) {
        const igual = juntos.find((x) => String(x.para) === String(b.para));
        if (igual) igual.valor += b.valor;
        else juntos.push({ para: b.para, valor: b.valor });
      }
      for (const b of juntos) {
        const quem = b.para.map((lugar) => {
          const j = m.jogadores.find((x) => x.lugar === lugar);
          return j ? j.nome : '';
        });
        const mao = m.jogadores.find((x) => x.lugar === b.para[0]);
        this.contar(
          `${quem.join(' e ')} ${quem.length > 1 ? 'dividem' : 'ganha'} ${b.valor}` +
            (mao && mao.mostra && mao.avaliacao ? ` com ${vistaDaMao(mao)}.` : '.')
        );
      }
      this.dados.ultimoBotao = m.botaoNoLugar;
      this.dados.fimEm = Date.now() + PAUSA;
    } else {
      /* Quem já deixou passar uma vez tem menos tempo na seguinte. Uma falta
         perdoa-se a quem estava distraído; a partir daí a mesa não pode ficar
         meio minuto parada de cada vez à espera de quem já não está. */
      const dele = m.vez >= 0 ? this.lugarDe(m.jogadores[m.vez].nome) : null;
      m.prazo = Date.now() + (dele && dele.faltas > 0 ? PRAZO_AUSENTE : PRAZO);
    }
  }

  /* ===================== o andar da mesa sozinha ===================== */

  podeComecar() {
    if (this.dados.mao) return false;
    return this.dados.lugares.filter((l) => l.ligado && l.fichas > 0).length >= MINIMO_PARA_JOGAR;
  }

  comecar() {
    const prontos = this.dados.lugares.filter((l) => l.ligado && l.fichas > 0);
    if (prontos.length < MINIMO_PARA_JOGAR) return;
    this.dados.numero++;
    this.dados.mao = maoNova({
      numero: this.dados.numero,
      lugares: prontos.map((l) => ({ lugar: l.lugar, nome: l.nome, fichas: l.fichas })),
      ultimoBotao: this.dados.ultimoBotao
    });
    this.dados.comecaEm = 0;
    this.dados.narracao = [];
    this.contar(`Mão ${this.dados.numero}. Cegos de ${CEGO_PEQUENO} e ${CEGO_GRANDE}.`);
    this.depoisDaJogada('');
  }

  /**
   * Quem se desligou e não voltou perde o lugar, e quem está ligado mas não dá
   * sinal de vida há muito tempo também. Sem isto, cinco separadores esquecidos
   * tomavam a mesa até alguém se lembrar de sair.
   */
  arrumarLugares() {
    const agora = Date.now();
    const ficam = [];
    for (const l of this.dados.lugares) {
      if (!l.ligado && agora - (l.caiuEm || 0) >= GUARDA_O_LUGAR) continue;
      if (l.ligado && agora - (l.ultimoSinal || agora) >= PARADO_DEMAIS) {
        this.contar(`${l.nome} esteve demasiado tempo parado e saiu da mesa.`);
        this.recadoPara(l.nome, 'Estiveste muito tempo sem jogar e saíste da mesa.');
        continue;
      }
      ficam.push(l);
    }
    if (ficam.length !== this.dados.lugares.length) this.dados.lugares = ficam;
  }

  /** Tira alguém da mesa e diz-lhe porquê. */
  levantarPorFalta(nome, porque) {
    this.dados.lugares = this.dados.lugares.filter((l) => l.nome !== nome);
    this.contar(`${nome} ${porque}`);
    this.recadoPara(nome, 'Deixaste passar a vez vezes de mais e saíste da mesa.');
  }

  async alarm() {
    const agora = Date.now();
    const m = this.dados.mao;

    if (m && m.fase !== 'acabou' && m.vez >= 0 && agora >= m.prazo - 1000) {
      /* O tempo acabou. Quem não deve nada fica como está; quem deve, desiste.
         É o que uma mesa faz a quem se ausenta. */
      const j = m.jogadores[m.vez];
      const acao = m.aposta - j.posto > 0 ? 'desistir' : 'passar';
      jogar(m, j.lugar, acao);
      this.depoisDaJogada(
        acao === 'desistir' ? `${j.nome} demorou e desistiu.` : `${j.nome} demorou e passou.`
      );

      /* Uma falta perdoa-se, três não: o lugar volta a ficar livre para quem
         queira mesmo jogar. */
      const lugar = this.lugarDe(j.nome);
      if (lugar) {
        lugar.faltas = (lugar.faltas || 0) + 1;
        if (lugar.faltas >= FALTAS_PARA_SAIR)
          this.levantarPorFalta(j.nome, 'deixou passar a vez vezes de mais e saiu da mesa.');
      }
    } else if (m && m.fase === 'acabou' && agora >= (this.dados.fimEm || 0) - 1000) {
      this.dados.mao = null;
      this.dados.fimEm = 0;
      this.arrumarLugares();
    } else if (!m) {
      this.arrumarLugares();
      if (this.dados.comecaEm && agora >= this.dados.comecaEm - 1000) this.comecar();
    }

    await this.gravarEEspalhar();
  }

  async agendar() {
    const agora = Date.now();
    const m = this.dados.mao;
    let quando = 0;

    if (m && m.fase !== 'acabou' && m.vez >= 0) quando = m.prazo;
    else if (m && m.fase === 'acabou') quando = this.dados.fimEm;
    else if (this.podeComecar()) {
      if (!this.dados.comecaEm) this.dados.comecaEm = agora + ESPERA;
      quando = this.dados.comecaEm;
    } else {
      this.dados.comecaEm = 0;
    }

    /* Haja mão ou não, há sempre a arrumação dos lugares para fazer: quem se
       desligou e não voltou, e quem está parado há muito tempo. O alarme fica
       para o que vier primeiro. */
    const arrumacao = [];
    for (const l of this.dados.lugares) {
      if (!l.ligado) arrumacao.push((l.caiuEm || 0) + GUARDA_O_LUGAR);
      else arrumacao.push((l.ultimoSinal || agora) + PARADO_DEMAIS);
    }
    if (arrumacao.length) {
      const cedo = Math.min(...arrumacao);
      quando = quando ? Math.min(quando, cedo) : cedo;
    }

    if (quando) await this.ctx.storage.setAlarm(Math.max(quando, agora + 300));
    else await this.ctx.storage.deleteAlarm();
  }

  /* ========================= o que sai daqui ========================= */

  contar(linha) {
    if (!linha) return;
    this.dados.narracao = [...this.dados.narracao, linha].slice(-MAX_NARRACAO);
  }

  /** Um recado para todos os separadores de uma pessoa. */
  recadoPara(nome, texto) {
    for (const ws of this.ctx.getWebSockets())
      if ((ws.deserializeAttachment() || {}).nome === nome) this.recado(ws, texto);
  }

  recado(ws, texto) {
    try {
      ws.send(JSON.stringify({ t: 'recado', texto }));
    } catch {
      /* ligação já morta */
    }
  }

  /** A mesa como ela é vista do lugar de quem está deste lado da ligação. */
  mandar(ws) {
    const quem = ws.deserializeAttachment() || { nome: '' };
    const meu = this.lugarDe(quem.nome);
    try {
      ws.send(
        JSON.stringify({
          t: 'mesa',
          agora: Date.now(),
          numero: this.dados.numero,
          comecaEm: this.dados.comecaEm,
          fimEm: this.dados.fimEm,
          narracao: this.dados.narracao,
          eu: quem.nome ? { nome: quem.nome, lugar: meu ? meu.lugar : -1 } : null,
          lugares: this.dados.lugares.map((l) => ({
            lugar: l.lugar,
            nome: l.nome,
            fichas: l.fichas,
            ligado: l.ligado,
            faltas: l.faltas || 0,
            /* A hora a que o lugar se perde por estar parado, para o site poder
               avisar quem esta quase la. */
            saiEm: l.ligado ? (l.ultimoSinal || 0) + PARADO_DEMAIS : 0
          })),
          mao: vista(this.dados.mao, meu ? meu.lugar : -1)
        })
      );
    } catch {
      /* ligação já morta */
    }
  }

  espalhar() {
    for (const ws of this.ctx.getWebSockets()) this.mandar(ws);
  }

  async gravarEEspalhar() {
    await this.agendar();
    await this.ctx.storage.put('mesa', this.dados);
    this.espalhar();
  }
}

/* O nome da mão de quem ganhou, para a narração. Vem da avaliação que já foi
   feita na altura de mostrar as cartas, e não se faz outra vez. */
function vistaDaMao(j) {
  const m = j.avaliacao;
  if (!m) return '';
  return NOMES_CURTOS[m.categoria] || 'a melhor mão';
}

const NOMES_CURTOS = [
  'carta alta',
  'um par',
  'dois pares',
  'um trio',
  'uma sequência',
  'uma cor',
  'um full house',
  'uma quadra',
  'uma sequência de cor'
];
