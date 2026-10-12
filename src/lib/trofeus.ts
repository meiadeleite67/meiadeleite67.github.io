import type { Pontuacao } from './tipos';
export type TrofeuDoJogador = { id: string; nome: string; categoria: string; descricao: string; meta: number; valor: number; conquistado: boolean };
type Marco = { categoria: string; nome: string; unidade: string; singular?: string; metas: number[]; valor: (p: Pontuacao) => number };
const MARCOS: Marco[] = [
  { categoria: 'Torrões', nome: 'Rei do açúcar', unidade: 'torrões no saldo máximo', metas: [1000, 5000, 10000, 25000, 100000], valor: p => p.pico },
  { categoria: 'Blackjack', nome: 'Cliente da casa', unidade: 'mãos de blackjack', metas: [10, 50, 100, 500, 1000], valor: p => p.maos },
  { categoria: 'Blackjack', nome: 'Vinte e um', unidade: 'blackjacks', singular: 'blackjack', metas: [1, 10, 50, 100], valor: p => p.bjs },
  { categoria: 'Blackjack', nome: 'A casa paga', unidade: 'vitórias no blackjack', metas: [10, 50, 100, 500], valor: p => p.vitorias },
  { categoria: 'Poker', nome: 'Lugar habitual', unidade: 'mãos de poker', metas: [10, 50, 100, 500], valor: p => p.poquer?.maos || 0 },
  { categoria: 'Poker', nome: 'Dono do pote', unidade: 'vitórias no poker', singular: 'vitória no poker', metas: [1, 10, 50, 100], valor: p => p.poquer?.ganhas || 0 },
  { categoria: 'Poker', nome: 'Pote bem servido', unidade: 'torrões num único pote', metas: [500, 1000, 5000], valor: p => p.poquer?.maiorPote || 0 },
  { categoria: 'Roleta', nome: 'Mais uma volta', unidade: 'rodadas de roleta', metas: [10, 50, 100, 500], valor: p => p.roleta?.rodadas || 0 },
  { categoria: 'Roleta', nome: 'A bola sorriu', unidade: 'torrões num prémio de roleta', metas: [100, 1000, 5000], valor: p => p.roleta?.maior || 0 },
  { categoria: 'Apostas', nome: 'Olho no marcador', unidade: 'apostas desportivas', metas: [10, 50, 100], valor: p => p.desporto?.apostas || 0 },
  { categoria: 'Apostas', nome: 'Prognóstico certeiro', unidade: 'apostas desportivas ganhas', singular: 'aposta desportiva ganha', metas: [1, 10, 50], valor: p => p.desporto?.ganhas || 0 }
];
export function trofeusDe(p: Pontuacao): TrofeuDoJogador[] {
  return MARCOS.flatMap((m, grupo) => m.metas.map(meta => {
    const valor = Math.max(0, Number(m.valor(p)) || 0);
    return { id: `${grupo}-${meta}`, nome: m.nome, categoria: m.categoria, descricao: `${meta.toLocaleString('pt-PT')} ${meta === 1 && m.singular ? m.singular : m.unidade}`, meta, valor, conquistado: valor >= meta };
  }));
}
export function proximosTrofeus(trofeus: TrofeuDoJogador[]): TrofeuDoJogador[] {
  // Mostra só o próximo nível de cada marco, para evitar cinco metas iguais.
  const vistos = new Set<string>();
  return trofeus.filter(t => {
    if (t.conquistado || vistos.has(t.nome)) return false;
    vistos.add(t.nome); return true;
  }).sort((a, b) => b.valor / b.meta - a.valor / a.meta).slice(0, 3);
}
