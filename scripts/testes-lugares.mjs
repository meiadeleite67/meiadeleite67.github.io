/**
 * Quem se senta e não joga tem de sair da mesa sozinho.
 *
 * Uma mesa são cinco lugares, e um separador esquecido tomava um deles até
 * alguém se lembrar de sair. Há duas maneiras de se perder o lugar: deixar
 * passar a vez três vezes seguidas, ou estar oito minutos sentado sem fazer
 * nada. É a primeira que se prova aqui, que leva pouco mais de um minuto; a
 * segunda leva oito, e prova-se à mão encurtando o PARADO_DEMAIS em
 * worker/mesa-de-poker.js.
 *
 *   cd worker && npx wrangler dev --port 8787 --local
 *   node scripts/testes-lugares.mjs
 */

const CASA = process.env.MDL_SERVIDOR || 'http://127.0.0.1:8787';
const CANO = CASA.replace(/^http/, 'ws');
const ORIGEM = 'http://localhost:5173';
const MESA = `lug${Date.now().toString(36)}`;
/** Três faltas de trinta, dez e dez segundos, mais as pausas entre mãos. */
const ESPERA_MAXIMA = 180_000;

const dorme = (ms) => new Promise((ok) => setTimeout(ok, ms));

async function estrear(nome) {
  const r = await fetch(`${CASA}/quadro/entrar`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: ORIGEM },
    body: JSON.stringify({ nome, pin: '1357' })
  });
  const c = await r.json();
  if (!c.passe) throw new Error(`sem passe para ${nome}: ${JSON.stringify(c)}`);
  return c.passe;
}

/** Uma ligação à mesa. Quem "joga" iguala ou passa sempre; quem não joga fica
 *  a olhar, que é o que se quer provar. */
function ligar(nome, passe, lugar, joga) {
  const ws = new WebSocket(`${CANO}/poker/${MESA}`);
  const p = { nome, mesa: null, recados: [] };
  const manda = (o) => ws.readyState === 1 && ws.send(JSON.stringify(o));
  let sentou = false;

  ws.addEventListener('open', () => manda({ a: 'entrar', nome, passe }));
  ws.addEventListener('message', (e) => {
    if (e.data === 'ok') return;
    const v = JSON.parse(e.data);
    if (v.t === 'recado') return p.recados.push(v.texto);
    if (v.t !== 'mesa') return;
    p.mesa = v;
    if (!sentou && v.eu && v.eu.lugar < 0) {
      sentou = true;
      return manda({ a: 'sentar', lugar });
    }
    if (!joga) return;
    const mao = v.mao;
    if (!mao || !v.eu || mao.vez !== v.eu.lugar || !mao.podes) return;
    setTimeout(
      () => manda({ a: 'jogada', passo: mao.passo, acao: mao.podes.passar ? 'passar' : 'igualar' }),
      400
    );
  });
  p.fechar = () => ws.close();
  return p;
}

const marca = Date.now().toString(36);
const parado = 'Parado' + marca;
const activo = 'Activo' + marca;

const olhos = ligar(parado, await estrear(parado), 0, false);
ligar(activo, await estrear(activo), 3, true);

console.log(`mesa ${MESA}: ${parado} nunca joga, ${activo} joga sempre`);

const fim = Date.now() + ESPERA_MAXIMA;
let saiu = false;
let ultimasFaltas = -1;

while (Date.now() < fim) {
  await dorme(3000);
  const m = olhos.mesa;
  if (!m) continue;
  const la = m.lugares.find((l) => l.nome === parado);
  if (!la) {
    saiu = true;
    console.log(`  . saiu ao fim de ${Math.round((ESPERA_MAXIMA - (fim - Date.now())) / 1000)}s`);
    console.log('  . a mesa contou: ' + m.narracao.filter((x) => x.includes(parado)).slice(-1)[0]);
    console.log('  . e a ele disse: ' + (olhos.recados.slice(-1)[0] || '(nada)'));
    break;
  }
  if (la.faltas !== ultimasFaltas) {
    ultimasFaltas = la.faltas;
    console.log(`    faltas: ${la.faltas}`);
  }
}

if (!saiu) console.error('  x ficou sentado ate ao fim');
console.log(saiu ? '\nO lugar de quem nao joga volta a ficar livre.' : '\n1 falha.');
process.exit(saiu ? 0 : 1);
