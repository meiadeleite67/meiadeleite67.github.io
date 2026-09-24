/**
 * O banco e a roleta, contra o Worker a correr aqui ao lado.
 *
 * O que se prova aqui é que os torrões são uns só e que não se inventam: que a
 * roleta tira as fichas da mesma carteira do blackjack, que ninguém aposta o
 * que não tem nem quando ganha, e que o quadro que sai daqui não traz segredos
 * lá dentro. Prova-se também que o recorde de um jogo de um só jogador entra
 * no quadro sem valer torrões nenhuns, que é de propósito.
 *
 *   cd worker && npx wrangler dev --port 8787 --local
 *   node scripts/testes-banco.mjs
 */

const CASA = process.env.MDL_SERVIDOR || 'http://127.0.0.1:8787';
const ORIGEM = 'http://localhost:5173';

let feitos = 0;
let falhas = 0;

function prova(nome, ok, porque = '') {
  feitos++;
  if (ok) return console.log('  . ' + nome);
  falhas++;
  console.error(`  x ${nome}${porque ? '\n    ' + porque : ''}`);
}

async function peco(rota, corpo) {
  const r = await fetch(CASA + rota, {
    method: corpo ? 'POST' : 'GET',
    headers: { 'Content-Type': 'application/json', Origin: ORIGEM },
    body: corpo ? JSON.stringify(corpo) : undefined
  });
  return { estado: r.status, corpo: await r.json().catch(() => null) };
}

const marca = Date.now().toString(36);
const nome = 'Banca' + marca;

/* ---------------- a carteira é uma só ---------------- */

let r = await peco('/quadro/entrar', { nome, pin: '7777' });
prova('o nome estreia-se com o saldo inicial', r.corpo?.linha?.torroes === 250, JSON.stringify(r.corpo));
const passe = r.corpo.passe;

prova(
  'e a linha traz as contas de todos os jogos',
  r.corpo.linha.poquer && r.corpo.linha.roleta && r.corpo.linha.recordes,
  JSON.stringify(r.corpo.linha)
);
prova(
  'sem nada de secreto lá dentro',
  !JSON.stringify(r.corpo.linha).match(/"pin"|passes|erros|resumo/),
  JSON.stringify(r.corpo.linha)
);

/* ---------------- a roleta ---------------- */

r = await peco('/roleta', { nome, passe, apostas: [{ tipo: 'vermelho', quanto: 50 }] });
prova('a roleta roda e diz o número que saiu', r.estado === 200 && typeof r.corpo?.rodada?.saiu === 'number', JSON.stringify(r.corpo));
prova('e diz a cor', ['verde', 'vermelho', 'preto'].includes(r.corpo?.rodada?.cor));
prova('e onde a casa fica na roda', r.corpo?.rodada?.casa >= 0 && r.corpo?.rodada?.casa < 37);

const depois = r.corpo.linha.torroes;
const ganhou = r.corpo.rodada.volta;
prova(
  'o saldo fica certo com o que se apostou e o que voltou',
  depois === 250 - 50 + ganhou,
  `saldo ${depois}, voltou ${ganhou}`
);
prova('e a rodada ficou contada no quadro', r.corpo.linha.roleta.rodadas === 1);

r = await peco('/roleta', { nome, passe, apostas: [{ tipo: 'vermelho', quanto: 999999 }] });
prova('não se aposta o que não se tem', r.estado === 400, JSON.stringify(r.corpo));

r = await peco('/roleta', { nome, passe, apostas: [{ tipo: 'cavalos', quanto: 5 }] });
prova('nem em coisas que não existem', r.estado === 400);

r = await peco('/roleta', { nome, passe: 'f'.repeat(32), apostas: [{ tipo: 'preto', quanto: 5 }] });
prova('e não se joga com o nome de outra pessoa', r.estado === 403, JSON.stringify(r.corpo));

/* ---------------- gastar tudo, e depois ---------------- */

let saldo = (await peco('/quadro/entrar', { nome, pin: '7777' })).corpo.linha.torroes;
let voltas = 0;
while (saldo > 0 && voltas++ < 60) {
  const x = await peco('/roleta', { nome, passe, apostas: [{ tipo: 'numero', valor: 13, quanto: saldo }] });
  if (x.estado !== 200) break;
  saldo = x.corpo.linha.torroes;
}
prova('dá para apostar tudo o que se tem', voltas > 0);
prova('e o saldo nunca fica negativo', saldo >= 0, `saldo ${saldo}`);

if (saldo === 0) {
  r = await peco('/quadro/emprestimo', { nome, passe });
  prova('quem fica a zero pede os cem emprestados', r.corpo?.linha?.torroes === 100, JSON.stringify(r.corpo));
  r = await peco('/quadro/emprestimo', { nome, passe });
  prova('e não os pede duas vezes seguidas', r.estado === 400);
}

/* ---------------- os recordes ---------------- */

r = await peco('/quadro/recorde', { nome, passe, jogo: 'cusco', pontos: 12 });
prova('um recorde entra no quadro', r.corpo?.linha?.recordes?.cusco === 12, JSON.stringify(r.corpo));

const torroesAntes = r.corpo.linha.torroes;
r = await peco('/quadro/recorde', { nome, passe, jogo: 'cusco', pontos: 40 });
prova('um recorde maior fica', r.corpo?.linha?.recordes?.cusco === 40);
prova('e não paga torrões nenhuns', r.corpo.linha.torroes === torroesAntes);

r = await peco('/quadro/recorde', { nome, passe, jogo: 'cusco', pontos: 3 });
prova('um recorde menor não apaga o que lá estava', r.corpo?.linha?.recordes?.cusco === 40);

r = await peco('/quadro/recorde', { nome, passe, jogo: 'xadrez', pontos: 9 });
prova('um jogo que não existe não tem recorde', r.estado === 400);

r = await peco('/quadro/recorde', { nome, passe: 'f'.repeat(32), jogo: 'jogo', pontos: 900 });
prova('e não se põe recorde no nome de outra pessoa', r.estado === 403);

/* ---------------- o quadro ---------------- */

r = await peco('/quadro');
prova('o quadro sai ordenado pelos torrões', Array.isArray(r.corpo) && r.corpo.every((l, i, t) => i === 0 || t[i - 1].torroes >= l.torroes));
prova('e não traz segredos de ninguém', !JSON.stringify(r.corpo).match(/"pin":\{|passes|"erros"|resumo/));
prova('o nome desta prova está lá', r.corpo.some((l) => l.nome === nome));

const tudo = await peco('/tudo');
prova('e o /tudo traz o mesmo quadro', Array.isArray(tudo.corpo?.quadro) && tudo.corpo.quadro.length === r.corpo.length);

/* ---------------- os nomes de antes do banco ---------------- */

prova(
  'os nomes que já existiam vieram todos para o banco',
  r.corpo.length > 5,
  `so vieram ${r.corpo.length}`
);
const velho = r.corpo.find((l) => l.nome === 'Zebzelgas' || l.maos > 0);
prova(
  'e trazem as contas antigas do blackjack intactas',
  !velho || typeof velho.maos === 'number',
  JSON.stringify(velho)
);

console.log(`\n${feitos - falhas} de ${feitos} provas passaram.`);
process.exit(falhas ? 1 : 0);
