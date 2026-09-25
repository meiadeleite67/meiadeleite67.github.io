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
  fecharAposta,
  jogoDaFeed,
  limparAposta,
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

/* ---------------- pôr uma aposta ---------------- */

console.log('\n pôr a aposta');

const pos = limparAposta({ escolha: 'casa', quanto: 50 }, jogo, 200, 0);
prova('uma aposta boa passa', !pos.erro && pos.quanto === 50);
prova('e traz a cotação do servidor e não a do site', pos.cotacao === 2.1);

const batota = limparAposta({ escolha: 'casa', quanto: 50, cotacao: 50 }, jogo, 200, 0);
prova('uma cotação mandada pelo site é ignorada', batota.cotacao === 2.1);

prova('sem jogo não se aposta', !!limparAposta({ escolha: 'casa', quanto: 10 }, null, 200, 0).erro);
prova(
  'numa escolha que não existe também não',
  !!limparAposta({ escolha: 'terceiro', quanto: 10 }, jogo, 200, 0).erro
);
prova(
  'nem no empate de um jogo sem empate',
  !!limparAposta({ escolha: 'empate', quanto: 10 }, semEmpate, 200, 0).erro
);
prova(
  'abaixo do mínimo não passa',
  !!limparAposta({ escolha: 'casa', quanto: APOSTA_MINIMA - 1 }, jogo, 500, 0).erro
);
prova(
  'acima do máximo também não',
  !!limparAposta({ escolha: 'casa', quanto: APOSTA_MAXIMA + 1 }, jogo, 99999, 0).erro
);
prova(
  'nem mais do que se tem',
  !!limparAposta({ escolha: 'casa', quanto: 100 }, jogo, 40, 0).erro
);
prova(
  'nem com a casa cheia de apostas por fechar',
  !!limparAposta({ escolha: 'casa', quanto: 10 }, jogo, 500, ABERTAS_NO_MAXIMO).erro
);
prova(
  'uma quantia com vírgula fica inteira',
  limparAposta({ escolha: 'casa', quanto: 10.9 }, jogo, 500, 0).quanto === 10
);
prova(
  'uma quantia negativa não passa',
  !!limparAposta({ escolha: 'casa', quanto: -50 }, jogo, 500, 0).erro
);

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

/* ---------------- fechar a aposta ---------------- */

console.log('\n fechar a aposta');

const aberta = (mexer = {}) => ({
  estado: 'aberta',
  escolha: 'casa',
  quanto: 100,
  cotacao: 2.1,
  tinhaEmpate: true,
  comeca: HA_UM_DIA,
  ...mexer
});

const ganhou = fecharAposta(aberta(), 'casa');
prova('quem acertou recebe o que a cotação prometeu', ganhou.estado === 'ganha' && ganhou.volta === 210);
prova('e o lucro é o que veio a mais', ganhou.lucro === 110);

const perdeu = fecharAposta(aberta(), 'fora');
prova('quem falhou não recebe nada', perdeu.estado === 'perdida' && perdeu.volta === 0);
prova('e perde o que pôs', perdeu.lucro === -100);

prova('sem resultado não se mexe em nada', fecharAposta(aberta(), null) === null);
prova('uma aposta já fechada não se fecha outra vez', fecharAposta(aberta({ estado: 'ganha' }), 'casa') === null);

/* O caso que mais interessa: um empate num desporto onde não se podia apostar
   no empate. Quem pôs num dos dois não teve como se defender, e por isso
   recebe de volta o que pôs. */
const empateSemEmpate = fecharAposta(aberta({ tinhaEmpate: false }), 'empate');
prova('um empate onde não se podia apostar no empate devolve tudo', empateSemEmpate.estado === 'anulada');
prova('e devolve mesmo o que se pôs', empateSemEmpate.volta === 100 && empateSemEmpate.lucro === 0);

const empateComEmpate = fecharAposta(aberta({ escolha: 'empate' }), 'empate');
prova('mas onde havia empate, quem o apostou ganha', empateComEmpate.estado === 'ganha');

/* E um jogo que nunca mais acaba. */
const hoje = Date.now();
const velha = aberta({ comeca: new Date(hoje - DESISTE_AO_FIM_DE - 1000).toISOString() });
const desistiu = fecharAposta(velha, null, hoje);
prova('um jogo que nunca acaba devolve o que se pôs', desistiu && desistiu.estado === 'anulada');
prova('e devolve tudo', desistiu.volta === 100);

const aindaCedo = aberta({ comeca: new Date(hoje - DESISTE_AO_FIM_DE + 60000).toISOString() });
prova('mas antes desse prazo ainda se espera', fecharAposta(aindaCedo, null, hoje) === null);

/* ---------------- a conta do fim ---------------- */

console.log(`\n${feitos - falhas} de ${feitos} provas passaram.\n`);
if (falhas) process.exit(1);
