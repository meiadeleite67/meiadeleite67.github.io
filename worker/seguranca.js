const encoder = new TextEncoder();
const DOMINIOS = ['meiadeleite.pt', 'www.meiadeleite.pt', 'meiadeleite67.github.io'];
const base64 = (bytes) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const bytes = (s) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));
async function chave(env) {
  return crypto.subtle.importKey('raw', encoder.encode(env.SEGURANCA_SEGREDO), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}
async function contexto(request) {
  const ip = request.headers.get('CF-Connecting-IP') || 'local';
  const origem = request.headers.get('Origin') || '';
  return base64(new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(`${ip}|${origem}`))));
}
export async function assinarVisita(request, env, agora = Date.now()) {
  if (!env.SEGURANCA_SEGREDO) throw new Error('Falta a assinatura de segurança.');
  const dados = { ate: agora + 5 * 60_000, contexto: await contexto(request), id: crypto.randomUUID() };
  const payload = base64(encoder.encode(JSON.stringify(dados)));
  const assinatura = base64(new Uint8Array(await crypto.subtle.sign('HMAC', await chave(env), encoder.encode(payload))));
  return { visita: `${payload}.${assinatura}`, ate: dados.ate };
}
export async function visitaValida(request, env, token, agora = Date.now()) {
  if (!env.SEGURANCA_SEGREDO || typeof token !== 'string' || token.length > 1024) return false;
  try {
    const partes = token.split('.');
    if (partes.length !== 2) return false;
    const [payload, assinatura] = partes;
    if (!(await crypto.subtle.verify('HMAC', await chave(env), bytes(assinatura), encoder.encode(payload)))) return false;
    const dados = JSON.parse(new TextDecoder().decode(bytes(payload)));
    return dados.ate > agora && dados.ate <= agora + 5 * 60_000 && dados.contexto === await contexto(request);
  } catch { return false; }
}
export async function verificarDesafio(request, env, token) {
  if (!env.TURNSTILE_SEGREDO || typeof token !== 'string' || token.length < 1 || token.length > 2048) return false;
  try {
    const r = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ secret: env.TURNSTILE_SEGREDO, response: token, remoteip: request.headers.get('CF-Connecting-IP') || undefined }),
      signal: AbortSignal.timeout(8000)
    });
    const visto = await r.json();
    const origem = new URL(request.headers.get('Origin')).hostname;
    const local = env.AMBIENTE === 'local' && ['localhost', '127.0.0.1'].includes(origem);
    const testeLocal = local && env.TURNSTILE_SEGREDO === '1x0000000000000000000000000000000AA' && visto.metadata?.result_with_testing_key === true;
    if (testeLocal) return r.ok && visto.success === true;
    return r.ok && visto.success === true && visto.action === 'site' &&
      (DOMINIOS.includes(origem) || local) && (visto.hostname === origem || (local && visto.hostname === 'dummy-key-pass'));
  } catch { return false; }
}

export async function limitarCorpo(request, maximo) {
  if (!request.body) return request;
  const reader = request.body.getReader();
  const partes = []; let tamanho = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      tamanho += value.length;
      if (tamanho > maximo) { await reader.cancel(); throw new Error('CORPO_GRANDE'); }
      partes.push(value);
    }
  } finally { reader.releaseLock(); }
  const corpo = new Uint8Array(tamanho); let offset = 0;
  for (const parte of partes) { corpo.set(parte, offset); offset += parte.length; }
  return new Request(request.url, { method: request.method, headers: request.headers, body: corpo, signal: request.signal });
}
