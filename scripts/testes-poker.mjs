/**
 * As contas do poker, postas à prova.
 *
 * O que se prova aqui é o que não se vê a olho: a força de cada mão, os bolos
 * separados de quem vai com tudo, e que as fichas que entram numa mão são
 * exactamente as que saem dela. Uma ficha a mais ou a menos era dinheiro
 * inventado.
 *
 *   node scripts/testes-poker.mjs
 */
import {
  CEGO_GRANDE,
  CEGO_PEQUENO,
  avaliar,
  jogar,
  maoNova,
  nomeDaMao,
  vista
} from '../worker/poker.js';

let feitos = 0;
let falhas = 0;

function prova(nome, o) {
  feitos++;
  try {
    o();
  } catch (e) {
    falhas++;
    console.error(`  x ${nome}\n    ${e.message}`);
  }
}

function igual(a, b, porque = '') {
  const x = JSON.stringify(a);
  const y = JSON.stringify(b);
  if (x !== y) throw new Error(`${porque} esperava ${y}, veio ${x}`);
}

function certo(v, porque = '') {
  if (!v) throw new Error(porque || 'esperava que fosse verdade');
}

/* As cartas escrevem-se como se lêem: 'Ac' é o ás de espadas (copas, ouros e
   paus são h, d, c). O número é o mesmo que o worker usa. */
const VALORES = ['A', '2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K'];
const NAIPES = { s: 0, h: 1, d: 2, c: 3 };
const K = (t) => NAIPES[t[1]] * 13 + VALORES.indexOf(t[0]);
const M = (s) => s.split(' ').map(K);

/* ============================ as mãos ============================ */

prova('conhece cada figura', () => {
  igual(avaliar(M('As Ks Qs Js Ts')).categoria, 8, 'sequência real:');
  igual(nomeDaMao(avaliar(M('As Ks Qs Js Ts'))), 'Sequência real');
  igual(avaliar(M('9h 8h 7h 6h 5h')).categoria, 8, 'sequência de cor:');
  igual(avaliar(M('Ah 2h 3h 4h 5h')).categoria, 8, 'a roda em cor:');
  igual(nomeDaMao(avaliar(M('Ah 2h 3h 4h 5h'))), 'Sequência de cor ao cinco');
  igual(avaliar(M('7s 7h 7d 7c Ks')).categoria, 7, 'quadra:');
  igual(avaliar(M('7s 7h 7d Kc Ks')).categoria, 6, 'full house:');
  igual(avaliar(M('As Js 9s 5s 2s')).categoria, 5, 'cor:');
  igual(avaliar(M('9s 8h 7d 6c 5s')).categoria, 4, 'sequência:');
  igual(avaliar(M('As 2h 3d 4c 5s')).categoria, 4, 'a roda:');
  igual(nomeDaMao(avaliar(M('As 2h 3d 4c 5s'))), 'Sequência ao cinco');
  igual(avaliar(M('7s 7h 7d Kc 2s')).categoria, 3, 'trio:');
  igual(avaliar(M('7s 7h Kd Kc 2s')).categoria, 2, 'dois pares:');
  igual(avaliar(M('7s 7h Kd 9c 2s')).categoria, 1, 'par:');
  igual(avaliar(M('As Jh 9d 5c 2s')).categoria, 0, 'carta alta:');
});

prova('tira a melhor mão de sete cartas', () => {
  // três pares em sete cartas: contam os dois mais altos e a carta que sobra
  const a = avaliar(M('Ks Kh 9d 9c 4s 4h Qd'));
  igual(a.categoria, 2);
  igual(a.chaves, [13, 9, 12], 'dois pares mais a dama:');

  // dois trios são um full house com o trio mais alto em cima
  igual(nomeDaMao(avaliar(M('7s 7h 7d 3c 3h 3d Kd'))), 'Full house, setes com trêses');

  // a cor de seis cartas fica pelas cinco mais altas
  igual(avaliar(M('As Ks 9s 5s 3s 2s 7h')).chaves, [14, 13, 9, 5, 3]);

  // a quadra não se deixa enganar pelo par que anda ao lado
  const q = avaliar(M('6s 6h 6d 6c Kh Kd 2s'));
  igual(q.categoria, 7);
  igual(q.chaves, [6, 13], 'a carta de fora é o rei:');
});

