import { useEffect, useRef, useState } from 'react';

/**
 * O Pixel d'Ouro, em três dimensões e sem biblioteca nenhuma.
 *
 * O troféu é uma placa de acrílico encaixada numa lâmina de vidro igualmente
 * transparente. Isso é
 * geometria simples: faz-se com as transformações 3D do próprio CSS, uma face
 * à frente, outra atrás e os bordos a fazer a espessura. Zero bytes de
 * biblioteca.
 *
 * O P não foi desenhado a olho. A foto do troféu foi passada por um filtro
 * que separa os pontos azuis da madeira da mesa, e a grelha abaixo é o que
 * saiu de lá, casa a casa. Por isso é um P manuscrito e não um P de imprensa:
 * é o que está bordado na placa verdadeira.
 */

const P_EM_PONTO_DE_CRUZ = [
  '....................XXXXXXXX.....',
  '................XXXXXXXXXXXXXXX..',
  '..............XXXXXX....XXXXXXX..',
  '.............XXX........XXXXXXXX.',
  '..........XXX..........XXXXXXXXX.',
  '.........XXX.........XXX....XXXXX',
  '........XXX.........XXX.....XXXXX',
  '......XXXX.........XXX......XXXXX',
  '.....XXXX.........XXXX......XXXX.',
  '.....XXX.........XXXXX......XXXX.',
  '....XXX..........XXXX......XXXXX.',
  '...XXXX.........XXXX......XXXXX..',
  '...XXX..........XXXX......XXXX...',
  '...XXX..........XXXX.....XXXX....',
  '..XXXX.........XXXXX.XXXXXX......',
  '..XXXX........XXXXX..XXX.........',
  '...XXXX.....XXXXXXX..............',
  '...XXXXX...XXXXXXXX..............',
  '....XXXXXXXXXXXXXXX..............',
  '.....XXXXXX.XXXXXX...............',
  '.............XXXX................',
  '............XXXXX................',
  '............XXXX.................',
  '............XXXX.................',
  '.XX........XXXX..................',
  'XXXX......XXXX...................',
  'XXXXX...XXX......................',
  '.XXXXXXXX........................'
];

const CELA = 9;
const COLUNAS = P_EM_PONTO_DE_CRUZ[0].length;
const LINHAS = P_EM_PONTO_DE_CRUZ.length;

/** A banda de pontos que corre ao longo do bordo de cima da placa. */
const PONTOS_DA_BANDA = 34;

/** Onde é que a rotação automática vai neste instante, para quem lhe pega
 *  continuar de onde ela estava e o troféu não dar um salto. */
function anguloDeAgora(cena: HTMLElement): number {
  const trofeu = cena.querySelector('.trofeu');
  if (!trofeu) return 0;
  const r = getComputedStyle(trofeu).rotate;
  const graus = /(-?[\d.]+)deg/.exec(r || '');
  return graus ? Number(graus[1]) : 0;
}

/** Um ponto de cruz: duas linhas em xis dentro da sua casa da grelha. */
function cruz(x: number, y: number, margem = 1.4): string {
  const cx = x * CELA;
  const cy = y * CELA;
  const a = `M${cx + margem} ${cy + margem} L${cx + CELA - margem} ${cy + CELA - margem}`;
  const b = `M${cx + CELA - margem} ${cy + margem} L${cx + margem} ${cy + CELA - margem}`;
  return `${a} ${b}`;
}

function PontoDeCruz() {
  const marcas: JSX.Element[] = [];
  P_EM_PONTO_DE_CRUZ.forEach((linha, y) => {
    [...linha].forEach((c, x) => {
      if (c === 'X') marcas.push(<path key={`${x}-${y}`} d={cruz(x, y)} />);
    });
  });
  return (
    <svg
      className="ponto-de-cruz"
      viewBox={`0 0 ${COLUNAS * CELA} ${LINHAS * CELA}`}
      aria-hidden="true"
      stroke="#a3c2ea"
      strokeWidth="2.2"
      strokeLinecap="round"
      fill="none"
    >
      {marcas}
    </svg>
  );
}

/** A mesma linha bordada que percorre o topo do troféu verdadeiro. */
function Banda() {
  const marcas: JSX.Element[] = [];
  for (let x = 0; x < PONTOS_DA_BANDA; x++) marcas.push(<path key={x} d={cruz(x, x % 2)} />);
  return (
    <svg
      className="banda"
      viewBox={`0 0 ${PONTOS_DA_BANDA * CELA} ${2 * CELA}`}
      preserveAspectRatio="none"
      aria-hidden="true"
      stroke="#cfe0f4"
      strokeWidth="2"
      strokeLinecap="round"
      fill="none"
    >
      {marcas}
    </svg>
  );
}

