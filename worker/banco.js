/**
 * O Banco: os torrões de toda a gente, num sítio só.
 *
 * Antes cada jogo tinha o seu canto. O blackjack guardava os torrões no
 * armazenamento normal do Worker e o poker dava fichas próprias a cada mesa,
 * que não valiam nada fora dela. Agora a carteira é uma só e serve os três
 * jogos onde é o servidor que dá as cartas: blackjack, poker e roleta.
 *
 * Uma carteira partilhada não pode viver no armazenamento normal. Ele é
 * consistente com o tempo, e quem se sentasse em duas mesas ao mesmo tempo
 * lia o mesmo saldo duas vezes e gastava os mesmos torrões duas vezes. Aqui
 * não: isto é um objecto só, num sítio só, a atender um pedido de cada vez, e
 * nenhuma conta sai daqui a meio.
 *
 * É também o Banco que sabe de quem é cada nome. O PIN e os passes vivem aqui,
 * porque quem guarda o dinheiro tem de ser quem confirma o dono.
 *
 * Nada disto é público: só se chega aqui pelo Worker, que é quem atende a rua.
 */
import { DurableObject } from 'cloudflare:workers';
import {
  PIN_MAXIMO,
  PIN_MINIMO,
  aoCalhasEmHex,
  passeBate,
  passeNovo,
  pinBate,
  pinLimpo,
  pinNovo,
  pinServe
} from './chaves.js';
import { fecharBilhete, limparBilhete } from './apostas.js';

export const SALDO_INICIAL = 250;
export const EMPRESTIMO = 100;
export const SALDO_PARA_EMPRESTAR = 5;
const MAX_NOMES = 200;
/** Quantos PINs errados antes de o nome ficar de castigo, e por quanto tempo. */
const MAX_PIN_ERRADO = 5;
const CASTIGO_PIN = 15 * 60 * 1000;

/** Os jogos de um só jogador entram no quadro com o recorde e não com
 *  torrões: correm todos dentro do browser, e o que o browser diz não se pode
 *  confirmar deste lado. Um recorde inventado é feio; torrões inventados eram
 *  o buraco que fechámos no blackjack. */
const COM_RECORDE = ['jogo', 'cusco', 'colherada'];

const texto = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const inteiro = (v) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? n : 0;
};
const naoNegativo = (v) => Math.max(0, Math.min(99_999_999, inteiro(v)));

const minutosAte = (quando) => {
  const m = Math.max(1, Math.ceil((quando - Date.now()) / 60000));
  return `${m} minuto${m === 1 ? '' : 's'}`;
};

export const linhaNova = (nome) => ({
  nome,
  torroes: SALDO_INICIAL,
  /* O blackjack veio de antes de haver mais jogos, e por isso as contas dele
     ficaram onde estavam: mexer-lhes obrigava a converter o quadro todo. */
  maos: 0,
  vitorias: 0,
  bjs: 0,
  pico: SALDO_INICIAL,
  poquer: { maos: 0, ganhas: 0, maiorPote: 0 },
  roleta: { rodadas: 0, ganhas: 0, maior: 0 },
  desporto: { apostas: 0, ganhas: 0, maior: 0 },
  recordes: { jogo: 0, cusco: 0, colherada: 0 },
  /* O PIN deste nome, e os passes dos aparelhos que já o acertaram. Nem o PIN
     nem os passes ficam guardados: só os resumos deles. */
  pin: null,
  passes: [],
  erros: null,
  /* O resumo da chave antiga, do tempo em que o nome era do browser que o
     estreasse. Fica para não se apagar nada, mas já não abre nada. */
  resumo: '',
  atualizado: new Date().toISOString()
});

/** O que pode sair daqui para fora. */
export const semSegredos = ({ resumo, pendente, pin, passes, erros, ...resto }) => resto;

/** Uma linha antiga, do tempo em que só havia blackjack, com o que lhe falta. */
const completa = (linha, nome) => ({
  ...linhaNova(nome),
  ...linha,
  poquer: { maos: 0, ganhas: 0, maiorPote: 0, ...(linha.poquer || {}) },
  roleta: { rodadas: 0, ganhas: 0, maior: 0, ...(linha.roleta || {}) },
  desporto: { apostas: 0, ganhas: 0, maior: 0, ...(linha.desporto || {}) },
  recordes: { jogo: 0, cusco: 0, colherada: 0, ...(linha.recordes || {}) }
});

