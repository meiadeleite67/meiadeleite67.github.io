/**
 * A parte do meiadeleite.pt que precisa de gravar coisas.
 *
 * O site está no GitHub Pages, que só entrega ficheiros. Este Worker é a
 * única peça viva: guarda o quadro de honra do blackjack e a agenda, e trata
 * da entrada na página de admin com o código do Google Authenticator.
 *
 *   GET    /quadro          o quadro de honra
 *   POST   /quadro/sentar     entra na mesa e devolve o saldo de quem joga
 *   POST   /quadro/apostar    tira a aposta do saldo, antes de haver cartas
 *   POST   /quadro/jogada     paga (ou não) o que saiu de cada mão
 *   POST   /quadro/emprestimo os cem do costume, para quem está sem nada
 *   POST   /quadro/limpar     deita o quadro abaixo (precisa da chave)
 *   GET    /agenda          a agenda
 *   GET    /membros         os membros do grupo
 *   GET    /membros/<id>/foto   a fotografia de um membro
 *   POST   /admin/entrar    troca um código de 6 dígitos por uma chave
 *   POST   /agenda          marca (precisa da chave)
 *   PATCH  /agenda/<id>     muda  (precisa da chave)
 *   DELETE /agenda/<id>     apaga (precisa da chave)
 *   POST, PATCH, DELETE em /membros    o mesmo, para os membros
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
const MAX_MEMBROS = 60;
const MAX_FOTO = 400_000; // caracteres de base64, uns 300 kB de imagem

/* O saldo do blackjack vive aqui e nao no browser de quem joga. Antes o site
   mandava o saldo ja feito e este Worker acreditava, o que dava para pôr o
   numero que se quisesse e fazer uma aposta pequena para o gravar. Agora o
   cliente so diz o que apostou e o que lhe saiu, e as contas sao daqui. */
const SALDO_INICIAL = 250;
const EMPRESTIMO = 100;
const SALDO_PARA_EMPRESTAR = 5;
const MAX_MAOS_POR_JOGADA = 4;
const RESULTADOS = ['blackjack', 'ganhou', 'empate', 'perdeu', 'rebentou'];

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

const linhaNova = (nome) => ({
  nome,
  torroes: SALDO_INICIAL,
  maos: 0,
  vitorias: 0,
  bjs: 0,
  pico: SALDO_INICIAL,
  pendente: 0,
  atualizado: new Date().toISOString()
});

/**
 * Tudo o que mexe no quadro passa por aqui: le o nome, vai buscar a linha de
 * quem joga, deixa o trabalho mudá-la e grava. O trabalho devolve uma queixa
 * em texto quando a jogada nao presta, e nesse caso nao se grava nada.
 */
async function comOQuadro(request, env, trabalho) {
  let veio;
  try {
    veio = await request.json();
  } catch {
    return responder({ erro: 'Corpo inválido.' }, request, 400);
  }
  const nome = texto(veio?.nome, 24);
  if (nome.length < 2) return responder({ erro: 'Falta o nome.' }, request, 400);

  const quadro = await ler(env, 'quadro', {});
  if (!quadro[nome] && Object.keys(quadro).length >= MAX_NOMES)
    return responder({ erro: 'O quadro está cheio.' }, request, 409);

  const linha = { ...linhaNova(nome), ...(quadro[nome] || {}) };
  const queixa = trabalho(linha, veio);
  if (queixa) return responder({ erro: queixa }, request, 400);

  linha.torroes = numero(linha.torroes);
  if (linha.torroes > linha.pico) linha.pico = linha.torroes;
  linha.atualizado = new Date().toISOString();
  quadro[nome] = linha;
  await env.QUADRO.put('quadro', JSON.stringify(quadro));
  return responder(linha, request);
}

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

/** As fotos dos membros ficam guardadas à parte, uma por chave, para a lista
 *  de membros continuar leve de ler. Chegam já encolhidas pelo browser. */
