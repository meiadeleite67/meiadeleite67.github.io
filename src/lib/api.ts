import type { Estado, Pontuacao } from './tipos';

/**
 * O site é servido pelo GitHub Pages, que só entrega ficheiros. Por isso:
 *
 *   agenda e mural  ->  /conteudo/estado.json, um ficheiro deste repositório
 *   quadro de honra ->  um Worker da Cloudflare, que é quem grava
 *
 * O endereço do Worker está em /conteudo/config.json. Enquanto estiver vazio,
 * o site funciona na mesma e os torrões ficam só no browser de cada um.
 */

const VAZIO: Estado = { agenda: [], insta: [], ranking: [] };

let quadro: string | null = null;

async function enderecoDoQuadro(): Promise<string> {
  if (quadro !== null) return quadro;
  let encontrado = '';
  try {
    const r = await fetch('/conteudo/config.json', { cache: 'no-cache' });
    const c = await r.json();
    if (typeof c?.quadro === 'string') encontrado = c.quadro.replace(/\/+$/, '');
  } catch {
    /* sem config, o site funciona na mesma sem quadro partilhado */
  }
  quadro = encontrado;
  return encontrado;
}

export const temQuadroPartilhado = () => quadro !== null && quadro !== '';

async function lerQuadro(): Promise<Pontuacao[]> {
  const url = await enderecoDoQuadro();
  if (!url) return [];
  try {
    const r = await fetch(url, { cache: 'no-cache' });
    if (!r.ok) return [];
    const lista = await r.json();
    return Array.isArray(lista) ? lista : [];
  } catch {
    return [];
  }
}

export const api = {
  async estado(): Promise<Estado> {
    const [conteudo, ranking] = await Promise.all([
      fetch('/conteudo/estado.json', { cache: 'no-cache' })
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null),
      lerQuadro()
    ]);
    if (!conteudo) return { ...VAZIO, ranking };
    return {
      agenda: Array.isArray(conteudo.agenda) ? conteudo.agenda : [],
      insta: Array.isArray(conteudo.insta) ? conteudo.insta : [],
      ranking
    };
  },

  /** Manda a pontuação para o Worker. Sem Worker, não há nada a fazer. */
  async pontuar(p: Omit<Pontuacao, 'atualizado'>): Promise<void> {
    const url = await enderecoDoQuadro();
    if (!url) return;
    await fetch(url, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(p)
    });
  }
};

/** Onde estão as fotos, agora servidas como ficheiros do próprio site. */
export const capaDe = (id: string) => `/media/${id}.jpg`;
export const slideDe = (id: string, n: number) => `/media/${id}-${n}.jpg`;