/**
 * Uma aposta com pernas, venha ela de que tempo vier.
 *
 * Antes das multiplas, uma aposta era um jogo so e os campos do jogo estavam
 * a mistura com os da aposta. Agora e sempre uma lista de pernas, mesmo quando
 * ha uma so, para haver um caminho unico e nao dois parecidos. Isto converte
 * as antigas na chegada, e deixa as novas como estao.
 */
function comPernas(a) {
  if (!a || Array.isArray(a.pernas)) return a;
  const { jogo, chave, desporto, liga, casa, fora, comeca, escolha, cotacao, tinhaEmpate, ...resto } = a;
  return {
    ...resto,
    cotacao,
    pernas: [
      {
        jogo,
        chave,
        desporto: desporto || '',
        liga: liga || '',
        casa,
        fora,
        comeca,
        escolha,
        cotacao,
        tinhaEmpate: !!tinhaEmpate,
        /* A perna herda o estado da aposta, que com uma perna so era a mesma
           coisa. */
        estado: a.estado === 'aberta' ? 'aberta' : a.estado
      }
    ]
  };
}

/** A marca de que as apostas penduradas na troca de fonte ja foram devolvidas.
 *  Vive no armazenamento deste objecto e nao no KV: aqui uma escrita ve-se de
 *  imediato, e uma coisa que so pode acontecer uma vez nao pode depender de
 *  uma bandeira que talvez ainda nao tenha chegado. */
const JA_DEVOLVIDO = 'devolvidas-na-troca-de-fonte';

/** Quantas apostas ja fechadas se guardam ao todo. Servem para cada um ver o
 *  que lhe aconteceu, e por isso guardam-se; mas nao para sempre, que isto
 *  vive todo em memoria e nao pode crescer sem fim. */
const HISTORIA_NO_MAXIMO = 600;

