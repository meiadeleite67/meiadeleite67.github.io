/**
 * A prova de que um nome é mesmo de quem diz ser.
 *
 * Quem estreia um nickname recebe uma chave, e do lado de cá fica guardado só
 * o resumo dela. O resumo confirma a chave mas não a devolve: mesmo que tudo o
 * que está guardado fosse parar à rua, ninguém jogava com o nome de ninguém.
 *
 * Vive num ficheiro à parte porque tanto o quadro como as mesas de poker
 * precisam da mesma prova, e uma coisa destas não se escreve duas vezes.
 */

/** Uma chave nova, ao calhas, em hexadecimal. */
export const aoCalhasEmHex = (bytes) => {
  const b = new Uint8Array(bytes);
  crypto.getRandomValues(b);
  return [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
};

export async function resumoDe(chave) {
  const dados = new TextEncoder().encode('mdl:' + chave);
  const digerido = await crypto.subtle.digest('SHA-256', dados);
  return [...new Uint8Array(digerido)].map((x) => x.toString(16).padStart(2, '0')).join('');
}

export const chaveBate = async (chave, resumo) =>
  typeof chave === 'string' && /^[a-f0-9]{32}$/.test(chave) && (await resumoDe(chave)) === resumo;
