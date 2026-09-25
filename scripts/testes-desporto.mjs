/**
 * As apostas desportivas contra o Worker a sério, de ponta a ponta.
 *
 * As provas do ficheiro testes-apostas.mjs tratam das regras. Estas tratam da
 * canalização: que os torrões saem mesmo da carteira quando se aposta, que
 * ficam presos enquanto o jogo não acaba, que voltam com o prémio a quem
 * acertou e não voltam a quem falhou, e que resolver o mesmo jogo duas vezes
 * não paga duas vezes.
 *
 * Não é precisa chave da feed nenhuma: semeiam-se jogos no KV local, que é
 * onde a volta do dia os deixaria. Assim isto corre em setembro sem haver
 * jogos, e corre sempre igual.
 *
 * Precisa do Worker local de pé:
 *   cd worker && npx wrangler dev --config ./wrangler.toml --port 8787 --local
 *   node scripts/testes-desporto.mjs
 */
import { createHmac } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { writeFileSync, unlinkSync } from 'node:fs';

const CASA = 'http://127.0.0.1:8787';
const ORIGEM = 'http://localhost:5173';

let feitos = 0;
let falhas = 0;

function prova(nome, ok, porque = '') {
  feitos++;
  if (ok) return console.log('  . ' + nome);
  falhas++;
  console.error(`  x ${nome}${porque ? '\n    ' + porque : ''}`);
}

async function pedir(rota, corpo, chave) {
  const cabecas = { 'Content-Type': 'application/json', Origin: ORIGEM };
  if (chave) cabecas.Authorization = `Bearer ${chave}`;
  const r = await fetch(CASA + rota, {
    method: corpo ? 'POST' : 'GET',
    headers: cabecas,
    body: corpo ? JSON.stringify(corpo) : undefined
  });
  return { estado: r.status, corpo: await r.json().catch(() => null) };
}

/* ---------------- semear os jogos ---------------- */

const daqui = (horas) => new Date(Date.now() + horas * 3600000).toISOString();

const JOGOS = [
  {
    id: 'prova-futebol-1',
    chave: 'soccer_portugal_primeira_liga',
    liga: 'Primeira Liga',
    desporto: 'Futebol',
    casa: 'Benfica',
    fora: 'Porto',
    comeca: daqui(6),
    cotacoes: { casa: 2.1, fora: 3.4, empate: 3.25 }
  },
  {
    id: 'prova-basquete-1',
    chave: 'basketball_nba',
    liga: 'NBA',
    desporto: 'Basquetebol',
    casa: 'Lakers',
    fora: 'Celtics',
    comeca: daqui(20),
    cotacoes: { casa: 1.8, fora: 2.05 }
  },
  {
    id: 'prova-tenis-1',
    chave: 'tennis_atp_us_open',
    liga: 'ATP US Open',
    desporto: 'Ténis',
    casa: 'Alcaraz',
    fora: 'Sinner',
    comeca: daqui(30),
    cotacoes: { casa: 1.65, fora: 2.25 }
  }
];

function semear() {
  const ficheiro = 'jogos-de-prova.json';
  writeFileSync(ficheiro, JSON.stringify({ jogos: JOGOS, quando: new Date().toISOString() }));
  execFileSync(
    'npx',
    ['wrangler', 'kv', 'key', 'put', 'desporto:jogos', '--path', `../${ficheiro}`,
      '--binding', 'QUADRO', '--local', '--config', './wrangler.toml'],
    { cwd: 'worker', stdio: 'ignore', shell: true }
  );
  try {
    unlinkSync(ficheiro);
  } catch {
    /* fica lá, não faz mal a ninguém */
  }
}

/* ---------------- a chave do admin ---------------- */

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
  const n = ((a[salto] & 127) << 24) | (a[salto + 1] << 16) | (a[salto + 2] << 8) | a[salto + 3];
  return String(n % 1000000).padStart(6, '0');
}

/* ================================ a prova ================================ */

const vivo = await fetch(CASA + '/quadro').then((r) => r.ok).catch(() => false);
if (!vivo) {
  console.error('\nO Worker local nao esta de pe. Arranca-o primeiro:');
  console.error('  cd worker && npx wrangler dev --config ./wrangler.toml --port 8787 --local\n');
  process.exit(1);
}

console.log('\n semear');
semear();
const lista = await pedir('/desporto');
prova('os tres jogos aparecem', lista.corpo?.jogos?.length === 3);
prova('sem chave da feed o site diz que nao a tem', lista.corpo?.temFeed === false);
prova('o de futebol tem empate', !!lista.corpo.jogos.find((j) => j.id === 'prova-futebol-1').cotacoes.empate);
prova(
  'e o de basquetebol nao tem',
  !lista.corpo.jogos.find((j) => j.id === 'prova-basquete-1').cotacoes.empate
);

/* ---------------- um nome novo ---------------- */

console.log('\n apostar');
const nome = 'Aposta' + Math.random().toString(36).slice(2, 8);
const entrou = await pedir('/quadro/entrar', { nome, pin: '4321' });
const passe = entrou.corpo?.passe;
prova('o nome novo entra', !!passe);
const comecou = entrou.corpo.linha.torroes;

