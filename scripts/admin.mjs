/**
 * Monta o autenticador da pagina de admin.
 *
 *     npm run admin
 *
 * Inventa uma chave, mostra o QR aqui no terminal para apontares o Google
 * Authenticator, e diz-te o comando para a guardar no Worker.
 *
 * A chave nao fica gravada em lado nenhum deste computador nem entra no
 * repositorio: so aparece aqui uma vez. Se a perderes, corres isto outra vez
 * e apagas a entrada velha na app.
 */
import crypto from 'node:crypto';
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
console.log('  Abre o Google Authenticator, carrega no mais, le um QR code');
console.log('  e aponta a isto:');
console.log('');
console.log(await QRCode.toString(uri, { type: 'terminal', small: true }));
console.log('  Se preferires escrever a mao, a chave e:');
console.log(`      ${segredo}`);
console.log('');
console.log('  Agora guarda-a no Worker. Corre isto e cola a chave quando ele pedir:');
console.log('');
console.log('      cd worker && npx wrangler secret put TOTP_SEGREDO');
console.log('');
console.log('  Feito isso, entras em https://meiadeleite.pt/admin com os seis digitos.');
console.log('');
