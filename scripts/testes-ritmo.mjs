import assert from 'node:assert/strict';
import { assinarVisita } from '../worker/seguranca.js';
import WebSocket from 'ws';

const base = process.env.MDL_SERVIDOR || 'http://127.0.0.1:8791';
if (!/^http:\/\/(127\.0\.0\.1|localhost):/.test(base)) throw new Error('Estas provas são apenas para o Worker local.');
const origem = 'http://localhost:5173';
const ip = '192.0.2.10';
const { visita } = await assinarVisita(new Request(base, { headers: { Origin: origem, 'CF-Connecting-IP': ip } }), { SEGURANCA_SEGREDO: 'segredo-local-testes' });
async function pedir(rota, corpo, token = visita) {
  const r = await fetch(base + rota, {
    method: corpo ? 'POST' : 'GET',
    headers: { 'Content-Type': 'application/json', Origin: origem, 'CF-Connecting-IP': ip, 'X-MDL-Visita': token },
    body: corpo ? JSON.stringify(corpo) : undefined
  });
  return { estado: r.status, corpo: await r.json(), retry: r.headers.get('Retry-After') };
}
for (const rota of ['/quadro/entrar', '/mesa/apostar', '/roleta', '/quadro/recorde', '/admin/entrar', '/tickets']) assert.equal((await pedir(rota, {}, '')).estado, 403);
const nome = 'Ritmo' + Date.now().toString(36);
const entrada = await pedir('/quadro/entrar', { nome, pin: '7777' });
assert.equal(entrada.estado, 200);
const passe = entrada.corpo.passe;
assert.equal((await pedir('/mesa', { nome, passe }, visita + 'f')).estado, 403);
const aposta = { nome, passe, apostas: [{ tipo: 'vermelho', quanto: 1 }] };
assert.equal((await pedir('/roleta', { ...aposta, passe: 'f'.repeat(32) })).estado, 403);
const rajada = await Promise.all(Array.from({ length: 8 }, () => pedir('/roleta', aposta)));
assert.equal(rajada.filter(r => r.estado === 200).length, 1);
assert.equal(rajada.filter(r => r.estado === 429).length, 7);
const mesa = await pedir('/mesa', { nome, passe });
assert.equal(mesa.estado, 200);
assert.equal(mesa.corpo.linha.roleta.rodadas, 1);
await new Promise(r => setTimeout(r, 12100));
const cartas = await pedir('/mesa/apostar', { nome, passe, aposta: 1 });
assert.equal(cartas.estado, 200, JSON.stringify(cartas));
assert.equal((await pedir('/mesa/jogar', { nome, passe, acao: 'ficar', passo: cartas.corpo.mesa.passo })).estado, 429);
await new Promise(r => setTimeout(r, 1600));
if (cartas.corpo.mesa.fase === 'jogo') {
  const passo = cartas.corpo.mesa.passo;
  const pares = await Promise.all([pedir('/mesa/jogar', { nome, passe, acao: 'ficar', passo }), pedir('/mesa/jogar', { nome, passe, acao: 'ficar', passo })]);
  assert.equal(pares.filter(r => r.estado === 200).length, 1);
  assert.equal((await pedir('/mesa', { nome, passe })).corpo.linha.maos, 1);
}
for (let i = 0; i < 11; i++) assert.equal((await pedir('/roleta', aposta)).estado, 429);
const suspenso = await pedir('/quadro/recorde', { nome, passe, jogo: 'cusco', pontos: 1 });
assert.equal(suspenso.estado, 429);
assert.ok(Number(suspenso.retry) > 800);
async function ligar(token = visita) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(base.replace('http', 'ws') + '/poker/m-prova?visita=' + encodeURIComponent(token), { origin: origem, headers: { 'CF-Connecting-IP': ip } });
    ws.on('open', () => resolve(ws)); ws.on('error', reject);
  });
}
await assert.rejects(ligar('forjado'));
const ws = await ligar();
const fechado = new Promise(resolve => ws.on('close', code => resolve(code)));
for (let i = 0; i < 31; i++) ws.send('{"a":"desconhecida"}');
assert.equal(await fechado, 1008);
let bloqueado;
for (let i = 0; i < 15; i++) {
  const grupo = await Promise.all(Array.from({ length: 20 }, () => pedir('/quadro')));
  bloqueado = grupo.find(r => r.estado === 429);
  if (bloqueado) break;
}
assert.equal(bloqueado?.retry, '60');
assert.equal((await pedir('/agenda')).estado, 200);
console.log('OK: portas HTTP, sessões forjadas, concorrência, pausas, suspensão, WebSockets e limite por IP.');
