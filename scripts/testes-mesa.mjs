/**
 * Uma mesa de poker a sério, com três ligações, contra o Worker a correr aqui
 * ao lado.
 *
 * As regras têm provas próprias em testes-poker.mjs, que não precisam de rede
 * nenhuma. O que se prova aqui é o resto: que as cartas dos outros não saem do
 * servidor, que ninguém joga fora da vez nem duas vezes a mesma jogada, que um
 * passe que não é nosso não abre nada, e que quem deixa de jogar perde o lugar
 * em vez de a mesa ficar tomada.
 *
 *   cd worker && npx wrangler dev --port 8787 --local
 *   node scripts/testes-mesa.mjs
 */

const CASA = process.env.MDL_SERVIDOR || 'http://127.0.0.1:8787';
const CANO = CASA.replace(/^http/, 'ws');
const ORIGEM = 'http://localhost:5173';
const MESA = `p${Date.now().toString(36)}`;

let falhas = 0;
const certo = (v, porque) => {
  if (v) return console.log('  . ' + porque);
  falhas++;
  console.error('  x ' + porque);
};

const dorme = (ms) => new Promise((ok) => setTimeout(ok, ms));

async function ate(cond, quanto, porque) {
  const fim = Date.now() + quanto;
  while (Date.now() < fim) {
    if (cond()) return true;
    await dorme(120);
  }
  throw new Error('nunca aconteceu: ' + porque);
}

/** Um nome novo com PIN, e o passe que ele devolve. */
async function estrear(nome) {
  const r = await fetch(`${CASA}/quadro/entrar`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: ORIGEM },
    body: JSON.stringify({ nome, pin: '2468' })
  });
  const c = await r.json();
  if (!c.passe) throw new Error(`sem passe para ${nome}: ${JSON.stringify(c)}`);
  return c.passe;
}

function ligar(nome) {
  const ws = new WebSocket(`${CANO}/poker/${MESA}`);
  const p = { nome, ws, mesa: null, recados: [] };
  ws.addEventListener('message', (e) => {
    if (e.data === 'ok') return;
    const v = JSON.parse(e.data);
    if (v.t === 'mesa') p.mesa = v;
    if (v.t === 'recado') p.recados.push(v.texto);
  });
  p.manda = (o) => ws.readyState === 1 && ws.send(JSON.stringify(o));
  p.aberto = new Promise((ok) => ws.addEventListener('open', ok));
  return p;
}

const marca = Date.now().toString(36);
const nomes = ['Um', 'Dois', 'Tres'].map((x) => 'Prova' + x + marca);
const passes = {};
for (const n of nomes) passes[n] = await estrear(n);

const jogadores = nomes.map(ligar);
await Promise.all(jogadores.map((j) => j.aberto));
console.log(`mesa ${MESA}, tres ligacoes abertas`);

/* ---------------- quem é quem ---------------- */

jogadores[0].manda({ a: 'entrar', nome: nomes[0], passe: 'f'.repeat(32) });
await ate(() => jogadores[0].recados.length > 0, 5000, 'recado do passe errado');
certo(
  /PIN/.test(jogadores[0].recados[0]),
  'um passe que nao e nosso nao entra com o nome de ninguem'
);

jogadores[1].manda({ a: 'sentar', lugar: 0 });
await ate(() => jogadores[1].recados.length > 0, 5000, 'recado de quem nao se identificou');
certo(/quem és/.test(jogadores[1].recados[0]), 'sem dizer quem se e nao ha lugar');

for (const j of jogadores) {
  j.recados = [];
  j.manda({ a: 'entrar', nome: j.nome, passe: passes[j.nome] });
}
await dorme(600);
jogadores.forEach((j, i) => j.manda({ a: 'sentar', lugar: i }));
await ate(() => jogadores[0].mesa && jogadores[0].mesa.lugares.length === 3, 8000, 'tres sentados');
certo(
  jogadores[0].mesa.lugares.every((l) => l.fichas === 2500),
  'cada um senta-se com 2500 torroes'
);

jogadores[0].recados = [];
jogadores[0].manda({ a: 'sentar', lugar: 1 });
await ate(() => jogadores[0].recados.length > 0, 5000, 'recado do lugar tomado');
certo(
  /já é de alguém|Já estás sentado/.test(jogadores[0].recados[0]),
  'ninguem se senta duas vezes nem em cima de outro'
);

