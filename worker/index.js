/**
 * A parte do meiadeleite.pt que precisa de gravar coisas.
 *
 * O site está no GitHub Pages, que só entrega ficheiros. Este Worker é a
 * única peça viva: guarda o quadro de honra do blackjack e a agenda, e trata
 * da entrada na página de admin com o código do Google Authenticator.
 *
 *   GET    /quadro          o quadro de honra
 *   PUT    /quadro          grava a pontuação de um nome
 *   GET    /agenda          a agenda
 *   POST   /admin/entrar    troca um código de 6 dígitos por uma chave
 *   POST   /agenda          marca (precisa da chave)
 *   PATCH  /agenda/<id>     muda  (precisa da chave)
 *   DELETE /agenda/<id>     apaga (precisa da chave)
 *
 * O segredo do autenticador NUNCA está aqui no código: vive num segredo do
 * Worker (TOTP_SEGREDO), posto com `wrangler secret put`. Assim não anda no
 * repositório nem viaja pela internet.
 */

const CASAS = [
  'https://meiadeleite.pt',
  'https://www.meiadeleite.pt',
  'https://meiadeleite67.github.io',
  'http://localhost:5173',
  'http://localhost:4173'
];

const TIPOS = ['copos', 'jantar', 'estudo', 'exame', 'festa', 'cozinha', 'outro'];
const SESSAO_DURA = 8 * 60 * 60; // segundos
const MAX_ENGANOS = 8;
const CASTIGO = 2 * 60 * 1000;
const MAX_EVENTOS = 300;
const MAX_NOMES = 200;

/* ============================ utilidades ============================ */

function cabecalhos(request) {
  const origem = request.headers.get('Origin') || '';
  return {
    'Access-Control-Allow-Origin': CASAS.includes(origem) ? origem : CASAS[0],
    'Access-Control-Allow-Methods': 'GET, PUT, POST, PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin'
  };
}

const responder = (corpo, request, estado = 200) =>
  new Response(JSON.stringify(corpo), {
    status: estado,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...cabecalhos(request) }
  });

const texto = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const numero = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.max(0, Math.min(9_999_999, Math.round(n))) : 0;
};
const eData = (v) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);
const eHora = (v) => typeof v === 'string' && /^\d{2}:\d{2}$/.test(v);
const novoId = () => crypto.randomUUID().slice(0, 8);

const ler = async (env, chave, porOmissao) => {
  const guardado = await env.QUADRO.get(chave);
  return guardado ? JSON.parse(guardado) : porOmissao;
};

/* ====================== o código do autenticador ====================== */

