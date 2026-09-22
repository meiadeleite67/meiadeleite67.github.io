import type { Estado, Evento, Pontuacao } from './tipos';

/**
 * O site é servido pelo GitHub Pages, que só entrega ficheiros. Quem grava é
 * um Worker da Cloudflare, cujo endereço está em /conteudo/config.json.
 *
 *   mural           ->  /conteudo/estado.json, um ficheiro deste repositório
 *   agenda          ->  o Worker; enquanto ele não tiver nada, o ficheiro
 *   quadro de honra ->  o Worker
 *   página de admin ->  o Worker (é ele que sabe o código do autenticador)
 *
 * Sem Worker configurado o site funciona na mesma: mostra o que está no
 * ficheiro e os torrões ficam só no browser de cada um.
 */

const VAZIO: Estado = { agenda: [], insta: [], ranking: [] };

let servidor: string | null = null;
let chave = '';

export const sessao = {
  tem: () => chave !== '',
  limpar: () => {
    chave = '';
  }
};

async function endereco(): Promise<string> {
  if (servidor !== null) return servidor;
  let encontrado = '';
  try {
    const r = await fetch('/conteudo/config.json', { cache: 'no-cache' });
    const c = await r.json();
    if (typeof c?.quadro === 'string') encontrado = c.quadro.replace(/\/+$/, '');
  } catch {
    /* sem config, o site vive só do ficheiro */
  }
  servidor = encontrado;
  return encontrado;
}

export const temServidor = () => servidor !== null && servidor !== '';

async function pedir<T>(rota: string, opcoes?: RequestInit): Promise<T> {
  const base = await endereco();
  if (!base) throw new Error('O site ainda não está ligado ao servidor do grupo.');

  const cabecalhos: Record<string, string> = {};
  if (opcoes?.body) cabecalhos['Content-Type'] = 'application/json';
  if (chave) cabecalhos.Authorization = `Bearer ${chave}`;

  const r = await fetch(base + rota, { ...opcoes, headers: cabecalhos });
  const corpo = await r.json().catch(() => null);
  if (!r.ok) {
    if (r.status === 401) chave = '';
    throw new Error((corpo && corpo.erro) || 'O servidor não respondeu como devia.');
  }
  return corpo as T;
}

type NovoEvento = {
  titulo: string;
  data: string;
  hora: string;
  sitio: string;
  tipo: string;
  notas: string;
};

export const api = {
  async estado(): Promise<Estado> {
    const doFicheiro = await fetch('/conteudo/estado.json', { cache: 'no-cache' })
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null);

    const base = await endereco();
    const insta = Array.isArray(doFicheiro?.insta) ? doFicheiro.insta : [];
    const agendaDoFicheiro = Array.isArray(doFicheiro?.agenda) ? doFicheiro.agenda : [];
    if (!base) return { ...VAZIO, insta, agenda: agendaDoFicheiro };

    const [doServidor, ranking] = await Promise.all([
      pedir<{ definida: boolean; agenda: Evento[] }>('/agenda').catch(() => null),
      pedir<Pontuacao[]>('/quadro').catch(() => [] as Pontuacao[])
    ]);

    return {
      insta,
      // a agenda do servidor manda; sem ela, fica a do ficheiro
      agenda: doServidor?.definida ? doServidor.agenda : agendaDoFicheiro,
      ranking: Array.isArray(ranking) ? ranking : []
    };
  },

  async pontuar(p: Omit<Pontuacao, 'atualizado'>): Promise<void> {
    if (!(await endereco())) return;
    await pedir('/quadro', { method: 'PUT', body: JSON.stringify(p) }).catch(() => null);
  },

  /* ---- página de admin ---- */

  async entrar(codigo: string) {
    const r = await pedir<{ chave: string }>('/admin/entrar', {
      method: 'POST',
      body: JSON.stringify({ codigo })
    });
    chave = r.chave;
    return r;
  },
  async sair() {
    try {
      await pedir('/admin/sair', { method: 'POST' });
    } finally {
      chave = '';
    }
  },

  marcar: (e: NovoEvento) => pedir<Evento>('/agenda', { method: 'POST', body: JSON.stringify(e) }),
  mudar: (id: string, e: Partial<NovoEvento>) =>
    pedir<Evento>(`/agenda/${id}`, { method: 'PATCH', body: JSON.stringify(e) }),
  apagarEvento: (id: string) => pedir<{ ok: boolean }>(`/agenda/${id}`, { method: 'DELETE' }),

  /** Leva para o servidor a agenda que está no ficheiro, na primeira vez. */
  importarAgenda: (agenda: Evento[]) =>
    pedir<{ ok: boolean; quantos: number }>('/agenda/importar', {
      method: 'POST',
      body: JSON.stringify({ agenda })
    })
};

/** Onde estão as fotos, servidas como ficheiros do próprio site. */
export const capaDe = (id: string) => `/media/${id}.jpg`;
export const slideDe = (id: string, n: number) => `/media/${id}-${n}.jpg`;
