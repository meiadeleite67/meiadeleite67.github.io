/**
 * As contas da roleta, postas à prova.
 *
 * O que se prova aqui é o que paga cada aposta, que o zero come as de fora, e
 * que a roda é mesmo a roda de uma roleta europeia. E prova-se também que ao
 * fim de muitas rodadas a casa fica com a fatia que lhe compete e não com
 * outra: numa roleta de um zero são 2,7 por cento, e se esse número saísse
 * muito diferente era sinal de que alguma conta estava torta.
 *
 *   node scripts/testes-roleta.mjs
 */
import { APOSTAS, RODA, contar, cor, limparApostas, rodada, vizinhos } from '../worker/roleta.js';

let feitos = 0;
let falhas = 0;

function prova(nome, ok, porque = '') {
  feitos++;
  if (ok) return console.log('  . ' + nome);
  falhas++;
  console.error(`  x ${nome}${porque ? '\n    ' + porque : ''}`);
}

/* ---------------- a roda ---------------- */

prova('a roda tem trinta e sete casas', RODA.length === 37);
prova('sem casas repetidas', new Set(RODA).size === 37);
prova('com todos os números de 0 a 36', RODA.every((n) => n >= 0 && n <= 36));
prova('e começa no zero', RODA[0] === 0);

const vermelhos = RODA.filter((n) => cor(n) === 'vermelho');
const pretos = RODA.filter((n) => cor(n) === 'preto');
prova('dezoito vermelhos e dezoito pretos', vermelhos.length === 18 && pretos.length === 18);
prova('e o zero é verde', cor(0) === 'verde');

/* Numa roleta a sério dois números seguidos nunca são da mesma cor, tirando os
   vizinhos do zero. É a maneira mais simples de confirmar que a ordem da roda
   não foi inventada. */
let seguidasIguais = 0;
for (let i = 0; i < RODA.length; i++) {
  const a = RODA[i];
  const b = RODA[(i + 1) % RODA.length];
  if (a !== 0 && b !== 0 && cor(a) === cor(b)) seguidasIguais++;
}
prova('as cores alternam à volta da roda', seguidasIguais === 0, `${seguidasIguais} vizinhas iguais`);

/* ---------------- o que cada aposta paga ---------------- */

/* ---------------- a cavalo e em quadra ---------------- */

prova('um cavalo lado a lado na fila', vizinhos([1, 2], 2) !== null);
prova('um cavalo de uma fila para a outra', vizinhos([17, 20], 2) !== null);
prova('a ordem em que chegam não importa', String(vizinhos([20, 17], 2)) === '17,20');
prova('o 3 e o 4 não são vizinhos', vizinhos([3, 4], 2) === null);
prova('nem o 1 e o 3', vizinhos([1, 3], 2) === null);
prova('nem o 1 e o 5', vizinhos([1, 5], 2) === null);
prova('não há cavalo com o zero', vizinhos([0, 1], 2) === null && vizinhos([0, 2], 2) === null);
prova('nem com números de fora da roleta', vizinhos([36, 39], 2) === null);
prova('nem com o mesmo número duas vezes', vizinhos([5, 5], 2) === null);

prova('uma quadra fecha um quadrado', vizinhos([1, 2, 4, 5], 4) !== null);
prova('a última quadra é a do 32', vizinhos([32, 33, 35, 36], 4) !== null);
prova('o 3 não abre quadra, que não tem nada à direita', vizinhos([3, 4, 6, 7], 4) === null);
prova('nem uma quadra torta', vizinhos([1, 2, 3, 4], 4) === null);
prova('nem uma quadra com o zero', vizinhos([0, 1, 2, 3], 4) === null);

let cavalos = 0;
let quadras = 0;
for (let a = 1; a <= 36; a++)
  for (let b = a + 1; b <= 36; b++) if (vizinhos([a, b], 2)) cavalos++;
for (let a = 1; a <= 36; a++) if (vizinhos([a, a + 1, a + 3, a + 4], 4)) quadras++;
prova('há 57 cavalos no pano', cavalos === 57, `contaram-se ${cavalos}`);
prova('e 22 quadras', quadras === 22, `contaram-se ${quadras}`);

const cavalo = [{ tipo: 'cavalo', numeros: [17, 20], quanto: 10 }];
prova('um cavalo paga 18 vezes pelo primeiro', contar(cavalo, 17).volta === 180);
prova('e pelo segundo', contar(cavalo, 20).volta === 180);
prova('e nada pelos outros', contar(cavalo, 18).volta === 0 && contar(cavalo, 0).volta === 0);

const quadra = [{ tipo: 'quadra', numeros: [1, 2, 4, 5], quanto: 10 }];
prova('uma quadra paga 8 vezes por qualquer dos quatro', [1, 2, 4, 5].every((n) => contar(quadra, n).volta === 80));
prova('e nada pelos outros', contar(quadra, 3).volta === 0 && contar(quadra, 0).volta === 0);

