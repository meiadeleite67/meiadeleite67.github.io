/**
 * A porta de entrada, posta à prova contra o Worker a correr aqui ao lado.
 *
 * O que se prova aqui é quem entra e quem não entra: um nome novo fica com o
 * PIN de quem o estreia, um nome antigo sem PIN fica com o primeiro que lhe
 * puserem, e um nome com PIN não se abre à martelada, porque as tentativas
 * acabam.
 *
 *   cd worker && npx wrangler dev --port 8787 --local
 *   node scripts/testes-pin.mjs
 *
 * A parte do nome antigo e a de limpar o PIN precisam de entrar no admin, e
 * para isso o Worker local tem de ter um segredo de autenticador conhecido.
 * Poe-se um em worker/.dev.vars, que nao entra no repositorio:
 *
 *   TOTP_SEGREDO=JBSWY3DPEHPK3PXP
 */

import { createHmac } from 'node:crypto';

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

async function entrar(nome, pin) {
  const r = await fetch(`${CASA}/quadro/entrar`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: ORIGEM },
    body: JSON.stringify({ nome, pin })
  });
  return { estado: r.status, corpo: await r.json().catch(() => null) };
}

async function naMesa(rota, corpo) {
  const r = await fetch(CASA + rota, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: ORIGEM },
    body: JSON.stringify(corpo)
  });
  return { estado: r.status, corpo: await r.json().catch(() => null) };
}

const aoCalhas = () => 'Prova' + Math.random().toString(36).slice(2, 8);

/* O codigo de seis digitos do autenticador, feito aqui para se poder entrar no
   admin sem ninguem ter de o escrever. So serve contra o Worker local, que e o
   unico com este segredo. */
