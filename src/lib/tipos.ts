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
  /** A carteira, que e a mesma em todos os jogos onde ha torroes a serio. */
  torroes: number;
  /** As contas do blackjack, que vem de antes de haver mais jogos. */
  maos: number;
  vitorias: number;
  bjs: number;
  pico: number;
  atualizado: string;
  poquer: { maos: number; ganhas: number; maiorPote: number };
  roleta: { rodadas: number; ganhas: number; maior: number };
  /** As apostas desportivas. A conta de apostas sobe quando se poe a aposta e
   *  a das ganhas so quando o jogo acaba, e por isso ha sempre um intervalo em
   *  que a primeira esta a frente da segunda. Nao e engano: sao as que estao
   *  por fechar. */
  desporto: { apostas: number; ganhas: number; maior: number };
  /** Os jogos de um so jogador entram com o recorde e nao com torroes: o
   *  servidor nao tem como confirmar o que o browser lhe diz. */
  recordes: { jogo: number; cusco: number; colherada: number };
};

/* ---------------------- as apostas desportivas ---------------------- */

/** Em que se pode apostar num jogo. O empate so existe onde existe. */
export type Escolha = 'casa' | 'fora' | 'empate';

export type JogoDeApostas = {
  id: string;
  /** A chave da liga na feed, por onde se vao buscar os resultados. */
  chave: string;
  liga: string;
  /** O nome do desporto como se le: Futebol, Basquetebol, Tenis. */
  desporto: string;
  casa: string;
  fora: string;
  comeca: string;
  cotacoes: { casa: number; fora: number; empate?: number; fonte?: string };
  /** Quantas casas de apostas deram preco a este jogo, e qual foi a que se
   *  usou. Serve so para a pagina de detalhe poder dizer de onde veio o
   *  numero em vez de o mostrar como se tivesse caido do ceu. */
  casasDeApostas?: number;
  fonte?: string;
};

/** Uma perna de um bilhete: um jogo e o que se escolheu nele. */
export type PernaDeAposta = {
  jogo: string;
  chave: string;
  desporto: string;
  liga: string;
  casa: string;
  fora: string;
  comeca: string;
  escolha: Escolha;
  cotacao: number;
  tinhaEmpate: boolean;
  /** Anulada e a perna que nao chegou a valer: o jogo foi adiado, ou deu
   *  empate onde nao se podia apostar no empate. Conta 1,00 na multipla. */
  estado: 'aberta' | 'ganha' | 'perdida' | 'anulada';
};

/** O que esta no boletim antes de se apostar. */
export type Escolhida = { jogo: JogoDeApostas; escolha: Escolha };

export type ApostaDesportiva = {
  id: string;
  nome: string;
  /** Uma perna e uma simples; varias sao uma multipla, em que as cotacoes se
   *  multiplicam e todas tem de acertar. */
  pernas: PernaDeAposta[];
  cotacao: number;
  quanto: number;
  estado: 'aberta' | 'ganha' | 'perdida' | 'anulada';
  posta: string;
  fechada: string | null;
  volta: number;
  lucro: number;
  /** A cotacao com que se acabou por pagar, se alguma perna foi anulada e por
   *  isso contou 1,00 em vez da sua. */
  cotacaoFinal?: number;
};

export type QuadroDeJogos = {
  jogos: JogoDeApostas[];
  /** Os desportos que o servidor segue, pela ordem em que os segue. Vem daqui
   *  e nao dos jogos para o filtro os poder mostrar todos, mesmo os que hoje
   *  estao a zero. */
  desportos?: string[];
  quando: string | null;
  /** Se o servidor tem chave da feed. Sem ela nao ha jogos novos, e o site diz
   *  isso em vez de mostrar uma pagina vazia sem explicacao. */
  temFeed: boolean;
  contas: { restam: number | null; gastos: number | null; quando: string | null };
};

/* ----------------------------- a roleta ----------------------------- */

export type TipoDeAposta =
  | 'numero'
  | 'cavalo'
  | 'quadra'
  | 'vermelho'
  | 'preto'
  | 'par'
  | 'impar'
  | 'baixo'
  | 'alto'
  | 'duzia1'
  | 'duzia2'
  | 'duzia3'
  | 'coluna1'
  | 'coluna2'
  | 'coluna3';

/** O `numeros` é só dos cavalos e das quadras: os dois ou quatro vizinhos
 *  entre os quais a ficha está pousada. */
export type Aposta = { tipo: TipoDeAposta; valor?: number; numeros?: number[]; quanto: number };

export type FichaContada = Aposta & { acertou: boolean; volta: number };

export type Rodada = {
  saiu: number;
  cor: 'verde' | 'vermelho' | 'preto';
  /** Onde a casa fica na roda, para a bola saber onde parar. */
  casa: number;
  detalhe: FichaContada[];
  apostado: number;
  volta: number;
  lucro: number;
};

export type RespostaDaRoleta = { linha: Pontuacao; rodada: Rodada };

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
  | 'poker'
  | 'roleta'
  | 'quadro'
  | 'termos'
  | 'privacidade'
  | 'apostas';
