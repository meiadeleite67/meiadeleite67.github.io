import { nomeGuardado, passeDe } from './nick';
import type {
  Aposta,
  ApostaDesportiva,
  Escolha,
  Estado,
  Evento,
  AClassificacao,
  ComoVaiOJogo,
  OsConfrontos,
  ItemDaGaleria,
  JogoDeApostas,
  Membro,
  Pontuacao,
  Post,
  QuantosNaMesa,
  QuadroDeJogos,
  RespostaDaMesa,
  RespostaDaRoleta,
  Ticket,
  ContasDosTickets
} from './tipos';

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
/** O que veio do ficheiro do site, lido uma vez so. */
let doFicheiroGuardado: { insta?: Post[]; agenda?: Evento[] } | null = null;
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
    /* O ficheiro do site so muda quando ha publicacao nova, e publicacao nova
       quer dizer site publicado de novo, o que ja traz tudo outra vez. Le-se
       uma vez por visita e nao de meio em meio minuto. */
    if (!doFicheiroGuardado) {
      doFicheiroGuardado = await fetch('/conteudo/estado.json', { cache: 'no-cache' })
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null);
    }
    const doFicheiro = doFicheiroGuardado;

    const base = await endereco();
    const insta = Array.isArray(doFicheiro?.insta) ? doFicheiro.insta : [];
    const agendaDoFicheiro = Array.isArray(doFicheiro?.agenda) ? doFicheiro.agenda : [];
    if (!base) return { ...VAZIO, insta, agenda: agendaDoFicheiro };

    /* Tudo numa viagem so. Eram quatro, e quatro de cinco em cinco segundos
       por cada separador aberto dao milhoes de pedidos ao fim do mes. */
    const tudo = await pedir<{
      agenda: { definida: boolean; agenda: Evento[] };
      quadro: Pontuacao[];
      membros: Membro[];
      mural: Post[];
    }>('/tudo').catch(() => null);

    const doServidor = tudo?.agenda ?? null;
    const ranking = tudo?.quadro ?? [];
    const membros = tudo?.membros ?? [];
    const doMural = tudo?.mural ?? [];

    /* O mural sao duas coisas juntas: as publicacoes que vivem no ficheiro do
       site e as que foram postas pelo painel de admin. Se a mesma aparecer nos
       dois sitios, manda a do painel, que e a mais recente. */
    const daNuvem = Array.isArray(doMural) ? doMural : [];
    const juntas: Post[] = [
      ...daNuvem,
      ...insta.filter((p: Post) => !daNuvem.some((n) => n.id === p.id))
    ].sort(
      (a, b) => (a.data < b.data ? 1 : a.data > b.data ? -1 : 0)
    );

    return {
      insta: juntas,
      // a agenda do servidor manda; sem ela, fica a do ficheiro
      agenda: doServidor?.definida ? doServidor.agenda : agendaDoFicheiro,
      ranking: Array.isArray(ranking) ? ranking : [],
      membros: Array.isArray(membros) ? [...membros].sort((a, b) => a.ordem - b.ordem) : []
    };
  },

  /* ---- blackjack ----
     As cartas saem do servidor e e ele que decide o que vale cada mao. O site
     pede jogadas e mostra o que recebe: nao tem como dizer que ganhou, nem
     como jogar com o nome de outra pessoa, que e para isso que serve o passe.
     Sem servidor nao ha jogo, porque nao ha quem de as cartas. */

  /** A porta de entrada: o nome e o PIN. Um nome novo fica com este PIN, um
   *  nome sem PIN passa a ter este, e um nome com PIN tem de o acertar. */
  entrarComPin: (nome: string, pin: string) => naMesa('/quadro/entrar', { nome, pin }),
  sentar: (nome: string, passe: string) => naMesa('/quadro/sentar', { nome, passe }),
  mesa: (nome: string, passe: string) => naMesa('/mesa', { nome, passe }),
  apostarNaMesa: (nome: string, passe: string, aposta: number) =>
    naMesa('/mesa/apostar', { nome, passe, aposta }),
  jogar: (nome: string, passe: string, acao: string, passo: number) =>
    naMesa('/mesa/jogar', { nome, passe, acao, passo }),
  emprestimo: (nome: string, passe: string) => naMesa('/quadro/emprestimo', { nome, passe }),

  /* ---- a roleta ----
     As fichas saem da carteira e o numero sai la, tudo no mesmo pedido: o site
     nao tem como saber onde a bola para antes de a mandar rodar. */

  roleta: (nome: string, passe: string, apostas: Aposta[]) =>
    pedir<RespostaDaRoleta>('/roleta', {
      method: 'POST',
      body: JSON.stringify({ nome, passe, apostas })
    }),

  /* ---- as apostas desportivas ----

     Os jogos vem do que o servidor tem guardado da ultima volta, e por isso
     esta chamada nao gasta creditos da feed por muita gente que abra a pagina.

     A cotacao nao se manda: quem manda nela e o servidor, que a vai buscar ao
     jogo que tem guardado. Se viesse daqui, bastava mexer no pedido no browser
     para apostar a cinquenta para um. */

  jogosDeApostas: () => pedir<QuadroDeJogos>('/desporto'),

  /** Um jogo so, para a pagina de detalhe. Sai do que o servidor ja tem
   *  guardado, por isso nao gasta creditos da feed. */
  jogoDeApostas: (id: string) =>
    pedir<{ jogo: JogoDeApostas }>(`/desporto/jogo/${encodeURIComponent(id)}`),

  /** Poe um bilhete: uma perna e uma simples, varias sao uma multipla. Daqui
   *  vai so em que jogo e em quem; as cotacoes sao as do servidor. */
  apostar: (
    nome: string,
    passe: string,
    pernas: { jogo: string; escolha: Escolha }[],
    quanto: number
  ) =>
    pedir<{ linha: Pontuacao; aposta: ApostaDesportiva }>('/desporto/apostar', {
      method: 'POST',
      body: JSON.stringify({ nome, passe, pernas, quanto })
    }),

  minhasApostas: (nome: string, passe: string) =>
    pedir<{ apostas: ApostaDesportiva[]; linha: Pontuacao }>('/desporto/minhas', {
      method: 'POST',
      body: JSON.stringify({ nome, passe })
    }),

  /** Como vai o jogo: estatisticas e eventos. O servidor guarda uma copia por
   *  jogo, por isso muita gente a abrir o mesmo jogo custa o mesmo que uma. */
  comoVaiOJogo: (id: string) =>
    pedir<ComoVaiOJogo>(`/desporto/stats/${encodeURIComponent(id)}`),

  /** A classificacao da liga do jogo. Guardada por liga e nao por jogo: os onze
   *  jogos de uma jornada fazem a mesma pergunta e pagam-na uma vez. */
  classificacaoDoJogo: (id: string) =>
    pedir<AClassificacao>(`/desporto/classificacao/${encodeURIComponent(id)}`),

  /** O historico entre as duas equipas, guardado pelo par e nao pelo jogo. */
  confrontosDoJogo: (id: string) =>
    pedir<OsConfrontos>(`/desporto/confrontos/${encodeURIComponent(id)}`),

  /* ---- os avisos de coisas partidas ----

     Escrever e publico de proposito: obrigar a entrar com um nome para se
     poder avisar de um erro era perder metade dos avisos. Ler e arrumar a
     caixa e que so se faz com a chave da cozinha. */

  avisarDeErro: (aviso: { texto: string; onde: string; aparelho: string; quem: string }) =>
    pedir<{ ok: boolean; id: string }>('/tickets', {
      method: 'POST',
      body: JSON.stringify(aviso)
    }),

  tickets: () => pedir<{ tickets: Ticket[]; contas: ContasDosTickets }>('/tickets'),

  mudarTicket: (id: string, estado: Ticket['estado']) =>
    pedir<{ tickets: Ticket[]; contas: ContasDosTickets }>('/tickets/estado', {
      method: 'POST',
      body: JSON.stringify({ id, estado })
    }),

  apagarTicket: (id: string) =>
    pedir<{ tickets: Ticket[]; contas: ContasDosTickets }>('/tickets/apagar', {
      method: 'POST',
      body: JSON.stringify({ id })
    }),

  /* ---- o mural do Instagram ---- */

  tirarDoMural: (id: string) => pedir<{ ok: boolean }>(`/mural/${id}`, { method: 'DELETE' }),

  /** O botao de ir buscar as que faltam. So anda com um token da Meta posto
   *  nos segredos do Worker; sem ele devolve o porque. */
  sincronizarMural: () => pedir<{ ok: boolean; postas: number }>('/mural/sincronizar', { method: 'POST' }),

  /** Poe uma publicacao no mural. A capa vai em bruto, como na galeria. */
  async acrescentarAoMural(
    dados: { url: string; legenda: string; data: string; formato: string },
    capa: File
  ): Promise<Post> {
    const base = await endereco();
    if (!base) throw new Error('O site ainda nao esta ligado ao servidor do grupo.');
    const p = new URLSearchParams(dados).toString();
    const r = await fetch(`${base}/mural?${p}`, {
      method: 'POST',
      headers: { 'Content-Type': capa.type, Authorization: `Bearer ${chave}` },
      body: capa
    });
    const corpo = await r.json().catch(() => null);
    if (!r.ok) {
      if (r.status === 401) chave = '';
      throw new Error((corpo && corpo.erro) || 'Nao deu para por a publicacao no mural.');
    }
    return corpo as Post;
  },

  /* ---- a galeria da mascote ---- */

  galeria: (dono: string) => pedir<ItemDaGaleria[]>(`/galeria/${dono}`),
  tirarDaGaleria: (dono: string, id: string) =>
    pedir<{ ok: boolean }>(`/galeria/${dono}/${id}`, { method: 'DELETE' }),

  /** Poe uma foto ou um video na galeria. O ficheiro vai em bruto, tal e qual
   *  saiu do telemovel: em base64 ocupava mais um terco e obrigava a converter
   *  tudo dos dois lados. */
  async porNaGaleria(dono: string, ficheiro: File, legenda: string): Promise<ItemDaGaleria> {
    const base = await endereco();
    if (!base) throw new Error('O site ainda nao esta ligado ao servidor do grupo.');
    const r = await fetch(`${base}/galeria/${dono}?legenda=${encodeURIComponent(legenda)}`, {
      method: 'POST',
      headers: { 'Content-Type': ficheiro.type, Authorization: `Bearer ${chave}` },
      body: ficheiro
    });
    const corpo = await r.json().catch(() => null);
    if (!r.ok) {
      if (r.status === 401) chave = '';
      throw new Error((corpo && corpo.erro) || 'Nao deu para por isso la.');
    }
    return corpo as ItemDaGaleria;
  },

  /** Tira um nome do quadro. Precisa da chave de admin. */
  apagarDoQuadro: (nome: string) =>
    pedir<{ ok: boolean; nome: string }>('/quadro/apagar', {
      method: 'POST',
      body: JSON.stringify({ nome })
    }),

  /** Tira o PIN a um nome, para ele poder ser reclamado outra vez. E a saida
   *  para quando alguem se mete no nome de outra pessoa. */
  limparPin: (nome: string) =>
    pedir<{ ok: boolean; nome: string }>('/quadro/pin/apagar', {
      method: 'POST',
      body: JSON.stringify({ nome })
    }),

  /** Deita o quadro de honra abaixo. Precisa da chave de admin. */
  /* Havia aqui um limparQuadro, que apagava os nomes e os torroes de toda a
     gente. Saiu do site: enquanto existisse aqui, bastava alguem voltar a
     liga-lo a um botao sem pensar duas vezes. O servidor ainda sabe fazer
     isso, e quem precisar mesmo de reiniciar o quadro tem de o pedir a mao,
     com a chave da cozinha, que e a friccao que uma coisa sem volta merece. */

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
/** O endereco de uma foto ou video da galeria. O tipo vai junto para o
 *  servidor saber com que cara o entregar. */
