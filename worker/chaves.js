/**
 * A prova de que um nome é mesmo de quem diz ser.
 *
 * Antes era uma chave inventada aqui e guardada no browser de quem estreava o
 * nome. Funcionava, mas só naquele browser: quem mudasse de telemóvel, ou
 * limpasse o histórico, perdia o nome e os torrões com ele.
 *
 * Agora cada nome tem um PIN, escolhido por quem o usa, e o PIN nunca fica
 * guardado aqui. Fica um resumo dele, com sal e com muitas voltas, de maneira
 * a que nem quem visse tudo o que está guardado conseguisse ler o PIN de
 * ninguém.
 *
 * O PIN só é preciso uma vez por aparelho. Quem acerta recebe um passe, que é
 * um número comprido ao calhas, e é o passe que fica no browser daí em diante.
 * Do passe também só fica cá o resumo. Assim o PIN não anda a viajar pela
 * internet a cada jogada, e um passe perdido apaga-se sem mexer no PIN.
 *
 * Um PIN de quatro algarismos são dez mil hipóteses, o que a um computador não
 * é nada. Quem o defende a sério não é a conta de aqui: é o limite de
 * tentativas, que está no index.js. As voltas do resumo servem para o caso de
 * o que está guardado ir parar à rua.
 */

/** Um número ao calhas, em hexadecimal. Serve de passe e de sal. */
export const aoCalhasEmHex = (bytes) => {
  const b = new Uint8Array(bytes);
  crypto.getRandomValues(b);
  return [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
};

const emHex = (bytes) => [...new Uint8Array(bytes)].map((x) => x.toString(16).padStart(2, '0')).join('');

const deHex = (t) => {
  const b = new Uint8Array(String(t || '').length / 2);
  for (let i = 0; i < b.length; i++) b[i] = parseInt(String(t).slice(i * 2, i * 2 + 2), 16);
  return b;
};

/** O resumo de um passe. É curto de propósito: um passe já é ao calhas, e não
 *  há nada para adivinhar nele. */
export async function resumoDe(chave) {
  const dados = new TextEncoder().encode('mdl:' + chave);
  const digerido = await crypto.subtle.digest('SHA-256', dados);
  return emHex(digerido);
}

export const chaveBate = async (chave, resumo) =>
  typeof chave === 'string' && /^[a-f0-9]{32}$/.test(chave) && (await resumoDe(chave)) === resumo;

/* ============================== o PIN ============================== */

export const PIN_MINIMO = 4;
export const PIN_MAXIMO = 8;
/**
 * Quantas voltas leva o resumo do PIN. Custa uns milésimos aqui e custa muito
 * a quem quisesse experimentar PINs aos milhões.
 *
 * Cem mil e nem mais uma: é o tecto que a Cloudflare põe ao PBKDF2 em
 * produção. Acima disso a conta rebenta, e rebenta só lá: o servidor que corre
 * no computador de casa não tem esse limite, e por isso isto passa nas provas
 * locais e cai em cima de quem for entrar no site a sério.
 */
const VOLTAS = 100_000;

export const pinLimpo = (v) => String(v ?? '').replace(/\D/g, '');

export const pinServe = (v) => {
  const p = pinLimpo(v);
  return p.length >= PIN_MINIMO && p.length <= PIN_MAXIMO;
};

/** O resumo de um PIN, com o sal dele. */
export async function resumoDoPin(pin, sal) {
  const material = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(pinLimpo(pin)),
    'PBKDF2',
    false,
    ['deriveBits']
  );
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: deHex(sal), iterations: VOLTAS },
    material,
    256
  );
  return emHex(bits);
}

/** Um PIN novo, pronto a guardar. O PIN em si não vai em lado nenhum. */
export async function pinNovo(pin) {
  const sal = aoCalhasEmHex(16);
  return { sal, resumo: await resumoDoPin(pin, sal), posto: new Date().toISOString() };
}

/** Compara sem deixar o tempo de resposta dizer quanto acertou. */
export function igualDevagar(a, b) {
  const x = String(a || '');
  const y = String(b || '');
  if (x.length !== y.length) return false;
  let diferenca = 0;
  for (let i = 0; i < x.length; i++) diferenca |= x.charCodeAt(i) ^ y.charCodeAt(i);
  return diferenca === 0;
}

export async function pinBate(pin, guardado) {
  if (!guardado || !guardado.sal || !guardado.resumo || !pinServe(pin)) return false;
  return igualDevagar(await resumoDoPin(pin, guardado.sal), guardado.resumo);
}

/* ============================= os passes =============================

   Cada aparelho tem o seu, e um nome não guarda mais do que uns quantos: o
   telemóvel, o computador, e o computador do outro. Passando disso, o mais
   velho sai. */

export const MAX_PASSES = 5;
/** Quanto tempo um passe serve sem se voltar a escrever o PIN. */
export const PASSE_DURA = 180 * 24 * 60 * 60 * 1000;

export async function passeNovo(linha) {
  const passe = aoCalhasEmHex(16);
  const agora = Date.now();
  const vivos = (linha.passes || []).filter((p) => p.ate > agora);
  vivos.push({ resumo: await resumoDe(passe), ate: agora + PASSE_DURA });
  linha.passes = vivos.slice(-MAX_PASSES);
  return passe;
}

/** Se este passe é de um aparelho que já acertou o PIN deste nome. */
export async function passeBate(passe, linha) {
  if (typeof passe !== 'string' || !/^[a-f0-9]{32}$/.test(passe)) return false;
  const lista = (linha && linha.passes) || [];
  if (lista.length === 0) return false;
  const resumo = await resumoDe(passe);
  const agora = Date.now();
  return lista.some((p) => p.ate > agora && igualDevagar(p.resumo, resumo));
}
