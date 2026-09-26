/**
 * O leitor das estatísticas, posto à prova.
 *
 * Cada desporto da API-Sports responde a isto de uma maneira diferente, e o
 * que se prova aqui é que um leitor só as aguenta a todas. As formas abaixo
 * são as três que se conhecem, e a quarta é lixo de propósito: um desporto que
 * mude de forma amanhã tem de dar uma página sem estatísticas, não uma página
 * rebentada.
 *
 *   node scripts/testes-estatisticas.mjs
 */
import {
  lerClassificacao,
  lerConfrontos,
  lerEstatisticas,
  lerEventos
} from '../worker/estatisticas.js';

let feitos = 0;
let falhas = 0;

function prova(nome, ok, porque = '') {
  feitos++;
  if (ok) return console.log('  . ' + nome);
  falhas++;
  console.error(`  x ${nome}${porque ? '\n    ' + porque : ''}`);
}

/* ---------------- as formas que se conhecem ---------------- */

console.log('\n as formas');

/** O futebol: lista de duas equipas, cada uma com lista de pares. */
const comoOFutebol = [
  {
    team: { id: 1, name: 'Benfica' },
    statistics: [
      { type: 'Ball Possession', value: '67%' },
      { type: 'Total Shots', value: 13 },
      { type: 'Corner Kicks', value: 9 },
      { type: 'Offsides', value: null }
    ]
  },
  {
    team: { id: 2, name: 'Porto' },
    statistics: [
      { type: 'Ball Possession', value: '33%' },
      { type: 'Total Shots', value: 9 },
      { type: 'Corner Kicks', value: 3 },
      { type: 'Offsides', value: null }
    ]
  }
];

const futebol = lerEstatisticas(comoOFutebol);
prova('o futebol le-se', futebol.length > 0);
prova('com os nomes em portugues', futebol[0].nome === 'Posse de bola');
prova('e os dois lados', futebol[0].casa.mostra === '67%' && futebol[0].fora.mostra === '33%');
prova('a percentagem tambem da numero', futebol[0].casa.numero === 67);
prova('os remates ficam numeros', futebol[1].casa.numero === 13 && futebol[1].fora.numero === 9);
prova(
  'uma linha a zero nos dois lados nao aparece',
  !futebol.some((l) => l.nome === 'Foras de jogo')
);

/** Outros: um objecto com home e away. */
const comoOutros = {
  home: { points: 88, assists: 21, rebounds: 40 },
  away: { points: 92, assists: 25, rebounds: 38 }
};
const outros = lerEstatisticas(comoOutros);
prova('a forma com home e away le-se', outros.length === 3);
prova('e traduz-se', outros.some((l) => l.nome === 'Pontos'));
prova(
  'com os valores certos',
  outros.find((l) => l.nome === 'Pontos').casa.numero === 88 &&
    outros.find((l) => l.nome === 'Pontos').fora.numero === 92
);

/** E outros ainda: lista de dois, com as estatisticas como objecto. */
const comoTerceiros = [
  { team: { name: 'A' }, statistics: { Faltas: 12, Cantos: 4 } },
  { team: { name: 'B' }, statistics: { Faltas: 9, Cantos: 7 } }
];
const terceiros = lerEstatisticas(comoTerceiros);
prova('a forma com as estatisticas em objecto le-se', terceiros.length === 2);
prova('e mantem os nomes que nao conhece', terceiros[0].nome === 'Faltas');

/* ---------------- e o que nao se entende ---------------- */

console.log('\n o que nao se entende');

prova('lixo nao rebenta', lerEstatisticas(null).length === 0);
prova('nem um objecto vazio', lerEstatisticas({}).length === 0);
prova('nem uma lista vazia', lerEstatisticas([]).length === 0);
prova('nem uma lista de um so', lerEstatisticas([{ statistics: [] }]).length === 0);
prova('nem texto', lerEstatisticas('isto nao e nada').length === 0);

/* ---------------- os eventos ---------------- */

console.log('\n os eventos');

const eventos = lerEventos([
  {
    time: { elapsed: 83, extra: null },
    team: { name: 'Angola' },
    player: { name: 'Mabululu' },
    assist: { name: 'Zito' },
    type: 'subst',
    detail: 'Substitution 1'
  },
  {
    time: { elapsed: 12 },
    team: { name: 'Egito' },
    player: { name: 'Salah' },
    type: 'Goal',
    detail: 'Normal Goal'
  },
  {
    time: { elapsed: 45, extra: 2 },
    team: { name: 'Egito' },
    player: { name: 'Hegazi' },
    type: 'Card',
    detail: 'Yellow Card'
  }
]);

