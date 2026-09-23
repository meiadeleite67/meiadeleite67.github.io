import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { api, enderecoDoMedia } from '../lib/api';
import type { ItemDaGaleria } from '../lib/tipos';

/**
 * A galeria da mascote: uma fila de miniaturas que abre numa lupa por cima da
 * página, uma coisa de cada vez.
 *
 * A lupa deixa aproximar as fotos, com a roda do rato, com dois dedos, ou com
 * dois toques seguidos. Enquanto estiver aproximada, arrastar passeia a foto
 * em vez de mudar de imagem, que é o que se espera de uma lupa.
 */

const MAIS_PERTO = 5;
const AO_DOBRO = 2.5;

const entre = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));

export function Galeria({ dono }: { dono: string }) {
  const [itens, setItens] = useState<ItemDaGaleria[]>([]);
  const [aberto, setAberto] = useState<number | null>(null);

  useEffect(() => {
    let vivo = true;
    api
      .galeria(dono)
      .then((l) => vivo && setItens(l))
      .catch(() => vivo && setItens([]));
    return () => {
      vivo = false;
    };
  }, [dono]);

  if (itens.length === 0) return null;

  return (
    <>
      <div className="galeria">
        {itens.map((item, i) => (
          <button
            key={item.id}
            type="button"
            className="galeria-tira"
            onClick={() => setAberto(i)}
            aria-label={item.legenda || (item.tipo === 'video' ? 'Ver o vídeo' : 'Ver a foto')}
          >
            {item.tipo === 'video' ? (
              <>
                <video src={enderecoDoMedia(item)} muted playsInline preload="metadata" />
                <span className="galeria-play" aria-hidden="true">
                  <svg viewBox="0 0 24 24" fill="currentColor">
                    <path d="M8 5.5v13l11-6.5z" />
                  </svg>
                </span>
              </>
            ) : (
              <img src={enderecoDoMedia(item)} alt={item.legenda} loading="lazy" />
            )}
          </button>
        ))}
      </div>

      {aberto !== null && (
        <Lupa itens={itens} onde={aberto} mudar={setAberto} fechar={() => setAberto(null)} />
      )}
    </>
  );
}