prova('a cor ganha ao full que não existe', () => {
  /* Cinco do mesmo naipe em sete cartas nunca deixam espaço para um full: é
     por isso que a avaliação pode resolver a cor primeiro. */
  const a = avaliar(M('As Qs 9s 5s 2s Ah Ad'));
  igual(a.categoria, 5, 'trio de ases mais cor dá cor:');
});

prova('desempata como deve ser', () => {
  const maior = (x, y) => avaliar(M(x)).pontos > avaliar(M(y)).pontos;
  certo(maior('As Ah Kd Qc Js', 'Ks Kh Ad Qc Js'), 'par de ases ganha a par de reis');
  certo(maior('As Ah Kd Qc Js', 'As Ah Kd Qc Ts'), 'a carta de fora desempata');
  certo(maior('2s 2h 2d 3c 4s', 'As Kh Qd Jc 9s'), 'trio ganha a carta alta');
  certo(maior('6s 5s 4s 3s 2s', 'As Ah Ad Ac Ks'), 'cor em sequência ganha à quadra');
  certo(maior('As Ks Qs Js Ts', '9h 8h 7h 6h 5h'), 'a real ganha à outra sequência de cor');
  igual(
    avaliar(M('As Ks Qd Jc Th')).pontos,
    avaliar(M('Ah Kh Qs Jd Tc')).pontos,
    'a mesma sequência de naipes diferentes empata:'
  );
});

/* ====================== as fichas de uma mão ====================== */

const mesaDe = (...fichas) =>
  fichas.map((f, i) => ({ lugar: i, nome: `j${i}`, fichas: f }));

/* O que cada um trouxe para a mesa: o que ainda tem à frente, mais o que já
   pôs no meio, menos o que já lhe voltou. Isto não pode mudar do princípio da
   mão até ao fim dela. */
const somaDe = (m) => m.jogadores.reduce((s, j) => s + j.fichas + j.total - j.ganhou, 0);

const arrumar = (m, maos, comunidade) => {
  maos.forEach((mao, i) => {
    m.jogadores[i].cartas = M(mao);
  });
  const [f1, f2, f3, t, r] = M(comunidade);
  // sai do fim para o princípio, com uma queimada antes de cada rua
  m.baralho = [r, 0, t, 0, f3, f2, f1, 0];
};

prova('a dois, o botão é o cego pequeno e fala primeiro', () => {
  const m = maoNova({ numero: 1, lugares: mesaDe(2500, 2500), ultimoBotao: -1 });
  igual(m.cegos.pequeno, m.botaoNoLugar, 'o botão põe o cego pequeno:');
  igual(m.jogadores[m.vez].lugar, m.botaoNoLugar, 'e é ele que fala:');
  igual(m.aposta, CEGO_GRANDE);
  igual(
    m.jogadores.map((j) => j.fichas).sort((a, b) => a - b),
    [2500 - CEGO_GRANDE, 2500 - CEGO_PEQUENO]
  );
});

prova('a três, os cegos ficam à esquerda do botão', () => {
  const m = maoNova({ numero: 1, lugares: mesaDe(2500, 2500, 2500), ultimoBotao: -1 });
  igual(m.botaoNoLugar, 0);
  igual(m.cegos, { pequeno: 1, grande: 2 });
  igual(m.jogadores[m.vez].lugar, 0, 'fala o botão, que é o último antes dos cegos:');
});

