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
  passeBate,
  passeNovo,
  pinBate,
  pinLimpo,
  pinNovo,
  pinServe
} from './chaves.js';

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
  recordes: { jogo: 0, cusco: 0, colherada: 0, ...(linha.recordes || {}) }
});

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
    });
  }

  async gravar() {
    await this.ctx.storage.put('nomes', this.nomes);
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
                          : { erro: 'O banco não sabe fazer isso.', estado: 404 };

    return Response.json(feito, { status: feito.estado || 200 });
  }

  /** A linha de quem prova ser dono do nome, sem lhe mexer. */
  async ver(veio) {
    const achado = await this.daPessoa(texto(veio.nome, 24), veio.passe);
    return achado.erro ? achado : { linha: semSegredos(achado.linha) };
  }
}
