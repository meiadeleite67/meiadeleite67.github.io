/**
 * De onde vêm os jogos, as cotações e os resultados.
 *
 * A feed é a The Odds API. A chave dela vive como segredo do Worker e nunca
 * passa por aqui para fora: o site nunca fala com a feed, fala só connosco.
 * Se falasse, a chave tinha de ir no browser de toda a gente.
 *
 * O plano gratuito são 500 créditos por mês, o que dá uns dezasseis por dia, e
 * é esse número que manda em tudo o que está aqui desenhado. Não há cotações ao
 * segundo nem há pedidos quando alguém abre a página: há duas voltas por dia,
 * feitas pelo relógio da Cloudflare, e o que elas trouxerem fica guardado no KV
 * para toda a gente ver sem gastar nada.
 *
 * Contas de uma volta:
 *   a lista de desportos      0 créditos (esta não conta para a quota)
 *   cotações, 4 ligas         4 créditos
 *   resultados, até 3 ligas   6 créditos (2 por liga, com os dias para trás)
 *
 * Que dá onze por dia e uns trezentos e trinta por mês, com folga para os meses
 * de trinta e um dias e para quem carregue no botão de refrescar.
 *
 * A lista de desportos ser de graça resolve de caminho o problema do ténis, que
 * não tem uma chave só: cada torneio é o seu. Em vez de adivinhar que torneios
 * há esta semana, pergunta-se, que não custa nada, e apanha-se o que estiver a
 * decorrer.
 */
import { jogoDaFeed } from './apostas.js';

const CASA = 'https://api.the-odds-api.com/v4';

/** Onde ficam guardadas as coisas entre voltas. */
const ONDE_OS_JOGOS = 'desporto:jogos';
const ONDE_AS_CONTAS = 'desporto:creditos';

/** Os desportos que se seguem, e quantas ligas de cada. O ténis leva uma só
 *  porque os torneios mudam de semana para semana e não vale a pena gastar
 *  créditos em quatro ao mesmo tempo. */
const A_SEGUIR = [
  { grupo: 'Soccer', quantas: 2, nome: 'Futebol' },
  { grupo: 'Basketball', quantas: 1, nome: 'Basquetebol' },
  { grupo: 'Tennis', quantas: 1, nome: 'Ténis' }
];

/** Quando há mais ligas do que lugares, estas vão à frente. É a única parte
 *  disto que tem gosto pessoal lá dentro. */
const PRIMEIRO = [
  'soccer_portugal_primeira_liga',
  'soccer_uefa_champs_league',
  'soccer_epl',
  'soccer_spain_la_liga',
  'basketball_nba',
  'basketball_euroleague'
];

/** Abaixo disto só se gastam créditos para fechar apostas. Quem tem torrões
 *  presos numa aposta por fechar tem mais direito ao que resta da quota do que
 *  quem quer ver jogos novos. */
const GUARDADOS_PARA_FECHAR = 40;

const cabecalhoDasContas = (r) => ({
  restam: Number(r.headers.get('x-requests-remaining')),
  gastos: Number(r.headers.get('x-requests-used'))
});

export const temChaveDaFeed = (env) => typeof env.ODDS_API_CHAVE === 'string' && env.ODDS_API_CHAVE.length > 8;

/**
 * Um pedido à feed, com as contas apontadas.
 *
 * Devolve sempre um objeto, nunca atira. Uma feed em baixo não pode levar o
 * site atrás dela: pior do que não haver jogos novos é não haver site.
 */
async function pedir(env, caminho, procura = {}) {
  if (!temChaveDaFeed(env)) return { erro: 'sem chave' };

  const url = new URL(CASA + caminho);
  Object.entries(procura).forEach(([k, v]) => url.searchParams.set(k, v));
  url.searchParams.set('apiKey', env.ODDS_API_CHAVE);

  let r;
  try {
    r = await fetch(url, { headers: { Accept: 'application/json' } });
  } catch {
    return { erro: 'a feed não respondeu' };
  }
  if (!r.ok) return { erro: `a feed respondeu ${r.status}`, estado: r.status };

  let corpo;
  try {
    corpo = await r.json();
  } catch {
    return { erro: 'a feed respondeu coisa que não se lê' };
  }
  return { corpo, contas: cabecalhoDasContas(r) };
}

/** Quantos créditos restam, do que a última resposta disse. */
export async function contasDaFeed(env) {
  const guardado = await env.QUADRO.get(ONDE_AS_CONTAS, 'json');
  return guardado || { restam: null, gastos: null, quando: null };
}