export const enderecoDoMedia = (item: { id: string; mime: string }) =>
  servidor ? `${servidor}/media/${item.id}?tipo=${encodeURIComponent(item.mime)}` : '';

/**
 * Manda o recorde de um jogo de um so jogador para o quadro.
 *
 * Nao espera resposta nem diz nada a quem esta a jogar: e um numero para se
 * comparar, nao vale torroes, e se o pedido falhar o jogo segue na mesma. Quem
 * nao tiver nome nem passe nao manda nada.
 */
export function mandarRecorde(jogo: string, pontos: number) {
  const nome = nomeGuardado();
  const passe = nome ? passeDe(nome) : '';
  if (!nome || !passe || !(pontos > 0)) return;
  pedir('/quadro/recorde', {
    method: 'POST',
    body: JSON.stringify({ nome, passe, jogo, pontos })
  }).catch(() => {
    /* o recorde fica no browser na mesma */
  });
}

/**
 * O endereco da ligacao viva a uma mesa de poker.
 *
 * E o mesmo servidor do resto, mas em ws: uma mesa com cinco pessoas nao se
 * faz a perguntar "ha novidades?" de meio em meio segundo. A ligacao fica
 * aberta e e a mesa que avisa quando alguem joga.
 */
export async function enderecoDaMesa(mesa: string): Promise<string> {
  const base = await endereco();
  if (!base) return '';
  return `${base.replace(/^http/, 'ws')}/poker/${encodeURIComponent(mesa)}`;
}

/** Quanta gente esta em cada mesa, para a entrada do poker. */
export const quantosNasMesas = (mesas: string[]) =>
  pedir<QuantosNaMesa[]>(`/poker?mesas=${mesas.map(encodeURIComponent).join(',')}`);

export const fotoDoMembro = (id: string) => (servidor ? `${servidor}/membros/${id}/foto` : '');

/** Onde estão as fotos do mural, servidas como ficheiros do próprio site. */
/* As publicacoes do ficheiro trazem as fotos no proprio site; as postas pelo
   painel de admin trazem-nas do servidor. Daqui sai o endereco certo para
   cada uma sem quem desenha ter de saber a diferenca. */
const doServidorOuDaqui = (post: Post, daqui: string) =>
  post.daNuvem
    ? servidor
      ? `${servidor}/media/insta-${post.id}?tipo=${encodeURIComponent(post.mime || 'image/jpeg')}`
      : ''
    : daqui;

export const capaDe = (post: Post) => doServidorOuDaqui(post, `/media/${post.id}.jpg`);
export const slideDe = (post: Post, n: number) =>
  doServidorOuDaqui(post, `/media/${post.id}-${n}.jpg`);