prova('o cego grande tem sempre a opção', () => {
  const m = maoNova({ numero: 1, lugares: mesaDe(2500, 2500, 2500), ultimoBotao: -1 });
  igual(jogar(m, 0, 'igualar'), null);
  igual(jogar(m, 1, 'igualar'), null);
  certo(m.fase === 'previa', 'a mão não pode ter avançado sem ouvir o cego grande');
  igual(m.jogadores[m.vez].lugar, 2, 'a vez é do cego grande:');
  igual(jogar(m, 2, 'passar'), null);
  igual(m.fase, 'flop');
  igual(m.pote, 3 * CEGO_GRANDE);
});

prova('quem desiste sozinho entrega a mão', () => {
  const m = maoNova({ numero: 1, lugares: mesaDe(2500, 2500), ultimoBotao: -1 });
  const antes = somaDe(m);
  igual(jogar(m, m.botaoNoLugar, 'desistir'), null);
  igual(m.fase, 'acabou');
  igual(somaDe(m), antes, 'as fichas não podem mudar de número:');
  const ganhou = m.jogadores.find((j) => j.ganhou > 0);
  igual(ganhou.fichas, 2500 + CEGO_PEQUENO, 'leva o cego pequeno do outro:');
  certo(
    m.jogadores.every((j) => !j.mostra),
    'ninguém mostra cartas quando os outros desistem'
  );
});

prova('as cartas dos outros não saem daqui antes de serem mostradas', () => {
  const m = maoNova({ numero: 1, lugares: mesaDe(2500, 2500, 2500), ultimoBotao: -1 });
  const v = vista(m, 1);
  igual(v.jogadores[1].cartas.length, 2, 'as minhas vejo eu:');
  igual(v.jogadores[0].cartas, null, 'as dos outros não:');
  igual(v.jogadores[2].cartas, null);
  igual(v.jogadores[0].quantas, 2, 'mas vê-se que ele tem duas:');
  certo(!('baralho' in v), 'o baralho nunca sai do servidor');
  certo(!JSON.stringify(v).includes('avaliacao'), 'nem a conta da força das mãos');
});

prova('não se joga fora da vez nem com jogadas inventadas', () => {
  const m = maoNova({ numero: 1, lugares: mesaDe(2500, 2500, 2500), ultimoBotao: -1 });
  certo(jogar(m, 1, 'igualar'), 'o lugar 1 não pode jogar antes do 0');
  certo(jogar(m, 9, 'igualar'), 'um lugar que não existe não joga');
  certo(jogar(m, 0, 'dançar'), 'uma jogada que não existe não passa');
  certo(jogar(m, 0, 'passar'), 'não se passa a dever o cego');
  igual(m.passo, 0, 'nenhuma delas pode ter mexido na mão:');
});

prova('a subida tem de ser de pelo menos o que subiu a anterior', () => {
  const m = maoNova({ numero: 1, lugares: mesaDe(2500, 2500, 2500), ultimoBotao: -1 });
  certo(jogar(m, 0, 'subir', CEGO_GRANDE + 1), 'subir um torrao nao chega');
  igual(jogar(m, 0, 'subir', CEGO_GRANDE * 3), null, 'subir ao triplo do cego chega');
  igual(m.subidaMinima, CEGO_GRANDE * 2);
  certo(jogar(m, 1, 'subir', CEGO_GRANDE * 4), 'a seguir tem de ir ao quintuplo');
  igual(jogar(m, 1, 'subir', CEGO_GRANDE * 5), null);
});

prova('com tudo dentro pode-se subir menos do que o mínimo', () => {
  const m = maoNova({ numero: 1, lugares: mesaDe(2500, 2500, 180), ultimoBotao: -1 });
  igual(jogar(m, 0, 'subir', 150), null);
  igual(jogar(m, 1, 'desistir'), null);
  // o lugar 2 tem 180 ao todo: só pode ir a 180
  certo(jogar(m, 2, 'subir', 300), 'não pode apostar o que não tem');
  igual(jogar(m, 2, 'subir', 180), null, 'mas pode ir com tudo:');
  igual(m.jogadores[2].estado, 'tudo');
});

