/**
 * Como vai o jogo: as estatísticas, e o que se faz com o que vem.
 *
 * Cada desporto da API-Sports responde a isto de uma maneira diferente. O
 * futebol manda uma lista de duas equipas, cada uma com a sua lista de pares
 * tipo/valor; outros mandam um objeto com "home" e "away" lá dentro; outros
 * mandam a lista de pares como objeto em vez de lista. Escrever um leitor para
 * cada um dava doze leitores para manter, e bastava um deles mudar de forma
 * para se perder as estatísticas desse desporto sem ninguém dar por isso.
 *
 * Por isso aqui há um leitor só, tolerante: tenta as formas que se conhecem,
 * aceita a primeira que resulte, e quando não entende nada devolve lista
 * vazia em vez de atirar. Uma página de jogo sem estatísticas é uma página
 * sem estatísticas; uma página que rebenta é uma página perdida.
 *
 * O que não está aqui, e não está de propósito: a posição da bola. Isso não
 * vem desta feed nem de nenhuma que se consiga sem contrato, porque é
 * recolhido no estádio por quem tem câmaras lá montadas.
 */

/** Onde cada desporto guarda as estatísticas de um jogo.
 *
 *  Vai uma lista de caminhos por desporto e não um caminho só, porque a
 *  API-Sports não os tem todos iguais e a documentação de cada desporto é uma
 *  página diferente. Provei-os ao vivo: o futebol responde a
 *  "/fixtures/statistics", e nos outros o que existe é "/games/statistics" ou
 *  "/games/statistics/teams" conforme o desporto. Em vez de adivinhar, tenta-se
 *  o mais provável e, se a feed disser que aquele caminho não existe, esse fica
 *  apontado como morto e passa-se ao seguinte. Uma vez por desporto, e não uma
 *  vez por jogo.
 *
 *  Quem não estiver aqui simplesmente não tem estatísticas, e a página do jogo
 *  mostra o resto sem elas. */
export const CAMINHOS = {
  Futebol: {
    caminhos: ['/fixtures/statistics'],
    chave: 'fixture',
    eventos: '/fixtures/events'
  },
  Basquetebol: { caminhos: ['/games/statistics/teams', '/games/statistics'], chave: 'id' },
  NBA: { caminhos: ['/games/statistics', '/games/statistics/teams'], chave: 'id' },
  'Futebol americano': { caminhos: ['/games/statistics/teams', '/games/statistics'], chave: 'id' },
  Basebol: { caminhos: ['/games/statistics/teams', '/games/statistics'], chave: 'id' },
  'Hóquei no gelo': {
    caminhos: ['/games/statistics/teams', '/games/statistics'],
    chave: 'id',
    eventos: '/games/events'
  },
  Andebol: { caminhos: ['/games/statistics/teams', '/games/statistics'], chave: 'id' },
  Voleibol: { caminhos: ['/games/statistics/teams', '/games/statistics'], chave: 'id' },
  Rugby: { caminhos: ['/games/statistics/teams', '/games/statistics'], chave: 'id' },
  AFL: { caminhos: ['/games/statistics/teams', '/games/statistics'], chave: 'id' }
};

/** A feed diz isto quando o caminho não existe naquele desporto. */
export const NAO_EXISTE = 'do not exist';

/** Os nomes em português das estatísticas que aparecem mais. O que não estiver
 *  aqui mostra-se como veio: mais vale um nome em inglês do que nada. */
