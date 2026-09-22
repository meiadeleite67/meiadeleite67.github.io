/**
 * Quadro de honra do blackjack do MEIadeLEIte.
 *
 * O site está no GitHub Pages, que só entrega ficheiros e não sabe gravar
 * nada. Este Worker é a única peça que grava: guarda as pontuações num KV da
 * Cloudflare e devolve-as a quem as pedir.
 *
 *   GET  ->  a lista toda, do mais rico para o mais pobre
 *   PUT  ->  grava a pontuação de um nome
 *
 * Não há contas nem palavras-passe: quem souber o endereço pode escrever.
 * Para um quadro de torrões de açúcar entre amigos, chega.
 */

const CASAS = ['https://meiadeleite.pt', 'https://www.meiadeleite.pt', 'https://meiadeleite67.github.io'];
const MAX_NOMES = 200;

function cabecalhos(request) {
  const origem = request.headers.get('Origin') || '';
  return {
    'Access-Control-Allow-Origin': CASAS.includes(origem) ? origem : CASAS[0],
    'Access-Control-Allow-Methods': 'GET, PUT, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400'
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

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') return new Response(null, { headers: cabecalhos(request) });

    const guardados = JSON.parse((await env.QUADRO.get('quadro')) || '{}');

    if (request.method === 'GET') {
      const lista = Object.values(guardados).sort((a, b) => b.torroes - a.torroes);
      return responder(lista, request);
    }

    if (request.method === 'PUT') {
      let veio;
      try {
        veio = await request.json();
      } catch {
        return responder({ erro: 'Corpo inválido.' }, request, 400);
      }

      const nome = texto(veio?.nome, 24);
      if (!nome) return responder({ erro: 'Falta o nome.' }, request, 400);
      if (!guardados[nome] && Object.keys(guardados).length >= MAX_NOMES)
        return responder({ erro: 'O quadro está cheio.' }, request, 409);

      const antes = guardados[nome];
      const linha = {
        nome,
        torroes: numero(veio?.torroes),
        maos: numero(veio?.maos),
        vitorias: numero(veio?.vitorias),
        bjs: numero(veio?.bjs),
        pico: numero(veio?.pico),
        atualizado: new Date().toISOString()
      };
      // o melhor que aquele nome já fez fica sempre guardado
      if (antes && antes.pico > linha.pico) linha.pico = antes.pico;

      guardados[nome] = linha;
      await env.QUADRO.put('quadro', JSON.stringify(guardados));
      return responder(linha, request);
    }

    return responder({ erro: 'Só GET e PUT.' }, request, 405);
  }
};
