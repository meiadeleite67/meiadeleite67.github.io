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
import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const PAGINAS = ['membros', 'blackjack', 'instagram', 'agenda', 'admin', 'jogo'];

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