const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function deBase32(t) {
  let bits = 0;
  let valor = 0;
  const bytes = [];
  for (const c of String(t).toUpperCase().replace(/[^A-Z2-7]/g, '')) {
    valor = (valor << 5) | B32.indexOf(c);
    bits += 5;
    if (bits >= 8) {
      bytes.push((valor >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return new Uint8Array(bytes);
}

/** Compara sem deixar o tempo de resposta dizer quantos dígitos acertaram. */
function igualDevagar(a, b) {
  if (a.length !== b.length) return false;
  let diferenca = 0;
  for (let i = 0; i < a.length; i++) diferenca |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diferenca === 0;
}

/** TOTP de sempre: HMAC-SHA1, 6 dígitos, 30 segundos, com folga de um passo
 *  para cada lado por causa dos relógios dos telemóveis. */
async function codigoCerto(segredo, dado) {
  const limpo = String(dado || '').replace(/\D/g, '');
  if (limpo.length !== 6 || !segredo) return false;

  const chave = await crypto.subtle.importKey(
    'raw',
    deBase32(segredo),
    { name: 'HMAC', hash: 'SHA-1' },
    false,
    ['sign']
  );
  const passo = Math.floor(Date.now() / 30000);

  for (const desvio of [-1, 0, 1]) {
    const agora = passo + desvio;
    const contador = new ArrayBuffer(8);
    const vista = new DataView(contador);
    vista.setUint32(0, Math.floor(agora / 2 ** 32));
    vista.setUint32(4, agora >>> 0);

    const assinatura = new Uint8Array(await crypto.subtle.sign('HMAC', chave, contador));
    const salto = assinatura[assinatura.length - 1] & 15;
    const n =
      ((assinatura[salto] & 127) << 24) |
      (assinatura[salto + 1] << 16) |
      (assinatura[salto + 2] << 8) |
      assinatura[salto + 3];

    if (igualDevagar(String(n % 1000000).padStart(6, '0'), limpo)) return true;
  }
  return false;
}

/** A chave da sessão vive no KV e expira sozinha ao fim de 8 horas. */
async function temChave(request, env) {
  const chave = String(request.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  if (!chave || !/^[a-f0-9]{48}$/.test(chave)) return false;
  return (await env.QUADRO.get(`sessao:${chave}`)) !== null;
}

/* ============================ as rotas ============================ */

async function entrar(request, env) {
  const quem = request.headers.get('CF-Connecting-IP') || 'desconhecido';
  const castigo = await ler(env, `castigo:${quem}`, null);

  if (castigo && castigo.ate > Date.now()) {
    const minutos = Math.ceil((castigo.ate - Date.now()) / 60000);
    return responder(
      { erro: `Demasiadas tentativas. Tenta daqui a ${minutos} minuto(s).` },
      request,
      429
    );
  }

  let veio;
  try {
    veio = await request.json();
  } catch {
    return responder({ erro: 'Corpo inválido.' }, request, 400);
  }

  if (!(await codigoCerto(env.TOTP_SEGREDO, veio?.codigo))) {
    const enganos = (castigo?.enganos ?? 0) + 1;
    await env.QUADRO.put(
      `castigo:${quem}`,
      JSON.stringify(
        enganos >= MAX_ENGANOS
          ? { enganos: 0, ate: Date.now() + CASTIGO }
          : { enganos, ate: 0 }
      ),
      { expirationTtl: 900 }
    );
    return responder({ erro: 'Código errado.' }, request, 401);
  }

  await env.QUADRO.delete(`castigo:${quem}`);
  const chave = [...crypto.getRandomValues(new Uint8Array(24))]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  await env.QUADRO.put(`sessao:${chave}`, '1', { expirationTtl: SESSAO_DURA });
  return responder({ chave }, request);
}

function limparEvento(veio, antes) {
  return {
    id: antes?.id ?? novoId(),
    titulo: texto(veio?.titulo, 80) || antes?.titulo || '',
    data: eData(veio?.data) ? veio.data : (antes?.data ?? new Date().toISOString().slice(0, 10)),
    hora: eHora(veio?.hora) ? veio.hora : (antes?.hora ?? ''),
    sitio: typeof veio?.sitio === 'string' ? texto(veio.sitio, 80) : (antes?.sitio ?? ''),
    tipo: TIPOS.includes(veio?.tipo) ? veio.tipo : (antes?.tipo ?? 'outro'),
    notas: typeof veio?.notas === 'string' ? texto(veio.notas, 300) : (antes?.notas ?? ''),
    criadoEm: antes?.criadoEm ?? new Date().toISOString()
  };
}

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') return new Response(null, { headers: cabecalhos(request) });

    const url = new URL(request.url);
    // o Worker atende em meiadeleite.pt/api/..., por isso tira-se o /api
    const caminho = url.pathname.replace(/^\/api/, '').replace(/\/+$/, '') || '/';
    const metodo = request.method;

    /* ---- quadro de honra ---- */

    if (caminho === '/quadro' || caminho === '/') {
      const guardado = await ler(env, 'quadro', {});

      if (metodo === 'GET')
        return responder(
          Object.values(guardado).sort((a, b) => b.torroes - a.torroes),
          request
        );

      if (metodo === 'PUT') {
        let veio;
        try {
          veio = await request.json();
        } catch {
          return responder({ erro: 'Corpo inválido.' }, request, 400);
        }
        const nome = texto(veio?.nome, 24);
        if (!nome) return responder({ erro: 'Falta o nome.' }, request, 400);
        if (!guardado[nome] && Object.keys(guardado).length >= MAX_NOMES)
          return responder({ erro: 'O quadro está cheio.' }, request, 409);

        const antes = guardado[nome];
        const linha = {
          nome,
          torroes: numero(veio?.torroes),
          maos: numero(veio?.maos),
          vitorias: numero(veio?.vitorias),
          bjs: numero(veio?.bjs),
          pico: numero(veio?.pico),
          atualizado: new Date().toISOString()
        };
        if (antes && antes.pico > linha.pico) linha.pico = antes.pico;

        guardado[nome] = linha;
        await env.QUADRO.put('quadro', JSON.stringify(guardado));
        return responder(linha, request);
      }
    }

    /* ---- entrada na página de admin ---- */

    if (caminho === '/admin/entrar' && metodo === 'POST') return entrar(request, env);

    if (caminho === '/admin/sair' && metodo === 'POST') {
      const chave = String(request.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
      if (/^[a-f0-9]{48}$/.test(chave)) await env.QUADRO.delete(`sessao:${chave}`);
      return responder({ ok: true }, request);
    }

    /* ---- agenda ---- */

    if (caminho === '/agenda') {
      const guardada = await ler(env, 'agenda', null);

      // ainda ninguem mexeu na agenda por aqui: o site usa o ficheiro dele
      if (metodo === 'GET')
        return responder({ definida: guardada !== null, agenda: guardada ?? [] }, request);

      if (metodo === 'POST') {
        if (!(await temChave(request, env)))
          return responder({ erro: 'Precisas de entrar outra vez.' }, request, 401);

        let veio;
        try {
          veio = await request.json();
        } catch {
          return responder({ erro: 'Corpo inválido.' }, request, 400);
        }
        const evento = limparEvento(veio, null);
        if (!evento.titulo) return responder({ erro: 'Falta dizer o que é.' }, request, 400);

        const agenda = guardada ?? [];
        if (agenda.length >= MAX_EVENTOS)
          return responder({ erro: 'A agenda está cheia.' }, request, 409);

        agenda.push(evento);
        await env.QUADRO.put('agenda', JSON.stringify(agenda));
        return responder(evento, request);
      }
    }

    const comId = /^\/agenda\/([A-Za-z0-9_-]{1,40})$/.exec(caminho);
    if (comId && (metodo === 'PATCH' || metodo === 'DELETE')) {
      if (!(await temChave(request, env)))
        return responder({ erro: 'Precisas de entrar outra vez.' }, request, 401);

      const agenda = await ler(env, 'agenda', []);
      const onde = agenda.findIndex((e) => e.id === comId[1]);
      if (onde < 0) return responder({ erro: 'Esse evento já não existe.' }, request, 404);

      if (metodo === 'DELETE') {
        agenda.splice(onde, 1);
        await env.QUADRO.put('agenda', JSON.stringify(agenda));
        return responder({ ok: true }, request);
      }

      let veio;
      try {
        veio = await request.json();
      } catch {
        return responder({ erro: 'Corpo inválido.' }, request, 400);
      }
      agenda[onde] = limparEvento(veio, agenda[onde]);
      await env.QUADRO.put('agenda', JSON.stringify(agenda));
      return responder(agenda[onde], request);
    }

    /** Primeira vez: deixa o admin trazer para aqui a agenda que está no
     *  ficheiro do site, para não se começar do zero. Só funciona enquanto
     *  ninguém tiver mexido na agenda por aqui. */
    if (caminho === '/agenda/importar' && metodo === 'POST') {
      if (!(await temChave(request, env)))
        return responder({ erro: 'Precisas de entrar outra vez.' }, request, 401);
      if ((await ler(env, 'agenda', null)) !== null)
        return responder({ erro: 'A agenda daqui já tem coisas.' }, request, 409);

      let veio;
      try {
        veio = await request.json();
      } catch {
        return responder({ erro: 'Corpo inválido.' }, request, 400);
      }
      const lista = Array.isArray(veio?.agenda) ? veio.agenda.slice(0, MAX_EVENTOS) : [];
      const limpa = lista.map((e) => limparEvento(e, { ...e, id: texto(e?.id, 40) || novoId() }));
      await env.QUADRO.put('agenda', JSON.stringify(limpa));
      return responder({ ok: true, quantos: limpa.length }, request);
    }

    return responder({ erro: 'Não há nada aqui.' }, request, 404);
  }
};