const EM_PORTUGUES = {
  'ball possession': 'Posse de bola',
  possession: 'Posse de bola',
  'total shots': 'Remates',
  'shots on goal': 'Remates enquadrados',
  'shots off goal': 'Remates para fora',
  'shots insidebox': 'Remates dentro da área',
  'shots outsidebox': 'Remates de fora',
  'blocked shots': 'Remates bloqueados',
  'corner kicks': 'Cantos',
  corners: 'Cantos',
  offsides: 'Foras de jogo',
  fouls: 'Faltas',
  'yellow cards': 'Cartões amarelos',
  'red cards': 'Cartões vermelhos',
  'goalkeeper saves': 'Defesas',
  'free kicks': 'Livres',
  'throw ins': 'Lançamentos',
  'goal kicks': 'Pontapés de baliza',
  'shots total': 'Remates',
  'ball safe': 'Bola controlada',
  attacks: 'Ataques',
  'dangerous attacks': 'Ataques perigosos',
  'substitutions': 'Substituições',
  'penalties': 'Penáltis',
  'field goals': 'Cestos de campo',
  field_goals: 'Cestos de campo',
  'free throws': 'Lances livres',
  freethrows_goals: 'Lances livres',
  'three point goals': 'Triplos',
  threepoint_goals: 'Triplos',
  personal_fouls: 'Faltas pessoais',
  'total rebounds': 'Ressaltos',
  biggest_lead: 'Maior vantagem',
  'points in paint': 'Pontos na área',
  fast_break_points: 'Pontos de contra-ataque',
  'second chance points': 'Pontos de segunda oportunidade',
  hits: 'Batidas',
  errors: 'Erros',
  runs: 'Corridas',
  'total passes': 'Passes',
  'passes accurate': 'Passes certos',
  'passes %': 'Precisão de passe',
  'expected goals': 'Golos esperados',
  points: 'Pontos',
  assists: 'Assistências',
  rebounds: 'Ressaltos',
  turnovers: 'Perdas de bola',
  steals: 'Roubos de bola',
  blocks: 'Bloqueios'
};

const emPortugues = (nome) => EM_PORTUGUES[String(nome).toLowerCase().trim()] || String(nome);

/** Chaves que vêm no meio das estatísticas e não são estatísticas nenhumas.
 *  O basquetebol manda o jogo e a equipa dentro do mesmo objeto, e sem isto
 *  apareciam duas linhas a dizer "[object Object]" logo no topo da tabela. */
const NAO_E_ESTATISTICA = new Set([
  'game',
  'team',
  'id',
  'league',
  'country',
  'logo',
  'name',
  'season',
  'fixture',
  'players'
]);

/** O número que lá está dentro, ou nada. Vazio é nada e não é zero: Number('')
 *  dá zero, e por causa disso os ressaltos apareceram como "40/0 (0%)", com
 *  uma percentagem que ninguém tinha calculado. */
const soNum = (v) => {
  if (v === null || v === undefined) return null;
  const limpo = String(v).replace('%', '').replace(',', '.').trim();
  if (limpo === '') return null;
  const n = Number(limpo);
  return Number.isFinite(n) ? n : null;
};

/**
 * Um valor, seja ele o que for que a feed mandou.
 *
 * Pode ser número, texto, "67%", ou um objeto. O basquetebol manda objetos:
 * os cestos de campo são {total, attempts, percentage}, e os ressaltos são
 * {total, offence, defense}. Um objeto posto no ecrã dá "[object Object]", que
 * foi exatamente o que apareceu.
 *
 * Um acerto sobre tentativas mostra-se como se diz em voz alta, "30/70", com a
 * percentagem ao lado; o resto mostra-se pelo total. O número que fica é
 * sempre o que serve para comparar os dois lados, que é o que a barra desenha.
 */
function valorDe(v) {
  if (v === null || v === undefined || v === '') return { mostra: '0', numero: 0 };

  if (typeof v === 'object') {
    const total = soNum(v.total ?? v.made ?? v.value);
    const tentativas = soNum(v.attempts ?? v.att);
    const parte = soNum(v.percentage ?? v.percent);

    if (total !== null && tentativas !== null)
      return {
        mostra: `${total}/${tentativas}${parte !== null ? ` (${Math.round(parte)}%)` : ''}`,
        numero: total
      };
    if (total !== null) return { mostra: String(total), numero: total };
    if (parte !== null) return { mostra: `${Math.round(parte)}%`, numero: parte };

    /* Um objeto que não se entende não vai para o ecrã como objeto. */
    return { mostra: '0', numero: 0 };
  }

  const texto = String(v);
  return { mostra: texto, numero: soNum(texto) };
}

/** Uma lista de pares tipo/valor, venha ela como lista ou como objeto, já sem
 *  o que não são estatísticas. */
function paresDe(o) {
  const fora = ([k]) => !NAO_E_ESTATISTICA.has(String(k).toLowerCase().trim());
  if (Array.isArray(o))
    return o
      .filter((x) => x && (x.type || x.name))
      .map((x) => [String(x.type || x.name), x.value])
      .filter(fora);
  if (o && typeof o === 'object') return Object.entries(o).filter(fora);
  return [];
}

