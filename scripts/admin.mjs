/**
 * Monta o autenticador da pagina de admin.
 *
 *     npm run admin
 *
 * Inventa uma chave, mostra o QR para apontares o Google Authenticator, e
 * entrega a chave ao Worker sozinho. Nao ha nada para copiar nem para colar:
 * a chave vai daqui direita para o wrangler, sem passar pelo teclado.
 *
 * E de proposito. Colar a chave a mao no wrangler e onde isto costuma
 * falhar: o terminal nem sempre recebe o paste inteiro, a chave fica cortada
 * e depois nenhum codigo da app bate certo, sem se perceber porque.
 */
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import QRCode from 'qrcode';

const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function paraBase32(bytes) {
  let bits = 0;
  let valor = 0;
  let saida = '';
  for (const b of bytes) {
    valor = (valor << 8) | b;
    bits += 8;
    while (bits >= 5) {
      saida += B32[(valor >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) saida += B32[(valor << (5 - bits)) & 31];
  return saida;
}

const segredo = paraBase32(crypto.randomBytes(20));
const conta = encodeURIComponent('admin@meiadeleite.pt');
const uri = `otpauth://totp/Meia%20de%20Leite:${conta}?secret=${segredo}&issuer=Meia%20de%20Leite&algorithm=SHA1&digits=6&period=30`;

console.log('');
console.log('  1. Apaga na app todas as entradas antigas com o nome "Meia de Leite".');
console.log('  2. Abre o Google Authenticator, carrega no mais, le um QR code,');
console.log('     e aponta a isto:');
console.log('');
console.log(await QRCode.toString(uri, { type: 'terminal', small: true }));

/* A chave so aparece se a pedirem: o QR chega para montar a app, e assim ela
   nao fica a apanhar sol no historico do terminal. */
if (process.argv.includes('--mostrar-chave')) {
  console.log('  A chave, para meteres a mao se o QR nao der:');
  console.log(`      ${segredo}`);
  console.log('');
  console.log('  Guarda-a como guardas uma palavra-passe. Nao a mandes a ninguem,');
  console.log('  nem a coles em conversas: quem a tiver entra no admin.');
  console.log('');
}

console.log('  3. A guardar a chave no Worker...');

/* Arranca-se o wrangler pelo proprio node, e nao pelo npx. No Windows o npx
   e um ficheiro .cmd, e o Node recusa-se a arranca-lo desde a correcao de uma
   vulnerabilidade: dava spawn EINVAL. */
const wrangler = spawn(
  process.execPath,
  [
    fileURLToPath(new URL('../node_modules/wrangler/bin/wrangler.js', import.meta.url)),
    'secret',
    'put',
    'TOTP_SEGREDO'
  ],
  { cwd: fileURLToPath(new URL('../worker/', import.meta.url)), stdio: ['pipe', 'inherit', 'inherit'] }
);

wrangler.stdin.write(segredo);
wrangler.stdin.end();

wrangler.on('close', (codigo) => {
  console.log('');
  if (codigo === 0) {
    console.log('  Feito. Entra em https://meiadeleite.pt/admin com os seis digitos da app.');
    console.log('  Se ja tinhas uma chave antiga, deixou de servir agora mesmo.');
  } else {
    console.log('  O wrangler nao conseguiu guardar a chave.');
    console.log('  Se for falta de sessao, corre `cd worker && npx wrangler login` e tenta outra vez.');
    console.log('  A app ja tem a entrada nova, mas ela so serve depois de a chave ficar guardada.');
  }
  console.log('');
});