async function guardarFoto(env, id, foto) {
  if (typeof foto !== 'string' || !foto.startsWith('data:image/')) return false;
  const base64 = foto.slice(foto.indexOf(',') + 1);
  if (base64.length > MAX_FOTO) return 'grande';
  try {
    atob(base64.slice(0, 64));
  } catch {
    return false;
  }
  await env.QUADRO.put(`foto:${id}`, base64);
  return true;
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

    if ((caminho === '/quadro' || caminho === '/') && metodo === 'GET') {
      const guardado = await ler(env, 'quadro', {});
      return responder(
        Object.values(guardado)
          .map(({ pendente, ...resto }) => resto)
          .sort((a, b) => b.torroes - a.torroes),
        request
      );
    }

    /* Sentar-se a mesa: quem ja jogou volta com o que tinha, quem e novo
       comeca com os torroes do costume. Uma aposta deixada a meio de uma
       jogada anterior fica perdida, senao bastava fechar a pagina para
       desfazer uma mao que corria mal. */
    if (caminho === '/quadro/sentar' && metodo === 'POST') {
      return comOQuadro(request, env, (linha) => {
        linha.pendente = 0;
      });
    }

    /* A aposta sai do saldo aqui, antes de haver cartas. */
    if (caminho === '/quadro/apostar' && metodo === 'POST') {
      return comOQuadro(request, env, (linha, veio) => {
        const aposta = numero(veio?.aposta);
        if (aposta < 1) return 'Aposta inválida.';
        if (aposta > linha.torroes) return 'Não tens torrões que cheguem.';
        linha.torroes -= aposta;
        linha.pendente = aposta;
      });
    }

    /* E o pagamento acontece aqui, com o servidor a fazer as contas a partir
       do que aconteceu a cada mao. O cliente diz o que lhe saiu; quanto e que
       isso vale e connosco. */
    if (caminho === '/quadro/jogada' && metodo === 'POST') {
      return comOQuadro(request, env, (linha, veio) => {
        const maos = Array.isArray(veio?.maos) ? veio.maos : [];
        if (maos.length < 1 || maos.length > MAX_MAOS_POR_JOGADA) return 'Jogada inválida.';

        const limpas = [];
        let total = 0;
        for (const m of maos) {
          const aposta = numero(m?.aposta);
          const resultado = texto(m?.resultado, 12);
          if (aposta < 1 || !RESULTADOS.includes(resultado)) return 'Jogada inválida.';
          total += aposta;
          limpas.push({ aposta, resultado });
        }

        /* O que foi apostado a mais do que o combinado no inicio e o que veio
           de dobrar ou de dividir, e tem de caber no que sobra. */
        const aMais = total - (linha.pendente || 0);
        if (aMais < 0) return 'Jogada inválida.';
        if (aMais > linha.torroes) return 'Não tens torrões que cheguem.';
        linha.torroes -= aMais;
        linha.pendente = 0;

        for (const m of limpas) {
          // blackjack a serio so existe na mao de origem, nunca depois de dividir
          const r = m.resultado === 'blackjack' && limpas.length > 1 ? 'ganhou' : m.resultado;
          if (r === 'blackjack') {
            linha.torroes += Math.round(m.aposta * 2.5);
            linha.vitorias++;
            linha.bjs++;
          } else if (r === 'ganhou') {
            linha.torroes += m.aposta * 2;
            linha.vitorias++;
          } else if (r === 'empate') {
            linha.torroes += m.aposta;
          }
          linha.maos++;
        }
      });
    }

    /* Deitar o quadro abaixo. So o admin, e nao ha volta a dar. */
    if (caminho === '/quadro/limpar' && metodo === 'POST') {
      if (!(await temChave(request, env)))
        return responder({ erro: 'Precisas de entrar outra vez.' }, request, 401);
      const guardado = await ler(env, 'quadro', {});
      const quantos = Object.keys(guardado).length;
      await env.QUADRO.put('quadro', JSON.stringify({}));
      return responder({ ok: true, quantos }, request);
    }

    /* Os cem emprestados: so para quem esta mesmo sem nada. */
    if (caminho === '/quadro/emprestimo' && metodo === 'POST') {
      return comOQuadro(request, env, (linha) => {
        if (linha.torroes >= SALDO_PARA_EMPRESTAR) return 'Ainda tens torrões.';
        linha.torroes += EMPRESTIMO;
      });
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

    /* ---- membros ---- */

    if (caminho === '/membros') {
      const lista = await ler(env, 'membros', []);

      if (metodo === 'GET') return responder(lista, request);

      if (metodo === 'POST') {
        if (!(await temChave(request, env)))
          return responder({ erro: 'Precisas de entrar outra vez.' }, request, 401);

        let veio;
        try {
          veio = await request.json();
        } catch {
          return responder({ erro: 'Corpo inválido.' }, request, 400);
        }
        const nome = texto(veio?.nome, 40);
        if (!nome) return responder({ erro: 'Falta o nome.' }, request, 400);
        if (lista.length >= MAX_MEMBROS)
          return responder({ erro: 'Já não cabem mais membros.' }, request, 409);

        const membro = {
          id: novoId(),
          nome,
          descricao: texto(veio?.descricao, 200),
          temFoto: false,
          ordem: lista.length
        };
        const guardou = await guardarFoto(env, membro.id, veio?.foto);
        if (guardou === 'grande')
          return responder({ erro: 'A foto é demasiado pesada.' }, request, 413);
        membro.temFoto = guardou === true;

        lista.push(membro);
        await env.QUADRO.put('membros', JSON.stringify(lista));
        return responder(membro, request);
      }
    }

    const membroComId = /^\/membros\/([A-Za-z0-9_-]{1,40})$/.exec(caminho);
    if (membroComId && (metodo === 'PATCH' || metodo === 'DELETE')) {
      if (!(await temChave(request, env)))
        return responder({ erro: 'Precisas de entrar outra vez.' }, request, 401);

      const lista = await ler(env, 'membros', []);
      const onde = lista.findIndex((m) => m.id === membroComId[1]);
      if (onde < 0) return responder({ erro: 'Esse membro já não existe.' }, request, 404);

      if (metodo === 'DELETE') {
        await env.QUADRO.delete(`foto:${lista[onde].id}`);
        lista.splice(onde, 1);
        lista.forEach((m, i) => {
          m.ordem = i;
        });
        await env.QUADRO.put('membros', JSON.stringify(lista));
        return responder({ ok: true }, request);
      }

      let veio;
      try {
        veio = await request.json();
      } catch {
        return responder({ erro: 'Corpo inválido.' }, request, 400);
      }
      const m = lista[onde];
      if (texto(veio?.nome, 40)) m.nome = texto(veio.nome, 40);
      if (typeof veio?.descricao === 'string') m.descricao = texto(veio.descricao, 200);
      if (veio?.foto) {
        const guardou = await guardarFoto(env, m.id, veio.foto);
        if (guardou === 'grande')
          return responder({ erro: 'A foto é demasiado pesada.' }, request, 413);
        if (guardou === true) m.temFoto = true;
      }
      await env.QUADRO.put('membros', JSON.stringify(lista));
      return responder(m, request);
    }

    /** A foto de um membro, servida como imagem para o site a poder mostrar
     *  numa tag normal. */
    const fotoComId = /^\/membros\/([A-Za-z0-9_-]{1,40})\/foto$/.exec(caminho);
    if (fotoComId && metodo === 'GET') {
      const guardada = await env.QUADRO.get(`foto:${fotoComId[1]}`);
      if (!guardada) return new Response(null, { status: 404, headers: cabecalhos(request) });
      const bytes = Uint8Array.from(atob(guardada), (c) => c.charCodeAt(0));
      return new Response(bytes, {
        headers: {
          'Content-Type': 'image/jpeg',
          'Cache-Control': 'public, max-age=300',
          ...cabecalhos(request)
        }
      });
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
