/**
 * O GitHub Pages devolve 404.html para qualquer endereco que nao seja um
 * ficheiro. Como o site tem paginas proprias (/blackjack, /agenda), damos-lhe
 * uma copia do index.html: o Pages serve-a e a aplicacao mostra a pagina certa.
 */
import { copyFileSync, existsSync } from 'node:fs';

if (!existsSync('dist/index.html')) {
  console.error('Nao ha dist/index.html. Corre o build primeiro.');
  process.exit(1);
}
copyFileSync('dist/index.html', 'dist/404.html');
console.log('404.html criado a partir do index.html');
