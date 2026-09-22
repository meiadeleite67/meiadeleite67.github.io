var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// index.js
var CASAS = [
  "https://meiadeleite.pt",
  "https://www.meiadeleite.pt",
  "https://meiadeleite67.github.io",
  "http://localhost:5173",
  "http://localhost:4173"
];
var TIPOS = ["copos", "jantar", "estudo", "exame", "festa", "cozinha", "outro"];
var SESSAO_DURA = 8 * 60 * 60;
var MAX_ENGANOS = 8;
var CASTIGO = 2 * 60 * 1e3;
var MAX_EVENTOS = 300;
var MAX_NOMES = 200;
function cabecalhos(request) {
  const origem = request.headers.get("Origin") || "";
  return {
    "Access-Control-Allow-Origin": CASAS.includes(origem) ? origem : CASAS[0],
    "Access-Control-Allow-Methods": "GET, PUT, POST, PATCH, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin"
  };
}
__name(cabecalhos, "cabecalhos");
var responder = /* @__PURE__ */ __name((corpo, request, estado = 200) => new Response(JSON.stringify(corpo), {
  status: estado,
  headers: { "Content-Type": "application/json; charset=utf-8", ...cabecalhos(request) }
}), "responder");
var texto = /* @__PURE__ */ __name((v, max) => typeof v === "string" ? v.trim().slice(0, max) : "", "texto");
var numero = /* @__PURE__ */ __name((v) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.max(0, Math.min(9999999, Math.round(n))) : 0;
}, "numero");
var eData = /* @__PURE__ */ __name((v) => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v), "eData");
var eHora = /* @__PURE__ */ __name((v) => typeof v === "string" && /^\d{2}:\d{2}$/.test(v), "eHora");
var novoId = /* @__PURE__ */ __name(() => crypto.randomUUID().slice(0, 8), "novoId");
var ler = /* @__PURE__ */ __name(async (env, chave, porOmissao) => {
  const guardado = await env.QUADRO.get(chave);
  return guardado ? JSON.parse(guardado) : porOmissao;
}, "ler");
var B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
function deBase32(t) {
  let bits = 0;
  let valor = 0;
  const bytes = [];
  for (const c of String(t).toUpperCase().replace(/[^A-Z2-7]/g, "")) {
    valor = valor << 5 | B32.indexOf(c);
    bits += 5;
    if (bits >= 8) {
      bytes.push(valor >>> bits - 8 & 255);
      bits -= 8;
    }
  }
  return new Uint8Array(bytes);
}
__name(deBase32, "deBase32");
function igualDevagar(a, b) {
  if (a.length !== b.length) return false;
  let diferenca = 0;
  for (let i = 0; i < a.length; i++) diferenca |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diferenca === 0;
}
__name(igualDevagar, "igualDevagar");
async function codigoCerto(segredo, dado) {
  const limpo = String(dado || "").replace(/\D/g, "");
  if (limpo.length !== 6 || !segredo) return false;
  const chave = await crypto.subtle.importKey(
    "raw",
    deBase32(segredo),
    { name: "HMAC", hash: "SHA-1" },
    false,
    ["sign"]
  );
  const passo = Math.floor(Date.now() / 3e4);
  for (const desvio of [-1, 0, 1]) {
    const agora = passo + desvio;
    const contador = new ArrayBuffer(8);
    const vista = new DataView(contador);
    vista.setUint32(0, Math.floor(agora / 2 ** 32));
    vista.setUint32(4, agora >>> 0);
    const assinatura = new Uint8Array(await crypto.subtle.sign("HMAC", chave, contador));
    const salto = assinatura[assinatura.length - 1] & 15;
    const n = (assinatura[salto] & 127) << 24 | assinatura[salto + 1] << 16 | assinatura[salto + 2] << 8 | assinatura[salto + 3];
    if (igualDevagar(String(n % 1e6).padStart(6, "0"), limpo)) return true;
  }
  return false;
}
__name(codigoCerto, "codigoCerto");
async function temChave(request, env) {
  const chave = String(request.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  if (!chave || !/^[a-f0-9]{48}$/.test(chave)) return false;
  return await env.QUADRO.get(`sessao:${chave}`) !== null;
}
__name(temChave, "temChave");
async function entrar(request, env) {
  const quem = request.headers.get("CF-Connecting-IP") || "desconhecido";
  const castigo = await ler(env, `castigo:${quem}`, null);
  if (castigo && castigo.ate > Date.now()) {
    const minutos = Math.ceil((castigo.ate - Date.now()) / 6e4);
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
    return responder({ erro: "Corpo inv\xE1lido." }, request, 400);
  }
  if (!await codigoCerto(env.TOTP_SEGREDO, veio?.codigo)) {
    const enganos = (castigo?.enganos ?? 0) + 1;
    await env.QUADRO.put(
      `castigo:${quem}`,
      JSON.stringify(
        enganos >= MAX_ENGANOS ? { enganos: 0, ate: Date.now() + CASTIGO } : { enganos, ate: 0 }
      ),
      { expirationTtl: 900 }
    );
    return responder({ erro: "C\xF3digo errado." }, request, 401);
  }
  await env.QUADRO.delete(`castigo:${quem}`);
  const chave = [...crypto.getRandomValues(new Uint8Array(24))].map((b) => b.toString(16).padStart(2, "0")).join("");
  await env.QUADRO.put(`sessao:${chave}`, "1", { expirationTtl: SESSAO_DURA });
  return responder({ chave }, request);
}
__name(entrar, "entrar");
function limparEvento(veio, antes) {
  return {
    id: antes?.id ?? novoId(),
    titulo: texto(veio?.titulo, 80) || antes?.titulo || "",
    data: eData(veio?.data) ? veio.data : antes?.data ?? (/* @__PURE__ */ new Date()).toISOString().slice(0, 10),
    hora: eHora(veio?.hora) ? veio.hora : antes?.hora ?? "",
    sitio: typeof veio?.sitio === "string" ? texto(veio.sitio, 80) : antes?.sitio ?? "",
    tipo: TIPOS.includes(veio?.tipo) ? veio.tipo : antes?.tipo ?? "outro",
    notas: typeof veio?.notas === "string" ? texto(veio.notas, 300) : antes?.notas ?? "",
    criadoEm: antes?.criadoEm ?? (/* @__PURE__ */ new Date()).toISOString()
  };
}
__name(limparEvento, "limparEvento");
var index_default = {
  async fetch(request, env) {
    if (request.method === "OPTIONS") return new Response(null, { headers: cabecalhos(request) });
    const url = new URL(request.url);
    const caminho = url.pathname.replace(/\/+$/, "") || "/";
    const metodo = request.method;
    if (caminho === "/quadro" || caminho === "/") {
      const guardado = await ler(env, "quadro", {});
      if (metodo === "GET")
        return responder(
          Object.values(guardado).sort((a, b) => b.torroes - a.torroes),
          request
        );
      if (metodo === "PUT") {
        let veio;
        try {
          veio = await request.json();
        } catch {
          return responder({ erro: "Corpo inv\xE1lido." }, request, 400);
        }
        const nome = texto(veio?.nome, 24);
        if (!nome) return responder({ erro: "Falta o nome." }, request, 400);
        if (!guardado[nome] && Object.keys(guardado).length >= MAX_NOMES)
          return responder({ erro: "O quadro est\xE1 cheio." }, request, 409);
        const antes = guardado[nome];
        const linha = {
          nome,
          torroes: numero(veio?.torroes),
          maos: numero(veio?.maos),
          vitorias: numero(veio?.vitorias),
          bjs: numero(veio?.bjs),
          pico: numero(veio?.pico),
          atualizado: (/* @__PURE__ */ new Date()).toISOString()
        };
        if (antes && antes.pico > linha.pico) linha.pico = antes.pico;
        guardado[nome] = linha;
        await env.QUADRO.put("quadro", JSON.stringify(guardado));
        return responder(linha, request);
      }
    }
    if (caminho === "/admin/entrar" && metodo === "POST") return entrar(request, env);
    if (caminho === "/admin/sair" && metodo === "POST") {
      const chave = String(request.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
      if (/^[a-f0-9]{48}$/.test(chave)) await env.QUADRO.delete(`sessao:${chave}`);
      return responder({ ok: true }, request);
    }
    if (caminho === "/agenda") {
      const guardada = await ler(env, "agenda", null);
      if (metodo === "GET")
        return responder({ definida: guardada !== null, agenda: guardada ?? [] }, request);
      if (metodo === "POST") {
        if (!await temChave(request, env))
          return responder({ erro: "Precisas de entrar outra vez." }, request, 401);
        let veio;
        try {
          veio = await request.json();
        } catch {
          return responder({ erro: "Corpo inv\xE1lido." }, request, 400);
        }
        const evento = limparEvento(veio, null);
        if (!evento.titulo) return responder({ erro: "Falta dizer o que \xE9." }, request, 400);
        const agenda = guardada ?? [];
        if (agenda.length >= MAX_EVENTOS)
          return responder({ erro: "A agenda est\xE1 cheia." }, request, 409);
        agenda.push(evento);
        await env.QUADRO.put("agenda", JSON.stringify(agenda));
        return responder(evento, request);
      }
    }
    const comId = /^\/agenda\/([A-Za-z0-9_-]{1,40})$/.exec(caminho);
    if (comId && (metodo === "PATCH" || metodo === "DELETE")) {
      if (!await temChave(request, env))
        return responder({ erro: "Precisas de entrar outra vez." }, request, 401);
      const agenda = await ler(env, "agenda", []);
      const onde = agenda.findIndex((e) => e.id === comId[1]);
      if (onde < 0) return responder({ erro: "Esse evento j\xE1 n\xE3o existe." }, request, 404);
      if (metodo === "DELETE") {
        agenda.splice(onde, 1);
        await env.QUADRO.put("agenda", JSON.stringify(agenda));
        return responder({ ok: true }, request);
      }
      let veio;
      try {
        veio = await request.json();
      } catch {
        return responder({ erro: "Corpo inv\xE1lido." }, request, 400);
      }
      agenda[onde] = limparEvento(veio, agenda[onde]);
      await env.QUADRO.put("agenda", JSON.stringify(agenda));
      return responder(agenda[onde], request);
    }
    if (caminho === "/agenda/importar" && metodo === "POST") {
      if (!await temChave(request, env))
        return responder({ erro: "Precisas de entrar outra vez." }, request, 401);
      if (await ler(env, "agenda", null) !== null)
        return responder({ erro: "A agenda daqui j\xE1 tem coisas." }, request, 409);
      let veio;
      try {
        veio = await request.json();
      } catch {
        return responder({ erro: "Corpo inv\xE1lido." }, request, 400);
      }
      const lista = Array.isArray(veio?.agenda) ? veio.agenda.slice(0, MAX_EVENTOS) : [];
      const limpa = lista.map((e) => limparEvento(e, { ...e, id: texto(e?.id, 40) || novoId() }));
      await env.QUADRO.put("agenda", JSON.stringify(limpa));
      return responder({ ok: true, quantos: limpa.length }, request);
    }
    return responder({ erro: "N\xE3o h\xE1 nada aqui." }, request, 404);
  }
};
export {
  index_default as default
};
//# sourceMappingURL=index.js.map
