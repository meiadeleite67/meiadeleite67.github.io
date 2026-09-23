import type { CSSProperties } from 'react';

/**
 * Uma caixa em três dimensões, feita com as transformações do próprio CSS:
 * seis faces, uma por lado, sem biblioteca nenhuma.
 *
 * É a peça com que estão feitos o troféu, o Cusco e o croupier da mesa de
 * poker. Os cantos redondos são o que tira a estas caixas o ar de caixote: um
 * cubo com os cantos bem redondos já se parece com uma coisa do mundo.
 */

export type Peca = {
  nome: string;
  /** largura, altura, fundura */
  w: number;
  h: number;
  d: number;
  /** onde fica, a contar do meio da figura */
  x: number;
  y: number;
  z: number;
  rz?: number;
  ry?: number;
  cor: string;
  /** Quanto se arredondam os cantos desta peça. */
  raio?: number;
  /** a que parte pertence, para as poses saberem o que mexer */
  grupo?: string;
};

export function Caixa({ peca, extra }: { peca: Peca; extra?: CSSProperties }) {
  const estilo = {
    '--w': `${peca.w}px`,
    '--h': `${peca.h}px`,
    '--d': `${peca.d}px`,
    '--x': `${peca.x}px`,
    '--y': `${peca.y}px`,
    '--z': `${peca.z}px`,
    '--rz': `${peca.rz ?? 0}deg`,
    '--ry': `${peca.ry ?? 0}deg`,
    '--cor': peca.cor,
    '--raio': `${peca.raio ?? 4}px`,
    ...extra
  } as CSSProperties;

  return (
    <div className={`caixa ${peca.nome}`} data-grupo={peca.grupo} style={estilo}>
      <i className="frente" />
      <i className="tras" />
      <i className="esq" />
      <i className="dir" />
      <i className="topo" />
      <i className="base" />
    </div>
  );
}
