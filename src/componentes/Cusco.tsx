import { useMemo, type CSSProperties } from 'react';

/**
 * O Cusco em três dimensões, pela mesma receita do troféu: caixas feitas com
 * as transformações 3D do próprio CSS, seis faces cada uma, sem biblioteca
 * nenhuma. São vinte e sete caixas com os cantos bem redondos, que é o que
 * lhe tira o ar de caixote e lhe dá ar de bicho.
 *
 * As cores vieram das fotografias: o pelo acastanhado, o peito e o focinho
 * mais claros, o nariz preto e a coleira verde acinzentada que ele traz.
 *
 * Três poses, e todas são animações do CSS:
 *   parado    respira e abana a cauda
 *   bebe      baixa a cabeça ao copo e lambe
 *   feliz     salta e abana a cauda depressa
 *   rebenta   cada peça sai para o seu lado e desaparece
 */

export type Pose = 'parado' | 'bebe' | 'feliz' | 'rebenta';

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
  /** Quanto se arredondam os cantos desta peça. É o que tira o ar de caixote:
   *  um cubo com os cantos bem redondos já se parece com um bicho. */
  raio?: number;
  /** a que parte pertence, para as poses saberem o que mexer */
  grupo?: 'cabeca' | 'cauda' | 'corpo';
};

const PECAS: Peca[] = [
  /* O corpo é feito de três volumes que se sobrepõem, e não de um caixote só:
     é a sobreposição, com os cantos redondos, que lhe dá a barriga e o lombo
     em vez de arestas. */
  { nome: 'corpo', w: 110, h: 54, d: 52, x: 2, y: 0, z: 0, raio: 18, cor: PELO, grupo: 'corpo' },
  { nome: 'garupa', w: 48, h: 52, d: 50, x: -44, y: -1, z: 0, raio: 22, cor: PELO, grupo: 'corpo' },
  { nome: 'peito', w: 42, h: 52, d: 50, x: 44, y: 1, z: 0, raio: 20, cor: PELO, grupo: 'corpo' },
  { nome: 'barriga', w: 88, h: 18, d: 42, x: 4, y: 23, z: 0, raio: 9, cor: CREME, grupo: 'corpo' },

  { nome: 'pescoco', w: 32, h: 36, d: 34, x: 64, y: -22, z: 0, raio: 14, cor: PELO, grupo: 'cabeca' },
  { nome: 'coleira', w: 9, h: 37, d: 36, x: 69, y: -20, z: 0, raio: 5, cor: COLEIRA, grupo: 'cabeca' },

  { nome: 'cabeca', w: 50, h: 42, d: 44, x: 92, y: -44, z: 0, raio: 18, cor: PELO, grupo: 'cabeca' },
  { nome: 'testa', w: 40, h: 18, d: 38, x: 94, y: -60, z: 0, raio: 12, cor: PELO, grupo: 'cabeca' },
  { nome: 'focinho', w: 30, h: 20, d: 24, x: 120, y: -38, z: 0, raio: 9, cor: PELO_CLARO, grupo: 'cabeca' },
  { nome: 'queixo', w: 26, h: 9, d: 19, x: 119, y: -28, z: 0, raio: 4, cor: CREME, grupo: 'cabeca' },
  { nome: 'nariz', w: 12, h: 10, d: 14, x: 136, y: -42, z: 0, raio: 5, cor: ESCURO, grupo: 'cabeca' },

  /* Os olhos tinham de ficar à tona: estavam a menos fundura do que a própria
     cabeça e ficavam enterrados lá dentro, sem se verem. */
  { nome: 'olho-esq', w: 10, h: 11, d: 10, x: 108, y: -54, z: -19, raio: 5, cor: ESCURO, grupo: 'cabeca' },
  { nome: 'olho-dir', w: 10, h: 11, d: 10, x: 108, y: -54, z: 19, raio: 5, cor: ESCURO, grupo: 'cabeca' },
  { nome: 'luz-esq', w: 4, h: 4, d: 4, x: 111, y: -57, z: -22, raio: 2, cor: '#ffffff', grupo: 'cabeca' },
  { nome: 'luz-dir', w: 4, h: 4, d: 4, x: 111, y: -57, z: 22, raio: 2, cor: '#ffffff', grupo: 'cabeca' },

  { nome: 'orelha-esq', w: 15, h: 40, d: 10, x: 79, y: -40, z: -23, rz: -12, raio: 7, cor: PELO_CLARO, grupo: 'cabeca' },
  { nome: 'orelha-dir', w: 15, h: 40, d: 10, x: 79, y: -40, z: 23, rz: -12, raio: 7, cor: PELO_CLARO, grupo: 'cabeca' },

  { nome: 'pata-fe', w: 15, h: 42, d: 15, x: 52, y: 46, z: -17, raio: 7, cor: PELO, grupo: 'corpo' },
  { nome: 'pata-fd', w: 15, h: 42, d: 15, x: 52, y: 46, z: 17, raio: 7, cor: PELO, grupo: 'corpo' },
  { nome: 'pata-te', w: 15, h: 42, d: 15, x: -42, y: 46, z: -17, raio: 7, cor: PELO, grupo: 'corpo' },
  { nome: 'pata-td', w: 15, h: 42, d: 15, x: -42, y: 46, z: 17, raio: 7, cor: PELO, grupo: 'corpo' },
  { nome: 'pe-fe', w: 17, h: 11, d: 18, x: 53, y: 70, z: -17, raio: 5, cor: CREME, grupo: 'corpo' },
  { nome: 'pe-fd', w: 17, h: 11, d: 18, x: 53, y: 70, z: 17, raio: 5, cor: CREME, grupo: 'corpo' },
  { nome: 'pe-te', w: 17, h: 11, d: 18, x: -41, y: 70, z: -17, raio: 5, cor: CREME, grupo: 'corpo' },
  { nome: 'pe-td', w: 17, h: 11, d: 18, x: -41, y: 70, z: 17, raio: 5, cor: CREME, grupo: 'corpo' },

  /* A cauda e uma peca so. Com a ponta a parte, o abanar deixava-a para tras:
     cada peca roda sobre o seu proprio eixo, e a ponta nunca acompanhava a
     raiz. */
  { nome: 'cauda', w: 12, h: 38, d: 12, x: -68, y: -4, z: 0, rz: -24, raio: 6, cor: PELO_CLARO, grupo: 'cauda' }
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
    '--raio': `${peca.raio ?? 4}px`,
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