function Lupa({
  itens,
  onde,
  mudar,
  fechar
}: {
  itens: ItemDaGaleria[];
  onde: number;
  mudar: (n: number) => void;
  fechar: () => void;
}) {
  const item = itens[onde];
  const [perto, setPerto] = useState(1);
  const [desvio, setDesvio] = useState({ x: 0, y: 0 });
  /* Os dedos que estão em cima da imagem neste momento. Com dois, a distância
     entre eles é que manda no zoom. */
  const dedos = useRef(new Map<number, { x: number; y: number }>());
  const arrasto = useRef({ ativo: false, x: 0, y: 0, dx: 0, dy: 0 });
  const entreDedos = useRef(0);
  const pertoAgora = useRef(1);

  const porPerto = useCallback((n: number) => {
    const preso = entre(n, 1, MAIS_PERTO);
    pertoAgora.current = preso;
    setPerto(preso);
    if (preso === 1) setDesvio({ x: 0, y: 0 });
  }, []);

  // cada imagem nova começa de longe e ao centro
  useEffect(() => {
    porPerto(1);
    setDesvio({ x: 0, y: 0 });
  }, [onde, porPerto]);

  const anterior = useCallback(() => mudar((onde - 1 + itens.length) % itens.length), [onde, itens.length, mudar]);
  const seguinte = useCallback(() => mudar((onde + 1) % itens.length), [onde, itens.length, mudar]);

  /* teclas, e a página por baixo fica quieta enquanto isto está aberto */
  useEffect(() => {
    const aoCarregar = (e: KeyboardEvent) => {
      if (e.key === 'Escape') fechar();
      if (e.key === 'ArrowLeft') anterior();
      if (e.key === 'ArrowRight') seguinte();
      if (e.key === '+' || e.key === '=') porPerto(pertoAgora.current + 0.5);
      if (e.key === '-') porPerto(pertoAgora.current - 0.5);
    };
    window.addEventListener('keydown', aoCarregar);
    const comoEstava = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', aoCarregar);
      document.body.style.overflow = comoEstava;
    };
  }, [fechar, anterior, seguinte, porPerto]);

  const daRoda = (e: React.WheelEvent) => {
    if (item.tipo === 'video') return;
    e.preventDefault();
    porPerto(pertoAgora.current * (e.deltaY < 0 ? 1.18 : 0.85));
  };

  const aoPegar = (e: React.PointerEvent) => {
    if (item.tipo === 'video') return;
    dedos.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    if (dedos.current.size === 2) {
      const [a, b] = [...dedos.current.values()];
      entreDedos.current = Math.hypot(a.x - b.x, a.y - b.y);
      arrasto.current.ativo = false;
      return;
    }
    if (pertoAgora.current > 1) {
      arrasto.current = { ativo: true, x: e.clientX, y: e.clientY, dx: desvio.x, dy: desvio.y };
    }
  };

  const aoMexer = (e: React.PointerEvent) => {
    if (!dedos.current.has(e.pointerId)) return;
    dedos.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (dedos.current.size === 2) {
      const [a, b] = [...dedos.current.values()];
      const agora = Math.hypot(a.x - b.x, a.y - b.y);
      if (entreDedos.current > 0) porPerto(pertoAgora.current * (agora / entreDedos.current));
      entreDedos.current = agora;
      return;
    }
    if (!arrasto.current.ativo) return;
    const a = arrasto.current;
    // a folga cresce com o zoom, senão não havia para onde passear
    const limite = 220 * (pertoAgora.current - 1);
    setDesvio({
      x: entre(a.dx + (e.clientX - a.x), -limite, limite),
      y: entre(a.dy + (e.clientY - a.y), -limite, limite)
    });
  };

  const aoLargar = (e: React.PointerEvent) => {
    dedos.current.delete(e.pointerId);
    if (dedos.current.size < 2) entreDedos.current = 0;
    if (dedos.current.size === 0) arrasto.current.ativo = false;
  };

  /* A lupa e desenhada no corpo da pagina e nao onde esta escrita. A pagina
     vive dentro de um <main> com animacao de troca, e uma animacao dessas faz
     dele um mundo a parte: o que la esta dentro nunca consegue ficar por cima
     do cabecalho, por mais que se lhe mande. */
  return createPortal(
    <div
      className="lupa"
      role="dialog"
      aria-modal="true"
      onPointerDown={(e) => e.target === e.currentTarget && fechar()}
    >
      <div className="lupa-topo">
        <span className="lupa-conta">
          {onde + 1} de {itens.length}
        </span>
        <div className="lupa-botoes">
          {item.tipo === 'foto' && (
            <>
              <button type="button" aria-label="Afastar" onClick={() => porPerto(perto - 0.5)}>
                &minus;
              </button>
              <button type="button" aria-label="Aproximar" onClick={() => porPerto(perto + 0.5)}>
                +
              </button>
            </>
          )}
          <button type="button" aria-label="Fechar" onClick={fechar}>
            &times;
          </button>
        </div>
      </div>

      {itens.length > 1 && (
        <button type="button" className="lupa-seta esquerda" aria-label="A anterior" onClick={anterior}>
          &lsaquo;
        </button>
      )}

      <div
        className={`lupa-palco${perto > 1 ? ' perto' : ''}`}
        onWheel={daRoda}
        onPointerDown={aoPegar}
        onPointerMove={aoMexer}
        onPointerUp={aoLargar}
        onPointerCancel={aoLargar}
        onDoubleClick={() => porPerto(perto > 1 ? 1 : AO_DOBRO)}
      >
        {item.tipo === 'video' ? (
          <video src={enderecoDoMedia(item)} controls autoPlay playsInline />
        ) : (
          <img
            src={enderecoDoMedia(item)}
            alt={item.legenda}
            draggable={false}
            style={{ transform: `translate(${desvio.x}px, ${desvio.y}px) scale(${perto})` }}
          />
        )}
      </div>

      {itens.length > 1 && (
        <button type="button" className="lupa-seta direita" aria-label="A seguinte" onClick={seguinte}>
          &rsaquo;
        </button>
      )}

      {item.legenda && <p className="lupa-legenda">{item.legenda}</p>}
    </div>,
    document.body
  );
}
