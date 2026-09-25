/**
 * O GitHub Pages so entrega ficheiros: para um endereco como /blackjack ele
 * procura um ficheiro com esse nome, nao encontra, e responde 404.
 *
 * Damos-lhe entao um ficheiro para cada pagina, em pasta propria. O Pages
 * serve /blackjack/ com o 200 que lhe compete, e a aplicacao mostra a pagina
 * certa a partir do endereco. O 404.html fica como rede de seguranca para
 * qualquer endereco que nao esteja nesta lista.
 *
 * Esta lista tem de acompanhar as PAGINAS em src/lib/dados.ts.
 */
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const PAGINAS = [
  'membros',
  'quadro',
  'blackjack',
  'poker',
  'roleta',
  'apostas',
  'instagram',
  'agenda',
  'admin',
  'jogo',
  'cusco',
  'colherada',
  'termos',
  'privacidade'
];

if (!existsSync('dist/index.html')) {
  console.error('Nao ha dist/index.html. Corre o build primeiro.');
  process.exit(1);
}

copyFileSync('dist/index.html', 'dist/404.html');

for (const pagina of PAGINAS) {
  const pasta = join('dist', pagina);
  mkdirSync(pasta, { recursive: true });
  copyFileSync('dist/index.html', join(pasta, 'index.html'));
}

console.log(`404.html criado, e uma pasta para cada pagina: ${PAGINAS.join(', ')}`);

/**
 * O service worker leva agora a lista do que tem de guardar mal seja
 * instalado. Ele sozinho nao a podia saber: os ficheiros do build trazem o
 * codigo no nome, que muda a cada publicacao. E sem a lista so ficava
 * guardado o que passasse por ele depois de a pagina abrir, o que deixava de
 * fora o proprio JavaScript e a folha de estilo. Dai o site nao existir sem
 * rede a primeira visita.
 */
const sw = 'dist/sw.js';
if (existsSync(sw)) {
  const bens = readdirSync('dist/assets').map((f) => `/assets/${f}`);
  const essenciais = [
    '/',
    ...PAGINAS.map((p) => `/${p}/`),
    ...bens,
    '/favicon.svg',
    '/conteudo/config.json',
    '/conteudo/estado.json'
  ];
  // a versao vem dos proprios nomes: publicacao nova, guardado novo
  const versao = bens.join('|').replace(/[^a-zA-Z0-9]/g, '').slice(-16) || 'sem-nome';

  const escrito = readFileSync(sw, 'utf8')
    .replace("const CACHE = 'mdl-por-publicar';", `const CACHE = 'mdl-${versao}';`)
    .replace(
      "const ESSENCIAIS = ['/', '/jogo/', '/favicon.svg'];",
      `const ESSENCIAIS = ${JSON.stringify(essenciais)};`
    );
  writeFileSync(sw, escrito);
  console.log(`sw.js com ${essenciais.length} ficheiros para guardar, versao mdl-${versao}`);
}
