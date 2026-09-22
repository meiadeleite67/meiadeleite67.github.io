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
  const cena = useRef<HTMLDivElement>(null);

  /* O troféu roda sozinho, mas segue o rato quando ele anda por perto: é o
     que dá a sensação de ser um objeto e não um desenho. */
  useEffect(() => {
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    const elemento = cena.current;
    if (!elemento) return;

    const aoMexer = (e: PointerEvent) => {
      const c = elemento.getBoundingClientRect();
      const dx = (e.clientX - (c.left + c.width / 2)) / c.width;
      const dy = (e.clientY - (c.top + c.height / 2)) / c.height;
      setInclinacao({
        x: Math.max(-1, Math.min(1, dy)) * -9,
        y: Math.max(-1, Math.min(1, dx)) * 22
      });
    };
    const aoSair = () => setInclinacao({ x: 0, y: 0 });

    window.addEventListener('pointermove', aoMexer);
    elemento.addEventListener('pointerleave', aoSair);
    return () => {
      window.removeEventListener('pointermove', aoMexer);
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
          '--inclina-y': `${inclinacao.y}deg`
        } as React.CSSProperties
      }
    >
      <div className="trofeu">
        <div className="placa">
          <div className="face frente">
            <PontoDeCruz />
            <div className="gravado">
              <span className="titulo">XXI Pixel d&apos;Ouro</span>
            </div>
          </div>
          <div className="face tras" />
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
