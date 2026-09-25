/**
 * Os avisos de coisas partidas, postos à prova.
 *
 * O que mais interessa aqui é o que acontece quando a caixa enche. Um aviso
 * que ninguém leu não pode desaparecer só porque entretanto entraram muitos
 * outros: o dia em que aparecerem cinquenta avisos de uma vez é precisamente o
 * dia em que não se pode perder o primeiro.
 *
 *   node scripts/testes-tickets.mjs
 */
import {
  ESTADOS,
  TICKETS_NO_MAXIMO,
  apagarTicket,
  arrumarTickets,
  contasDosTickets,
  limparTicket,
  mudarEstado
} from '../worker/tickets.js';

let feitos = 0;
let falhas = 0;

function prova(nome, ok, porque = '') {
  feitos++;
  if (ok) return console.log('  . ' + nome);
  falhas++;
  console.error(`  x ${nome}${porque ? '\n    ' + porque : ''}`);
}

/* ---------------- escrever um aviso ---------------- */

console.log('\n escrever');

const bom = limparTicket({
  texto: 'A roleta não pagou o empate no Benfica - Porto.',
  onde: '/roleta/',
  quem: 'Zebzelgas',
  aparelho: 'iPhone, 390x844'
});
prova('um aviso com tudo passa', !!bom.ticket);
prova('e fica aberto', bom.ticket.estado === 'aberto');
prova('com a hora apontada', !Number.isNaN(Date.parse(bom.ticket.quando)));
prova('e guarda onde foi', bom.ticket.onde === '/roleta/');
prova('e quem avisou', bom.ticket.quem === 'Zebzelgas');

prova('sem nome passa na mesma', !!limparTicket({ texto: 'O menu não abre no telemóvel.' }).ticket);
prova('texto curto de mais não passa', !!limparTicket({ texto: 'erro' }).erro);
prova('nem vazio', !!limparTicket({ texto: '   ' }).erro);
prova('nem lixo nenhum', !!limparTicket(null).erro && !!limparTicket({}).erro);

const comprido = limparTicket({ texto: 'a'.repeat(5000), quem: 'b'.repeat(200) });
prova('um texto enorme fica cortado', comprido.ticket.texto.length === 1200);
prova('e o nome também', comprido.ticket.quem.length === 24);

const mentiroso = limparTicket({ texto: 'isto está partido de verdade', estado: 'resolvido', id: 'meu' }, { id: 'xpto' });
prova('o estado não vem de fora', mentiroso.ticket.estado === 'aberto');
prova('nem o número, que é dado por quem guarda', mentiroso.ticket.id === 'xpto');

/* ---------------- arrumar a caixa ---------------- */

console.log('\n arrumar');

const quando = (dias) => new Date(Date.now() - dias * 86400000).toISOString();
const feito = (id, estado, dias) => ({ id, estado, quando: quando(dias), texto: 'x' });

const ordenados = arrumarTickets([
  feito('velho', 'aberto', 10),
  feito('novo', 'aberto', 1),
  feito('meio', 'aberto', 5)
]);
prova('os mais recentes vão à frente', ordenados.map((t) => t.id).join() === 'novo,meio,velho');

const misturados = arrumarTickets([
  feito('resolvido-novo', 'resolvido', 1),
  feito('aberto-velho', 'aberto', 30)
]);
prova(
  'os por resolver vão à frente dos resolvidos, mesmo sendo mais velhos',
  misturados[0].id === 'aberto-velho'
);

/* A caixa cheia: os resolvidos saem, os por resolver ficam todos. */
const muitos = [
  ...Array.from({ length: TICKETS_NO_MAXIMO }, (_, i) => feito('r' + i, 'resolvido', i + 1)),
  ...Array.from({ length: 20 }, (_, i) => feito('a' + i, 'aberto', 100 + i))
];
const cortados = arrumarTickets(muitos);
prova('a caixa não passa do tecto', cortados.length === TICKETS_NO_MAXIMO);
prova(
  'e nenhum por resolver se perde',
  cortados.filter((t) => t.estado === 'aberto').length === 20
);
prova(
  'quem sai são os resolvidos mais velhos',
  cortados.filter((t) => t.estado === 'resolvido').length === TICKETS_NO_MAXIMO - 20
);

/* ---------------- mexer num aviso ---------------- */

console.log('\n mexer');

const caixa = [feito('um', 'aberto', 1), feito('dois', 'aberto', 2)];

const tratado = mudarEstado(caixa, 'um', 'a-tratar');
prova('muda-se o estado', tratado.find((t) => t.id === 'um').estado === 'a-tratar');
prova('e os outros ficam como estavam', tratado.find((t) => t.id === 'dois').estado === 'aberto');
prova('um estado que não existe não passa', mudarEstado(caixa, 'um', 'inventado') === null);
prova('nem um aviso que não existe', mudarEstado(caixa, 'nao-ha', 'resolvido') === null);
prova('os estados são os três', ESTADOS.length === 3);

const apagado = apagarTicket(caixa, 'um');
prova('apaga-se um aviso', apagado.length === 1 && apagado[0].id === 'dois');
prova('e apagar um que não existe não faz nada', apagarTicket(caixa, 'nao-ha') === null);

const contas = contasDosTickets([
  feito('a', 'aberto', 1),
  feito('b', 'a-tratar', 1),
  feito('c', 'resolvido', 1),
  feito('d', 'aberto', 1)
]);
prova('as contas batem certo', contas.todos === 4 && contas.abertos === 2 && contas.resolvidos === 1);

/* ---------------- a conta do fim ---------------- */

console.log(`\n${feitos - falhas} de ${feitos} provas passaram.\n`);
if (falhas) process.exit(1);
