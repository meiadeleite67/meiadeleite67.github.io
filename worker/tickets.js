/**
 * Os avisos de coisas partidas: as regras, sem nada à volta.
 *
 * Quem encontra um erro no site escreve-o aqui, e quem toma conta da casa
 * lê-o na cozinha. Não é um sistema de bilhetes de empresa: é uma caixa de
 * reclamações, e a graça está em ela ser tão fácil de usar que as pessoas a
 * usem em vez de dizerem o erro no grupo de conversa e ninguém apontar.
 *
 * O que vem de fora é tudo suspeito, e por isso nada daqui vai parar ao site
 * sem passar por este ficheiro: o texto é cortado ao tamanho, os campos que
 * não existem são deitados fora, e a parte que o browser preenche sozinho
 * (que página, que ecrã, que browser) é lida daqui e não do que o pedido
 * disser que é.
 */

/** Quanto texto se aceita em cada campo. */
const CONTAR = { texto: 1200, onde: 120, quem: 24, aparelho: 180 };

/** Quantos avisos se guardam ao todo. Os mais velhos já resolvidos saem
 *  primeiro; os que estão por resolver ficam sempre. */
export const TICKETS_NO_MAXIMO = 300;

/** O mínimo para um aviso servir para alguma coisa. Menos do que isto é
 *  alguém a carregar no botão para ver o que acontece. */
const TEXTO_MINIMO = 10;

export const ESTADOS = ['aberto', 'a-tratar', 'resolvido'];

const texto = (v, quanto) => (typeof v === 'string' ? v.trim().slice(0, quanto) : '');

/**
 * Confere um aviso acabado de escrever.
 *
 * Devolve o erro em linguagem de gente, que isto aparece a quem o escreveu.
 */
export function limparTicket(veio, extras = {}) {
  const oQue = texto(veio?.texto, CONTAR.texto);
  if (oQue.length < TEXTO_MINIMO)
    return { erro: 'Escreve um bocadinho mais: o que estavas a fazer e o que correu mal.' };

  return {
    ticket: {
      texto: oQue,
      /* Onde e em que aparelho, preenchido pelo browser de quem escreve. Não
         é obrigatório e não se confia nele para nada: serve só para quem for
         corrigir saber onde ir ver. */
      onde: texto(veio?.onde, CONTAR.onde),
      aparelho: texto(veio?.aparelho, CONTAR.aparelho),
      /* O nome é o nickname de quem escreve, se ele quiser dizer. Um aviso sem
         nome vale na mesma: quem encontra um erro nem sempre está com sessão
         iniciada, e obrigar a isso era perder metade dos avisos. */
      quem: texto(veio?.quem, CONTAR.quem),
      estado: 'aberto',
      quando: new Date().toISOString(),
      ...extras
    }
  };
}

/**
 * Arruma a lista: os mais recentes à frente, e corta o que passa do tecto.
 *
 * Os que estão por resolver nunca são cortados. Um aviso que ninguém leu não
 * pode desaparecer só porque entretanto entraram muitos outros, senão o dia em
 * que aparecerem cinquenta avisos de uma vez é o dia em que se perde o
 * primeiro.
 */
export function arrumarTickets(lista) {
  const todos = Array.isArray(lista) ? lista : [];
  const porResolver = todos.filter((t) => t && t.estado !== 'resolvido');
  const resolvidos = todos.filter((t) => t && t.estado === 'resolvido');

  const recentes = (a, b) => Date.parse(b.quando || 0) - Date.parse(a.quando || 0);
  porResolver.sort(recentes);
  resolvidos.sort(recentes);

  const cabem = Math.max(0, TICKETS_NO_MAXIMO - porResolver.length);
  return [...porResolver, ...resolvidos.slice(0, cabem)];
}

/** Muda o estado de um aviso. Devolve a lista nova, ou nada se o aviso não
 *  existir ou o estado não for um dos que há. */
export function mudarEstado(lista, id, estado) {
  if (!ESTADOS.includes(estado)) return null;
  const todos = Array.isArray(lista) ? lista : [];
  const achado = todos.find((t) => t && t.id === id);
  if (!achado) return null;
  return arrumarTickets(todos.map((t) => (t.id === id ? { ...t, estado } : t)));
}

/** Tira um aviso da lista. */
export function apagarTicket(lista, id) {
  const todos = Array.isArray(lista) ? lista : [];
  if (!todos.some((t) => t && t.id === id)) return null;
  return todos.filter((t) => t.id !== id);
}

/** As contas, para a cozinha poder dizer quantos há sem os contar à mão. */
export const contasDosTickets = (lista) => {
  const todos = Array.isArray(lista) ? lista : [];
  return {
    todos: todos.length,
    abertos: todos.filter((t) => t.estado === 'aberto').length,
    aTratar: todos.filter((t) => t.estado === 'a-tratar').length,
    resolvidos: todos.filter((t) => t.estado === 'resolvido').length
  };
};
