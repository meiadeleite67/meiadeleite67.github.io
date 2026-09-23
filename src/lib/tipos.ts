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

export type Estado = {
  agenda: Evento[];
  insta: Post[];
  ranking: Pontuacao[];
  membros: Membro[];
};

export type Pagina = 'inicio' | 'membros' | 'blackjack' | 'instagram' | 'agenda' | 'admin' | 'jogo';