const lido = limparApostas([{ tipo: 'cavalo', numeros: [20, 17], quanto: 5 }], 100);
prova('a mesa aceita um cavalo e arruma-lhe os números', !lido.erro && String(lido.apostas[0].numeros) === '17,20');
prova('e recusa um cavalo com o zero', !!limparApostas([{ tipo: 'cavalo', numeros: [0, 1], quanto: 5 }], 100).erro);
prova('e uma quadra torta', !!limparApostas([{ tipo: 'quadra', numeros: [1, 2, 3, 4], quanto: 5 }], 100).erro);
prova('e um cavalo sem números', !!limparApostas([{ tipo: 'cavalo', quanto: 5 }], 100).erro);

const so = (tipo, quanto, valor) => (valor === undefined ? [{ tipo, quanto }] : [{ tipo, valor, quanto }]);

prova('um número paga trinta e cinco para um', contar(so('numero', 10, 17), 17).volta === 360);
prova('e não paga nada quando sai outro', contar(so('numero', 10, 17), 18).volta === 0);
prova('o zero em cheio também paga', contar(so('numero', 10, 0), 0).volta === 360);

prova('vermelho paga a dobrar', contar(so('vermelho', 10), 3).volta === 20);
prova('e perde no preto', contar(so('vermelho', 10), 2).volta === 0);
prova('par paga a dobrar', contar(so('par', 10), 4).volta === 20);
prova('ímpar também', contar(so('impar', 10), 5).volta === 20);
prova('1 a 18 paga a dobrar', contar(so('baixo', 10), 18).volta === 20);
prova('19 a 36 também', contar(so('alto', 10), 19).volta === 20);

prova('uma dúzia paga dois para um', contar(so('duzia1', 10), 12).volta === 30);
prova('a do meio também', contar(so('duzia2', 10), 13).volta === 30);
prova('e a de cima', contar(so('duzia3', 10), 36).volta === 30);
prova('uma coluna paga dois para um', contar(so('coluna1', 10), 34).volta === 30);
prova('a do meio também', contar(so('coluna2', 10), 35).volta === 30);
prova('e a terceira', contar(so('coluna3', 10), 36).volta === 30);

/* ---------------- o zero ---------------- */

const deFora = ['vermelho', 'preto', 'par', 'impar', 'baixo', 'alto', 'duzia1', 'duzia2', 'duzia3', 'coluna1', 'coluna2', 'coluna3'];
prova(
  'no zero perdem-se todas as apostas de fora',
  deFora.every((t) => contar(so(t, 10), 0).volta === 0)
);

/* ---------------- o que não presta ---------------- */

prova('uma mesa vazia não gira', !!limparApostas([], 1000).erro);
prova('uma aposta que não existe não passa', !!limparApostas([{ tipo: 'cavalos', quanto: 5 }], 1000).erro);
prova('um número fora da roleta não passa', !!limparApostas([{ tipo: 'numero', valor: 37, quanto: 5 }], 1000).erro);
prova('nem um número negativo', !!limparApostas([{ tipo: 'numero', valor: -1, quanto: 5 }], 1000).erro);
prova('uma ficha de zero não passa', !!limparApostas([{ tipo: 'vermelho', quanto: 0 }], 1000).erro);
prova('nem uma ficha negativa', !!limparApostas([{ tipo: 'vermelho', quanto: -50 }], 1000).erro);
prova(
  'nem apostar mais do que se tem',
  !!limparApostas([{ tipo: 'vermelho', quanto: 600 }, { tipo: 'preto', quanto: 600 }], 1000).erro
);
prova(
  'o que presta passa e vem limpo',
  (() => {
    const r = limparApostas([{ tipo: 'numero', valor: 7, quanto: 20, lixo: 'x' }], 1000);
    return !r.erro && r.total === 20 && JSON.stringify(r.apostas) === JSON.stringify([{ tipo: 'numero', valor: 7, quanto: 20 }]);
  })()
);

/* ---------------- a fatia da casa ---------------- */

const VOLTAS = 200_000;
let apostado = 0;
let devolvido = 0;
const saiuQuantas = new Array(37).fill(0);

for (let i = 0; i < VOLTAS; i++) {
  const r = rodada([{ tipo: 'vermelho', quanto: 10 }]);
  apostado += r.apostado;
  devolvido += r.volta;
  saiuQuantas[r.saiu]++;
}

const casaFica = ((apostado - devolvido) / apostado) * 100;
prova(
  `a casa fica com perto de 2,7 por cento (ficou com ${casaFica.toFixed(2)}%)`,
  casaFica > 1.7 && casaFica < 3.7,
  'se isto sair muito fora, ha uma conta torta ou a roda nao e uniforme'
);

const esperado = VOLTAS / 37;
const piorDesvio = Math.max(...saiuQuantas.map((q) => Math.abs(q - esperado) / esperado));
prova(
  `nenhuma casa sai muito mais do que as outras (a pior desviou ${(piorDesvio * 100).toFixed(1)}%)`,
  piorDesvio < 0.12
);
prova(
  'e todas as casas saíram pelo menos uma vez',
  saiuQuantas.every((q) => q > 0)
);

console.log(`\n${feitos - falhas} de ${feitos} provas passaram.`);
process.exit(falhas ? 1 : 0);
