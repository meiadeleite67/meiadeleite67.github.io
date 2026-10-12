export const HORA = 60 * 60_000;
export const DIA = 24 * HORA;
export const INTERVALOS = { rodada: 12_000, acao: 1500, recorde: 30_000, emprestimo: 60_000, aposta: 5000, poker: 1500 };
export function limitarJogador(estado, tipo, agora = Date.now()) {
  const negar = (ate, erro) => ({ erro, estado: 429, repetirEm: Math.max(1, Math.ceil((ate - agora) / 1000)) });
  if (estado.bloqueadoAte > agora) return negar(estado.bloqueadoAte, 'A atividade automática foi suspensa. Volta mais tarde.');
  const falta = Math.max(estado[`proxima:${tipo}`] || 0, tipo === 'acao' ? estado.cartasEm || 0 : 0);
  if (falta > agora) {
    if (!estado.violacoes || agora - estado.violacoes.desde >= 60_000) estado.violacoes = { desde: agora, quantas: 0 };
    if (++estado.violacoes.quantas >= 10) {
      estado.bloqueadoAte = agora + 15 * 60_000;
      return negar(estado.bloqueadoAte, 'Demasiadas jogadas fora de tempo. Os jogos ficam suspensos durante 15 minutos.');
    }
    return negar(falta, 'Aguarda antes da próxima jogada.');
  }
  if (tipo === 'rodada') {
    if (!estado.hora || agora >= estado.hora.ate) estado.hora = { ate: agora + HORA, quantas: 0 };
    if (!estado.dia || agora >= estado.dia.ate) estado.dia = { ate: agora + DIA, quantas: 0 };
    if (estado.hora.quantas >= 120) return negar(estado.hora.ate, 'Chegaste ao limite de 120 rodadas por hora. Faz uma pausa.');
    if (estado.dia.quantas >= 600) return negar(estado.dia.ate, 'Chegaste ao limite de 600 rodadas por dia. Volta amanhã.');
    estado.hora.quantas++; estado.dia.quantas++;
    estado.cartasEm = agora + 1500;
  }
  estado[`proxima:${tipo}`] = agora + (INTERVALOS[tipo] || 1500);
  return null;
}
export function terminarRodada(estado, agora = Date.now()) {
  estado['proxima:rodada'] = Math.max(estado['proxima:rodada'] || 0, agora + 8000);
}
