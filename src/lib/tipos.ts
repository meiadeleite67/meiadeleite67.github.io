export type TipoEvento = 'copos' | 'jantar' | 'estudo' | 'exame' | 'festa' | 'cozinha' | 'outro';

export type Evento = {
  id: string;
  titulo: string;
  data: string;
  hora: string;
  sitio: string;
  tipo: TipoEvento;
  notas: string;
  criadoEm: string;
};

export type Post = {
  id: string;
  url: string;
  /** Como a publicacao se abre: foto simples, album de slides ou reel. */
  formato: 'foto' | 'reel' | 'album';
  data: string;
  legenda: string;
  temImagem: boolean;
  /** Quantas fotos temos guardadas desta publicacao (albuns tem varias). */
  slides: number;
};

export type Membro = {
  id: string;
  nome: string;
  descricao: string;
  temFoto: boolean;
  /** A mascote do grupo. Ha uma so, e fica no topo da lista, a parte. */
  mascote?: boolean;
  ordem: number;
};

export type Pontuacao = {
  nome: string;
  torroes: number;
  maos: number;
  vitorias: number;
  bjs: number;
  pico: number;
  atualizado: string;
};

/* O que o servidor deixa o site ver da mao que esta a decorrer. As cartas da
   casa vem cortadas: enquanto a tapada estiver tapada, ela nem sai de la. */

export type CartaVista = { v: string; n: string; verm: boolean };

export type MaoVista = {
  cartas: CartaVista[];
  aposta: number;
  fechada: boolean;
  resultado: 'blackjack' | 'ganhou' | 'empate' | 'perdeu' | 'rebentou' | null;
  deAses: boolean;
};

export type MesaVista = {
  fase: 'jogo' | 'fim';
  revelar: boolean;
  atual: number;
  /** O numero da jogada, que volta com cada acao para nao se repetirem. */
  passo: number;
  casa: CartaVista[];
  /** Se a casa ainda tem uma carta por virar. */
  tapada: boolean;
  maos: MaoVista[];
  podeDividir: boolean;
  podeDobrar: boolean;
};

export type RespostaDaMesa = {
  linha: Pontuacao;
  /** So vem quando um nome e estreado: e a chave desse nome, e so aparece uma vez. */
  chave?: string;
  mesa: MesaVista | null;
};

/** Uma foto ou um video da galeria da mascote. */
export type ItemDaGaleria = {
  id: string;
  mime: string;
  tipo: 'foto' | 'video';
  legenda: string;
  criadoEm: string;
};

export type Estado = {
  agenda: Evento[];
  insta: Post[];
  ranking: Pontuacao[];
  membros: Membro[];
};

export type Pagina = 'inicio' | 'membros' | 'blackjack' | 'instagram' | 'agenda' | 'admin' | 'jogo';