/**
 * Lê as estatísticas de um jogo e devolve-as numa forma só.
 *
 * Sai uma lista de linhas, cada uma com o nome e o valor dos dois lados, pela
 * ordem em que vieram. Devolve lista vazia quando não se entende o que veio.
 */
export function lerEstatisticas(cru) {
  const lados = ladosDe(cru);
  if (!lados) return [];

  const daCasa = new Map(paresDe(lados.casa).map(([k, v]) => [String(k).toLowerCase(), v]));
  const daFora = new Map(paresDe(lados.fora).map(([k, v]) => [String(k).toLowerCase(), v]));

  const nomes = [];
  paresDe(lados.casa).forEach(([k]) => nomes.push(k));
  paresDe(lados.fora).forEach(([k]) => {
    if (!nomes.some((n) => n.toLowerCase() === String(k).toLowerCase())) nomes.push(k);
  });

  return nomes
    .map((nome) => {
      const chave = String(nome).toLowerCase();
      const casa = valorDe(daCasa.get(chave));
      const fora = valorDe(daFora.get(chave));
      return { nome: emPortugues(nome), casa, fora };
    })
    /* Uma linha em que os dois lados estão a zero não diz nada a ninguém. */
    .filter((l) => l.casa.mostra !== '0' || l.fora.mostra !== '0');
}

/**
 * Descobre qual é o lado de casa e qual é o de fora, nas formas que se
 * conhecem. Devolve nada quando nenhuma resulta.
 */
function ladosDe(cru) {
  /* Uma lista de dois, cada um com a sua equipa e as suas estatísticas: é o
     futebol e a maior parte dos outros. */
  if (Array.isArray(cru) && cru.length >= 2) {
    const [a, b] = cru;
    if (a && b && ('statistics' in a || 'statistics' in b))
      return { casa: a.statistics, fora: b.statistics };
    /* Ou dois objetos que já são as próprias estatísticas. */
    if (a && b) return { casa: a, fora: b };
  }

  /* Um objeto com os dois lados dentro, com nomes conhecidos. */
  const o = Array.isArray(cru) ? cru[0] : cru;
  if (o && typeof o === 'object') {
    const casa = o.home ?? o.casa ?? o.team_home ?? o.local;
    const fora = o.away ?? o.fora ?? o.team_away ?? o.visitor;
    if (casa && fora) return { casa: casa.statistics ?? casa, fora: fora.statistics ?? fora };
  }

  return null;
}

/**
 * Os eventos de um jogo: golos, cartões, substituições, ao minuto.
 *
 * É isto que substitui o campo animado que não se consegue ter. Não mostra
 * onde a bola está, mas mostra o que aconteceu e quando, que é a parte que se
 * conta depois no café.
 */
export function lerEventos(cru) {
  if (!Array.isArray(cru)) return [];
  return cru
    .map((e) => {
      const minuto = Number(e?.time?.elapsed ?? e?.minute ?? e?.time);
      const tipo = String(e?.type || '').toLowerCase();
      return {
        minuto: Number.isFinite(minuto) ? minuto : null,
        extra: Number(e?.time?.extra) || null,
        tipo: tipo.includes('goal')
          ? 'golo'
          : tipo.includes('card')
            ? 'cartao'
            : tipo.includes('subst')
              ? 'troca'
              : 'outro',
        detalhe: String(e?.detail || e?.type || ''),
        equipa: String(e?.team?.name || ''),
        quem: String(e?.player?.name || ''),
        /* Numa substituição, este é quem entra. */
        outro: String(e?.assist?.name || '')
      };
    })
    .filter((e) => e.minuto !== null)
    .sort((a, b) => a.minuto - b.minuto || (a.extra || 0) - (b.extra || 0));
}

/* ==================== a classificação e os confrontos ====================

   Duas coisas que a página da partida mostra em separadores próprios, e que
   por isso só custam um pedido quando alguém abre esse separador. A
   classificação de uma liga é a mesma para todos os jogos dela, e dois
   adversários têm sempre o mesmo histórico: as duas guardam-se bem, e é isso
   que as torna possíveis com cem pedidos por dia. */