const SEGREDO_DE_PROVA = 'JBSWY3DPEHPK3PXP';
const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function deBase32(t) {
  let bits = 0;
  let valor = 0;
  const bytes = [];
  for (const c of t.toUpperCase().replace(/[^A-Z2-7]/g, '')) {
    valor = (valor << 5) | B32.indexOf(c);
    bits += 5;
    if (bits >= 8) {
      bytes.push((valor >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

function codigoAgora() {
  const passo = Math.floor(Date.now() / 30000);
  const contador = Buffer.alloc(8);
  contador.writeUInt32BE(Math.floor(passo / 2 ** 32), 0);
  contador.writeUInt32BE(passo >>> 0, 4);
  const a = createHmac('sha1', deBase32(SEGREDO_DE_PROVA)).update(contador).digest();
  const salto = a[a.length - 1] & 15;
  const n =
    ((a[salto] & 127) << 24) | (a[salto + 1] << 16) | (a[salto + 2] << 8) | a[salto + 3];
  return String(n % 1000000).padStart(6, '0');
}

async function chaveDeAdmin() {
  const r = await fetch(`${CASA}/admin/entrar`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: ORIGEM },
    body: JSON.stringify({ codigo: codigoAgora() })
  });
  if (!r.ok) return '';
  return (await r.json()).chave || '';
}

async function limparPin(nome, chave) {
  const r = await fetch(`${CASA}/quadro/pin/apagar`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Origin: ORIGEM,
      Authorization: `Bearer ${chave}`
    },
    body: JSON.stringify({ nome })
  });
  return { estado: r.status, corpo: await r.json().catch(() => null) };
}

/* ---------------- um nome novo ---------------- */

const novo = aoCalhas();
let r = await entrar(novo, '4821');
prova('um nome novo fica com o PIN de quem o estreia', r.estado === 200 && r.corpo.estreou === 'nome', JSON.stringify(r.corpo));
prova('e vem de lá um passe', /^[a-f0-9]{32}$/.test(r.corpo?.passe || ''));
prova('o PIN não volta para trás', !JSON.stringify(r.corpo).includes('4821'));
prova(
  'nem o resumo dele, nem os passes',
  !JSON.stringify(r.corpo.linha).match(/pin|passes|erros|resumo/),
  JSON.stringify(r.corpo.linha)
);
const passe = r.corpo.passe;

/* ---------------- o passe abre a mesa ---------------- */

r = await naMesa('/mesa', { nome: novo, passe });
prova('o passe serve para jogar', r.estado === 200);

r = await naMesa('/mesa', { nome: novo, passe: 'a'.repeat(32) });
prova('um passe inventado não serve', r.estado === 403, JSON.stringify(r.corpo));

r = await naMesa('/mesa', { nome: novo, passe: '' });
prova('nem um passe vazio', r.estado === 403);

/* ---------------- o PIN certo e o errado ---------------- */

r = await entrar(novo, '4821');
prova('quem sabe o PIN entra outra vez', r.estado === 200 && r.corpo.estreou === '');
prova('e leva outro passe, para este aparelho', r.corpo.passe !== passe);

r = await entrar(novo, '9999');
prova('o PIN errado não entra', r.estado === 401, JSON.stringify(r.corpo));
prova('e diz quantas tentativas faltam', /[Ff]alta/.test(r.corpo?.erro || ''), r.corpo?.erro);

/* ---------------- as tentativas acabam ---------------- */

const alvo = aoCalhas();
await entrar(alvo, '1111');
let trancou = '';
for (let i = 0; i < 5; i++) {
  const x = await entrar(alvo, '2222');
  if (x.estado === 401 && /castigo/.test(x.corpo?.erro || '')) trancou = x.corpo.erro;
}
prova('ao fim de cinco enganos o nome fica de castigo', !!trancou, trancou || 'nunca trancou');

r = await entrar(alvo, '1111');
prova('e nem o PIN certo abre enquanto o castigo durar', r.estado === 429, JSON.stringify(r.corpo));

/* -------- limpar o PIN, e o nome que fica outra vez à espera de um --------

   É a saída para quando alguém se mete no nome de outra pessoa. O admin limpa
   o PIN, o nome fica como os que vinham do tempo das chaves, e o primeiro que
   lá chegar põe-lhe um novo. Os torrões não se mexem. */

const chaveAdmin = await chaveDeAdmin();

if (!chaveAdmin) {
  console.log('  ~ saltadas as provas do admin: falta worker/.dev.vars com o TOTP_SEGREDO de prova');
} else {
  const antes = (await entrar(novo, '4821')).corpo.linha.torroes;

  let x = await limparPin(novo, chaveAdmin);
  prova('o admin consegue limpar o PIN de um nome', x.estado === 200, JSON.stringify(x.corpo));

  r = await entrar(novo, '4821');
  prova('e os passes que havia deixam de servir', r.estado === 200 && r.corpo.estreou === 'pin');

  r = await naMesa('/mesa', { nome: novo, passe });
  prova('mesmo o passe antigo daquele aparelho', r.estado === 403, JSON.stringify(r.corpo));

  prova('um nome sem PIN fica com o primeiro que lhe puserem', r.estado === 403);
  prova('e os torrões dele ficam onde estavam', (await entrar(novo, '4821')).corpo.linha.torroes === antes);

  x = await limparPin('NomeQueNaoExiste' + Date.now(), chaveAdmin);
  prova('e não se limpa o PIN de um nome que não existe', x.estado === 404);
}

/* ---------------- o que não presta ---------------- */

r = await entrar(aoCalhas(), '12');
prova('um PIN de dois algarismos não serve', r.estado === 400, JSON.stringify(r.corpo));

r = await entrar('a', '1234');
prova('um nome de uma letra não serve', r.estado === 400);

r = await entrar(aoCalhas(), 'abcd');
prova('um PIN de letras não serve', r.estado === 400);

/* ---------------- limpar o PIN é só do admin ---------------- */

const semChave = await naMesa('/quadro/pin/apagar', { nome: novo });
prova('limpar o PIN de um nome não é para qualquer um', semChave.estado === 401);

console.log(`\n${feitos - falhas} de ${feitos} provas passaram.`);
process.exit(falhas ? 1 : 0);
