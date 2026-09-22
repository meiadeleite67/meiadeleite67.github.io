import type { Pagina, TipoEvento } from './tipos';

export const PAGINAS: { id: Pagina; nome: string }[] = [
  { id: 'inicio', nome: 'Início' },
  { id: 'blackjack', nome: 'Blackjack' },
  { id: 'instagram', nome: 'Instagram' },
  { id: 'agenda', nome: 'Agenda' }
];

export const TODAS_AS_PAGINAS: Pagina[] = PAGINAS.map((p) => p.id);

export const TIPOS: Record<TipoEvento, { nome: string; cls: string; cor: string }> = {
  copos: { nome: 'Copos', cls: 't-copos', cor: 'var(--crema)' },
  jantar: { nome: 'Jantar', cls: 't-jantar', cor: 'var(--vinho)' },
  estudo: { nome: 'Estudo', cls: 't-estudo', cor: 'var(--azulejo)' },
  exame: { nome: 'Exame', cls: 't-exame', cor: 'var(--vinho)' },
  festa: { nome: 'Festa', cls: 't-festa', cor: 'var(--crema)' },
  cozinha: { nome: 'Reunião de cozinha', cls: 't-cozinha', cor: 'var(--verde)' },
  outro: { nome: 'Outro', cls: 't-outro', cor: 'var(--tinta-3)' }
};

export const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

export const MESES_INTEIROS = [
  'Janeiro',
  'Fevereiro',
  'Março',
  'Abril',
  'Maio',
  'Junho',
  'Julho',
  'Agosto',
  'Setembro',
  'Outubro',
  'Novembro',
  'Dezembro'
];

/** A semana começa à segunda, como em Portugal. */
export const DIAS_DA_SEMANA = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];

export const hoje = () => new Date().toISOString().slice(0, 10);

export function dataCurta(iso: string): string {
  const p = (iso || '').split('-');
  if (p.length !== 3) return iso || '';
  return `${Number(p[2])} ${MESES[Number(p[1]) - 1]} ${p[0]}`;
}

/** "amanhã", "sexta", "daqui a 12 dias". Para a agenda se ler de relance. */
export function quandoEmPalavras(iso: string): string {
  const p = (iso || '').split('-');
  if (p.length !== 3) return '';
  const alvo = new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]));
  const agora = new Date();
  const zero = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate());
  const dias = Math.round((alvo.getTime() - zero.getTime()) / 86400000);
  if (dias === 0) return 'hoje';
  if (dias === 1) return 'amanhã';
  if (dias === -1) return 'ontem';
  if (dias > 1 && dias < 7) return ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'][alvo.getDay()];
  if (dias > 0) return `daqui a ${dias} dias`;
  return `há ${Math.abs(dias)} dias`;
}

export function guardar(chave: string, valor: string) {
  try {
    localStorage.setItem(chave, valor);
  } catch {
    /* modo privado ou disco cheio: o site funciona sem isto */
  }
}

export function lido(chave: string): string | null {
  try {
    return localStorage.getItem(chave);
  } catch {
    return null;
  }
}