/** Onde cada desporto tem a classificação. A mesma ideia dos caminhos das
 *  estatísticas: tenta-se, e o que não existir fica apontado. */
export const CAMINHOS_CLASSIFICACAO = {
  Futebol: ['/standings'],
  Basquetebol: ['/standings'],
  NBA: ['/standings'],
  'Futebol americano': ['/standings'],
  Basebol: ['/standings'],
  'Hóquei no gelo': ['/standings'],
  Andebol: ['/standings'],
  Voleibol: ['/standings'],
  Rugby: ['/standings'],
  AFL: ['/standings']
};

/** E onde cada um tem o histórico entre duas equipas. */
export const CAMINHOS_CONFRONTOS = {
  Futebol: ['/fixtures/headtohead'],
  Basquetebol: ['/games/h2h'],
  NBA: ['/games/h2h'],
  'Futebol americano': ['/games/h2h'],
  Basebol: ['/games/h2h'],
  'Hóquei no gelo': ['/games/h2h'],
  Andebol: ['/games/h2h'],
  Voleibol: ['/games/h2h'],
  Rugby: ['/games/h2h'],
  AFL: ['/games/h2h']
};

const soN = (n) => (Number.isFinite(+n) ? +n : null);

/**
 * A classificação, numa forma só.
 *
 * O futebol manda grupos dentro da liga (uma fase de grupos são oito tabelas),
 * e os outros mandam uma lista simples. Sai sempre uma lista de grupos, ainda
 * que seja um grupo só, para a página não ter de saber a diferença.
 */
export function lerClassificacao(cru) {
  const primeiro = Array.isArray(cru) ? cru[0] : cru;
  const tabelas = primeiro?.league?.standings ?? primeiro?.standings ?? cru;
  if (!Array.isArray(tabelas)) return [];

  /* Uma lista de listas são grupos; uma lista de objectos é um grupo só. */
  const grupos = Array.isArray(tabelas[0]) ? tabelas : [tabelas];

  return grupos
    .map((linhas) => ({
      nome: String(linhas?.[0]?.group || linhas?.[0]?.stage || ''),
      linhas: (Array.isArray(linhas) ? linhas : [])
        .map((l, i) => {
          const jogados = l?.all ?? l?.games ?? {};
          return {
            lugar: soN(l?.rank ?? l?.position) ?? i + 1,
            equipa: String(l?.team?.name || ''),
            brasao: String(l?.team?.logo || ''),
            jogos: soN(jogados?.played ?? jogados?.played?.all ?? l?.games?.played),
            vitorias: soN(jogados?.win ?? jogados?.win?.total ?? l?.games?.win?.total),
            empates: soN(jogados?.draw ?? jogados?.draw?.total),
            derrotas: soN(jogados?.lose ?? jogados?.lose?.total ?? l?.games?.lose?.total),
            pontos: soN(l?.points),
            diferenca: soN(l?.goalsDiff ?? l?.goals_diff),
            forma: String(l?.form || '')
          };
        })
        .filter((l) => l.equipa)
    }))
    .filter((g) => g.linhas.length > 0);
}

/**
 * Os confrontos entre duas equipas, do mais recente para trás.
 *
 * Só os que já se jogaram: um jogo por jogar não é histórico, é a agenda.
 */
export function lerConfrontos(cru) {
  if (!Array.isArray(cru)) return [];
  return cru
    .map((x) => {
      const f = x?.fixture || x;
      const quando = Date.parse(f?.date || x?.date || '');
      const casa = String(x?.teams?.home?.name || '');
      const fora = String(x?.teams?.away?.name || '');
      if (!Number.isFinite(quando) || !casa || !fora) return null;
      return {
        quando: new Date(quando).toISOString(),
        liga: String(x?.league?.name || ''),
        casa,
        fora,
        marcaCasa: soN(x?.goals?.home ?? x?.scores?.home?.total),
        marcaFora: soN(x?.goals?.away ?? x?.scores?.away?.total)
      };
    })
    .filter((x) => x && x.marcaCasa !== null && x.marcaFora !== null)
    .sort((a, b) => Date.parse(b.quando) - Date.parse(a.quando))
    .slice(0, 10);
}