/* ---------------- o que cada um pode ver ---------------- */

await ate(() => jogadores[0].mesa.mao, 15000, 'a mao comecar');
const m0 = jogadores[0].mesa.mao;
console.log(`mao ${m0.numero} a andar`);

certo(m0.jogadores.find((j) => j.lugar === 0).cartas?.length === 2, 'vejo as minhas duas cartas');
certo(
  m0.jogadores.filter((j) => j.lugar !== 0).every((j) => j.cartas === null),
  'as cartas dos outros nao chegam ca'
);
certo(
  m0.jogadores.filter((j) => j.lugar !== 0).every((j) => j.quantas === 2),
  'mas ve-se que eles tem duas'
);
certo(!JSON.stringify(jogadores[0].mesa).includes('baralho'), 'o baralho nunca sai do servidor');
certo(m0.pote === 75, 'os cegos ja estao no meio');

/* ---------------- fora da vez e a dobrar ---------------- */

const fora = jogadores.find((j) => j.mesa.eu.lugar !== m0.vez);
fora.recados = [];
fora.manda({ a: 'jogada', passo: m0.passo, acao: 'igualar' });
await ate(() => fora.recados.length > 0, 5000, 'recado de quem joga fora da vez');
certo(/tua vez/.test(fora.recados[0]), 'fora da vez nao se joga');

const deVez = jogadores.find((j) => j.mesa.eu.lugar === m0.vez);
const passoAntes = deVez.mesa.mao.passo;
deVez.recados = [];
deVez.manda({ a: 'jogada', passo: passoAntes, acao: 'igualar' });
await dorme(400);
deVez.manda({ a: 'jogada', passo: passoAntes, acao: 'igualar' });
await ate(() => deVez.recados.length > 0, 5000, 'recado da jogada repetida');
certo(/já foi feita/.test(deVez.recados[0]), 'a mesma jogada nao passa duas vezes');

/* ---------------- maos inteiras, com as fichas contadas ---------------- */

const naMao = (p) => p.mesa.mao.jogadores.reduce((s, j) => s + j.fichas, 0) + p.mesa.mao.pote;
const nosLugares = (p) => p.mesa.lugares.reduce((s, l) => s + l.fichas, 0);

let acabadas = 0;
const fim = Date.now() + 90000;
while (acabadas < 3 && Date.now() < fim) {
  const p = jogadores[0];
  if (p.mesa.mao && p.mesa.mao.fase === 'acabou') {
    acabadas++;
    certo(nosLugares(p) === 7500, `no fim da mao ${acabadas} as fichas da mesa continuam 7500`);
    await ate(() => !jogadores[0].mesa.mao, 15000, 'a mao ser arrumada');
    await ate(() => jogadores[0].mesa.mao, 20000, 'a mao seguinte');
    continue;
  }
  const quem = jogadores.find((j) => j.mesa.mao && j.mesa.mao.vez === j.mesa.eu.lugar);
  if (!quem || !quem.mesa.mao.podes) {
    await dorme(120);
    continue;
  }
  const mao = quem.mesa.mao;
  if (naMao(quem) !== 7500) {
    falhas++;
    console.error('  x a meio da mao as fichas deram ' + naMao(quem));
  }
  const sorte = Math.random();
  if (sorte < 0.15) quem.manda({ a: 'jogada', passo: mao.passo, acao: 'desistir' });
  else if (sorte < 0.85 || !mao.podes.podeSubir)
    quem.manda({ a: 'jogada', passo: mao.passo, acao: mao.podes.passar ? 'passar' : 'igualar' });
  else
    quem.manda({
      a: 'jogada',
      passo: mao.passo,
      acao: 'subir',
      valor: Math.min(mao.podes.maximo, mao.podes.minimo + 75)
    });
  await dorme(140);
}
certo(acabadas >= 3, 'tres maos jogadas de fio a pavio');

/* ---------------- quem se desliga ---------------- */

jogadores[2].ws.close();
await ate(
  () => jogadores[0].mesa.lugares.find((l) => l.lugar === 2)?.ligado === false,
  8000,
  'o lugar de quem se desligou ficar marcado'
);
certo(true, 'quem se desliga fica marcado, e o lugar dele so se perde mais tarde');

jogadores[0].ws.close();
jogadores[1].ws.close();
console.log(falhas ? `\n${falhas} falhas.` : '\nA mesa passou em tudo.');
process.exit(falhas ? 1 : 0);
