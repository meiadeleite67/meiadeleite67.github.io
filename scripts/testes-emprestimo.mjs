import assert from 'node:assert/strict';
import { assinarVisita } from '../worker/seguranca.js';
const base = process.env.MDL_SERVIDOR || 'http://127.0.0.1:8792';
if (!/^http:\/\/(127\.0\.0\.1|localhost):/.test(base)) throw new Error('Teste apenas local.');
const headers = { Origin: 'http://localhost:5173', 'CF-Connecting-IP': '192.0.2.12', 'Content-Type': 'application/json' };
headers['X-MDL-Visita'] = (await assinarVisita(new Request(base, { headers }), { SEGURANCA_SEGREDO: 'segredo-local-testes' })).visita;
async function pedir(rota, body) { const r = await fetch(base + rota, { method: 'POST', headers, body: JSON.stringify(body) }); return { estado: r.status, corpo: await r.json() }; }
for (const nome of ['CreditoTeste', 'CreditoConcorrente']) {
  const entrada = await pedir('/quadro/entrar', { nome, pin: '7777' });
  assert.equal(entrada.estado, 200);
  assert.equal(entrada.corpo.linha.torroes, 0, 'Semear estas contas com saldo zero no KV local antes do arranque.');
  const passe = entrada.corpo.passe;
  assert.equal((await pedir('/quadro/emprestimo', { nome, passe: 'f'.repeat(32) })).estado, 403);
  const respostas = await Promise.all([pedir('/quadro/emprestimo', { nome, passe }), pedir('/quadro/emprestimo', { nome, passe })]);
  const aceite = respostas.find(r => r.estado === 200);
  assert.equal(respostas.filter(r => r.estado === 200).length, 1);
  assert.equal(respostas.filter(r => r.estado === 400).length, 1);
  assert.equal(aceite.corpo.linha.torroes, 100);
  assert.equal(aceite.corpo.mesa, null);
  assert.equal(aceite.corpo.linha.maos, 8);
  assert.equal((await pedir('/mesa', { nome, passe })).corpo.linha.torroes, 100);
}
console.log('OK: empréstimo responde com saldo e mesa, mantém estatísticas, verifica o passe e não duplica créditos.');
