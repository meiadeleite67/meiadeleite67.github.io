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
  /** Posta pelo painel de admin: a capa dela vive no servidor e nao no site. */
  daNuvem?: boolean;
  mime?: string;
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
  /** So vem de /quadro/entrar: o passe deste aparelho, que fica guardado. */
  passe?: string;
  /** 'nome' quando o nickname foi estreado agora, 'pin' quando o nome ja
   *  existia e acabou de ficar com um PIN. Vazio quando so se entrou. */
  estreou?: string;
  mesa: MesaVista | null;
};

/* ---------------------------- o poker ----------------------------

   A mesa de poker e viva: chega por uma ligacao aberta e nao por pedidos. O
   que vem de la e sempre a mesa vista do lugar de quem esta a ver, e as cartas
   dos outros vem a null enquanto nao forem mostradas. */

export type EstadoNaMao = 'aberto' | 'tudo' | 'passou';

export type NaMao = {
  lugar: number;
  nome: string;
  fichas: number;
  /** O que ele ja pos no meio nesta ronda. */
  posto: number;
  estado: EstadoNaMao;
  ganhou: number;
  /** Quantas cartas tem na mao, mesmo quando nao se veem quais. */
  quantas: number;
  /** As minhas, ou as de quem mostrou. As dos outros vem a null. */
  cartas: CartaVista[] | null;
  mao: string;
};

/** O que da para fazer agora, decidido pelo servidor e nao pelo site. */
export type Podes = {
  passar: boolean;
  igualar: number;
  minimo: number;
  maximo: number;
  podeSubir: boolean;
};

export type FaseDaMao = 'previa' | 'flop' | 'turn' | 'river' | 'mostra' | 'acabou';

export type MaoDePoker = {
  numero: number;
  passo: number;
  fase: FaseDaMao;
  comunidade: CartaVista[];
  pote: number;
  aposta: number;
  subidaMinima: number;
  botao: number;
  cegos: { pequeno: number; grande: number };
  vez: number;
  /** A hora, no relogio do servidor, a que a vez de quem esta a jogar acaba. */
  prazo: number;
  bolos: { valor: number; para: number[] }[];
  podes: Podes | null;
  jogadores: NaMao[];
};

export type LugarDaMesa = {
  lugar: number;
  nome: string;
  fichas: number;
  ligado: boolean;
  /** Quantas vezes seguidas deixou passar a vez. */
  faltas: number;
  /** A hora, no relogio do servidor, a que perde o lugar por estar parado. */
  saiEm: number;
};

export type MesaViva = {
  /** A hora do servidor quando isto saiu de la, para os relogios baterem. */
  agora: number;
  /** A hora do nosso relogio quando isto chegou. */
  recebidoEm: number;
  numero: number;
  comecaEm: number;
  fimEm: number;
  narracao: string[];
  eu: { nome: string; lugar: number } | null;
  lugares: LugarDaMesa[];
  mao: MaoDePoker | null;
};

export type QuantosNaMesa = {
  mesa: string;
  sentados: number;
  aJogar: number;
  maos: number;
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

export type Pagina =
  | 'inicio'
  | 'membros'
  | 'blackjack'
  | 'instagram'
  | 'agenda'
  | 'admin'
  | 'jogo'
  | 'cusco'
  | 'colherada'
  | 'poker';
