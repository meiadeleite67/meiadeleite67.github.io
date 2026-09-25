/**
 * As apostas desportivas, postas à prova.
 *
 * Aqui não se liga a lado nenhum. As respostas da feed são as que estão na
 * documentação da The Odds API, copiadas com a forma que elas têm mesmo, e o
 * que se prova é que sabemos lê-las e decidir a partir delas.
 *
 * O que mais importa nestas provas não é o caso em que corre tudo bem. É o
 * caso em que a feed vem torta: sem cotações, com um jogo dado como acabado e
 * sem resultado, com um empate num desporto onde não se podia apostar no
 * empate, ou com um jogo que nunca mais acaba. Em todos esses, ninguém pode
 * ficar sem os torrões que pôs.
 *
 *   node scripts/testes-apostas.mjs
 */
import {
  APOSTA_MAXIMA,
  APOSTA_MINIMA,
  ABERTAS_NO_MAXIMO,
  DESISTE_AO_FIM_DE,
  PERNAS_NO_MAXIMO,
  cotacaoDe,
  fecharBilhete,
  jogoDaFeed,
  limparBilhete,
  quantoPaga,
  quemGanhou
} from '../worker/apostas.js';

let feitos = 0;
let falhas = 0;

function prova(nome, ok, porque = '') {
  feitos++;
  if (ok) return console.log('  . ' + nome);
  falhas++;
  console.error(`  x ${nome}${porque ? '\n    ' + porque : ''}`);
}

const DAQUI_A_UM_DIA = new Date(Date.now() + 86400000).toISOString();
const HA_UM_DIA = new Date(Date.now() - 86400000).toISOString();

/** Um jogo tal como a feed o manda. */
const daFeed = (mexer = {}) => ({
  id: 'abc123',
  sport_key: 'soccer_portugal_primeira_liga',
  sport_title: 'Primeira Liga',
  commence_time: DAQUI_A_UM_DIA,
  home_team: 'Benfica',
  away_team: 'Porto',
  bookmakers: [
    {
      key: 'pinnacle',
      title: 'Pinnacle',
      last_update: DAQUI_A_UM_DIA,
      markets: [
        {
          key: 'h2h',
          outcomes: [
            { name: 'Benfica', price: 2.1 },
            { name: 'Porto', price: 3.4 },
            { name: 'Draw', price: 3.25 }
          ]
        }
      ]
    }
  ],
  ...mexer
});

/* ---------------- ler um jogo da feed ---------------- */

console.log('\n a feed');

const jogo = jogoDaFeed(daFeed());
prova('um jogo com tudo passa', !!jogo);
prova('com as duas equipas', jogo.casa === 'Benfica' && jogo.fora === 'Porto');
prova('e a liga', jogo.liga === 'Primeira Liga');
prova(
  'com as três cotações',
  jogo.cotacoes.casa === 2.1 && jogo.cotacoes.fora === 3.4 && jogo.cotacoes.empate === 3.25
);

const semEmpate = jogoDaFeed(
  daFeed({
    sport_key: 'basketball_nba',
    home_team: 'Lakers',
    away_team: 'Celtics',
    bookmakers: [
      {
        key: 'pinnacle',
        markets: [
          {
            key: 'h2h',
            outcomes: [
              { name: 'Lakers', price: 1.8 },
              { name: 'Celtics', price: 2.05 }
            ]
          }
        ]
      }
    ]
  })
);
prova('um desporto sem empate fica com duas cotações', semEmpate && !('empate' in semEmpate.cotacoes));

prova('um jogo já começado não passa', jogoDaFeed(daFeed({ commence_time: HA_UM_DIA })) === null);
prova('um jogo sem casas de apostas não passa', jogoDaFeed(daFeed({ bookmakers: [] })) === null);
prova('nem um sem o mercado do vencedor', jogoDaFeed(daFeed({
  bookmakers: [{ key: 'x', markets: [{ key: 'totals', outcomes: [] }] }]
})) === null);
prova('nem um a que falte uma das equipas nas cotações', jogoDaFeed(daFeed({
  bookmakers: [{ key: 'x', markets: [{ key: 'h2h', outcomes: [{ name: 'Benfica', price: 2 }] }] }]
})) === null);
prova('nem um com uma cotação impossível', jogoDaFeed(daFeed({
  bookmakers: [{
    key: 'x',
    markets: [{ key: 'h2h', outcomes: [{ name: 'Benfica', price: 0.5 }, { name: 'Porto', price: 3 }] }]
  }]
})) === null);
prova('nem lixo nenhum', jogoDaFeed(null) === null && jogoDaFeed({}) === null);