function CaraDaPlaca() {
  return (
    <>
      <PontoDeCruz />
      <span className="gravado">XXI Pixel d&apos;Ouro</span>
    </>
  );
}

export function Trofeu() {
  /** Ângulo posto à mão. Nulo quer dizer que o troféu roda sozinho. */
  const [aMao, setAMao] = useState<{ x: number; y: number } | null>(null);
  const cena = useRef<HTMLDivElement>(null);
  const arrasto = useRef<{ ativo: boolean; x: number; y: number; rx: number; ry: number }>({
    ativo: false,
    x: 0,
    y: 0,
    rx: 0,
    ry: 0
  });
  const voltarSozinho = useRef<number>();
  /* O mesmo ângulo, guardado à parte: os ouvintes de eventos leem daqui, para
     não ser preciso voltar a instalá-los a cada movimento do dedo. */
  const aMaoAgora = useRef<{ x: number; y: number } | null>(null);
  const porAMao = (v: { x: number; y: number } | null) => {
    aMaoAgora.current = v;
    setAMao(v);
  };

  /* Roda-se arrastando, com o rato ou com o dedo, e para onde se quiser.
     Seguir o cursor por perto ficava agitado e nunca deixava ninguém pousar
     o troféu no ângulo que queria. */
  useEffect(() => {
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    const elemento = cena.current;
    if (!elemento) return;

    const aoPegar = (e: PointerEvent) => {
      clearTimeout(voltarSozinho.current);
      const a = arrasto.current;
      a.ativo = true;
      a.x = e.clientX;
      a.y = e.clientY;
      const atual = aMaoAgora.current ?? { x: 0, y: anguloDeAgora(elemento) };
      a.rx = atual.x;
      a.ry = atual.y;
      porAMao(atual);
      elemento.setPointerCapture?.(e.pointerId);
    };

    const aoMexer = (e: PointerEvent) => {
      const a = arrasto.current;
      if (!a.ativo) return;
      porAMao({
        x: Math.max(-34, Math.min(34, a.rx - (e.clientY - a.y) * 0.35)),
        y: a.ry + (e.clientX - a.x) * 0.6
      });
    };

    const aoLargar = () => {
      if (!arrasto.current.ativo) return;
      arrasto.current.ativo = false;
      // uns segundos quieto e ele volta a rodar sozinho
      voltarSozinho.current = window.setTimeout(() => porAMao(null), 3500);
    };

    elemento.addEventListener('pointerdown', aoPegar);
    window.addEventListener('pointermove', aoMexer);
    window.addEventListener('pointerup', aoLargar);
    window.addEventListener('pointercancel', aoLargar);
    return () => {
      clearTimeout(voltarSozinho.current);
      elemento.removeEventListener('pointerdown', aoPegar);
      window.removeEventListener('pointermove', aoMexer);
      window.removeEventListener('pointerup', aoLargar);
      window.removeEventListener('pointercancel', aoLargar);
    };
  }, []);

  return (
    <div
      className="trofeu-cena"
      ref={cena}
      aria-label="O troféu do XXI Pixel d'Ouro, Grupo d'Ano"
      role="img"
      style={
        {
          '--gira-x': `${aMao?.x ?? 0}deg`,
          '--gira-y': `${aMao?.y ?? 0}deg`
        } as React.CSSProperties
      }
    >
      <div className={`trofeu${aMao ? ' a-mao' : ''}`}>
        <div className="placa">
          <div className="face frente">
            <CaraDaPlaca />
          </div>
          {/* O bordado está dentro do acrílico, por isso vê-se também de trás,
              ao contrário e mais apagado por causa do vidro pelo meio. Sem
              isto, dar meia volta ao troféu mostrava uma placa lisa. */}
          <div className="face tras">
            <div className="ao-contrario">
              <CaraDaPlaca />
            </div>
          </div>
          <div className="bordo cima">
            <Banda />
          </div>
          <div className="bordo esquerdo" />
          <div className="bordo direito" />
          <div className="brilho" />
        </div>

        <div className="base">
          <div className="base-face base-tras" />
          <div className="base-face base-lado esq" />
          <div className="base-face base-lado dir" />
          <div className="base-face base-topo">
            <span>Grupo d&apos;Ano</span>
          </div>
          <div className="base-face base-frente" />
        </div>

        <div className="sombra" />
      </div>
    </div>
  );
}
