/**
 * A parte do meiadeleite.pt que precisa de gravar coisas.
 *
 * O site está no GitHub Pages, que só entrega ficheiros. Este Worker é a
 * única peça viva: guarda o quadro de honra do blackjack e a agenda, e trata
 * da entrada na página de admin com o código do Google Authenticator.
 *
 *   GET    /tudo            a agenda, o quadro, os membros e o mural de uma vez
 *   GET    /quadro          o quadro de honra
 *   POST   /quadro/entrar     nome mais PIN; devolve o passe deste aparelho
 *   POST   /quadro/recorde    guarda o recorde de um jogo de um so jogador
 *   POST   /roleta           poe as fichas, roda, e paga
 *   POST   /quadro/sentar     volta à mesa com o passe que já se tem
 *   POST   /quadro/emprestimo os cem do costume, para quem está sem nada
 *   POST   /mesa              a mão que está a decorrer, se houver
 *   POST   /mesa/apostar      aposta e dá cartas
 *   POST   /mesa/jogar        pedir, ficar, dobrar ou dividir
 *   GET    /poker            quantas pessoas estao em cada mesa
 *   GET    /poker/<mesa>     a ligacao viva a uma mesa de poker (WebSocket)
 *   POST   /quadro/apagar     tira um nome do quadro (precisa da chave)
 *   POST   /quadro/pin/apagar  tira o PIN de um nome (precisa da chave)
 *   GET    /agenda          a agenda
 *   GET    /membros         os membros do grupo
 *   GET    /membros/<id>/foto   a fotografia de um membro
 *   GET    /mural            as publicacoes postas por aqui
 *   POST   /mural            poe uma publicacao no mural (precisa da chave)
 *   DELETE /mural/<id>       tira do mural (precisa da chave)
 *   POST   /mural/sincronizar  vai busca-las a Meta, se houver token
 *   GET    /galeria/<id>      a galeria da mascote
 *   POST   /galeria/<id>      poe la uma foto ou um video (precisa da chave)
 *   DELETE /galeria/<id>/<item>  tira de la (precisa da chave)
 *   GET    /media/<item>      a foto ou o video, tal e qual
 *   POST   /admin/entrar    troca um código de 6 dígitos por uma chave
 *   POST   /agenda          marca (precisa da chave)
 *   PATCH  /agenda/<id>     muda  (precisa da chave)
 *   DELETE /agenda/<id>     apaga (precisa da chave)
 *   POST, PATCH, DELETE em /membros    o mesmo, para os membros
 *
 * O segredo do autenticador NUNCA está aqui no código: vive num segredo do
 * Worker (TOTP_SEGREDO), posto com `wrangler secret put`. Assim não anda no
 * repositório nem viaja pela internet.
 */

import { Banco } from './banco.js';
import { MesaDePoker } from './mesa-de-poker.js';
import { limparApostas, rodada } from './roleta.js';
import {
  APOSTA_MAXIMA,
  dividir,
  dobrar,
  ficar,
  maoAtual,
  mesaNova,
  paga,
  pedir,
  podeDividir,
  podeDobrar,
  vista
} from './blackjack.js';

const CASAS = [
  'https://meiadeleite.pt',
  'https://www.meiadeleite.pt',
  'https://meiadeleite67.github.io',
  'http://localhost:5173',
  'http://localhost:4173'
];

const TIPOS = ['copos', 'jantar', 'estudo', 'exame', 'festa', 'cozinha', 'outro'];
const SESSAO_DURA = 8 * 60 * 60; // segundos
const MAX_ENGANOS = 8;
const CASTIGO = 2 * 60 * 1000;
const MAX_EVENTOS = 300;
const MAX_MEMBROS = 60;
const MAX_FOTO = 400_000; // caracteres de base64, uns 300 kB de imagem

/* A galeria da mascote. Os ficheiros vao para aqui em bruto e nao em base64:
   um video em base64 ocupava mais um terco e obrigava a converter tudo de cada
   vez que fosse pedido. */
const MAX_MEDIA = 8 * 1024 * 1024;
const MAX_NA_GALERIA = 40;
const MAX_NO_MURAL = 60;
const TIPOS_DE_MEDIA = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'video/mp4', 'video/webm', 'video/quicktime'];

/* Quantos PINs errados antes de o nome ficar de castigo, e por quanto tempo.
   E o que defende mesmo um PIN de quatro algarismos: a conta do resumo e
   dificil de fazer aos milhoes, mas quem defende a serio e isto. */
const MAX_PIN_ERRADO = 5;
const CASTIGO_PIN = 15 * 60 * 1000;
/* E o mesmo por quem pergunta, para ninguem andar a experimentar PINs em
   muitos nomes de uma vez. Folgado de proposito: o grupo vive na mesma casa e
   sai tudo pelo mesmo endereco, e um numero curto aqui trancava-os uns aos
   outros. Quem defende mesmo cada PIN e o limite por nome, ali em cima. */
const MAX_PIN_ERRADO_DAQUI = 40;
const MAX_MAOS_POR_JOGADA = 4;
const RESULTADOS = ['blackjack', 'ganhou', 'empate', 'perdeu', 'rebentou'];

/* ============================ utilidades ============================ */

function cabecalhos(request) {
  const origem = request.headers.get('Origin') || '';
  return {
    'Access-Control-Allow-Origin': CASAS.includes(origem) ? origem : CASAS[0],
    'Access-Control-Allow-Methods': 'GET, PUT, POST, PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin'
  };
}

const responder = (corpo, request, estado = 200) =>
  new Response(JSON.stringify(corpo), {
    status: estado,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...cabecalhos(request) }
  });

const texto = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const numero = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.max(0, Math.min(9_999_999, Math.round(n))) : 0;
};
const eData = (v) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);
const eHora = (v) => typeof v === 'string' && /^\d{2}:\d{2}$/.test(v);
const novoId = () => crypto.randomUUID().slice(0, 8);

const ler = async (env, chave, porOmissao) => {
  const guardado = await env.QUADRO.get(chave);
  return guardado ? JSON.parse(guardado) : porOmissao;
};

/** O codigo de uma publicacao, tirado do endereco dela. */
const codigoDoInsta = (endereco) => {
  const m = /instagram\.com\/(?:[^/]+\/)?(?:p|reel|tv)\/([A-Za-z0-9_-]{5,20})/.exec(String(endereco || ''));
  return m ? m[1] : '';
};

/* ========================== o banco ==========================

   Os torroes de toda a gente vivem num objecto so, que atende um pedido de
   cada vez. E dai que vem o quadro, e e por ai que passa tudo o que mexe em
   dinheiro. O Worker so lhe entrega os pedidos: nada disto e publico. */

const oBanco = (env) => env.BANCO.get(env.BANCO.idFromName('mdl'));