export class Banco extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    ctx.blockConcurrencyWhile(async () => {
      this.nomes = await ctx.storage.get('nomes');
      if (!this.nomes) {
        /* Primeira vez: traz o quadro de onde ele vivia. O que está no
           armazenamento antigo fica lá, sem se lhe tocar: é a rede por baixo
           desta mudança. */
        const antes = await env.QUADRO.get('quadro');
        this.nomes = antes ? JSON.parse(antes) : {};
        await ctx.storage.put('nomes', this.nomes);
      }
      /* As apostas desportivas vivem aqui e nao no KV pela mesma razao por que
         os torroes vivem aqui: pagar uma aposta e mexer na carteira, e as duas
         coisas tem de acontecer juntas ou nao acontecer nenhuma. */
      const guardadas = (await ctx.storage.get('apostas')) || [];
      this.apostas = guardadas.map(comPernas);
      /* Se alguma vinha do tempo em que uma aposta era um jogo so, fica
         convertida ja gravada, para nao se andar a converter em cada arranque. */
      if (guardadas.some((a) => !Array.isArray(a.pernas)))
        await ctx.storage.put('apostas', this.apostas);

      /* ---- devolver as apostas que ficaram penduradas na troca de fonte ----

         A troca de fonte deixou treze apostas abertas cujos jogos vinham da
         feed antiga. Fechavam-se ao fim de uma semana, anuladas, mas ninguem
         tem de esperar uma semana por torroes que sao seus: devolvem-se agora.

         Corre uma vez so. A marca fica no armazenamento deste objecto, que e
         consistente de imediato, ao contrario do KV: uma bandeira no KV podia
         nao ser vista a tempo e isto corria duas vezes. */
      if (!(await ctx.storage.get(JA_DEVOLVIDO))) {
        let devolvidas = 0;
        let torroes = 0;
        for (const aposta of this.apostas) {
          if (aposta.estado !== 'aberta') continue;
          aposta.estado = 'anulada';
          aposta.volta = aposta.quanto;
          aposta.lucro = 0;
          aposta.fechada = new Date().toISOString();
          aposta.pernas = aposta.pernas.map((p) =>
            p.estado === 'aberta' ? { ...p, estado: 'anulada' } : p
          );

          const linha = this.nomes[aposta.nome];
          if (linha) {
            const cheia = completa(linha, aposta.nome);
            cheia.torroes += aposta.quanto;
            cheia.atualizado = new Date().toISOString();
            if (cheia.torroes > (cheia.pico || 0)) cheia.pico = cheia.torroes;
            this.nomes[aposta.nome] = cheia;
            torroes += aposta.quanto;
          }
          devolvidas += 1;
        }
        if (devolvidas > 0) {
          await ctx.storage.put('nomes', this.nomes);
          await ctx.storage.put('apostas', this.apostas);
        }
        await ctx.storage.put(JA_DEVOLVIDO, {
          quando: new Date().toISOString(),
          devolvidas,
          torroes
        });
        console.log(`DEVOLVIDAS ${devolvidas} apostas, ${torroes} torroes`);
      }
    });
  }

  async gravar() {
    await this.ctx.storage.put('nomes', this.nomes);
  }

  async gravarApostas() {
    await this.ctx.storage.put('apostas', this.apostas);
  }

  /** A linha de um nome, já completa e já confirmada como sendo de quem pede. */
  async daPessoa(nome, passe) {
    const linha = this.nomes[nome];
    if (!linha) return { erro: 'Senta-te à mesa primeiro.', estado: 401 };
    if (!(await passeBate(passe, linha))) return { erro: 'Escreve outra vez o teu PIN.', estado: 403 };
    return { linha: completa(linha, nome) };
  }

  /** Guarda a linha, com o pico e a hora sempre em dia. */
  async pousar(nome, linha) {
    linha.torroes = naoNegativo(linha.torroes);
    if (linha.torroes > (linha.pico || 0)) linha.pico = linha.torroes;
    linha.atualizado = new Date().toISOString();
    this.nomes[nome] = linha;
    await this.gravar();
    return linha;
  }

  /* ==================== as apostas desportivas ====================

     Uma aposta desportiva e a unica coisa neste banco que nao se resolve no
     momento. Poe-se hoje, fecha-se quando o jogo acabar, e no meio ha horas ou
     dias em que os torroes nao estao na carteira nem estao no premio: estao
     presos na aposta. E por isso que elas vivem aqui dentro e nao noutro sitio
     qualquer. Tirar da carteira e guardar a aposta tem de ser a mesma conta, e
     pagar o premio e fechar a aposta tambem, senao havia sempre um instante em
     que os torroes estavam nos dois sitios ou em nenhum. */

  abertasDe(nome) {
    return this.apostas.filter((a) => a.nome === nome && a.estado === 'aberta');
  }

  /**
   * Poe uma aposta, de uma perna ou de varias. Os torroes saem da carteira
   * agora, que e o que faz com que ninguem possa apostar o que nao tem
   * enquanto os jogos nao acabam.
   *
   * Os jogos vem de quem atende a rua, ja lidos da feed, e as cotacoes saem de
   * dentro deles. Nao se aceita cotacao vinda do site: bastava mexer no pedido
   * para apostar a cinquenta para um.
   */
  async apostar(veio) {
    const nome = texto(veio.nome, 24);
    const achado = await this.daPessoa(nome, veio.passe);
    if (achado.erro) return achado;
    const linha = achado.linha;

    const jogos = new Map((veio.jogos || []).map((j) => [j.id, j]));
    const limpo = limparBilhete(veio, jogos, linha.torroes, this.abertasDe(nome).length);
    if (limpo.erro) return { erro: limpo.erro, estado: 400 };

    linha.torroes -= limpo.quanto;
    linha.desporto.apostas += 1;

    const aposta = {
      id: aoCalhasEmHex(16),
      nome,
      pernas: limpo.pernas,
      cotacao: limpo.cotacao,
      quanto: limpo.quanto,
      estado: 'aberta',
      posta: new Date().toISOString(),
      fechada: null,
      volta: 0,
      lucro: 0
    };

    this.apostas.push(aposta);
    await this.gravarApostas();
    return { linha: semSegredos(await this.pousar(nome, linha)), aposta };
  }

  /** As apostas de quem prova ser dono do nome, as abertas a frente. */
  async minhasApostas(veio) {
    const nome = texto(veio.nome, 24);
    const achado = await this.daPessoa(nome, veio.passe);
    if (achado.erro) return achado;
    const ordem = { aberta: 0, ganha: 1, anulada: 2, perdida: 3 };
    const minhas = this.apostas
      .filter((a) => a.nome === nome)
      .sort((a, b) =>
        a.estado === b.estado
          ? Date.parse(b.posta) - Date.parse(a.posta)
          : ordem[a.estado] - ordem[b.estado]
      );
    return { apostas: minhas, linha: semSegredos(achado.linha) };
  }

  /**
   * O trinco da volta das apostas.
   *
   * Isto vive aqui e nao no KV por uma razao de fundo: este objecto atende um
   * pedido de cada vez, e por isso duas voltas que tentem pegar o trinco ao
   * mesmo tempo sao atendidas uma depois da outra e so uma o leva. Uma bandeira
   * no KV nao dava essa garantia: ali uma escrita pode levar um minuto a ser
   * vista, e duas voltas liam "esta livre" as duas. Foi isso que encheu o
   * travao de pedidos por minuto da feed nova, e nao a quota do dia, que estava
   * quase intacta.
   */
  async pegarTrinco(veio) {
    const agora = Date.now();
    const ate = (await this.ctx.storage.get('trinco-da-volta')) || 0;
    if (ate > agora) return { pegou: false, faltam: Math.round((ate - agora) / 1000) };
    const quanto = Math.min(600, Math.max(30, inteiro(veio.segundos) || 180));
    await this.ctx.storage.put('trinco-da-volta', agora + quanto * 1000);
    return { pegou: true };
  }

  async largarTrinco() {
    await this.ctx.storage.delete('trinco-da-volta');
    return { ok: true };
  }

  /** As contas das apostas guardadas, sem nomes nem nada de ninguem: quantas
   *  ha, quantas estao abertas, e quantas nao tem pernas. A ultima e a que
   *  interessa: uma aposta sem pernas vem do tempo em que uma aposta era um
   *  jogo so, e se alguma ficou assim e porque a conversao nao lhe chegou. */
  contasDasApostas() {
    return {
      quantas: this.apostas.length,
      abertas: this.apostas.filter((a) => a.estado === 'aberta').length,
      semPernas: this.apostas.filter((a) => !Array.isArray(a.pernas) || a.pernas.length === 0).length,
      deQuantosNomes: new Set(this.apostas.map((a) => a.nome)).size
    };
  }

  /**
   * Os jogos onde ha apostas por fechar, por liga.
   *
   * E por aqui que se sabe a quem vale a pena perguntar, em vez de perguntar a
   * todas e gastar creditos com jogos que ninguem apostou. Vai o numero do jogo
   * e a hora a que ele comecou, que e o que deixa la fora decidir se ja ha
   * alguma coisa para saber ou se ainda esta a decorrer.
   *
   * Conta as pernas e nao os bilhetes: numa multipla de tres, sao tres jogos a
   * seguir, possivelmente em tres ligas diferentes.
   */
  ligasPorFechar() {
    const porLiga = new Map();
    let quantas = 0;
    this.apostas.forEach((a) => {
      if (a.estado !== 'aberta') return;
      quantas += 1;
      a.pernas.forEach((perna) => {
        if (perna.estado !== 'aberta' || !perna.chave) return;
        const ja = porLiga.get(perna.chave) || new Map();
        /* Vai tambem a fonte e o desporto: e por eles que quem atende a rua
           sabe a que API perguntar o resultado desta perna. */
        ja.set(perna.jogo, {
          comeca: perna.comeca,
          fonte: perna.fonte || '',
          desporto: perna.desporto || ''
        });
        porLiga.set(perna.chave, ja);
      });
    });
    return {
      quantas,
      chaves: [...porLiga.keys()],
      ligas: [...porLiga.entries()].map(([chave, jogos]) => ({
        chave,
        jogos: [...jogos.entries()].map(([jogo, o]) => ({ jogo, ...o }))
      }))
    };
  }

  /**
   * Fecha as apostas a que ja se sabe o fim.
   *
   * Recebe uma lista de {jogo, ganhou}, que quem atende a rua tirou dos
   * resultados da feed. As apostas de jogos que nao estao na lista passam por
   * aqui na mesma, para o caso de ja ter passado o prazo de desistir delas: e a
   * unica maneira de nao ficarem torroes presos para sempre num jogo que foi
   * adiado e nunca mais se fez.
   */
  async fechar(veio) {
    const sabidos = new Map();
    (Array.isArray(veio.resultados) ? veio.resultados : []).forEach((r) => {
      if (r && r.jogo) sabidos.set(String(r.jogo), r.ganhou ?? null);
    });
    const ganhouDe = (jogo) => (sabidos.has(jogo) ? sabidos.get(jogo) : null);

    const agora = Date.now();
    const fechadas = [];

    for (const aposta of this.apostas) {
      if (aposta.estado !== 'aberta') continue;
      const fim = fecharBilhete(aposta, ganhouDe, agora);
      if (!fim) continue;

      aposta.pernas = fim.pernas;

      /* Uma aposta que continua aberta com uma perna ja decidida nao se fecha:
         so se guarda o que ja se sabe, para se ver no site quais e que ja
         cairam. */
      if (fim.estado === 'aberta') continue;

      aposta.estado = fim.estado;
      aposta.volta = fim.volta;
      aposta.lucro = fim.lucro;
      aposta.fechada = new Date(agora).toISOString();
      if (fim.cotacaoFinal) aposta.cotacaoFinal = fim.cotacaoFinal;

      const linha = this.nomes[aposta.nome];
      if (linha) {
        const cheia = completa(linha, aposta.nome);
        cheia.torroes += fim.volta;
        /* Uma aposta anulada nao conta como ganha nem como perdida: os jogos e
           que nao se fizeram. A conta de apostas feitas foi somada quando ela
           foi posta, e essa fica. */
        if (fim.estado === 'ganha') {
          cheia.desporto.ganhas += 1;
          if (fim.volta > cheia.desporto.maior) cheia.desporto.maior = fim.volta;
        }
        await this.pousar(aposta.nome, cheia);
      }
      fechadas.push({ id: aposta.id, nome: aposta.nome, estado: fim.estado, volta: fim.volta });
    }

    this.arrumarApostas();
    await this.gravarApostas();
    return { fechadas: fechadas.length, detalhe: fechadas };
  }

  /** As apostas ja fechadas nao ficam para sempre: as mais velhas saem quando
   *  passam do que cabe. As abertas nunca saem, que essas tem torroes dentro. */
  arrumarApostas() {
    const abertas = this.apostas.filter((a) => a.estado === 'aberta');
    const resto = this.apostas
      .filter((a) => a.estado !== 'aberta')
      .sort((a, b) => Date.parse(b.fechada || b.posta) - Date.parse(a.fechada || a.posta))
      .slice(0, HISTORIA_NO_MAXIMO);
    this.apostas = [...abertas, ...resto];
  }

  /* ======================= a porta de entrada ======================= */

  /**
   * Nome e PIN. Um nome novo fica com este PIN, um nome sem PIN fica com este,
   * e um nome com PIN tem de o acertar. Quem acerta leva um passe.
   */
  async entrar(veio) {
    const nome = texto(veio.nome, 24);
    const pin = pinLimpo(veio.pin);
    if (nome.length < 2) return { erro: 'Falta o nome.', estado: 400 };
    if (!pinServe(pin))
      return { erro: `O PIN são ${PIN_MINIMO} a ${PIN_MAXIMO} algarismos.`, estado: 400 };

    const havia = this.nomes[nome];
    if (!havia && Object.keys(this.nomes).length >= MAX_NOMES)
      return { erro: 'O quadro está cheio.', estado: 409 };

    const linha = completa(havia || linhaNova(nome), nome);
    const agora = Date.now();
    let estreou = '';

    if (!linha.pin) {
      linha.pin = await pinNovo(pin);
      estreou = havia ? 'pin' : 'nome';
    } else {
      if (linha.erros && linha.erros.ate > agora)
        return {
          erro: `Esse nome está de castigo. Tenta daqui a ${minutosAte(linha.erros.ate)}.`,
          estado: 429
        };

      if (!(await pinBate(pin, linha.pin))) {
        const quantas = ((linha.erros && linha.erros.quantas) || 0) + 1;
        const trancado = quantas >= MAX_PIN_ERRADO;
        linha.erros = trancado ? { quantas: 0, ate: agora + CASTIGO_PIN } : { quantas, ate: 0 };
        this.nomes[nome] = linha;
        await this.gravar();
        return {
          erro: trancado
            ? `PIN errado. Esse nome fica de castigo ${Math.round(CASTIGO_PIN / 60000)} minutos.`
            : `PIN errado. ${
                MAX_PIN_ERRADO - quantas === 1
                  ? 'Falta uma tentativa'
                  : `Faltam ${MAX_PIN_ERRADO - quantas} tentativas`
              }.`,
          estado: 401,
          enganou: true
        };
      }
      linha.erros = null;
    }

    const passe = await passeNovo(linha);
    await this.pousar(nome, linha);
    return { linha: semSegredos(linha), passe, estreou };
  }

  /* ========================== o dinheiro ==========================

     Tudo o que mexe em torrões passa por aqui, e daqui nunca sai um saldo
     negativo: quem pedir mais do que tem leva um não, e é esse não que
     impede que os mesmos torrões se gastem em dois sítios ao mesmo tempo. */

  /**
   * Muda o saldo de quem prova ser dono do nome. O acrescento pode ser
   * negativo, mas nunca deixa o saldo abaixo de zero.
   */
  async mexer(veio) {
    const nome = texto(veio.nome, 24);
    const achado = await this.daPessoa(nome, veio.passe);
    if (achado.erro) return achado;

    const linha = achado.linha;
    const delta = inteiro(veio.delta);
    /* O custo é o que se pôs em jogo antes de se saber o resultado. Confere-se
       à parte do acrescento porque quem ganha traz um acrescento positivo, e
       sem isto dava para apostar o que não se tem desde que se ganhasse. */
    const custo = naoNegativo(veio.custo);
    if (linha.torroes < custo) return { erro: 'Não tens torrões que cheguem.', estado: 400 };
    if (linha.torroes + delta < 0) return { erro: 'Não tens torrões que cheguem.', estado: 400 };

    linha.torroes += delta;
    this.somarContas(linha, veio.contas);
    return { linha: semSegredos(await this.pousar(nome, linha)) };
  }

  /** Os cem emprestados, só para quem está mesmo sem nada. */
  async emprestimo(veio) {
    const nome = texto(veio.nome, 24);
    const achado = await this.daPessoa(nome, veio.passe);
    if (achado.erro) return achado;
    const linha = achado.linha;
    if (linha.torroes >= SALDO_PARA_EMPRESTAR) return { erro: 'Ainda tens torrões.', estado: 400 };
    linha.torroes += EMPRESTIMO;
    return { linha: semSegredos(await this.pousar(nome, linha)) };
  }

  /**
   * Tira torrões a um nome sem passar pelo passe. Só lhe chega quem já é do
   * nosso lado, e é assim que uma mesa de poker compra fichas a quem se senta:
   * a mesa já confirmou quem ele é antes de o deixar entrar.
   *
   * Devolve quanto levou mesmo, que pode ser menos do que o pedido.
   */
  async cobrar(veio) {
    const nome = texto(veio.nome, 24);
    const linha = this.nomes[nome];
    if (!linha) return { erro: 'Esse nome não está no quadro.', estado: 404 };
    const cheia = completa(linha, nome);
    const quanto = Math.min(naoNegativo(veio.quanto), cheia.torroes);
    if (quanto <= 0) return { erro: 'Não tens torrões que cheguem.', estado: 400, levou: 0 };
    cheia.torroes -= quanto;
    await this.pousar(nome, cheia);
    return { levou: quanto, linha: semSegredos(cheia) };
  }

  /** E o contrário: o que sobra das fichas volta para a carteira. */
  async creditar(veio) {
    const nome = texto(veio.nome, 24);
    const linha = this.nomes[nome];
    if (!linha) return { erro: 'Esse nome não está no quadro.', estado: 404 };
    const cheia = completa(linha, nome);
    cheia.torroes += naoNegativo(veio.quanto);
    this.somarContas(cheia, veio.contas);
    return { linha: semSegredos(await this.pousar(nome, cheia)) };
  }

  /** As contas de cada jogo, somadas à linha. */
  somarContas(linha, contas) {
    if (!contas || typeof contas !== 'object') return;
    if (contas.bj) {
      linha.maos += naoNegativo(contas.bj.maos);
      linha.vitorias += naoNegativo(contas.bj.vitorias);
      linha.bjs += naoNegativo(contas.bj.bjs);
    }
    if (contas.poquer) {
      linha.poquer.maos += naoNegativo(contas.poquer.maos);
      linha.poquer.ganhas += naoNegativo(contas.poquer.ganhas);
      linha.poquer.maiorPote = Math.max(linha.poquer.maiorPote, naoNegativo(contas.poquer.maiorPote));
    }
    if (contas.roleta) {
      linha.roleta.rodadas += naoNegativo(contas.roleta.rodadas);
      linha.roleta.ganhas += naoNegativo(contas.roleta.ganhas);
      linha.roleta.maior = Math.max(linha.roleta.maior, naoNegativo(contas.roleta.maior));
    }
  }

  /* ========================== os recordes ========================== */

  /**
   * O recorde de um jogo de um só jogador. Guarda-se o melhor e mais nada:
   * o número vem do browser, e o browser diz o que quiser. Serve para se
   * comparar quem joga melhor, não para valer dinheiro.
   */
  async recorde(veio) {
    const nome = texto(veio.nome, 24);
    const jogo = texto(veio.jogo, 20);
    if (!COM_RECORDE.includes(jogo)) return { erro: 'Esse jogo não tem recorde.', estado: 400 };
    const achado = await this.daPessoa(nome, veio.passe);
    if (achado.erro) return achado;

    const linha = achado.linha;
    const pontos = naoNegativo(veio.pontos);
    if (pontos <= linha.recordes[jogo]) return { linha: semSegredos(linha), mudou: false };
    linha.recordes[jogo] = pontos;
    return { linha: semSegredos(await this.pousar(nome, linha)), mudou: true };
  }

  /* ====================== o quadro, e o admin ====================== */

  todos() {
    return Object.entries(this.nomes)
      .map(([nome, l]) => semSegredos(completa(l, nome)))
      .sort((a, b) => b.torroes - a.torroes);
  }

  async apagar(veio) {
    const nome = texto(veio.nome, 24);
    if (!nome || !this.nomes[nome]) return { erro: 'Esse nome não está lá.', estado: 404 };
    delete this.nomes[nome];
    await this.gravar();
    return { ok: true, nome };
  }

  async limpar() {
    const quantos = Object.keys(this.nomes).length;
    this.nomes = {};
    await this.gravar();
    return { ok: true, quantos };
  }

  async limparPin(veio) {
    const nome = texto(veio.nome, 24);
    if (!nome || !this.nomes[nome]) return { erro: 'Esse nome não está lá.', estado: 404 };
    this.nomes[nome].pin = null;
    this.nomes[nome].passes = [];
    this.nomes[nome].erros = null;
    await this.gravar();
    return { ok: true, nome };
  }

  /* ========================= quem chama ========================= */

  async fetch(request) {
    const caminho = new URL(request.url).pathname;
    if (caminho === '/todos') return Response.json(this.todos());

    let veio = {};
    try {
      veio = await request.json();
    } catch {
      /* há rotas que não levam nada */
    }

    const feito =
      caminho === '/entrar'
        ? await this.entrar(veio)
        : caminho === '/ver'
          ? await this.ver(veio)
          : caminho === '/mexer'
            ? await this.mexer(veio)
            : caminho === '/emprestimo'
              ? await this.emprestimo(veio)
              : caminho === '/cobrar'
                ? await this.cobrar(veio)
                : caminho === '/creditar'
                  ? await this.creditar(veio)
                  : caminho === '/recorde'
                    ? await this.recorde(veio)
                    : caminho === '/apagar'
                      ? await this.apagar(veio)
                      : caminho === '/limpar'
                        ? await this.limpar()
                        : caminho === '/pin/apagar'
                          ? await this.limparPin(veio)
                          : caminho === '/apostar'
                            ? await this.apostar(veio)
                            : caminho === '/apostas'
                              ? await this.minhasApostas(veio)
                              : caminho === '/apostas/por-fechar'
                                ? this.ligasPorFechar()
                                : caminho === '/trinco/pegar'
                                  ? await this.pegarTrinco(veio)
                                  : caminho === '/trinco/largar'
                                    ? await this.largarTrinco()
                                    : caminho === '/apostas/contas'
                                  ? this.contasDasApostas()
                                  : caminho === '/apostas/fechar'
                                  ? await this.fechar(veio)
                                  : { erro: 'O banco não sabe fazer isso.', estado: 404 };

    return Response.json(feito, { status: feito.estado || 200 });
  }

  /** A linha de quem prova ser dono do nome, sem lhe mexer. */
  async ver(veio) {
    const achado = await this.daPessoa(texto(veio.nome, 24), veio.passe);
    return achado.erro ? achado : { linha: semSegredos(achado.linha) };
  }
}