prova('os eventos leem-se', eventos.length === 3);
prova('e vem por ordem do minuto', eventos.map((e) => e.minuto).join() === '12,45,83');
prova('um golo e um golo', eventos[0].tipo === 'golo');
prova('um cartao e um cartao', eventos[1].tipo === 'cartao');
prova('uma substituicao e uma troca', eventos[2].tipo === 'troca');
prova('a substituicao diz quem sai e quem entra', eventos[2].quem === 'Mabululu' && eventos[2].outro === 'Zito');
prova('e o tempo de compensacao fica apontado', eventos[1].extra === 2);
prova('eventos sem minuto nao entram', lerEventos([{ type: 'Goal' }]).length === 0);
prova('lixo nao rebenta', lerEventos(null).length === 0 && lerEventos({}).length === 0);

/* ---------------- a classificacao ---------------- */

console.log('\n a classificacao');

/** O futebol manda grupos dentro da liga. */
const tabelaDoFutebol = lerClassificacao([
  {
    league: {
      standings: [
        [
          {
            rank: 1,
            group: 'Grupo A',
            team: { name: 'Benfica', logo: 'b.png' },
            points: 30,
            goalsDiff: 12,
            all: { played: 12, win: 10, draw: 0, lose: 2 },
            form: 'WWLWW'
          },
          {
            rank: 2,
            group: 'Grupo A',
            team: { name: 'Porto', logo: 'p.png' },
            points: 28,
            goalsDiff: 9,
            all: { played: 12, win: 9, draw: 1, lose: 2 }
          }
        ],
        [
          {
            rank: 1,
            group: 'Grupo B',
            team: { name: 'Sporting', logo: 's.png' },
            points: 26,
            all: { played: 12, win: 8, draw: 2, lose: 2 }
          }
        ]
      ]
    }
  }
]);

prova('os grupos leem-se todos', tabelaDoFutebol.length === 2);
prova('com o nome do grupo', tabelaDoFutebol[0].nome === 'Grupo A');
prova('e as equipas por lugar', tabelaDoFutebol[0].linhas.map((l) => l.equipa).join() === 'Benfica,Porto');
prova('com os pontos', tabelaDoFutebol[0].linhas[0].pontos === 30);
prova('e as contas dos jogos', tabelaDoFutebol[0].linhas[0].vitorias === 10);
prova('a forma quando vem', tabelaDoFutebol[0].linhas[0].forma === 'WWLWW');
prova('e vazia quando nao vem', tabelaDoFutebol[0].linhas[1].forma === '');

/** Uma lista simples e um grupo so. */
const tabelaSimples = lerClassificacao([
  { standings: [{ position: 1, team: { name: 'Lakers' }, points: 44, games: { played: 30 } }] }
]);
prova('uma lista simples da um grupo so', tabelaSimples.length === 1);
prova('e le a equipa', tabelaSimples[0].linhas[0].equipa === 'Lakers');

prova('sem lugar, conta-se pela ordem', lerClassificacao([{ standings: [{ team: { name: 'A' } }] }])[0].linhas[0].lugar === 1);
prova('lixo nao rebenta', lerClassificacao(null).length === 0 && lerClassificacao('nada').length === 0);
prova('uma tabela sem equipas nao aparece', lerClassificacao([{ standings: [[{ rank: 1 }]] }]).length === 0);

/* ---------------- os confrontos ---------------- */

console.log('\n os confrontos');

const confrontos = lerConfrontos([
  {
    fixture: { date: '2024-03-02T20:00:00+00:00' },
    league: { name: 'Liga Portugal' },
    teams: { home: { name: 'Porto' }, away: { name: 'Benfica' } },
    goals: { home: 5, away: 0 }
  },
  {
    fixture: { date: '2026-01-05T20:00:00+00:00' },
    league: { name: 'Taça' },
    teams: { home: { name: 'Benfica' }, away: { name: 'Porto' } },
    goals: { home: 2, away: 1 }
  },
  {
    /* Um jogo por jogar nao e historico, e a agenda. */
    fixture: { date: '2027-01-05T20:00:00+00:00' },
    teams: { home: { name: 'Benfica' }, away: { name: 'Porto' } },
    goals: { home: null, away: null }
  }
]);

prova('so entram os que se jogaram', confrontos.length === 2);
prova('e vem do mais recente para tras', confrontos[0].quando.startsWith('2026'));
prova('com o resultado', confrontos[0].marcaCasa === 2 && confrontos[0].marcaFora === 1);
prova('e a competicao', confrontos[1].liga === 'Liga Portugal');
prova('um zero a zero conta', lerConfrontos([
  {
    fixture: { date: '2024-03-02T20:00:00+00:00' },
    teams: { home: { name: 'A' }, away: { name: 'B' } },
    goals: { home: 0, away: 0 }
  }
]).length === 1);
prova('lixo nao rebenta', lerConfrontos(null).length === 0 && lerConfrontos({}).length === 0);

/* ---------------- a conta do fim ---------------- */

console.log(`\n${feitos - falhas} de ${feitos} provas passaram.\n`);
if (falhas) process.exit(1);