const posta = await pedir('/desporto/apostar', {
  nome,
  passe,
  jogo: 'prova-futebol-1',
  escolha: 'casa',
  quanto: 100
});
prova('a aposta passa', !posta.corpo?.erro, JSON.stringify(posta.corpo));
prova('os torroes saem da carteira logo', posta.corpo?.linha?.torroes === comecou - 100);
prova('e a aposta fica com a cotacao do servidor', posta.corpo?.aposta?.cotacao === 2.1);
prova('e fica aberta', posta.corpo?.aposta?.estado === 'aberta');

/* Uma cotacao mandada pelo site nao pode valer nada. */
const batota = await pedir('/desporto/apostar', {
  nome,
  passe,
  jogo: 'prova-basquete-1',
  escolha: 'casa',
  quanto: 10,
  cotacao: 50
});
prova('uma cotacao mandada pelo site e ignorada', batota.corpo?.aposta?.cotacao === 1.8);

const demais = await pedir('/desporto/apostar', {
  nome,
  passe,
  jogo: 'prova-tenis-1',
  escolha: 'casa',
  quanto: 999999
});
prova('nao se aposta mais do que o maximo', !!demais.corpo?.erro);

const semEmpate = await pedir('/desporto/apostar', {
  nome,
  passe,
  jogo: 'prova-basquete-1',
  escolha: 'empate',
  quanto: 10
});
prova('nao se aposta no empate de um jogo sem empate', !!semEmpate.corpo?.erro);

const semNome = await pedir('/desporto/apostar', {
  nome,
  passe: 'passe-a-fingir',
  jogo: 'prova-futebol-1',
  escolha: 'casa',
  quanto: 10
});
prova('sem o passe certo nao se aposta', semNome.estado === 403 || !!semNome.corpo?.erro);

const jogoQueNaoHa = await pedir('/desporto/apostar', {
  nome,
  passe,
  jogo: 'nao-existe',
  escolha: 'casa',
  quanto: 10
});
prova('nem num jogo que nao existe', !!jogoQueNaoHa.corpo?.erro);

/* ---------------- ver as minhas ---------------- */

const minhas = await pedir('/desporto/minhas', { nome, passe });
prova('vejo as minhas apostas', minhas.corpo?.apostas?.length === 2);
prova('as duas estao abertas', minhas.corpo.apostas.every((a) => a.estado === 'aberta'));
prova('e o saldo ja conta com as duas', minhas.corpo.linha.torroes === comecou - 110);

const deOutro = await pedir('/desporto/minhas', { nome, passe: 'nao-e-meu' });
prova('as de outra pessoa nao se veem', !!deOutro.corpo?.erro);

/* ---------------- resolver ---------------- */

console.log('\n fechar');
const chave = (await pedir('/admin/entrar', { codigo: codigoAgora() })).corpo?.chave;
prova('entra-se na administracao', !!chave);

const semChave = await pedir('/desporto/resolver', {
  resultados: [{ jogo: 'prova-futebol-1', ganhou: 'casa' }]
});
prova('sem a chave da administracao nao se resolve nada', semChave.estado === 401);

const antes = (await pedir('/desporto/minhas', { nome, passe })).corpo.linha.torroes;
const fechou = await pedir(
  '/desporto/resolver',
  { resultados: [{ jogo: 'prova-futebol-1', ganhou: 'casa' }] },
  chave
);
prova('fecha-se a aposta do futebol', fechou.corpo?.fechadas >= 1, JSON.stringify(fechou.corpo));

const depois = await pedir('/desporto/minhas', { nome, passe });
const doFutebol = depois.corpo.apostas.find((a) => a.jogo === 'prova-futebol-1');
prova('a aposta fica ganha', doFutebol?.estado === 'ganha');
prova('paga o que a cotacao prometia', doFutebol?.volta === 210);
prova('e os torroes voltam a carteira', depois.corpo.linha.torroes === antes + 210);
prova('a conta de ganhas sobe', depois.corpo.linha.desporto.ganhas === 1);
prova('e o maior premio fica apontado', depois.corpo.linha.desporto.maior === 210);
prova('as apostas feitas contam as duas', depois.corpo.linha.desporto.apostas === 2);

/* O mesmo resultado outra vez nao pode pagar outra vez. */
const outraVez = await pedir(
  '/desporto/resolver',
  { resultados: [{ jogo: 'prova-futebol-1', ganhou: 'casa' }] },
  chave
);
const igual = await pedir('/desporto/minhas', { nome, passe });
prova('resolver o mesmo jogo outra vez nao fecha nada', outraVez.corpo?.fechadas === 0);
prova('e nao paga outra vez', igual.corpo.linha.torroes === depois.corpo.linha.torroes);

/* E quem falhou nao recebe nada. */
const antesDoBasquete = igual.corpo.linha.torroes;
await pedir('/desporto/resolver', { resultados: [{ jogo: 'prova-basquete-1', ganhou: 'fora' }] }, chave);
const fim = await pedir('/desporto/minhas', { nome, passe });
const doBasquete = fim.corpo.apostas.find((a) => a.jogo === 'prova-basquete-1');
prova('quem falhou fica com a aposta perdida', doBasquete?.estado === 'perdida');
prova('e nao recebe nada', fim.corpo.linha.torroes === antesDoBasquete);
prova('nem sobe a conta das ganhas', fim.corpo.linha.desporto.ganhas === 1);

/* ---------------- a conta do fim ---------------- */

console.log(`\n${feitos - falhas} de ${feitos} provas passaram.\n`);
if (falhas) process.exit(1);