prova('uma mão inteira até ao fim, com as fichas todas contadas', () => {
  const m = maoNova({ numero: 1, lugares: mesaDe(2500, 2500, 2500), ultimoBotao: -1 });
  const antes = somaDe(m);
  arrumar(m, ['As Ah', 'Ks Kh', '2s 3h'], 'Ad Kd 7c 9s 4h');

  igual(jogar(m, 0, 'igualar'), null);
  igual(jogar(m, 1, 'igualar'), null);
  igual(jogar(m, 2, 'passar'), null);
  igual(m.fase, 'flop');
  igual(m.comunidade.length, 3);

  igual(jogar(m, 1, 'passar'), null);
  igual(jogar(m, 2, 'passar'), null);
  igual(jogar(m, 0, 'subir', 200), null);
  igual(jogar(m, 1, 'igualar'), null);
  igual(jogar(m, 2, 'desistir'), null);
  igual(m.fase, 'turn');

  igual(jogar(m, 1, 'passar'), null);
  igual(jogar(m, 0, 'passar'), null);
  igual(m.fase, 'river');
  igual(jogar(m, 1, 'passar'), null);
  igual(jogar(m, 0, 'passar'), null);

  igual(m.fase, 'acabou');
  igual(somaDe(m), antes, 'as fichas de uma mão são sempre as mesmas:');
  igual(m.jogadores[0].mao ? 1 : 1, 1);
  igual(nomeDaMao(m.jogadores[0].avaliacao), 'Trio de ases');
  igual(m.jogadores[0].ganhou, 3 * CEGO_GRANDE + 400, 'o trio de ases leva o bolo todo:');
  igual(m.jogadores[1].ganhou, 0);
  certo(!m.jogadores[2].mostra, 'quem desistiu não mostra as cartas');
});

prova('quem vai com tudo só ganha até onde pôs', () => {
  /* O lugar 1 só tem 300 e tem a melhor mão. Os outros dois continuam a
     apostar entre eles: esse dinheiro é de um bolo à parte, que ele não pode
     tocar por muito boa que seja a mão dele. */
  const m = maoNova({ numero: 1, lugares: mesaDe(2000, 300, 2000), ultimoBotao: -1 });
  const antes = somaDe(m);
  arrumar(m, ['Ks Kh', 'As Ah', 'Qs Qh'], '2d 7c 9s 4h 3c');

  igual(jogar(m, 0, 'subir', 300), null);
  igual(jogar(m, 1, 'igualar'), null, 'vai com os 300 que tem:');
  igual(m.jogadores[1].estado, 'tudo');
  igual(jogar(m, 2, 'igualar'), null);

  // dos 900 no meio, 900 são do bolo grande porque todos lá chegaram
  igual(jogar(m, 2, 'subir', 500), null);
  igual(jogar(m, 0, 'igualar'), null);
  while (m.fase !== 'acabou') {
    const quem = m.jogadores[m.vez].lugar;
    igual(jogar(m, quem, 'passar'), null);
  }

  igual(somaDe(m), antes, 'as fichas não se inventam:');
  igual(m.bolos.length, 2, 'há um bolo principal e um à parte:');
  igual(m.bolos[0], { valor: 900, para: [1] }, 'o dos ases:');
  igual(m.bolos[1], { valor: 1000, para: [0] }, 'o dos reis, que os ases não disputam:');
  igual(m.jogadores[1].fichas, 900, 'o curto fica com o que ganhou e mais nada:');
});