/* A segunda casa de apostas só é usada se a primeira não servir. */
const duasCasas = jogoDaFeed(
  daFeed({
    bookmakers: [
      { key: 'coxo', markets: [{ key: 'h2h', outcomes: [{ name: 'Benfica', price: 9 }] }] },
      {
        key: 'bom',
        markets: [
          {
            key: 'h2h',
            outcomes: [
              { name: 'Benfica', price: 2.5 },
              { name: 'Porto', price: 2.7 }
            ]
          }
        ]
      }
    ]
  })
);
prova('salta a casa de apostas que vem incompleta', duasCasas.cotacoes.casa === 2.5);

/* ---------------- pôr o bilhete ---------------- */

console.log('\n pôr a aposta');

/** Os jogos como o servidor os tem, por numero. */
const mesa = new Map([
  ['abc123', { ...jogo, id: 'abc123', desporto: 'Futebol' }],
  ['bsk1', { ...semEmpate, id: 'bsk1', desporto: 'Basquetebol' }]
]);

const bilhete = (pernas, quanto = 50, abertas = 0) =>
  limparBilhete({ pernas, quanto }, mesa, 5000, abertas);

const simples = bilhete([{ jogo: 'abc123', escolha: 'casa' }]);
prova('uma simples passa', !simples.erro && simples.quanto === 50);
prova('com uma perna so', simples.pernas.length === 1);
prova('e traz a cotacao do servidor e nao a do site', simples.pernas[0].cotacao === 2.1);
prova('a cotacao do bilhete e a da perna', simples.cotacao === 2.1);
prova('e guarda se o jogo tinha empate', simples.pernas[0].tinhaEmpate === true);

const batota = limparBilhete(
  { pernas: [{ jogo: 'abc123', escolha: 'casa', cotacao: 50 }], quanto: 50 },
  mesa,
  5000
);
prova('uma cotacao mandada pelo site e ignorada', batota.pernas[0].cotacao === 2.1);

const dupla = bilhete([
  { jogo: 'abc123', escolha: 'casa' },
  { jogo: 'bsk1', escolha: 'fora' }
]);
prova('uma dupla passa', !dupla.erro && dupla.pernas.length === 2);
prova('e as cotacoes multiplicam-se', dupla.cotacao === 4.31, `deu ${dupla.cotacao}`);
prova('o basquetebol entra sem empate', dupla.pernas[1].tinhaEmpate === false);

prova('sem escolhas nenhumas nao ha bilhete', !!limparBilhete({ pernas: [], quanto: 10 }, mesa, 500).erro);
prova(
  'o mesmo jogo duas vezes na mesma multipla nao passa',
  !!bilhete([
    { jogo: 'abc123', escolha: 'casa' },
    { jogo: 'abc123', escolha: 'fora' }
  ]).erro
);
prova(
  'mais pernas do que o maximo nao passa',
  !!limparBilhete(
    { pernas: Array.from({ length: PERNAS_NO_MAXIMO + 1 }, () => ({ jogo: 'abc123', escolha: 'casa' })), quanto: 10 },
    mesa,
    500
  ).erro
);
prova('um jogo que nao esta na mesa nao passa', !!bilhete([{ jogo: 'nao-ha', escolha: 'casa' }]).erro);
prova('uma escolha que nao existe tambem nao', !!bilhete([{ jogo: 'abc123', escolha: 'terceiro' }]).erro);
prova(
  'nem o empate de um jogo sem empate',
  !!bilhete([{ jogo: 'bsk1', escolha: 'empate' }]).erro
);
prova('abaixo do minimo nao passa', !!bilhete([{ jogo: 'abc123', escolha: 'casa' }], APOSTA_MINIMA - 1).erro);
prova('acima do maximo tambem nao', !!bilhete([{ jogo: 'abc123', escolha: 'casa' }], APOSTA_MAXIMA + 1).erro);
prova(
  'nem mais do que se tem',
  !!limparBilhete({ pernas: [{ jogo: 'abc123', escolha: 'casa' }], quanto: 100 }, mesa, 40).erro
);
prova(
  'nem com a casa cheia de apostas por fechar',
  !!bilhete([{ jogo: 'abc123', escolha: 'casa' }], 10, ABERTAS_NO_MAXIMO).erro
);
prova(
  'uma quantia com virgula fica inteira',
  bilhete([{ jogo: 'abc123', escolha: 'casa' }], 10.9).quanto === 10
);
prova('uma quantia negativa nao passa', !!bilhete([{ jogo: 'abc123', escolha: 'casa' }], -50).erro);

