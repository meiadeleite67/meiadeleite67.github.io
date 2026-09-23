import type { Estado, Evento, Membro, Pontuacao, RespostaDaMesa } from './tipos';

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

const VAZIO: Estado = { agenda: [], insta: [], ranking: [], membros: [] };

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

/** Os pedidos da mesa devolvem sempre a mesma coisa: a linha de quem joga e a
 *  mao que esta a decorrer, se houver. */
const naMesa = (rota: string, corpo: unknown) =>
  pedir<RespostaDaMesa>(rota, { method: 'POST', body: JSON.stringify(corpo) });


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

    const [doServidor, ranking, membros] = await Promise.all([
      pedir<{ definida: boolean; agenda: Evento[] }>('/agenda').catch(() => null),
      pedir<Pontuacao[]>('/quadro').catch(() => [] as Pontuacao[]),
      pedir<Membro[]>('/membros').catch(() => [] as Membro[])
    ]);

    return {
      insta,
      // a agenda do servidor manda; sem ela, fica a do ficheiro
      agenda: doServidor?.definida ? doServidor.agenda : agendaDoFicheiro,
      ranking: Array.isArray(ranking) ? ranking : [],
      membros: Array.isArray(membros) ? [...membros].sort((a, b) => a.ordem - b.ordem) : []
    };
  },

  /* ---- blackjack ----
     As cartas saem do servidor e e ele que decide o que vale cada mao. O site
     pede jogadas e mostra o que recebe: nao tem como dizer que ganhou, nem
     como jogar com o nome de outra pessoa, que e para isso que serve a chave.
     Sem servidor nao ha jogo, porque nao ha quem de as cartas. */

  sentar: (nome: string, chave?: string) =>
    naMesa('/quadro/sentar', { nome, chave: chave || undefined }),
  mesa: (nome: string, chave: string) => naMesa('/mesa', { nome, chave }),
  apostarNaMesa: (nome: string, chave: string, aposta: number) =>
    naMesa('/mesa/apostar', { nome, chave, aposta }),
  jogar: (nome: string, chave: string, acao: string, passo: number) =>
    naMesa('/mesa/jogar', { nome, chave, acao, passo }),
  emprestimo: (nome: string, chave: string) => naMesa('/quadro/emprestimo', { nome, chave }),

  /** Tira um nome do quadro. Precisa da chave de admin. */
  apagarDoQuadro: (nome: string) =>
    pedir<{ ok: boolean; nome: string }>('/quadro/apagar', {
      method: 'POST',
      body: JSON.stringify({ nome })
    }),

  /** Deita o quadro de honra abaixo. Precisa da chave de admin. */
  limparQuadro: () => pedir<{ ok: boolean; quantos: number }>('/quadro/limpar', { method: 'POST' }),

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

  /* ---- membros ---- */
  acrescentarMembro: (m: { nome: string; descricao: string; foto?: string }) =>
    pedir<Membro>('/membros', { method: 'POST', body: JSON.stringify(m) }),
  mudarMembro: (
    id: string,
    m: { nome?: string; descricao?: string; foto?: string; mascote?: boolean }
  ) =>
    pedir<Membro>(`/membros/${id}`, { method: 'PATCH', body: JSON.stringify(m) }),
  apagarMembro: (id: string) => pedir<{ ok: boolean }>(`/membros/${id}`, { method: 'DELETE' }),

  /** Leva para o servidor a agenda que está no ficheiro, na primeira vez. */
  importarAgenda: (agenda: Evento[]) =>
    pedir<{ ok: boolean; quantos: number }>('/agenda/importar', {
      method: 'POST',
      body: JSON.stringify({ agenda })
    })
};

/** A foto de um membro vem do servidor, que é quem a guarda. Quando isto é
 *  chamado já houve uma leitura do estado, por isso o endereço está sabido. */
export const fotoDoMembro = (id: string) => (servidor ? `${servidor}/membros/${id}/foto` : '');

/** Onde estão as fotos do mural, servidas como ficheiros do próprio site. */
export const capaDe = (id: string) => `/media/${id}.jpg`;
export const slideDe = (id: string, n: number) => `/media/${id}-${n}.jpg`;