prova('o que ninguém iguala volta para quem apostou', () => {
  const m = maoNova({ numero: 1, lugares: mesaDe(2000, 200), ultimoBotao: -1 });
  const antes = somaDe(m);
  arrumar(m, ['2s 3h', 'As Ah'], 'Ad Kd 7c 9s 4h');

  // o botão sobe muito acima do que o outro tem; só 200 é que jogam
  igual(jogar(m, 0, 'subir', 1500), null);
  igual(jogar(m, 1, 'igualar'), null);
  igual(m.jogadores[1].estado, 'tudo');
  while (m.fase !== 'acabou') igual(jogar(m, m.jogadores[m.vez].lugar, 'passar'), null);

  igual(somaDe(m), antes);
  igual(m.jogadores[1].fichas, 400, 'os ases levam 200 de cada um:');
  igual(m.jogadores[0].fichas, 1800, 'e o resto da subida volta ao dono:');
});

prova('um empate divide, e a ficha a mais fica para quem está depois do botão', () => {
  const m = maoNova({ numero: 1, lugares: mesaDe(2500, 2500, 2500), ultimoBotao: -1 });
  const antes = somaDe(m);
  // o tabuleiro é a mão de toda a gente: dividem os três
  arrumar(m, ['2s 3h', '2d 3c', '2h 4c'], 'As Ks Qd Jc Th');

  igual(jogar(m, 0, 'igualar'), null);
  igual(jogar(m, 1, 'igualar'), null);
  igual(jogar(m, 2, 'passar'), null);
  while (m.fase !== 'acabou') igual(jogar(m, m.jogadores[m.vez].lugar, 'passar'), null);

  igual(somaDe(m), antes);
  igual(m.bolos[0].para, [1, 2, 0], 'ganham os três, a contar da esquerda do botão:');
  igual(
    m.jogadores.map((j) => j.ganhou),
    [CEGO_GRANDE, CEGO_GRANDE, CEGO_GRANDE]
  );
});

prova('o botão anda para a frente de mão para mão', () => {
  let ultimo = -1;
  const voltas = [];
  for (let i = 0; i < 5; i++) {
    const m = maoNova({ numero: i, lugares: mesaDe(2500, 2500, 2500), ultimoBotao: ultimo });
    voltas.push(m.botaoNoLugar);
    ultimo = m.botaoNoLugar;
  }
  igual(voltas, [0, 1, 2, 0, 1]);
});

prova('mil mãos ao calhas e nunca uma ficha a mais', () => {
  for (let v = 0; v < 1000; v++) {
    const quantos = 2 + Math.floor(Math.random() * 4);
    const fichas = [];
    for (let i = 0; i < quantos; i++) fichas.push(60 + Math.floor(Math.random() * 3000));
    const m = maoNova({ numero: v, lugares: mesaDe(...fichas), ultimoBotao: -1 });
    const antes = somaDe(m);

    let voltas = 0;
    while (m.fase !== 'acabou' && voltas++ < 400) {
      const j = m.jogadores[m.vez];
      const podes = vista(m, j.lugar).podes;
      const sorte = Math.random();
      if (sorte < 0.12) jogar(m, j.lugar, 'desistir');
      else if (sorte < 0.75) jogar(m, j.lugar, podes.passar ? 'passar' : 'igualar');
      else if (podes.podeSubir) {
        const quanto =
          podes.minimo + Math.floor(Math.random() * Math.max(1, podes.maximo - podes.minimo));
        jogar(m, j.lugar, 'subir', quanto);
      } else jogar(m, j.lugar, podes.passar ? 'passar' : 'igualar');
    }

    certo(m.fase === 'acabou', `a mão ${v} não chegou ao fim`);
    igual(somaDe(m), antes, `a mão ${v} mudou o número de fichas:`);
    certo(
      m.jogadores.every((j) => j.fichas >= 0),
      `a mão ${v} deixou alguém com fichas a menos`
    );
    const repartido = m.bolos.reduce((s, b) => s + b.valor, 0);
    igual(repartido, m.pote, `a mão ${v} não repartiu o pote todo:`);
  }
});

console.log(`\n${feitos - falhas} de ${feitos} provas passaram.`);
process.exit(falhas ? 1 : 0);