prova('tres pernas multiplicam-se todas', cotacaoDe([{ cotacao: 2 }, { cotacao: 3 }, { cotacao: 1.5 }]) === 9);
prova('e a conta fica a duas casas', cotacaoDe([{ cotacao: 1.33 }, { cotacao: 1.33 }]) === 1.77);

/* ---------------- o que paga ---------------- */

console.log('\n o que paga');

prova('cem a 2,1 pagam duzentos e dez', quantoPaga(100, 2.1) === 210);
prova('e a conta arredonda em vez de ficar aos bocados', quantoPaga(33, 2.15) === 71);
prova('uma cotação de 1,5 sobre 10 dá 15', quantoPaga(10, 1.5) === 15);

/* ---------------- quem ganhou ---------------- */

console.log('\n quem ganhou');

const resultado = (mexer = {}) => ({
  id: 'abc123',
  completed: true,
  home_team: 'Benfica',
  away_team: 'Porto',
  scores: [
    { name: 'Benfica', score: '2' },
    { name: 'Porto', score: '1' }
  ],
  ...mexer
});

prova('ganha quem marcou mais', quemGanhou(resultado(), 'Benfica', 'Porto') === 'casa');
prova(
  'e do outro lado é a mesma coisa',
  quemGanhou(
    resultado({ scores: [{ name: 'Benfica', score: '0' }, { name: 'Porto', score: '3' }] }),
    'Benfica',
    'Porto'
  ) === 'fora'
);
prova(
  'marcas iguais são empate',
  quemGanhou(
    resultado({ scores: [{ name: 'Benfica', score: '1' }, { name: 'Porto', score: '1' }] }),
    'Benfica',
    'Porto'
  ) === 'empate'
);
prova('um jogo por acabar não decide nada', quemGanhou(resultado({ completed: false }), 'Benfica', 'Porto') === null);
prova(
  'um jogo acabado sem resultado também não',
  quemGanhou(resultado({ scores: null }), 'Benfica', 'Porto') === null
);
prova(
  'nem um a que falte a marca de uma das equipas',
  quemGanhou(resultado({ scores: [{ name: 'Benfica', score: '2' }] }), 'Benfica', 'Porto') === null
);
prova('nem lixo nenhum', quemGanhou(null, 'Benfica', 'Porto') === null);

/* ---------------- fechar o bilhete ---------------- */

console.log('\n fechar a aposta');

const perna = (mexer = {}) => ({
  jogo: 'j1',
  escolha: 'casa',
  cotacao: 2,
  tinhaEmpate: true,
  comeca: HA_UM_DIA,
  estado: 'aberta',
  ...mexer
});

const posto = (pernas, quanto = 100) => ({ estado: 'aberta', quanto, pernas });

/** Um dicionario de resultados, como o banco o passa. */
const saiu = (mapa) => (jogo) => (jogo in mapa ? mapa[jogo] : null);

