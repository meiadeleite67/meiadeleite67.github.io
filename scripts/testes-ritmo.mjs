import assert from 'node:assert/strict';

const base = process.env.MDL_SERVIDOR || 'http://127.0.0.1:8791';
async function pedir(rota, corpo) {
  const r = await fetch(base + rota, {
    method: corpo ? 'POST' : 'GET',
    headers: { 'Content-Type': 'application/json', Origin: 'http://localhost:5173' },
    body: corpo ? JSON.stringify(corpo) : undefined
  });
  return { estado: r.status, corpo: await r.json(), retry: r.headers.get('Retry-After') };
}
const nome = 'Ritmo' + Date.now().toString(36);
const entrada = await pedir('/quadro/entrar', { nome, pin: '7777' });
assert.equal(entrada.estado, 200);
const passe = entrada.corpo.passe;
const aposta = { nome, passe, apostas: [{ tipo: 'vermelho', quanto: 1 }] };
assert.equal((await pedir('/roleta', { ...aposta, passe: 'f'.repeat(32) })).estado, 403);
const rajada = await Promise.all(Array.from({ length: 8 }, () => pedir('/roleta', aposta)));
assert.equal(rajada.filter(r => r.estado === 200).length, 1);
assert.equal(rajada.filter(r => r.estado === 429).length, 7);
const mesa = await pedir('/mesa', { nome, passe });
assert.equal(mesa.estado, 200);
assert.equal(mesa.corpo.linha.roleta.rodadas, 1);
await new Promise(r => setTimeout(r, 5700));
assert.equal((await pedir('/roleta', aposta)).estado, 200);
assert.equal((await pedir('/mesa/apostar', { nome, passe, aposta: 1 })).estado, 200);
assert.equal((await pedir('/mesa/apostar', { nome, passe, aposta: 1 })).estado, 429);
let bloqueado;
for (let i = 0; i < 245; i++) {
  const r = await pedir('/quadro');
  if (r.estado === 429) { bloqueado = r; break; }
}
assert.equal(bloqueado?.retry, '60');
assert.equal((await pedir('/agenda')).estado, 200);
console.log('OK: rajadas, passe inválido, saldo, fim do intervalo, blackjack e limite por IP.');