async function aoBanco(env, rota, corpo) {
  const r = await oBanco(env).fetch(`https://banco${rota}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(corpo || {})
  });
  return r.json();
}

const doBanco = async (env, rota) => (await oBanco(env).fetch(`https://banco${rota}`)).json();

const minutosAte = (quando) => {
  const m = Math.max(1, Math.ceil((quando - Date.now()) / 60000));
  return `${m} minuto${m === 1 ? '' : 's'}`;
};

/** Quem anda a experimentar PINs em muitos nomes tambem fica de castigo, e nao
 *  so o nome que esta a ser tentado. */
async function castigarQuemPergunta(env, daqui, castigo) {
  const enganos = (castigo?.enganos ?? 0) + 1;
  await env.QUADRO.put(
    `pin:${daqui}`,
    JSON.stringify(
      enganos >= MAX_PIN_ERRADO_DAQUI
        ? { enganos: 0, ate: Date.now() + CASTIGO_PIN }
        : { enganos, ate: 0 }
    ),
    { expirationTtl: 3600 }
  );
}

/**
 * Tudo o que e jogar passa por aqui: confirma que quem pede e mesmo o dono do
 * nome, vai buscar a mao que estiver a decorrer, deixa o trabalho fazer o que
 * tem a fazer, e no fim diz ao banco o que mudou.
 *
 * O trabalho devolve a mesa nova, ou uma queixa em texto quando a jogada nao
 * presta, e nesse caso nao se grava nada.
 *
 * O saldo com que o trabalho conta e o que o banco disse ha um instante, mas
 * quem decide e o banco: se entretanto o dinheiro foi gasto noutro jogo, e ele
 * que recusa, e a mesa nao chega a ser gravada.
 */
async function comOJogador(request, env, trabalho) {
  let veio;
  try {
    veio = await request.json();
  } catch {
    return responder({ erro: 'Corpo inválido.' }, request, 400);
  }
  const nome = texto(veio?.nome, 24);
  const passe = texto(veio?.passe, 40);

  const visto = await aoBanco(env, '/ver', { nome, passe });
  if (visto.erro) return responder({ erro: visto.erro }, request, visto.estado || 400);

  const linha = { ...visto.linha };
  const antes = linha.torroes;
  const contas = { bj: { maos: 0, vitorias: 0, bjs: 0 } };

  const mesa = await ler(env, `mesa:${nome}`, null);
  const feito = trabalho({ linha, mesa, veio });
  if (typeof feito === 'string') return responder({ erro: feito }, request, 400);

  /* O pagamento acontece uma unica vez por mao, marcado na propria mesa: se o
     mesmo pedido chegar duas vezes, a segunda ja nao paga nada. */
  if (feito && feito.fase === 'fim' && !feito.pago) {
    for (const mao of feito.maos) {
      linha.torroes += paga(mao);
      contas.bj.maos++;
      if (mao.resultado === 'blackjack') {
        contas.bj.vitorias++;
        contas.bj.bjs++;
      } else if (mao.resultado === 'ganhou') {
        contas.bj.vitorias++;
      }
    }
    feito.pago = true;
  }

  const delta = Math.round(linha.torroes) - antes;
  const mexeu = delta !== 0 || contas.bj.maos > 0;

  const fim = mexeu ? await aoBanco(env, '/mexer', { nome, passe, delta, contas }) : visto;
  if (fim.erro) return responder({ erro: fim.erro }, request, fim.estado || 400);

  if (feito) await env.QUADRO.put(`mesa:${nome}`, JSON.stringify(feito));

  return responder(
    { linha: fim.linha, mesa: feito ? vista(feito, fim.linha.torroes) : null },
    request
  );
}

/* ====================== o código do autenticador ====================== */

const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function deBase32(t) {
  let bits = 0;
  let valor = 0;
  const bytes = [];
  for (const c of String(t).toUpperCase().replace(/[^A-Z2-7]/g, '')) {
    valor = (valor << 5) | B32.indexOf(c);
    bits += 5;
    if (bits >= 8) {
      bytes.push((valor >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return new Uint8Array(bytes);
}

/** Compara sem deixar o tempo de resposta dizer quantos dígitos acertaram. */
function igualDevagar(a, b) {
  if (a.length !== b.length) return false;
  let diferenca = 0;
  for (let i = 0; i < a.length; i++) diferenca |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diferenca === 0;
}

/** TOTP de sempre: HMAC-SHA1, 6 dígitos, 30 segundos, com folga de um passo
 *  para cada lado por causa dos relógios dos telemóveis. */
async function codigoCerto(segredo, dado) {
  const limpo = String(dado || '').replace(/\D/g, '');
  if (limpo.length !== 6 || !segredo) return false;

  const chave = await crypto.subtle.importKey(
    'raw',
    deBase32(segredo),
    { name: 'HMAC', hash: 'SHA-1' },
    false,
    ['sign']
  );
  const passo = Math.floor(Date.now() / 30000);

  for (const desvio of [-1, 0, 1]) {
    const agora = passo + desvio;
    const contador = new ArrayBuffer(8);
    const vista = new DataView(contador);
    vista.setUint32(0, Math.floor(agora / 2 ** 32));
    vista.setUint32(4, agora >>> 0);

    const assinatura = new Uint8Array(await crypto.subtle.sign('HMAC', chave, contador));
    const salto = assinatura[assinatura.length - 1] & 15;
    const n =
      ((assinatura[salto] & 127) << 24) |
      (assinatura[salto + 1] << 16) |
      (assinatura[salto + 2] << 8) |
      assinatura[salto + 3];

    if (igualDevagar(String(n % 1000000).padStart(6, '0'), limpo)) return true;
  }
  return false;
}

/** A chave da sessão vive no KV e expira sozinha ao fim de 8 horas. */
async function temChave(request, env) {
  const chave = String(request.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  if (!chave || !/^[a-f0-9]{48}$/.test(chave)) return false;
  return (await env.QUADRO.get(`sessao:${chave}`)) !== null;
}

/* ============================ as rotas ============================ */

async function entrar(request, env) {
  const quem = request.headers.get('CF-Connecting-IP') || 'desconhecido';
  const castigo = await ler(env, `castigo:${quem}`, null);

  if (castigo && castigo.ate > Date.now()) {
    const minutos = Math.ceil((castigo.ate - Date.now()) / 60000);
    return responder(
      { erro: `Demasiadas tentativas. Tenta daqui a ${minutos} minuto(s).` },
      request,
      429
    );
  }

  let veio;
  try {
    veio = await request.json();
  } catch {
    return responder({ erro: 'Corpo inválido.' }, request, 400);
  }

  if (!(await codigoCerto(env.TOTP_SEGREDO, veio?.codigo))) {
    const enganos = (castigo?.enganos ?? 0) + 1;
    await env.QUADRO.put(
      `castigo:${quem}`,
      JSON.stringify(
        enganos >= MAX_ENGANOS
          ? { enganos: 0, ate: Date.now() + CASTIGO }
          : { enganos, ate: 0 }
      ),
      { expirationTtl: 900 }
    );
    return responder({ erro: 'Código errado.' }, request, 401);
  }

  await env.QUADRO.delete(`castigo:${quem}`);
  const chave = [...crypto.getRandomValues(new Uint8Array(24))]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  await env.QUADRO.put(`sessao:${chave}`, '1', { expirationTtl: SESSAO_DURA });
  return responder({ chave }, request);
}

/** As fotos dos membros ficam guardadas à parte, uma por chave, para a lista
 *  de membros continuar leve de ler. Chegam já encolhidas pelo browser. */
async function guardarFoto(env, id, foto) {
  if (typeof foto !== 'string' || !foto.startsWith('data:image/')) return false;
  const base64 = foto.slice(foto.indexOf(',') + 1);
  if (base64.length > MAX_FOTO) return 'grande';
  try {
    atob(base64.slice(0, 64));
  } catch {
    return false;
  }
  await env.QUADRO.put(`foto:${id}`, base64);
  return true;
}

function limparEvento(veio, antes) {
  return {
    id: antes?.id ?? novoId(),
    titulo: texto(veio?.titulo, 80) || antes?.titulo || '',
    data: eData(veio?.data) ? veio.data : (antes?.data ?? new Date().toISOString().slice(0, 10)),
    hora: eHora(veio?.hora) ? veio.hora : (antes?.hora ?? ''),
    sitio: typeof veio?.sitio === 'string' ? texto(veio.sitio, 80) : (antes?.sitio ?? ''),
    tipo: TIPOS.includes(veio?.tipo) ? veio.tipo : (antes?.tipo ?? 'outro'),
    notas: typeof veio?.notas === 'string' ? texto(veio.notas, 300) : (antes?.notas ?? ''),
    criadoEm: antes?.criadoEm ?? new Date().toISOString()
  };
}

/* Os objectos proprios vivem nos ficheiros deles, mas quem os tem de dar a
   conhecer e o ficheiro de entrada do Worker. */
import {
  DESPORTOS,
  FECHOS_POR_VOLTA,
  PRATELEIRA_VAZIA,
  contasDaFeed,
  faltamDesportos,
  guardarRelatorio,
  relatorioDaVolta,
  jaAcabaram,
  jogosGuardados,
  refrescarJogos,
  resultadosDe,
  temChaveDaFeed
} from './desporto.js';
import { quemGanhou } from './apostas.js';
import {
  CAMINHOS,
  CAMINHOS_CLASSIFICACAO,
  CAMINHOS_CONFRONTOS,
  NAO_EXISTE,
  lerClassificacao,
  lerConfrontos,
  lerEstatisticas,
  lerEventos
} from './estatisticas.js';
import {
  CASAS as DESPORTOS_NOVOS,
  aindaServe,
  eDoPlano,
  pedir as pedirANova,
  cotacoesDoDia,
  jogosDaFeedNova,
  quemGanhouNova,
  resultadosPorNumero,
  temChaveNova
} from './api-sports.js';
import {
  apagarTicket,
  arrumarTickets,
  contasDosTickets,
  limparTicket,
  mudarEstado
} from './tickets.js';

export { Banco, MesaDePoker };

/* ====================== a volta das apostas ======================

   Isto corre pelo relogio da Cloudflare e nao quando alguem abre a pagina. Um
   pedido por visita gastava a quota de um mes numa tarde.

   A volta da-se de seis em seis horas e quase sempre nao custa nada, porque
   perguntar o que ha e de graca e so se paga o que faz falta saber. Primeiro
   fecha-se o que ja acabou, e so depois se vao buscar jogos novos: se os
   creditos estiverem a acabar, quem tem torroes presos numa aposta tem mais
   direito ao que resta do que quem quer ver a jornada seguinte. */

/**
 * Que desporto se trata nesta volta.
 *
 * Trata-se um de cada vez, a rodar, e nao os sete de uma vez. Com sete
 * desportos a tres dias de jogos mais as cotacoes, uma volta unica dava umas
 * quarenta chamadas espacadas de sete segundos, o que sao cinco minutos de
 * espera dentro de uma volta so. A rodar, cada volta custa meia duzia de
 * chamadas e cada desporto e refrescado a cada poucas horas.
 */
async function aVez(env, quantos = 3) {
  const nomes = Object.keys(DESPORTOS_NOVOS);
  const ultimo = (await ler(env, 'desporto:vez', null)) || '';
  const i = nomes.indexOf(ultimo);
  /* Tres por volta e nao um: com doze desportos, um por volta levava meio dia a
     dar a volta toda, e um desporto refrescado uma vez por dia e um desporto
     que quase nunca tem jogos a vista. Cada um tem a sua conta de cem pedidos,
     por isso tres nao se estorvam; quem tem de ser respeitado e o travao de
     pedidos por minuto, e desse trata a espera entre pedidos. */
  const vez = [];
  for (let k = 1; k <= quantos; k += 1) vez.push(nomes[(i + k) % nomes.length]);
  await env.QUADRO.put('desporto:vez', JSON.stringify(vez[vez.length - 1]));
  return vez;
}

/** Traz os jogos e as cotacoes de um desporto para a gaveta dele. */
async function trazerUmDesporto(env, desporto, feito) {
  const novos = await jogosDaFeedNova(env, desporto);
  feito.pedidos += novos.pedidos || 0;
  if (novos.erro) feito.erros.push(`${desporto}: ${novos.erro}`);

  const jogos = novos.jogos || [];
  if (jogos.length === 0) return;

  const com = await cotacoesDoDia(env, desporto);
  feito.pedidos += com.pedidos || 0;
  if (com.erro) feito.erros.push(`${desporto} cotacoes: ${com.erro}`);

  const cotacoes = com.cotacoes || new Map();
  /* As cotacoes que ja se sabiam ficam: este pedido so traz as de hoje, e um
     jogo de amanha nao pode perder o preco por isso. */
  const antesDisto = await ler(env, ONDE_OS_NOVOS(desporto), null);
  const jaSabidas = new Map(((antesDisto && antesDisto.jogos) || []).map((j) => [j.id, j.cotacoes]));

  const comPreco = jogos
    .map((j) => ({ ...j, cotacoes: cotacoes.get(j.id) || jaSabidas.get(j.id) || null }))
    .filter((j) => j.cotacoes || (!j.porComecar && !j.acabou));

  await guardarJogosNovos(env, desporto, comPreco);
  feito.jogos = (feito.jogos || 0) + comPreco.length;
}

/**
 * Os jogos da fonte nova, guardados por desporto.
 *
 * Cada desporto tem a sua gaveta. Assim uma volta que trate do basquetebol nao
 * mexe no que ja se sabia do futebol, e a pagina mostra sempre tudo o que ha
 * de todos, mesmo que cada um tenha sido refrescado a horas diferentes.
 */
const ONDE_OS_NOVOS = (desporto) => `desporto:novo:${desporto}`;

async function guardarJogosNovos(env, desporto, jogos) {
  await env.QUADRO.put(
    ONDE_OS_NOVOS(desporto),
    JSON.stringify({ jogos, quando: new Date().toISOString() })
  );
}

/**
 * Tudo o que ha para apostar, das duas fontes.
 *
 * Enquanto a troca de fonte nao estiver acabada, ha jogos das duas: os novos
 * vem por desporto da fonte nova, e o que restava da antiga fica a vista ate
 * comecar. Nao se apaga nada a mao: o que comecou sai sozinho pelo relogio.
 */
async function todosOsJogos(env) {
  const novos = await jogosNovosGuardados(env);
  const velhos = (await jogosGuardados(env)).jogos || [];

  /* A fonte antiga e rede e nao rival: num desporto onde a nova ja trouxe
     jogos, os dela saem. As duas seguem quase os mesmos desportos e cada uma
     numera os jogos a sua maneira, por isso deixa-las as duas na pagina daria
     o mesmo Red Sox-Yankees duas vezes, uma delas sem resultado, sem minuto e
     sem estatisticas nenhumas por o numero nao ser conhecido da nova.
     O tenis e o caso que justifica manter isto: a nova nao o tem. */
  const cobertos = new Set(novos.map((j) => j.desporto));

  const por = new Map();
  [...velhos.filter((j) => !cobertos.has(j.desporto)), ...novos].forEach((j) => por.set(j.id, j));
  return [...por.values()].sort((a, b) => Date.parse(a.comeca) - Date.parse(b.comeca));
}

export async function jogosNovosGuardados(env) {
  const tudo = [];
  for (const desporto of Object.keys(DESPORTOS_NOVOS)) {
    const g = await ler(env, ONDE_OS_NOVOS(desporto), null);
    if (g && Array.isArray(g.jogos)) tudo.push(...g.jogos);
  }
  /* Fora os que ja acabaram de vez. Os que estao a decorrer ficam, trancados,
     e agora com o resultado a vista. */
  /* Um jogo sem cotacao nao se mostra a nao ser que esteja a decorrer, e este
     e o sitio certo para essa regra: aqui ela protege a pagina de qualquer
     feed que se porte mal, e nao so daquela que se portou mal hoje. Um jogo
     sem preco e uma linha onde nao se pode carregar em nada. */
  const agora = Date.now();
  const aDecorrer = (j) => Date.parse(j.comeca) <= agora && !j.acabou;
  return tudo
    /* Um jogo adiado ou de ha dias nao tem lugar aqui, e e a mesma regra que a
       busca usa. Sem isto ficavam na pagina a dizer que estavam a decorrer, e
       era nesses que se ia procurar estatisticas que nunca podiam existir. */
    .filter((j) => aindaServe(j, agora))
    .filter((j) => j.cotacoes || aDecorrer(j))
    .sort((a, b) => Date.parse(a.comeca) - Date.parse(b.comeca));
}

/* ==================== como vai o jogo ====================

   As estatisticas de um jogo, com copia guardada. A copia e o que faz isto
   caber no orcamento: guarda-se por jogo e nao por pessoa, e por isso vinte da
   malta a abrir o mesmo Benfica-Porto custa dois pedidos e nao quarenta. Numa
   noite de jogo e precisamente isso que acontece, que estao todos a ver o
   mesmo.

   Um jogo acabado guarda-se para sempre: aquilo ja nao muda. Um a decorrer
   guarda-se tres minutos. E quando o que resta do dia for pouco, deixa-se de
   pedir e mostra-se a ultima fotografia com a hora dela, que e melhor do que
   gastar no ultimo pedido do dia a refrescar uma posse de bola. */

/** Quantos pedidos a fonte nova leva por dia fora das voltas. O resto do cento
 *  fica para as voltas, que sao o que garante que ha jogos na pagina. */
const PEDIDOS_DE_FORA_POR_DIA = 60;

const diaDeHoje = () => new Date().toISOString().slice(0, 10);

async function jaSeGastou(env) {
  const g = await ler(env, 'desporto:gastos-de-fora', null);
  return g && g.dia === diaDeHoje() ? g.quantos : 0;
}

async function apontarGasto(env, quantos) {
  const antes = await jaSeGastou(env);
  await env.QUADRO.put(
    'desporto:gastos-de-fora',
    JSON.stringify({ dia: diaDeHoje(), quantos: antes + quantos })
  );
}

/**
 * As estatisticas de um jogo, do que estiver guardado ou da feed.
 *
 * Devolve sempre alguma coisa: se nao houver copia nem orcamento, devolve o
 * que tem com uma nota a dizer porque nao foi buscar mais.
 */
/**
 * Pede as estatísticas de um jogo, tentando os caminhos daquele desporto.
 *
 * O caminho que a feed disser que não existe fica apontado por um mês, para
 * não se gastar um pedido por jogo a descobrir a mesma coisa. Sai o que veio e
 * quantos pedidos custou, que quem chama tem de os apontar na conta do dia.
 */
async function pedirEstatisticas(env, jogo, onde, casa) {
  let pedidos = 0;
  let ultimoErro = '';

  for (const caminho of onde.caminhos) {
    const morto = `desporto:caminho-morto:${jogo.desporto}:${caminho}`;
    if (await env.QUADRO.get(morto)) continue;

    const r = await pedirANova(env, casa.casa, caminho, { [onde.chave]: jogo.id });
    pedidos += 1;
    if (!r.erro) return { lista: r.lista, pedidos };

    ultimoErro = r.erro;
    /* "This endpoint do not exist" e a maneira dela dizer que aquele desporto
       nao tem este caminho. Qualquer outro erro e do momento, e o caminho pode
       estar bom: nao se aponta como morto por uma recusa passageira. */
    if (String(r.erro).includes(NAO_EXISTE))
      await env.QUADRO.put(morto, '1', { expirationTtl: 60 * 60 * 24 * 30 });
    else break;
  }

  /* Sem caminho nenhum vivo, o que se sabe e que este desporto nao tem
     estatisticas nesta feed, e nao que este jogo nao as tem. Sao coisas
     diferentes e a pagina tem de as dizer de maneira diferente: uma passa, a
     outra nao passa nunca. */
  if (!ultimoErro) return { lista: null, pedidos, semCaminho: true };
  return { lista: null, pedidos, erro: ultimoErro, semPlano: eDoPlano(ultimoErro) };
}

/** Onde fica apontado que uma competição não dá estatísticas. */
const LIGA_SEM_STATS = (jogo) => `desporto:liga-sem-stats:${jogo.desporto}:${jogo.chave || jogo.liga}`;

/**
 * Se já se sabe que aquela competição não dá estatísticas.
 *
 * A API-Football não cobre tudo por igual: as grandes ligas dão dezasseis
 * linhas e as pequenas não dão nenhuma. Sem isto gastava-se um pedido por cada
 * jogo da FAW Championship para ouvir o mesmo nada, e o orçamento do dia ia-se
 * embora a confirmar uma coisa já sabida.
 */
/** A versão do leitor das estatísticas, dentro da chave de quem as guarda.
 *
 *  Quando o leitor muda, as cópias antigas deixam de servir: foram lidas pelo
 *  leitor de antes. O basquetebol ficou guardado com "[object Object]" em
 *  metade das linhas, e as cópias de jogos acabados duram um mês. Subir isto
 *  deita fora essas de uma vez, sem se andar a apagar nada à mão. */
const VERSAO_DAS_STATS = 2;

async function comoVaiOJogo(env, jogo) {
  const onde = CAMINHOS[jogo.desporto];
  const casa = DESPORTOS_NOVOS[jogo.desporto];
  const guardado = await ler(env, `desporto:stats:${VERSAO_DAS_STATS}:${jogo.id}`, null);

  const acabou = !!jogo.acabou;
  const idade = guardado ? Date.now() - Date.parse(guardado.quando) : Infinity;
  /* Um jogo acabado nunca mais muda; um a decorrer vale tres minutos. */
  const serve = guardado && (acabou || idade < 3 * 60 * 1000);
  if (serve) return { ...guardado, daCopia: true };

  /* Um jogo da fonte antiga nao tem numero que a fonte nova conheca, por isso
     pedir-lhe estatisticas seria gastar um pedido para ouvir um nao. */
  if (!onde || !casa || jogo.fonte !== 'api-sports' || !temChaveNova(env))
    return guardado || { estatisticas: [], eventos: [], quando: null, semFonte: true };

  /* O pior caso sao todos os caminhos do desporto mais os eventos. */
  const quantosPedidos = onde.caminhos.length + (onde.eventos ? 1 : 0);
  if ((await jaSeGastou(env)) + quantosPedidos > PEDIDOS_DE_FORA_POR_DIA)
    return guardado
      ? { ...guardado, daCopia: true, semOrcamento: true }
      : { estatisticas: [], eventos: [], quando: null, semOrcamento: true };

  /* Uma competição já dada por sem estatísticas não se volta a pedir. */
  if (await env.QUADRO.get(LIGA_SEM_STATS(jogo)))
    return { estatisticas: [], eventos: [], quando: null, semEstatisticas: true };

  const st = await pedirEstatisticas(env, jogo, onde, casa);
  await apontarGasto(env, st.pedidos);
  if (st.semCaminho)
    return { estatisticas: [], eventos: [], quando: null, semFonte: true };

  if (st.erro) {
    /* O travao da feed e de dez pedidos por minuto, e e partilhado com a volta.
       Numa noite de jogos com meia dúzia de pessoas a abrir jogos ao mesmo
       tempo, isto bate: nao e um jogo sem estatisticas, e um minuto cheio, e a
       pagina tem de dizer isso e tentar outra vez em vez de mentir. */
    const ocupado = /too many requests|rate/i.test(String(st.erro));
    return guardado
      ? { ...guardado, daCopia: true, ocupado, semPlano: st.semPlano }
      : { estatisticas: [], eventos: [], erro: st.erro, ocupado, semPlano: st.semPlano };
  }

  let eventos = [];
  if (onde.eventos) {
    const ev = await pedirANova(env, casa.casa, onde.eventos, { [onde.chave]: jogo.id });
    await apontarGasto(env, 1);
    if (!ev.erro) eventos = lerEventos(ev.lista);
  }

  const novo = {
    estatisticas: lerEstatisticas(st.lista),
    eventos,
    quando: new Date().toISOString()
  };

  /* Nada de nada num jogo que já vai adiantado não é o jogo, é a competição:
     aponta-se por três dias. Num jogo que acabou de começar ainda não há nada
     para haver, e apontar aí era enterrar uma liga boa por causa do minuto
     cinco. */
  const jaVaiLonge = !!jogo.acabou || (jogo.minuto || 0) >= 30;
  if (novo.estatisticas.length === 0 && novo.eventos.length === 0 && jaVaiLonge) {
    await env.QUADRO.put(LIGA_SEM_STATS(jogo), '1', { expirationTtl: 60 * 60 * 24 * 3 });
    return { ...novo, semEstatisticas: true };
  }
  /* Um jogo acabado fica guardado para sempre; um a decorrer tem prazo, para o
     KV nao ficar a guardar fotografias de jogos do ano passado. */
  await env.QUADRO.put(`desporto:stats:${VERSAO_DAS_STATS}:${jogo.id}`, JSON.stringify(novo), {
    expirationTtl: acabou ? 60 * 60 * 24 * 30 : 60 * 60 * 6
  });
  return novo;
}

/**
 * A classificação de uma liga, ou o histórico entre duas equipas.
 *
 * As duas seguem a mesma ideia e por isso partilham a casa: pede-se uma vez,
 * guarda-se com a chave do que se pediu e não do jogo, e a partir daí serve
 * todos os jogos que fizerem a mesma pergunta. A classificação da Segunda
 * Divisão é a mesma para os onze jogos dela nessa jornada, e dois adversários
 * têm sempre o mesmo histórico: é isto que faz caber num orçamento de cem.
 *
 * Só se pede quando alguém abre o separador, e não ao abrir a partida: quem
 * quer ver como vai o jogo não paga pela tabela que não pediu.
 */
async function maisDoJogo(env, jogo, que) {
  const casa = DESPORTOS_NOVOS[jogo.desporto];
  const caminhos =
    que === 'classificacao'
      ? CAMINHOS_CLASSIFICACAO[jogo.desporto]
      : CAMINHOS_CONFRONTOS[jogo.desporto];

  /* A chave de quem guarda: a liga e a temporada para a tabela, o par de
     equipas para o histórico. Nunca o número do jogo. */
  const marca =
    que === 'classificacao'
      ? `liga:${jogo.desporto}:${jogo.chave}:${jogo.temporada || ''}`
      : `par:${jogo.desporto}:${[jogo.casa, jogo.fora].sort().join('-')}`;
  const onde = `desporto:${que}:${marca}`;

  const guardado = await ler(env, onde, null);
  if (guardado) return { ...guardado, daCopia: true };

  /* O plano gratuito so da algumas epocas, e a recusa dele e a mesma em todas
     as ligas do desporto: "try from 2022 to 2024". Por isso a marca e por
     desporto e epoca e nao por liga, que senao pagava-se uma descoberta por
     cada liga para ouvir vinte vezes o mesmo nao. Uma vez por desporto chega,
     e dura um mes. */
  const semPlano = `desporto:sem-plano:${que}:${jogo.desporto}:${jogo.temporada || ''}`;
  if (await env.QUADRO.get(semPlano))
    return que === 'classificacao'
      ? { grupos: [], semPlano: true }
      : { confrontos: [], semPlano: true };

  if (!casa || !caminhos || jogo.fonte !== 'api-sports' || !temChaveNova(env))
    return { linhas: [], grupos: [], semFonte: true };

  if ((await jaSeGastou(env)) + caminhos.length > PEDIDOS_DE_FORA_POR_DIA)
    return { grupos: [], confrontos: [], semOrcamento: true };

  /* O histórico pede-se pelos números das equipas, que a feed não nos dá no
     jogo: dá os nomes e os emblemas. O caminho dela aceita o par de números,
     por isso tira-se do endereço do emblema, que é onde ele está. */
  const numeroDe = (brasao) => {
    const m = String(brasao || '').match(/\/(\d+)\.png/);
    return m ? m[1] : '';
  };

  let procura = {};
  if (que === 'classificacao') {
    procura = { league: jogo.chave, season: jogo.temporada };
  } else {
    const a = numeroDe(jogo.brasaoCasa);
    const b = numeroDe(jogo.brasaoFora);
    if (!a || !b) return { confrontos: [], semFonte: true };
    /* Sem o "last": o plano gratuito nao lhe da acesso, e a resposta dele e uma
       recusa seca que deixava o separador vazio. Vem tudo o que houve entre as
       duas equipas e e o leitor que corta nos dez mais recentes, que e trabalho
       nosso e nao custa pedido nenhum. */
    procura = { h2h: `${a}-${b}` };
  }

  let resposta = null;
  let ultimoErro = '';
  for (const caminho of caminhos) {
    const morto = `desporto:caminho-morto:${jogo.desporto}:${caminho}`;
    if (await env.QUADRO.get(morto)) continue;
    const r = await pedirANova(env, casa.casa, caminho, procura);
    await apontarGasto(env, 1);
    if (!r.erro) {
      resposta = r.lista;
      break;
    }
    ultimoErro = r.erro;
    if (String(r.erro).includes(NAO_EXISTE))
      await env.QUADRO.put(morto, '1', { expirationTtl: 60 * 60 * 24 * 30 });
    else break;
  }

  if (resposta === null) {
    const ocupado = /too many requests|rate/i.test(String(ultimoErro));
    const foiOPlano = eDoPlano(ultimoErro);
    if (foiOPlano) await env.QUADRO.put(semPlano, '1', { expirationTtl: 60 * 60 * 24 * 30 });
    return que === 'classificacao'
      ? { grupos: [], erro: ultimoErro, ocupado, semPlano: foiOPlano }
      : { confrontos: [], erro: ultimoErro, ocupado, semPlano: foiOPlano };
  }

  const novo =
    que === 'classificacao'
      ? { grupos: lerClassificacao(resposta), quando: new Date().toISOString() }
      : { confrontos: lerConfrontos(resposta), quando: new Date().toISOString() };

  /* A tabela muda a cada jornada, o histórico não muda quase nunca. */
  await env.QUADRO.put(onde, JSON.stringify(novo), {
    expirationTtl: que === 'classificacao' ? 60 * 60 * 6 : 60 * 60 * 24 * 7
  });
  return novo;
}

/* ====================== a volta ======================

   Fecha-se o que ja acabou e so depois se vao buscar jogos novos: se houver
   pouco por onde pedir, quem tem torroes presos numa aposta tem mais direito
   ao que resta do que quem quer ver a jornada seguinte.

   As apostas fecham-se pela fonte de onde nasceram. As que ja estavam feitas
   quando se trocou de fonte nao tem a marca posta, e essas continuam a fechar
   pelo caminho antigo ate a ultima delas estar resolvida. E a unica maneira de
   trocar de fonte sem que ninguem fique a espera de um resultado que nunca
   chega. */

async function aVoltaDoDia(env) {
  /* Um trinco, para nao haver duas voltas ao mesmo tempo.
     A feed nova trava aos dez pedidos por minuto, e uma volta leva umas seis
     chamadas espacadas de sete segundos: duas voltas a andar juntas passam do
     travao e as duas saem de maos vazias. Isto aconteceu ao pe da letra ao
     experimentar, com o relogio a disparar uma volta enquanto eu forcava
     outra. O trinco dura dois minutos, que e mais do que uma volta leva. */
  const trinco = await aoBanco(env, '/trinco/pegar', { segundos: 300 });
  if (!trinco.pegou)
    return { erros: [`ja ha uma volta a andar, faltam ${trinco.faltam}s`], fechadas: 0, jogos: 0 };

  /* Se a fonte nova recusou na volta passada, espera-se um quarto de hora.
     O travao dela e por minuto, nao por dia: o painel da conta mostrou o
     futebol a onze por cento e tudo o resto a zero enquanto ela me recusava
     pedidos, o que diz que nunca foi a quota do dia. Era eu a fazer bursts com
     voltas sobrepostas, que o trinco de cima agora impede. */
  const novaDeCastigo = !!(await env.QUADRO.get('desporto:nova-de-castigo'));

  const feito = { fechadas: 0, ligas: [], jogos: 0, erros: [], pedidos: 0 };

  const porFechar = await doBanco(env, '/apostas/por-fechar');
  const ligas = Array.isArray(porFechar?.ligas) ? porFechar.ligas : [];
  const resultados = [];

  /* ---- fechar o que nasceu na fonte nova ---- */
  if (temChaveNova(env)) {
    /* As pernas novas trazem o desporto, e e por ele que se sabe a que API
       perguntar. Vinte numeros por pedido. */
    const porDesporto = new Map();
    ligas.forEach((l) =>
      (l.jogos || []).forEach((j) => {
        if (j.fonte !== 'api-sports' || !j.desporto) return;
        porDesporto.set(j.desporto, [...(porDesporto.get(j.desporto) || []), j.jogo]);
      })
    );

    for (const [desporto, numeros] of porDesporto) {
      const r = await resultadosPorNumero(env, desporto, numeros);
      feito.pedidos += r.pedidos || 0;
      if (r.erro) {
        feito.erros.push(`${desporto}: ${r.erro}`);
        continue;
      }
      r.jogos.forEach((j) => {
        const ganhou = quemGanhouNova(j);
        if (ganhou) resultados.push({ jogo: j.id, ganhou });
      });
    }
  }

  /* ---- e o que nasceu na fonte antiga, enquanto houver ---- */
  const antigas = ligas.filter((l) => (l.jogos || []).some((j) => j.fonte !== 'api-sports'));
  if (temChaveDaFeed(env) && antigas.length > 0) {
    let fechadas = 0;
    for (const liga of antigas) {
      if (fechadas >= FECHOS_POR_VOLTA) break;
      const fim = await jaAcabaram(env, liga.chave, liga.jogos);
      if (fim.erro) {
        feito.erros.push(`${liga.chave}: ${fim.erro}`);
        continue;
      }
      if (fim.acabados.length === 0) continue;

      const r = await resultadosDe(env, liga.chave);
      if (r.erro) {
        feito.erros.push(`${liga.chave}: ${r.erro}`);
        continue;
      }
      fechadas += 1;
      feito.ligas.push(liga.chave);
      for (const cru of r.resultados) {
        const ganhou = quemGanhou(cru, cru.home_team, cru.away_team);
        if (ganhou) resultados.push({ jogo: cru.id, ganhou });
      }
    }
  }

  const fim = await aoBanco(env, '/apostas/fechar', { resultados });
  feito.fechadas = fim?.fechadas || 0;

  /* ---- e so depois ir buscar jogos novos, dos desportos desta vez ---- */
  if (temChaveNova(env) && !novaDeCastigo) {
    feito.desporto = await aVez(env);
    for (const desporto of feito.desporto) await trazerUmDesporto(env, desporto, feito);
  }

  /* ---- e quem esta a jogar agora, que e um pedido e traz o resultado ----

     A chamada que lista os jogos de um dia ja traz os golos e o minuto. Por
     isso manter o resultado fresco custa um pedido por desporto a jogar, e nao
     um pedido por jogo: e o que torna isto possivel com cem por dia. */
  if (temChaveNova(env) && !novaDeCastigo) {
    const agora = Date.now();
    const aJogar = new Set(
      (await jogosNovosGuardados(env))
        .filter(
          (j) =>
            j.fonte === 'api-sports' &&
            !j.acabou &&
            Date.parse(j.comeca) <= agora &&
            /* A vez sao tres desportos, nao um: comparar com o array dava
               sempre verdade e um desporto acabado de buscar era buscado
               outra vez na mesma volta. */
            !(feito.desporto || []).includes(j.desporto)
        )
        .map((j) => j.desporto)
    );

    for (const desporto of [...aJogar].slice(0, 2)) {
      const r = await jogosDaFeedNova(env, desporto, 1);
      feito.pedidos += r.pedidos || 0;
      if (r.erro) {
        feito.erros.push(`${desporto} ao vivo: ${r.erro}`);
        continue;
      }
      /* Guarda-se o que veio por cima do que se sabia, mantendo as cotacoes
         que ja estavam: este pedido nao as traz. */
      const antes = await ler(env, ONDE_OS_NOVOS(desporto), null);
      const jaSabidas = new Map(((antes && antes.jogos) || []).map((j) => [j.id, j.cotacoes]));
      const juntos = (r.jogos || []).map((j) => ({ ...j, cotacoes: jaSabidas.get(j.id) || null }));
      /* Junta-se o que chegou com o que se sabia, mas podando: o que ja nao
         serve sai. Antes nao saia nada, e por isso a prateleira crescia sem
         nunca esquecer, com jogos adiados e jogos de ha dias la dentro. */
      const quando = Date.now();
      const por = new Map(
        ((antes && antes.jogos) || []).filter((j) => aindaServe(j, quando)).map((j) => [j.id, j])
      );
      juntos.forEach((j) => por.set(j.id, j));
      await guardarJogosNovos(env, desporto, [...por.values()].filter((j) => aindaServe(j, quando)));
      feito.aoVivo = [...(feito.aoVivo || []), desporto];
    }
  }

  /* Se a fonte nova recusou alguma coisa nesta volta, poe-se de castigo. */
  if (feito.erros.some((e) => /too many requests|recusou/i.test(e)))
    await env.QUADRO.put('desporto:nova-de-castigo', '1', { expirationTtl: 900 });

  /* E a fonte antiga continua a encher a prateleira. Enquanto a nova nao
     estiver provada por um dia inteiro, e ela que garante que ha jogos na
     pagina: tem quatrocentos e setenta creditos por gastar e um desenho que
     ja se sabe barato. */
  if (temChaveDaFeed(env)) {
    const velhos = await refrescarJogos(env);
    if (velhos.erro) feito.erros.push('antiga: ' + velhos.erro);
    else feito.jogosAntigos = velhos.jogos.length;
  }

  feito.contas = await contasDaFeed(env);
  await guardarRelatorio(env, feito);
  await aoBanco(env, '/trinco/largar', {});
  console.log('VOLTA ' + JSON.stringify(feito).slice(0, 1500));
  return feito;
}

export default {
  async fetch(request, env, ctx) {
    if (request.method === 'OPTIONS') return new Response(null, { headers: cabecalhos(request) });

    const url = new URL(request.url);
    // o Worker atende em meiadeleite.pt/api/..., por isso tira-se o /api
    const caminho = url.pathname.replace(/^\/api/, '').replace(/\/+$/, '') || '/';
    const metodo = request.method;

    /* Tudo o que o site precisa de saber, num pedido so.

       Antes eram quatro pedidos de cinco em cinco segundos por cada separador
       aberto, o que da quase um pedido por segundo por pessoa e come uma conta
       inteira num mes de separadores esquecidos. Ler quatro coisas do
       armazenamento e barato; o que custa e a viagem. */
    if (caminho === '/tudo' && metodo === 'GET') {
      const [agenda, quadro, membros, mural] = await Promise.all([
        ler(env, 'agenda', null),
        doBanco(env, '/todos'),
        ler(env, 'membros', []),
        ler(env, 'mural', [])
      ]);
      return responder(
        {
          agenda: { definida: agenda !== null, agenda: agenda ?? [] },
          quadro,
          membros,
          mural
        },
        request
      );
    }

    /* ---- quadro de honra ---- */

    if ((caminho === '/quadro' || caminho === '/') && metodo === 'GET')
      return responder(await doBanco(env, '/todos'), request);

    /* A porta de entrada: o nome e o PIN.

       Uma porta so para as tres coisas que podem acontecer. O nome e novo, e
       fica com este PIN. O nome ja existe mas ainda nao tem PIN, e fica com
       este. Ou o nome ja tem PIN, e e preciso acerta-lo.

       Quem acerta leva um passe, e e o passe que fica neste aparelho. Assim o
       PIN escreve-se uma vez por aparelho e nao anda a viajar a cada jogada, e
       quem perder o telemovel apaga o passe sem mexer no PIN.

       Antes disto o nome era de quem o estreasse e a prova vivia no browser:
       quem mudasse de telemovel perdia o nome, e quem limpasse o historico
       perdia os torroes com ele. */
    if (caminho === '/quadro/entrar' && metodo === 'POST') {
      const daqui = request.headers.get('CF-Connecting-IP') || 'desconhecido';
      const castigo = await ler(env, `pin:${daqui}`, null);
      if (castigo && castigo.ate > Date.now())
        return responder(
          { erro: `Demasiadas tentativas. Tenta daqui a ${minutosAte(castigo.ate)}.` },
          request,
          429
        );

      let veio;
      try {
        veio = await request.json();
      } catch {
        return responder({ erro: 'Corpo inválido.' }, request, 400);
      }

      const feito = await aoBanco(env, '/entrar', {
        nome: texto(veio?.nome, 24),
        pin: veio?.pin
      });

      /* Quem erra o PIN conta duas vezes: para o nome, que o banco trata, e
         para quem esta a perguntar, que e o que impede alguem de andar a
         experimentar PINs em nomes diferentes. */
      if (feito.enganou) await castigarQuemPergunta(env, daqui, castigo);
      else if (!feito.erro) await env.QUADRO.delete(`pin:${daqui}`);

      if (feito.erro) return responder({ erro: feito.erro }, request, feito.estado || 400);

      const mesa = await ler(env, `mesa:${feito.linha.nome}`, null);
      return responder(
        {
          linha: feito.linha,
          passe: feito.passe,
          estreou: feito.estreou,
          mesa: mesa ? vista(mesa, feito.linha.torroes) : null
        },
        request
      );
    }

    /* Voltar a mesa com o passe que este aparelho ja tem. */
    if (caminho === '/quadro/sentar' && metodo === 'POST') {
      return comOJogador(request, env, ({ mesa }) => mesa);
    }

    /* ---- a mesa: e aqui que as cartas saem ----

       As cartas sao dadas aqui e a carta tapada da casa nem chega a sair
       daqui enquanto estiver tapada. O site so pede jogadas e mostra o que
       recebe: nao tem como dizer que ganhou uma mao que perdeu, porque quem
       decide isso e este lado. */

    if (caminho === '/mesa' && metodo === 'POST') {
      return comOJogador(request, env, ({ mesa }) => mesa);
    }

    if (caminho === '/mesa/apostar' && metodo === 'POST') {
      return comOJogador(request, env, ({ linha, mesa, veio }) => {
        /* Com uma mao a meio nao se aposta outra vez: senao bastava pedir
           cartas novas para fugir a uma mao que corria mal. */
        if (mesa && mesa.fase === 'jogo') return 'Ainda tens uma mão a meio.';
        const aposta = numero(veio?.aposta);
        if (aposta < 1 || aposta > APOSTA_MAXIMA) return 'Aposta inválida.';
        if (aposta > linha.torroes) return 'Não tens torrões que cheguem.';
        linha.torroes -= aposta;
        // o sapato da mao anterior continua, como numa mesa a serio
        return mesaNova(aposta, mesa ? mesa.sapato : null);
      });
    }

    if (caminho === '/mesa/jogar' && metodo === 'POST') {
      return comOJogador(request, env, ({ linha, mesa, veio }) => {
        if (!mesa || mesa.fase !== 'jogo') return 'Não há nenhuma mão a decorrer.';
        /* O passo e o numero da jogada. Se nao bater certo e porque o pedido
           vem repetido ou fora de horas, e uma carta a mais era uma carta a
           mais. */
        if (numero(veio?.passo) !== mesa.passo) return 'Essa jogada já foi feita.';
        const acao = texto(veio?.acao, 10);
        mesa.passo++;

        if (acao === 'pedir') return pedir(mesa);
        if (acao === 'ficar') return ficar(mesa);
        if (acao === 'dobrar') {
          if (!podeDobrar(mesa, linha.torroes)) return 'Agora não dá para dobrar.';
          linha.torroes -= maoAtual(mesa).aposta;
          return dobrar(mesa);
        }
        if (acao === 'dividir') {
          if (!podeDividir(mesa, linha.torroes)) return 'Agora não dá para dividir.';
          linha.torroes -= maoAtual(mesa).aposta;
          return dividir(mesa);
        }
        return 'Jogada que não existe.';
      });
    }

    /* Apagar um nome do quadro. Vai no corpo e nao no caminho porque ha
       nomes com barras la dentro, e uma barra num caminho e outra coisa. */
    if (caminho === '/quadro/apagar' && metodo === 'POST') {
      if (!(await temChave(request, env)))
        return responder({ erro: 'Precisas de entrar outra vez.' }, request, 401);
      let veio;
      try {
        veio = await request.json();
      } catch {
        return responder({ erro: 'Corpo inválido.' }, request, 400);
      }
      const nome = texto(veio?.nome, 24);
      const feito = await aoBanco(env, '/apagar', { nome });
      if (feito.erro) return responder({ erro: feito.erro }, request, feito.estado || 400);
      await env.QUADRO.delete(`mesa:${nome}`);
      return responder(feito, request);
    }

    /* Aqui havia um /quadro/limpar, que apagava os nomes e os torroes de toda
       a gente. Saiu. Nao ha caso nenhum em que valha a pena poder fazer isso
       com um pedido: no dia em que fizer falta reiniciar o quadro, faz-se com
       o cuidado de quem escreve o codigo para o fazer, e nao com uma rota que
       esta ali a espera de ser chamada por engano. O banco ainda sabe limpar-
       se, e e so de la que se pode pedir. */

    /* ---- as mesas de poker ----

       Cada mesa e um Durable Object: um sitio so, que atende um pedido de cada
       vez e que fica com a ligacao aberta a quem la esta sentado. Este Worker
       so lhe entrega o pedido e sai da frente.

       Uma ligacao destas nao leva cabecalhos: o browser nao deixa. Por isso
       quem e cada um diz-se na primeira mensagem, ja dentro da ligacao, com a
       mesma chave do quadro de honra. */

    if (caminho === '/poker' && metodo === 'GET') {
      const quais = (url.searchParams.get('mesas') || '')
        .split(',')
        .map((x) => x.trim())
        .filter((x) => /^[A-Za-z0-9_-]{1,40}$/.test(x))
        .slice(0, 8);
      const todas = await Promise.all(
        quais.map(async (mesa) => {
          try {
            const r = await env.MESAS.get(env.MESAS.idFromName(mesa)).fetch(
              'https://mesa/quantos'
            );
            return { mesa, ...(await r.json()) };
          } catch {
            return { mesa, sentados: 0, aJogar: 0, maos: 0 };
          }
        })
      );
      return responder(todas, request);
    }

    const daMesa = /^\/poker\/([A-Za-z0-9_-]{1,40})$/.exec(caminho);
    if (daMesa) {
      /* So do nosso site. A chave e que manda, mas nao ha razao nenhuma para
         deixar outra pagina qualquer abrir uma ligacao a uma mesa nossa. */
      const origem = request.headers.get('Origin') || '';
      if (origem && !CASAS.includes(origem))
        return responder({ erro: 'Essa mesa nao e para aqui.' }, request, 403);
      return env.MESAS.get(env.MESAS.idFromName(daMesa[1])).fetch(request);
    }

    /* Tirar o PIN a um nome. E a unica saida quando alguem se mete no nome de
       outra pessoa: sem PIN o nome volta a poder ser reclamado, e os passes de
       quem la estava deixam de servir. */
    if (caminho === '/quadro/pin/apagar' && metodo === 'POST') {
      if (!(await temChave(request, env)))
        return responder({ erro: 'Precisas de entrar outra vez.' }, request, 401);
      let veio;
      try {
        veio = await request.json();
      } catch {
        return responder({ erro: 'Corpo inválido.' }, request, 400);
      }
      const feito = await aoBanco(env, '/pin/apagar', { nome: texto(veio?.nome, 24) });
      return responder(feito, request, feito.erro ? feito.estado || 400 : 200);
    }

    /* Os cem emprestados: so para quem esta mesmo sem nada. Quem decide e o
       banco, que e quem sabe o saldo a serio. */
    if (caminho === '/quadro/emprestimo' && metodo === 'POST') {
      let veio;
      try {
        veio = await request.json();
      } catch {
        return responder({ erro: 'Corpo inválido.' }, request, 400);
      }
      const nome = texto(veio?.nome, 24);
      const feito = await aoBanco(env, '/emprestimo', { nome, passe: texto(veio?.passe, 40) });
      if (feito.erro) return responder({ erro: feito.erro }, request, feito.estado || 400);
      const mesa = await ler(env, `mesa:${nome}`, null);
      return responder(
        { linha: feito.linha, mesa: mesa ? vista(mesa, feito.linha.torroes) : null },
        request
      );
    }

    /* O recorde de um jogo de um so jogador. Vem do browser e nao ha como o
       confirmar daqui, por isso nao vale torroes nenhuns: vale para se saber
       quem joga melhor, e mais nada. */
    if (caminho === '/quadro/recorde' && metodo === 'POST') {
      let veio;
      try {
        veio = await request.json();
      } catch {
        return responder({ erro: 'Corpo inválido.' }, request, 400);
      }
      const feito = await aoBanco(env, '/recorde', {
        nome: texto(veio?.nome, 24),
        passe: texto(veio?.passe, 40),
        jogo: texto(veio?.jogo, 20),
        pontos: veio?.pontos
      });
      return responder(feito, request, feito.erro ? feito.estado || 400 : 200);
    }

    /* ---- a roleta ----

       As fichas saem da carteira e a bola anda, tudo na mesma conta: o banco
       recebe o que se apostou e o que se ganhou de uma vez so, e ou faz as
       duas coisas ou nao faz nenhuma. O numero sai aqui, depois de as fichas
       estarem postas, e o site nao tem como o saber antes. */
    if (caminho === '/roleta' && metodo === 'POST') {
      let veio;
      try {
        veio = await request.json();
      } catch {
        return responder({ erro: 'Corpo inválido.' }, request, 400);
      }
      const nome = texto(veio?.nome, 24);
      const passe = texto(veio?.passe, 40);

      const visto = await aoBanco(env, '/ver', { nome, passe });
      if (visto.erro) return responder({ erro: visto.erro }, request, visto.estado || 400);

      const postas = limparApostas(veio?.apostas, visto.linha.torroes);
      if (postas.erro) return responder({ erro: postas.erro }, request, 400);

      const r = rodada(postas.apostas);
      const feito = await aoBanco(env, '/mexer', {
        nome,
        passe,
        custo: postas.total,
        delta: r.volta - postas.total,
        contas: {
          roleta: { rodadas: 1, ganhas: r.volta > 0 ? 1 : 0, maior: r.volta }
        }
      });
      if (feito.erro) return responder({ erro: feito.erro }, request, feito.estado || 400);

      return responder({ linha: feito.linha, rodada: r }, request);
    }

    /* ==================== as apostas desportivas ====================

       Os jogos saem do que a volta do dia deixou guardado, e por isso esta
       rota nao gasta crédito nenhum por muita gente que a abra. */

    if (caminho === '/desporto' && metodo === 'GET') {
      const guardado = { jogos: await todosOsJogos(env), quando: null };

      /* Com a prateleira quase vazia, da-se uma volta agora, por tras desta
         resposta, em vez de deixar a pagina sem nada ate a proxima. Serve para
         o dia em que a chave e posta e ninguem quer esperar pela madrugada,
         serve se o KV for limpo, e serve num domingo a noite em que a jornada
         ja acabou toda.

         Nao e uma porta para gastar creditos a pedido: so acontece com a
         prateleira vazia, o trinco de seis horas e o mesmo intervalo do
         relogio, e o tecto do dia esta por cima de tudo. Refrescar a pagina
         vinte vezes nao manda dar vinte voltas. */
      /* Da-se uma volta quando ha pouco para apostar, e tambem quando falta
         um desporto inteiro. A segunda condicao existe porque a primeira nao
         chegava: com quarenta jogos de futebol a prateleira parecia cheia
         enquanto o basebol, o hoquei e o resto estavam a zero. */
      const aFaltar = guardado.jogos.length < PRATELEIRA_VAZIA || (await faltamDesportos(env));
      if (aFaltar && temChaveDaFeed(env)) {
        const trinco = await env.QUADRO.get('desporto:arranque');
        if (!trinco) {
          await env.QUADRO.put('desporto:arranque', new Date().toISOString(), {
            expirationTtl: 6 * 3600
          });
          ctx.waitUntil(aVoltaDoDia(env));
        }
      }

      return responder(
        {
          ...guardado,
          /* Os desportos das duas fontes juntas. O tenis so existe na antiga
             porque a nova nao o tem; os outros todos vem da nova. */
          desportos: [...new Set([...Object.keys(DESPORTOS_NOVOS), ...DESPORTOS])],
          temFeed: temChaveDaFeed(env),
          contas: await contasDaFeed(env),
          /* O que a ultima volta fez. E so para se poder ver de fora porque e
             que ela nao trouxe o que se esperava; o site nao o mostra. */
          volta: await relatorioDaVolta(env),
          /* As contas das apostas guardadas, sem nome de ninguem. E so para
             quem mantem isto poder ver que ha apostas la dentro sem ter de
             pedir o PIN a alguem. */
          apostas: await doBanco(env, '/apostas/contas')
        },
        request
      );
    }

    /* Pôr uma aposta, de uma perna ou de várias.

       As cotações não vêm do site: vão-se buscar aos jogos que estão guardados
       aqui. Se viessem do site, bastava mexer no pedido no browser para
       apostar a cinquenta para um. Do site vem só em que jogo e em quem, que é
       o que ele tem direito a escolher. */
    if (caminho === '/desporto/apostar' && metodo === 'POST') {
      let veio;
      try {
        veio = await request.json();
      } catch {
        return responder({ erro: 'Corpo inválido.' }, request, 400);
      }

      const pedidas = Array.isArray(veio?.pernas) ? veio.pernas.slice(0, 12) : [];
      if (pedidas.length === 0) return responder({ erro: 'Não escolheste nada.' }, request, 400);

      const pernas = pedidas.map((p) => ({
        jogo: texto(p?.jogo, 64),
        escolha: texto(p?.escolha, 10)
      }));

      const todos = await todosOsJogos(env);
      const jogos = pernas.map((p) => todos.find((j) => j.id === p.jogo)).filter(Boolean);

      const feito = await aoBanco(env, '/apostar', {
        nome: texto(veio?.nome, 24),
        passe: texto(veio?.passe, 40),
        quanto: veio?.quanto,
        pernas,
        jogos
      });
      if (feito.erro) return responder({ erro: feito.erro }, request, feito.estado || 400);
      return responder(feito, request);
    }

    /* Como vai o jogo: as estatisticas e os eventos. */
    if (caminho.startsWith('/desporto/stats/') && metodo === 'GET') {
      const qual = texto(caminho.slice(16), 64);
      const jogo = (await todosOsJogos(env)).find((j) => j.id === qual);
      if (!jogo) return responder({ erro: 'Esse jogo já não está à vista.' }, request, 404);
      return responder(await comoVaiOJogo(env, jogo), request);
    }

    /* A classificacao da liga e o historico entre as duas equipas, cada um
       no seu separador da pagina da partida. */
    if (caminho.startsWith('/desporto/classificacao/') && metodo === 'GET') {
      const qual = texto(caminho.slice(24), 64);
      const jogo = (await todosOsJogos(env)).find((j) => j.id === qual);
      if (!jogo) return responder({ erro: 'Esse jogo já não está à vista.' }, request, 404);
      return responder(await maisDoJogo(env, jogo, 'classificacao'), request);
    }

    if (caminho.startsWith('/desporto/confrontos/') && metodo === 'GET') {
      const qual = texto(caminho.slice(21), 64);
      const jogo = (await todosOsJogos(env)).find((j) => j.id === qual);
      if (!jogo) return responder({ erro: 'Esse jogo já não está à vista.' }, request, 404);
      return responder(await maisDoJogo(env, jogo, 'confrontos'), request);
    }

    /* Um jogo só, para a página de detalhe. Sai do que já está guardado, por
       isso não gasta crédito nenhum por muita gente que lá entre. */
    if (caminho.startsWith('/desporto/jogo/') && metodo === 'GET') {
      const qual = texto(caminho.slice(15), 64);
      const jogo = (await todosOsJogos(env)).find((j) => j.id === qual);
      if (!jogo) return responder({ erro: 'Esse jogo já não está aberto a apostas.' }, request, 404);

      /* O que já se sabe que o plano não dá, dito antes de a pessoa lá clicar.
         Um separador que nunca vai ter nada não é honesto: mais vale não
         estar. Isto sai do que já está apontado, por isso não custa nada. */
      const semPlanoDe = async (que) =>
        !!(await env.QUADRO.get(
          `desporto:sem-plano:${que}:${jogo.desporto}:${jogo.temporada || ''}`
        ));

      return responder(
        {
          jogo,
          daoTabela: !(await semPlanoDe('classificacao')),
          daoConfrontos: !(await semPlanoDe('confrontos'))
        },
        request
      );
    }

    /* As apostas de quem prova ser dono do nome. */
    if (caminho === '/desporto/minhas' && metodo === 'POST') {
      let veio;
      try {
        veio = await request.json();
      } catch {
        return responder({ erro: 'Corpo inválido.' }, request, 400);
      }
      const feito = await aoBanco(env, '/apostas', {
        nome: texto(veio?.nome, 24),
        passe: texto(veio?.passe, 40)
      });
      if (feito.erro) return responder({ erro: feito.erro }, request, feito.estado || 400);
      return responder(feito, request);
    }

    /* Resolver jogos à mão, para quem manda na casa.

       Uma feed perde jogos: um adiamento, uma liga que ela deixa de seguir, um
       nome de equipa que muda a meio da época. Quando isso acontece, os torrões
       de quem apostou ficam presos até ao prazo de desistência, que é uma
       semana. Isto é a saída: diz-se aqui quem ganhou e as apostas fecham.

       Quem responde por isto é quem tem a chave da administração, e fica dito
       nos termos que é o grupo que decide estes casos. */
    if (caminho === '/desporto/resolver' && metodo === 'POST') {
      if (!(await temChave(request, env)))
        return responder({ erro: 'Entra primeiro.' }, request, 401);

      let veio;
      try {
        veio = await request.json();
      } catch {
        return responder({ erro: 'Corpo inválido.' }, request, 400);
      }
      const lista = Array.isArray(veio?.resultados) ? veio.resultados : [];
      const limpos = lista
        .map((r) => ({ jogo: texto(r?.jogo, 64), ganhou: texto(r?.ganhou, 10) }))
        .filter((r) => r.jogo && ['casa', 'fora', 'empate'].includes(r.ganhou));
      if (limpos.length === 0)
        return responder({ erro: 'Não veio nenhum resultado que se aproveite.' }, request, 400);

      return responder(await aoBanco(env, '/apostas/fechar', { resultados: limpos }), request);
    }

    /* Dar a volta do dia à mão, para quem manda na casa. Serve para não se ter
       de esperar pelo relógio quando se está a estrear isto. */
    if (caminho === '/desporto/volta' && metodo === 'POST') {
      if (!(await temChave(request, env)))
        return responder({ erro: 'Entra primeiro.' }, request, 401);
      return responder(await aVoltaDoDia(env), request);
    }

    /* ==================== os avisos de coisas partidas ====================

       Quem encontra um erro no site escreve-o, e quem toma conta da casa le-o
       na cozinha. Escrever e publico de proposito: obrigar a entrar com um
       nome para se poder avisar de um erro era perder metade dos avisos, que
       muita gente encontra o erro sem sessao iniciada. */

    if (caminho === '/tickets' && metodo === 'POST') {
      /* Ha um travao por endereco, que sem ele bastava um script para encher
         a caixa. Cinco por hora chega para quem esta mesmo a avisar de coisas,
         e nao chega para quem esta a brincar. */
      const daqui = request.headers.get('CF-Connecting-IP') || 'desconhecido';
      const quantos = (await ler(env, `tickets:${daqui}`, 0)) || 0;
      if (quantos >= 5)
        return responder(
          { erro: 'Já mandaste avisos que cheguem por agora. Tenta daqui a bocado.' },
          request,
          429
        );

      let veio;
      try {
        veio = await request.json();
      } catch {
        return responder({ erro: 'Corpo inválido.' }, request, 400);
      }

      const limpo = limparTicket(veio, { id: novoId() });
      if (limpo.erro) return responder({ erro: limpo.erro }, request, 400);

      const lista = arrumarTickets([limpo.ticket, ...(await ler(env, 'tickets', []))]);
      await env.QUADRO.put('tickets', JSON.stringify(lista));
      await env.QUADRO.put(`tickets:${daqui}`, JSON.stringify(quantos + 1), {
        expirationTtl: 3600
      });

      return responder({ ok: true, id: limpo.ticket.id }, request);
    }

    /* Ler e arrumar a caixa e so para quem tem a chave da cozinha. */
    if (caminho === '/tickets' && metodo === 'GET') {
      if (!(await temChave(request, env)))
        return responder({ erro: 'Entra primeiro.' }, request, 401);
      const lista = await ler(env, 'tickets', []);
      return responder({ tickets: lista, contas: contasDosTickets(lista) }, request);
    }

    if (caminho === '/tickets/estado' && metodo === 'POST') {
      if (!(await temChave(request, env)))
        return responder({ erro: 'Entra primeiro.' }, request, 401);
      let veio;
      try {
        veio = await request.json();
      } catch {
        return responder({ erro: 'Corpo inválido.' }, request, 400);
      }
      const nova = mudarEstado(
        await ler(env, 'tickets', []),
        texto(veio?.id, 40),
        texto(veio?.estado, 20)
      );
      if (!nova) return responder({ erro: 'Esse aviso já não existe.' }, request, 404);
      await env.QUADRO.put('tickets', JSON.stringify(nova));
      return responder({ tickets: nova, contas: contasDosTickets(nova) }, request);
    }

    if (caminho === '/tickets/apagar' && metodo === 'POST') {
      if (!(await temChave(request, env)))
        return responder({ erro: 'Entra primeiro.' }, request, 401);
      let veio;
      try {
        veio = await request.json();
      } catch {
        return responder({ erro: 'Corpo inválido.' }, request, 400);
      }
      const nova = apagarTicket(await ler(env, 'tickets', []), texto(veio?.id, 40));
      if (!nova) return responder({ erro: 'Esse aviso já não existe.' }, request, 404);
      await env.QUADRO.put('tickets', JSON.stringify(nova));
      return responder({ tickets: nova, contas: contasDosTickets(nova) }, request);
    }

    /* ---- entrada na página de admin ---- */

    if (caminho === '/admin/entrar' && metodo === 'POST') return entrar(request, env);

    if (caminho === '/admin/sair' && metodo === 'POST') {
      const chave = String(request.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
      if (/^[a-f0-9]{48}$/.test(chave)) await env.QUADRO.delete(`sessao:${chave}`);
      return responder({ ok: true }, request);
    }

    /* ---- agenda ---- */

    if (caminho === '/agenda') {
      const guardada = await ler(env, 'agenda', null);

      // ainda ninguem mexeu na agenda por aqui: o site usa o ficheiro dele
      if (metodo === 'GET')
        return responder({ definida: guardada !== null, agenda: guardada ?? [] }, request);

      if (metodo === 'POST') {
        if (!(await temChave(request, env)))
          return responder({ erro: 'Precisas de entrar outra vez.' }, request, 401);

        let veio;
        try {
          veio = await request.json();
        } catch {
          return responder({ erro: 'Corpo inválido.' }, request, 400);
        }
        const evento = limparEvento(veio, null);
        if (!evento.titulo) return responder({ erro: 'Falta dizer o que é.' }, request, 400);

        const agenda = guardada ?? [];
        if (agenda.length >= MAX_EVENTOS)
          return responder({ erro: 'A agenda está cheia.' }, request, 409);

        agenda.push(evento);
        await env.QUADRO.put('agenda', JSON.stringify(agenda));
        return responder(evento, request);
      }
    }

    const comId = /^\/agenda\/([A-Za-z0-9_-]{1,40})$/.exec(caminho);
    if (comId && (metodo === 'PATCH' || metodo === 'DELETE')) {
      if (!(await temChave(request, env)))
        return responder({ erro: 'Precisas de entrar outra vez.' }, request, 401);

      const agenda = await ler(env, 'agenda', []);
      const onde = agenda.findIndex((e) => e.id === comId[1]);
      if (onde < 0) return responder({ erro: 'Esse evento já não existe.' }, request, 404);

      if (metodo === 'DELETE') {
        agenda.splice(onde, 1);
        await env.QUADRO.put('agenda', JSON.stringify(agenda));
        return responder({ ok: true }, request);
      }

      let veio;
      try {
        veio = await request.json();
      } catch {
        return responder({ erro: 'Corpo inválido.' }, request, 400);
      }
      agenda[onde] = limparEvento(veio, agenda[onde]);
      await env.QUADRO.put('agenda', JSON.stringify(agenda));
      return responder(agenda[onde], request);
    }

    /* ---- membros ---- */

    if (caminho === '/membros') {
      const lista = await ler(env, 'membros', []);

      if (metodo === 'GET') return responder(lista, request);

      if (metodo === 'POST') {
        if (!(await temChave(request, env)))
          return responder({ erro: 'Precisas de entrar outra vez.' }, request, 401);

        let veio;
        try {
          veio = await request.json();
        } catch {
          return responder({ erro: 'Corpo inválido.' }, request, 400);
        }
        const nome = texto(veio?.nome, 40);
        if (!nome) return responder({ erro: 'Falta o nome.' }, request, 400);
        if (lista.length >= MAX_MEMBROS)
          return responder({ erro: 'Já não cabem mais membros.' }, request, 409);

        const membro = {
          id: novoId(),
          nome,
          descricao: texto(veio?.descricao, 200),
          temFoto: false,
          mascote: false,
          ordem: lista.length
        };
        const guardou = await guardarFoto(env, membro.id, veio?.foto);
        if (guardou === 'grande')
          return responder({ erro: 'A foto é demasiado pesada.' }, request, 413);
        membro.temFoto = guardou === true;

        lista.push(membro);
        await env.QUADRO.put('membros', JSON.stringify(lista));
        return responder(membro, request);
      }
    }

    const membroComId = /^\/membros\/([A-Za-z0-9_-]{1,40})$/.exec(caminho);
    if (membroComId && (metodo === 'PATCH' || metodo === 'DELETE')) {
      if (!(await temChave(request, env)))
        return responder({ erro: 'Precisas de entrar outra vez.' }, request, 401);

      const lista = await ler(env, 'membros', []);
      const onde = lista.findIndex((m) => m.id === membroComId[1]);
      if (onde < 0) return responder({ erro: 'Esse membro já não existe.' }, request, 404);

      if (metodo === 'DELETE') {
        await env.QUADRO.delete(`foto:${lista[onde].id}`);
        // a galeria dele vai atras, ficheiro a ficheiro
        for (const item of await ler(env, `galeria:${lista[onde].id}`, []))
          await env.QUADRO.delete(`media:${item.id}`);
        await env.QUADRO.delete(`galeria:${lista[onde].id}`);
        lista.splice(onde, 1);
        lista.forEach((m, i) => {
          m.ordem = i;
        });
        await env.QUADRO.put('membros', JSON.stringify(lista));
        return responder({ ok: true }, request);
      }

      let veio;
      try {
        veio = await request.json();
      } catch {
        return responder({ erro: 'Corpo inválido.' }, request, 400);
      }
      const m = lista[onde];
      if (texto(veio?.nome, 40)) m.nome = texto(veio.nome, 40);
      if (typeof veio?.descricao === 'string') m.descricao = texto(veio.descricao, 200);
      /* Mascote ha uma so: aclamar uma tira o titulo a anterior. */
      if (typeof veio?.mascote === 'boolean') {
        for (const outro of lista) outro.mascote = false;
        m.mascote = veio.mascote;
      }
      if (veio?.foto) {
        const guardou = await guardarFoto(env, m.id, veio.foto);
        if (guardou === 'grande')
          return responder({ erro: 'A foto é demasiado pesada.' }, request, 413);
        if (guardou === true) m.temFoto = true;
      }
      await env.QUADRO.put('membros', JSON.stringify(lista));
      return responder(m, request);
    }

    /* ---- o mural do Instagram ----

       O Instagram fechou as portas a quem quer ler um perfil sem estar la
       dentro: nem daqui nem do browser se consegue ir buscar as publicacoes a
       bruta. O que ha e a via oficial, a API da Meta, que precisa de uma
       conta de empresa e de um token; sem ele, as publicacoes poem-se a mao
       pelo painel de admin, que e o que estas rotas fazem. */

    if (caminho === '/mural') {
      const lista = await ler(env, 'mural', []);

      if (metodo === 'GET') return responder(lista, request);

      if (metodo === 'POST') {
        if (!(await temChave(request, env)))
          return responder({ erro: 'Precisas de entrar outra vez.' }, request, 401);
        if (lista.length >= MAX_NO_MURAL)
          return responder({ erro: 'O mural está cheio.' }, request, 409);

        const id = codigoDoInsta(url.searchParams.get('url'));
        if (!id) return responder({ erro: 'Esse link não parece de uma publicação.' }, request, 400);
        if (lista.some((x) => x.id === id))
          return responder({ erro: 'Essa publicação já está no mural.' }, request, 409);

        const mime = (request.headers.get('Content-Type') || '').split(';')[0].trim();
        if (!TIPOS_DE_MEDIA.includes(mime) || mime.startsWith('video/'))
          return responder({ erro: 'A capa tem de ser uma imagem.' }, request, 415);

        const bytes = await request.arrayBuffer();
        if (bytes.byteLength === 0) return responder({ erro: 'A capa veio vazia.' }, request, 400);
        if (bytes.byteLength > MAX_MEDIA)
          return responder({ erro: 'Essa capa é demasiado pesada.' }, request, 413);

        const formato = ['foto', 'album', 'reel'].includes(url.searchParams.get('formato'))
          ? url.searchParams.get('formato')
          : 'foto';
        const data = eData(url.searchParams.get('data'))
          ? url.searchParams.get('data')
          : new Date().toISOString().slice(0, 10);

        await env.QUADRO.put(`media:insta-${id}`, bytes);
        const post = {
          id,
          data,
          url: `https://www.instagram.com/p/${id}/`,
          legenda: texto(url.searchParams.get('legenda'), 2200),
          temImagem: true,
          formato,
          slides: 1,
          mime,
          daNuvem: true
        };
        lista.unshift(post);
        lista.sort((a, b) => (a.data < b.data ? 1 : a.data > b.data ? -1 : 0));
        await env.QUADRO.put('mural', JSON.stringify(lista));
        return responder(post, request);
      }
    }

    const doMural = /^\/mural\/([A-Za-z0-9_-]{1,40})$/.exec(caminho);
    if (doMural && metodo === 'DELETE') {
      if (!(await temChave(request, env)))
        return responder({ erro: 'Precisas de entrar outra vez.' }, request, 401);
      const lista = await ler(env, 'mural', []);
      const onde = lista.findIndex((x) => x.id === doMural[1]);
      if (onde < 0) return responder({ erro: 'Essa não está no mural.' }, request, 404);
      await env.QUADRO.delete(`media:insta-${lista[onde].id}`);
      lista.splice(onde, 1);
      await env.QUADRO.put('mural', JSON.stringify(lista));
      return responder({ ok: true }, request);
    }

    /* O botao de ir buscar as que faltam. So funciona com um token da API da
       Meta guardado nos segredos do Worker (INSTAGRAM_TOKEN); sem ele nao ha
       maneira nenhuma de um servidor ler o perfil, e o mais honesto e dizer
       isso em vez de fingir que se tentou. */
    if (caminho === '/mural/sincronizar' && metodo === 'POST') {
      if (!(await temChave(request, env)))
        return responder({ erro: 'Precisas de entrar outra vez.' }, request, 401);
      if (!env.INSTAGRAM_TOKEN)
        return responder(
          {
            erro: 'Falta o token da Meta. Sem ele o Instagram não deixa ninguém ler o perfil de fora, e as publicações têm de ser postas à mão aqui ao lado.'
          },
          request,
          501
        );

      const campos = 'id,caption,media_type,media_url,permalink,thumbnail_url,timestamp';
      let vindas;
      try {
        const r = await fetch(
          `https://graph.instagram.com/me/media?fields=${campos}&limit=25&access_token=${env.INSTAGRAM_TOKEN}`
        );
        vindas = await r.json();
        if (!r.ok) throw new Error(vindas?.error?.message || 'a Meta recusou');
      } catch (e) {
        return responder({ erro: 'A Meta não respondeu: ' + e.message }, request, 502);
      }

      const lista = await ler(env, 'mural', []);
      const jaLa = new Set(lista.map((x) => x.id));
      let postas = 0;

      for (const v of vindas.data || []) {
        const id = codigoDoInsta(v.permalink);
        if (!id || jaLa.has(id)) continue;

        /* Dos videos guarda-se a miniatura: o video em si vive no Instagram e
           e de la que o mural o mostra. */
        const capa = v.media_type === 'VIDEO' ? v.thumbnail_url : v.media_url;
        if (!capa) continue;
        let bytes;
        try {
          const r = await fetch(capa);
          if (!r.ok) continue;
          bytes = await r.arrayBuffer();
        } catch {
          continue;
        }
        if (bytes.byteLength === 0 || bytes.byteLength > MAX_MEDIA) continue;

        await env.QUADRO.put(`media:insta-${id}`, bytes);
        lista.push({
          id,
          data: String(v.timestamp || '').slice(0, 10),
          url: v.permalink,
          legenda: texto(v.caption, 2200),
          temImagem: true,
          formato: v.media_type === 'VIDEO' ? 'reel' : v.media_type === 'CAROUSEL_ALBUM' ? 'album' : 'foto',
          slides: 1,
          mime: 'image/jpeg',
          daNuvem: true
        });
        jaLa.add(id);
        postas++;
      }

      lista.sort((a, b) => (a.data < b.data ? 1 : a.data > b.data ? -1 : 0));
      await env.QUADRO.put('mural', JSON.stringify(lista.slice(0, MAX_NO_MURAL)));
      return responder({ ok: true, postas }, request);
    }

    /* ---- a galeria da mascote ----

       Uma lista por membro, e cada coisa guardada a parte com o seu tipo.
       Quem ve so precisa do enderecos; quem poe precisa da chave de admin. */

    const galeriaDe = /^\/galeria\/([A-Za-z0-9_-]{1,40})$/.exec(caminho);
    if (galeriaDe) {
      const dono = galeriaDe[1];
      const lista = await ler(env, `galeria:${dono}`, []);

      if (metodo === 'GET') return responder(lista, request);

      if (metodo === 'POST') {
        if (!(await temChave(request, env)))
          return responder({ erro: 'Precisas de entrar outra vez.' }, request, 401);
        if (lista.length >= MAX_NA_GALERIA)
          return responder({ erro: 'A galeria está cheia.' }, request, 409);

        const mime = (request.headers.get('Content-Type') || '').split(';')[0].trim();
        if (!TIPOS_DE_MEDIA.includes(mime))
          return responder({ erro: 'Isso não é uma foto nem um vídeo que eu saiba mostrar.' }, request, 415);

        const bytes = await request.arrayBuffer();
        if (bytes.byteLength === 0) return responder({ erro: 'Veio vazio.' }, request, 400);
        if (bytes.byteLength > MAX_MEDIA)
          return responder(
            { erro: 'Isso é demasiado pesado. O limite são oito megabytes.' },
            request,
            413
          );

        const item = {
          id: novoId() + novoId(),
          mime,
          tipo: mime.startsWith('video/') ? 'video' : 'foto',
          legenda: texto(url.searchParams.get('legenda'), 120),
          criadoEm: new Date().toISOString()
        };
        await env.QUADRO.put(`media:${item.id}`, bytes);
        lista.push(item);
        await env.QUADRO.put(`galeria:${dono}`, JSON.stringify(lista));
        return responder(item, request);
      }
    }

    const itemDaGaleria = /^\/galeria\/([A-Za-z0-9_-]{1,40})\/([A-Za-z0-9_-]{1,80})$/.exec(caminho);
    if (itemDaGaleria && metodo === 'DELETE') {
      if (!(await temChave(request, env)))
        return responder({ erro: 'Precisas de entrar outra vez.' }, request, 401);
      const dono = itemDaGaleria[1];
      const lista = await ler(env, `galeria:${dono}`, []);
      const onde = lista.findIndex((x) => x.id === itemDaGaleria[2]);
      if (onde < 0) return responder({ erro: 'Isso já não está lá.' }, request, 404);
      await env.QUADRO.delete(`media:${lista[onde].id}`);
      lista.splice(onde, 1);
      await env.QUADRO.put(`galeria:${dono}`, JSON.stringify(lista));
      return responder({ ok: true }, request);
    }

    /** Uma foto ou um video da galeria, servido tal e qual, para o site o
     *  poder mostrar numa tag normal. */
    const mediaComId = /^\/media\/([A-Za-z0-9_-]{1,80})$/.exec(caminho);
    if (mediaComId && metodo === 'GET') {
      const bytes = await env.QUADRO.get(`media:${mediaComId[1]}`, 'arrayBuffer');
      if (!bytes) return new Response(null, { status: 404, headers: cabecalhos(request) });
      /* O tipo esta na lista de quem e dono do ficheiro, mas procurar por ele
         obrigava a ler as listas todas. Vai antes no proprio endereco, como
         pergunta, e se nao vier assume-se imagem. */
      const mime = TIPOS_DE_MEDIA.includes(url.searchParams.get('tipo') || '')
        ? url.searchParams.get('tipo')
        : 'image/jpeg';
      return new Response(bytes, {
        headers: {
          'Content-Type': mime,
          'Cache-Control': 'public, max-age=31536000, immutable',
          'Accept-Ranges': 'none',
          ...cabecalhos(request)
        }
      });
    }

    /** A foto de um membro, servida como imagem para o site a poder mostrar
     *  numa tag normal. */
    const fotoComId = /^\/membros\/([A-Za-z0-9_-]{1,40})\/foto$/.exec(caminho);
    if (fotoComId && metodo === 'GET') {
      const guardada = await env.QUADRO.get(`foto:${fotoComId[1]}`);
      if (!guardada) return new Response(null, { status: 404, headers: cabecalhos(request) });
      const bytes = Uint8Array.from(atob(guardada), (c) => c.charCodeAt(0));
      return new Response(bytes, {
        headers: {
          'Content-Type': 'image/jpeg',
          'Cache-Control': 'public, max-age=300',
          ...cabecalhos(request)
        }
      });
    }

    /** Primeira vez: deixa o admin trazer para aqui a agenda que está no
     *  ficheiro do site, para não se começar do zero. Só funciona enquanto
     *  ninguém tiver mexido na agenda por aqui. */
    if (caminho === '/agenda/importar' && metodo === 'POST') {
      if (!(await temChave(request, env)))
        return responder({ erro: 'Precisas de entrar outra vez.' }, request, 401);
      if ((await ler(env, 'agenda', null)) !== null)
        return responder({ erro: 'A agenda daqui já tem coisas.' }, request, 409);

      let veio;
      try {
        veio = await request.json();
      } catch {
        return responder({ erro: 'Corpo inválido.' }, request, 400);
      }
      const lista = Array.isArray(veio?.agenda) ? veio.agenda.slice(0, MAX_EVENTOS) : [];
      const limpa = lista.map((e) => limparEvento(e, { ...e, id: texto(e?.id, 40) || novoId() }));
      await env.QUADRO.put('agenda', JSON.stringify(limpa));
      return responder({ ok: true, quantos: limpa.length }, request);
    }

    return responder({ erro: 'Não há nada aqui.' }, request, 404);
  },

  /* O relógio da Cloudflare. Uma volta por dia, de manhã, que é o que os
     quinhentos créditos por mês dão com folga. Está em wrangler.toml. */
  async scheduled(evento, env, ctx) {
    ctx.waitUntil(aVoltaDoDia(env));
  }
};
