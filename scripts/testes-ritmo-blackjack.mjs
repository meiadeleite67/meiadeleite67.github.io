import assert from 'node:assert/strict';
import { limitarJogador, terminarRodada } from '../worker/ritmo.js';

const estado = {};
assert.equal(limitarJogador(estado, 'blackjack', 10000), null);
assert.equal(estado['proxima:blackjack'], 13000);
assert.equal(limitarJogador(estado, 'acao', 10249).estado, 429);
assert.equal(limitarJogador(estado, 'acao', 10250), null);
assert.equal(limitarJogador(estado, 'acao', 10500), null);
terminarRodada(estado, 14000);
assert.equal(estado['proxima:blackjack'], 14500);
assert.equal(limitarJogador(estado, 'blackjack', 14500), null);
assert.equal(limitarJogador(estado, 'rodada', 14500), null);
assert.equal(estado['proxima:rodada'], 26500);
assert.equal(estado.hora.quantas, 3);
const limite = { hora: { ate: 999999, quantas: 120 }, dia: { ate: 999999, quantas: 120 } };
assert.equal(limitarJogador(limite, 'blackjack', 15000).estado, 429);
console.log('OK: decisões rápidas, pausa final curta e limites de volume preservados.');
