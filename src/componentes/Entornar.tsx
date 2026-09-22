import { useCallback, useEffect, useRef, useState } from 'react';

type Fase = 'nada' | 'correr';

/** Quanto tempo dura tudo, e em que instante a página troca por trás. */
const TUDO = 1350;
const TROCA = 600;

/**
 * A meia de leite a ser entornada entre páginas.
 *
 * O copo tomba, o jato cai da boca do copo e a bebida atravessa o ecrã de uma
 * ponta à outra sem parar, com a espuma à frente. A página troca no instante em
 * que o ecrã está tapado, por isso ninguém vê a troca.
 */
export function useEntornar() {
  const [fase, setFase] = useState<Fase>('nada');
  const ocupado = useRef(false);
  const relogios = useRef<number[]>([]);

  useEffect(() => () => relogios.current.forEach(clearTimeout), []);

  const entornar = useCallback((aMeio: () => void) => {
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      aMeio();
      return;
    }
    if (ocupado.current) return;
    ocupado.current = true;
    setFase('correr');
    relogios.current.push(
      window.setTimeout(() => {
        aMeio();
        window.scrollTo(0, 0);
      }, TROCA)
    );
    relogios.current.push(
      window.setTimeout(() => {
        setFase('nada');
        ocupado.current = false;
      }, TUDO)
    );
  }, []);

  return { fase, entornar };
}

/** O bordo do líquido: espuma clara à frente, café atrás, pingos a cair. */
function Bordo({ classe }: { classe: string }) {
  return (
    <svg className={classe} viewBox="0 0 1200 170" preserveAspectRatio="none" aria-hidden="true">
      <g fill="#F4E2C6">
        <path d="M0 0 H1200 V98 C1120 134 1040 80 950 106 C860 132 790 76 690 100 C590 124 510 72 410 98 C310 124 230 70 120 96 C72 108 40 102 0 94 Z" />
        <circle cx="998" cy="128" r="13" />
        <circle cx="741" cy="124" r="10" />
        <circle cx="462" cy="122" r="14" />
        <circle cx="171" cy="118" r="9" />
        <circle cx="1008" cy="152" r="7" />
        <circle cx="470" cy="150" r="6" />
      </g>
      <path
        d="M0 0 H1200 V76 C1120 112 1040 58 950 84 C860 110 790 54 690 78 C590 102 510 50 410 76 C310 102 230 48 120 74 C72 86 40 80 0 72 Z"
        fill="#7E4C27"
      />
    </svg>
  );
}

export function Entornar({ fase }: { fase: Fase }) {
  if (fase === 'nada') return null;
  return (
    <div className="spill correr" aria-hidden="true">
      <div className="spill-folha">
        <Bordo classe="bordo tras" />
        <div className="spill-corpo">
          <i className="risca r1" />
          <i className="risca r2" />
          <i className="risca r3" />
          <i className="risca r4" />
        </div>
        <Bordo classe="bordo frente" />
      </div>

      <div className="spill-copo">
        <svg className="jato" viewBox="0 0 60 400" preserveAspectRatio="none" aria-hidden="true">
          <defs>
            <linearGradient id="jato-cor" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#F4E2C6" />
              <stop offset="24%" stopColor="#D6A876" />
              <stop offset="62%" stopColor="#9A6437" />
              <stop offset="100%" stopColor="#8A5A30" stopOpacity="0" />
            </linearGradient>
          </defs>
          {/* larga na boca do copo, a afinar e a desfazer-se no fim */}
          <path
            d="M9 0 C7 64 15 112 19 184 C22 254 17 322 23 400 L41 400 C45 322 39 254 42 184 C46 112 53 64 51 0 Z"
            fill="url(#jato-cor)"
          />
        </svg>

        <svg className="copo" viewBox="0 0 92 138" aria-hidden="true">
          {/* o vidro */}
          <path
            d="M20 8 h52 l-5.5 108 a13 13 0 0 1 -13 12 h-15 a13 13 0 0 1 -13 -12 Z"
            fill="#EDE4DA"
            fillOpacity="0.22"
            stroke="#F6EEE2"
            strokeWidth="3"
            strokeLinejoin="round"
          />
          {/* a meia de leite lá dentro */}
          <g className="conteudo">
            <path d="M25 52 h42 l-3.6 62 a10 10 0 0 1 -10 9 h-15 a10 10 0 0 1 -10 -9 Z" fill="#6E4223" />
            <path d="M24.2 40 h43.6 l-1 12 h-41.6 Z" fill="#A9703C" />
            <rect x="23.4" y="30" width="45.2" height="11" rx="5" fill="#F4E2C6" />
          </g>
          {/* brilho do vidro */}
          <path d="M28 16 h7 l-4 100 h-6 Z" fill="#FFFFFF" fillOpacity="0.4" />
          <path d="M64 18 h3.4 l-3.4 96 h-3 Z" fill="#FFFFFF" fillOpacity="0.22" />
        </svg>
      </div>
    </div>
  );
}