const ganhouSimples = fecharBilhete(posto([perna()]), saiu({ j1: 'casa' }));
prova('quem acertou recebe o que a cotacao prometia', ganhouSimples.estado === 'ganha' && ganhouSimples.volta === 200);
prova('e o lucro e o que veio a mais', ganhouSimples.lucro === 100);

const perdeuSimples = fecharBilhete(posto([perna()]), saiu({ j1: 'fora' }));
prova('quem falhou nao recebe nada', perdeuSimples.estado === 'perdida' && perdeuSimples.volta === 0);
prova('e perde o que pos', perdeuSimples.lucro === -100);

prova('sem resultado nao se mexe em nada', fecharBilhete(posto([perna()]), saiu({})) === null);
prova(
  'uma aposta ja fechada nao se fecha outra vez',
  fecharBilhete({ ...posto([perna()]), estado: 'ganha' }, saiu({ j1: 'casa' })) === null
);

/* ---- as multiplas ---- */

const duasPernas = [perna(), perna({ jogo: 'j2', cotacao: 3 })];

prova(
  'uma dupla so paga com as duas certas',
  fecharBilhete(posto(duasPernas), saiu({ j1: 'casa', j2: 'casa' })).volta === 600
);
prova(
  'uma perna perdida chumba a dupla toda',
  fecharBilhete(posto(duasPernas), saiu({ j1: 'casa', j2: 'fora' })).estado === 'perdida'
);
prova(
  'e chumba-a logo, sem esperar pela outra',
  fecharBilhete(posto(duasPernas), saiu({ j1: 'fora' })).estado === 'perdida'
);
/* Com uma perna ja ganha e outra por jogar, o bilhete continua aberto mas
   volta com a perna marcada: e assim que o site pode mostrar o que ja caiu. */
const aMeio = fecharBilhete(posto(duasPernas), saiu({ j1: 'casa' }));
prova('com uma perna por decidir a aposta continua aberta', aMeio.estado === 'aberta');
prova('mas a perna que ja caiu fica marcada', aMeio.pernas[0].estado === 'ganha');
prova('e a outra fica como estava', aMeio.pernas[1].estado === 'aberta');
prova('e nao se paga nada ainda', aMeio.volta === undefined);
prova(
  'sem nenhuma decidida nao volta nada',
  fecharBilhete(posto(duasPernas), saiu({})) === null
);

/* Uma perna anulada vale 1,00: nao chumba o bilhete nem o paga. */
const comAnulada = fecharBilhete(
  posto([perna({ tinhaEmpate: false }), perna({ jogo: 'j2', cotacao: 3 })]),
  saiu({ j1: 'empate', j2: 'casa' })
);
prova('um empate onde nao se podia apostar no empate vale 1,00', comAnulada.estado === 'ganha');
prova('e a dupla paga so pela outra perna', comAnulada.volta === 300);
prova('a perna fica marcada como anulada', comAnulada.pernas[0].estado === 'anulada');

const todasAnuladas = fecharBilhete(
  posto([perna({ tinhaEmpate: false }), perna({ jogo: 'j2', tinhaEmpate: false })]),
  saiu({ j1: 'empate', j2: 'empate' })
);
prova('com tudo anulado a aposta e anulada', todasAnuladas.estado === 'anulada');
prova('e devolve exatamente o que se pos', todasAnuladas.volta === 100);

/* E um jogo que nunca mais acaba. */
const hoje = Date.now();
const velha = posto([perna({ comeca: new Date(hoje - DESISTE_AO_FIM_DE - 1000).toISOString() })]);
const desistiu = fecharBilhete(velha, saiu({}), hoje);
prova('um jogo que nunca acaba devolve o que se pos', desistiu && desistiu.estado === 'anulada');
prova('e devolve tudo', desistiu.volta === 100);

const aindaCedo = posto([perna({ comeca: new Date(hoje - DESISTE_AO_FIM_DE + 60000).toISOString() })]);
prova('mas antes desse prazo ainda se espera', fecharBilhete(aindaCedo, saiu({}), hoje) === null);

/* ---------------- a conta do fim ---------------- */

console.log(`\n${feitos - falhas} de ${feitos} provas passaram.\n`);
if (falhas) process.exit(1);