async function apontarContas(env, contas) {
  if (!contas || !Number.isFinite(contas.restam)) return;
  await env.QUADRO.put(
    ONDE_AS_CONTAS,
    JSON.stringify({ ...contas, quando: new Date().toISOString() })
  );
}

/**
 * Que ligas seguir hoje.
 *
 * Isto não gasta créditos, e é por isso que se pergunta em vez de se adivinhar.
 * Das que estão a decorrer, ficam as preferidas e, se sobrarem lugares, as
 * outras pela ordem em que vierem.
 */
export async function ligasDeHoje(env) {
  const r = await pedir(env, '/sports/');
  if (r.erro) return { erro: r.erro };
  const todas = Array.isArray(r.corpo) ? r.corpo : [];

  const escolhidas = [];
  for (const { grupo, quantas, nome } of A_SEGUIR) {
    /* Sem os vencedores de campeonato: ali não há jogo nenhum para acabar, e
       uma aposta que só fecha em maio ficava meio ano à espera. */
    const doGrupo = todas.filter((d) => d && d.group === grupo && d.active && !d.has_outrights);
    const ordenadas = [
      ...doGrupo.filter((d) => PRIMEIRO.includes(d.key)),
      ...doGrupo.filter((d) => !PRIMEIRO.includes(d.key))
    ];
    ordenadas.slice(0, quantas).forEach((d) => escolhidas.push({ chave: d.key, liga: d.title, desporto: nome }));
  }
  return { ligas: escolhidas, contas: r.contas };
}

/**
 * Vai buscar os jogos das ligas de hoje e guarda-os.
 *
 * As cotações pedem-se em decimal e à região da Europa, que é a que tem as
 * casas de apostas que dizem alguma coisa a quem está cá. Um mercado e uma
 * região é um crédito por liga, que é o mais barato que isto se consegue pedir.
 */
export async function refrescarJogos(env) {
  const contas = await contasDaFeed(env);
  if (Number.isFinite(contas.restam) && contas.restam <= GUARDADOS_PARA_FECHAR)
    return { erro: 'créditos quase no fim, os que restam ficam para fechar apostas' };

  const quais = await ligasDeHoje(env);
  if (quais.erro) return { erro: quais.erro };
  await apontarContas(env, quais.contas);

  const jogos = [];
  const agora = Date.now();
  for (const { chave, liga, desporto } of quais.ligas) {
    const r = await pedir(env, `/sports/${chave}/odds/`, {
      regions: 'eu',
      markets: 'h2h',
      oddsFormat: 'decimal'
    });
    if (r.erro) continue;
    await apontarContas(env, r.contas);

    const crus = Array.isArray(r.corpo) ? r.corpo : [];
    for (const cru of crus) {
      const jogo = jogoDaFeed(cru, agora);
      if (jogo) jogos.push({ ...jogo, liga: jogo.liga || liga, desporto });
    }
  }

  /* Pelos que começam primeiro, e não mais do que cabem numa página. */
  jogos.sort((a, b) => Date.parse(a.comeca) - Date.parse(b.comeca));
  const guardar = { jogos: jogos.slice(0, 60), quando: new Date().toISOString() };
  await env.QUADRO.put(ONDE_OS_JOGOS, JSON.stringify(guardar));
  return guardar;
}

/** Os jogos que estão guardados, sem gastar crédito nenhum. */
export async function jogosGuardados(env) {
  const guardado = await env.QUADRO.get(ONDE_OS_JOGOS, 'json');
  if (!guardado) return { jogos: [], quando: null };
  /* Os que já começaram saem da lista sem ser preciso ir buscar nada: a hora
     de começo já está guardada e o relógio anda sozinho. */
  const agora = Date.now();
  return { ...guardado, jogos: guardado.jogos.filter((j) => Date.parse(j.comeca) > agora) };
}

/** Um jogo pelo seu número, para se confirmar uma aposta contra ele. */
export async function jogoGuardado(env, id) {
  const { jogos } = await jogosGuardados(env);
  return jogos.find((j) => j.id === id) || null;
}

/**
 * Os resultados de uma liga, dos últimos três dias.
 *
 * Três dias são o máximo que a feed dá de uma vez, e é o que torna possível
 * fechar apostas uma vez por dia sem nunca deixar passar um jogo. Custa dois
 * créditos em vez de um, e é dinheiro bem gasto.
 */
export async function resultadosDe(env, chave) {
  const r = await pedir(env, `/sports/${chave}/scores/`, { daysFrom: 3 });
  if (r.erro) return { erro: r.erro };
  await apontarContas(env, r.contas);
  return { resultados: Array.isArray(r.corpo) ? r.corpo : [] };
}
