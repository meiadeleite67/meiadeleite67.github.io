import { useMemo, type CSSProperties } from 'react';

/**
 * O Cusco em três dimensões, pela mesma receita do troféu: caixas feitas com
 * as transformações 3D do próprio CSS, seis faces cada uma, sem biblioteca
 * nenhuma. Ele é feito de dezasseis caixas, e é isso que lhe dá o ar de
 * brinquedo de madeira em vez de cão a sério, que é o que queremos.
 *
 * As cores vieram das fotografias: o pelo acastanhado, o peito e o focinho
 * mais claros, o nariz preto e a coleira verde acinzentada que ele traz.
 *
 * Três poses, e todas são animações do CSS:
 *   parado    respira e abana a cauda
 *   bebe      baixa a cabeça ao copo e lambe
 *   feliz     salta e abana a cauda depressa
 *   nojo      vira a cara e estremece
 *   rebenta   cada peça sai para o seu lado e desaparece
 */

export type Pose = 'parado' | 'bebe' | 'feliz' | 'nojo' | 'rebenta';

const PELO = '#c87a3c';
const PELO_CLARO = '#e2a96a';
const CREME = '#efd4ad';
const ESCURO = '#2a1a11';
const COLEIRA = '#9cae8d';

type Peca = {
  nome: string;
  /** largura, altura, fundura */
  w: number;
  h: number;
  d: number;
  /** onde fica, a contar do meio do cão */
  x: number;
  y: number;
  z: number;
  rz?: number;
  ry?: number;
  cor: string;
  /** a que parte pertence, para as poses saberem o que mexer */
  grupo?: 'cabeca' | 'cauda' | 'corpo';
};

const PECAS: Peca[] = [
  { nome: 'corpo', w: 116, h: 56, d: 54, x: 0, y: 0, z: 0, cor: PELO, grupo: 'corpo' },
  { nome: 'barriga', w: 96, h: 18, d: 46, x: 2, y: 22, z: 0, cor: CREME, grupo: 'corpo' },
  { nome: 'anca', w: 40, h: 54, d: 52, x: -48, y: -2, z: 0, cor: PELO, grupo: 'corpo' },
  { nome: 'peito', w: 34, h: 50, d: 50, x: 52, y: 2, z: 0, cor: PELO, grupo: 'corpo' },

  { nome: 'pescoco', w: 30, h: 34, d: 36, x: 66, y: -20, z: 0, cor: PELO, grupo: 'cabeca' },
  { nome: 'coleira', w: 9, h: 36, d: 38, x: 70, y: -18, z: 0, cor: COLEIRA, grupo: 'cabeca' },
  { nome: 'cabeca', w: 52, h: 44, d: 46, x: 92, y: -44, z: 0, cor: PELO, grupo: 'cabeca' },
  { nome: 'focinho', w: 34, h: 22, d: 24, x: 124, y: -36, z: 0, cor: CREME, grupo: 'cabeca' },
  { nome: 'nariz', w: 9, h: 9, d: 12, x: 143, y: -40, z: 0, cor: ESCURO, grupo: 'cabeca' },
  { nome: 'olho-esq', w: 6, h: 7, d: 6, x: 112, y: -54, z: -15, cor: ESCURO, grupo: 'cabeca' },
  { nome: 'olho-dir', w: 6, h: 7, d: 6, x: 112, y: -54, z: 15, cor: ESCURO, grupo: 'cabeca' },
  { nome: 'orelha-esq', w: 13, h: 38, d: 8, x: 86, y: -36, z: -24, rz: -8, cor: PELO_CLARO, grupo: 'cabeca' },
  { nome: 'orelha-dir', w: 13, h: 38, d: 8, x: 86, y: -36, z: 24, rz: -8, cor: PELO_CLARO, grupo: 'cabeca' },

  { nome: 'pata-fe', w: 15, h: 46, d: 15, x: 46, y: 46, z: -17, cor: PELO, grupo: 'corpo' },
  { nome: 'pata-fd', w: 15, h: 46, d: 15, x: 46, y: 46, z: 17, cor: PELO, grupo: 'corpo' },
  { nome: 'pata-te', w: 15, h: 46, d: 15, x: -44, y: 46, z: -17, cor: PELO, grupo: 'corpo' },
  { nome: 'pata-td', w: 15, h: 46, d: 15, x: -44, y: 46, z: 17, cor: PELO, grupo: 'corpo' },

  { nome: 'cauda', w: 11, h: 36, d: 11, x: -70, y: -18, z: 0, rz: 38, cor: PELO_CLARO, grupo: 'cauda' }
];

/** Para onde cada peça sai quando ele rebenta. Fica decidido uma vez e não a
 *  cada imagem, para a explosão ser sempre a mesma enquanto dura. */
function paraOndeVoam(): Record<string, CSSProperties> {
  const saidas: Record<string, CSSProperties> = {};
  PECAS.forEach((p, i) => {
    const angulo = (i / PECAS.length) * Math.PI * 2 + (p.x / 200);
    const forca = 130 + ((i * 37) % 90);
    saidas[p.nome] = {
      '--vx': `${Math.cos(angulo) * forca + p.x * 0.6}px`,
      '--vy': `${Math.sin(angulo) * forca - 60}px`,
      '--giro': `${((i * 97) % 360) - 180}deg`,
      '--atraso': `${(i % 5) * 18}ms`
    } as CSSProperties;
  });
  return saidas;
}

function Caixa({ peca, voo }: { peca: Peca; voo?: CSSProperties }) {
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
    ...voo
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

export function Cusco({ pose }: { pose: Pose }) {
  const voos = useMemo(paraOndeVoam, []);

  return (
    <div className="cusco-cena">
      <div className="cusco" data-pose={pose} aria-label="O Cusco" role="img">
        {PECAS.map((p) => (
          <Caixa key={p.nome} peca={p} voo={pose === 'rebenta' ? voos[p.nome] : undefined} />
        ))}
      </div>
      <div className="cusco-sombra" data-pose={pose} />
      {pose === 'rebenta' && <div className="cusco-clarao" aria-hidden="true" />}
    </div>
  );
}
