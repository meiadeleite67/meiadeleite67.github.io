import { useEffect, useRef, useState } from 'react';

/**
 * O Pixel d'Ouro, em três dimensões e sem biblioteca nenhuma.
 *
 * O troféu é uma placa de acrílico transparente sobre uma base escura, o que
 * é geometria simples: faz-se com as transformações 3D do próprio CSS, com
 * uma face à frente, outra atrás e quatro bordos finos a fazer a espessura.
 * Zero bytes de biblioteca.
 *
 * O P é bordado a ponto de cruz na placa verdadeira, e ponto de cruz é uma
 * grelha: desenha-se marcando as casas de uma matriz. Não é decalque do
 * original, é a mesma ideia com a mesma técnica.
 */

const P_EM_PONTO_DE_CRUZ = [
  '................',
  '...XXXXXXXXX....',
  '...XXXXXXXXXX...',
  '...XX.......XX..',
  '...XX........XX.',
  '...XX........XX.',
  '...XX........XX.',
  '...XX.......XX..',
  '...XXXXXXXXXX...',
  '...XXXXXXXXX....',
  '...XX...........',
  '...XX...........',
  '...XX...........',
  '...XX...........',
  '..XXXXXX........',
  '..XXXXXX........'
];

const CELA = 9;

/** Onde é que a rotação automática vai neste instante, para quem lhe pega
 *  continuar de onde ela estava e o troféu não dar um salto. */
function anguloDeAgora(cena: HTMLElement): number {
  const trofeu = cena.querySelector('.trofeu');
  if (!trofeu) return 0;
  const r = getComputedStyle(trofeu).rotate;
  const graus = /(-?[\d.]+)deg/.exec(r || '');
  return graus ? Number(graus[1]) : 0;
}

function PontoDeCruz() {
  const marcas: JSX.Element[] = [];
  P_EM_PONTO_DE_CRUZ.forEach((linha, y) => {
    [...linha].forEach((c, x) => {
      if (c !== 'X') return;
      const cx = x * CELA;
      const cy = y * CELA;
      const m = 1.4;
      marcas.push(
        <path
          key={`${x}-${y}`}
          d={`M${cx + m} ${cy + m} L${cx + CELA - m} ${cy + CELA - m} M${cx + CELA - m} ${cy + m} L${cx + m} ${cy + CELA - m}`}
        />
      );
    });
  });
  return (
    <svg
      className="ponto-de-cruz"
      viewBox={`0 0 ${16 * CELA} ${16 * CELA}`}
      aria-hidden="true"
      stroke="#8FAEDE"
      strokeWidth="2.1"
      strokeLinecap="round"
      fill="none"
    >
      {marcas}
    </svg>
  );
}

export function Trofeu() {
  const [inclinacao, setInclinacao] = useState({ x: 0, y: 0 });
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

  /* Com rato, o troféu segue o cursor quando ele anda por perto. Com dedo não
     há cursor nenhum, por isso roda-se arrastando: é o que dá a sensação de
     ser um objeto e não um desenho. */
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
      setInclinacao({ x: 0, y: 0 });
      elemento.setPointerCapture?.(e.pointerId);
    };

    const aoMexer = (e: PointerEvent) => {
      const a = arrasto.current;
      if (a.ativo) {
        porAMao({
          x: Math.max(-26, Math.min(26, a.rx - (e.clientY - a.y) * 0.35)),
          y: a.ry + (e.clientX - a.x) * 0.6
        });
        return;
      }
      if (e.pointerType !== 'mouse') return;
      const c = elemento.getBoundingClientRect();
      const dx = (e.clientX - (c.left + c.width / 2)) / c.width;
      const dy = (e.clientY - (c.top + c.height / 2)) / c.height;
      setInclinacao({
        x: Math.max(-1, Math.min(1, dy)) * -9,
        y: Math.max(-1, Math.min(1, dx)) * 22
      });
    };

    const aoLargar = () => {
      if (!arrasto.current.ativo) return;
      arrasto.current.ativo = false;
      // uns segundos quieto e ele volta a rodar sozinho
      voltarSozinho.current = window.setTimeout(() => porAMao(null), 3500);
    };

    const aoSair = () => {
      if (!arrasto.current.ativo) setInclinacao({ x: 0, y: 0 });
    };

    elemento.addEventListener('pointerdown', aoPegar);
    window.addEventListener('pointermove', aoMexer);
    window.addEventListener('pointerup', aoLargar);
    window.addEventListener('pointercancel', aoLargar);
    elemento.addEventListener('pointerleave', aoSair);
    return () => {
      clearTimeout(voltarSozinho.current);
      elemento.removeEventListener('pointerdown', aoPegar);
      window.removeEventListener('pointermove', aoMexer);
      window.removeEventListener('pointerup', aoLargar);
      window.removeEventListener('pointercancel', aoLargar);
      elemento.removeEventListener('pointerleave', aoSair);
    };
  }, []);

  return (
    <div
      className="trofeu-cena"
      ref={cena}
      aria-label="O troféu do XXI Pixel d'Ouro, Grupo do Ano"
      role="img"
      style={
        {
          '--inclina-x': `${inclinacao.x}deg`,
          '--inclina-y': `${inclinacao.y}deg`,
          '--gira-x': `${aMao?.x ?? 0}deg`,
          '--gira-y': `${aMao?.y ?? 0}deg`
        } as React.CSSProperties
      }
    >
      <div className={`trofeu${aMao ? ' a-mao' : ''}`}>
        <div className="placa">
          <div className="face frente">
            <PontoDeCruz />
            <div className="gravado">
              <span className="titulo">XXI Pixel d&apos;Ouro</span>
            </div>
          </div>
          {/* O gravado está dentro do acrílico, por isso vê-se também de trás,
              ao contrário e mais apagado por causa do vidro pelo meio. Sem
              isto, dar meia volta ao troféu mostrava uma placa lisa. */}
          <div className="face tras">
            <div className="ao-contrario">
              <PontoDeCruz />
              <div className="gravado">
                <span className="titulo">XXI Pixel d&apos;Ouro</span>
              </div>
            </div>
          </div>
          <div className="bordo cima" />
          <div className="bordo baixo" />
          <div className="bordo esquerdo" />
          <div className="bordo direito" />
          <div className="brilho" />
        </div>

        <div className="base">
          {/* o texto vai no plano inclinado logo por baixo da placa, que é
              onde ele está no troféu verdadeiro */}
          <div className="base-topo">
            <span>Grupo do Ano</span>
          </div>
          <div className="base-frente" />
        </div>

        <div className="sombra" />
      </div>
    </div>
  );
}
