import { useCallback, useEffect, useState } from 'react';
import { Entornar, useEntornar } from './componentes/Entornar';
import { Inicio } from './componentes/Inicio';
import { Blackjack } from './componentes/Blackjack';
import { Mural } from './componentes/Mural';
import { Agenda } from './componentes/Agenda';
import { Rodape } from './componentes/Rodape';
import { api } from './lib/api';
import { PAGINAS, TODAS_AS_PAGINAS } from './lib/dados';
import type { Estado, Pagina } from './lib/tipos';

const VAZIO: Estado = { agenda: [], insta: [], ranking: [] };

/** A página vem do endereço: /blackjack, /agenda, /admin. Os links podem ser
 *  partilhados e a de admin existe sem estar em sítio nenhum à vista. */
function paginaDoEndereco(): Pagina {
  const p = window.location.pathname.replace(/^\/+|\/+$/g, '');
  return (TODAS_AS_PAGINAS as string[]).includes(p) ? (p as Pagina) : 'inicio';
}

const enderecoDe = (p: Pagina) => (p === 'inicio' ? '/' : `/${p}`);

export default function App() {
  const [pagina, setPagina] = useState<Pagina>(paginaDoEndereco);
  const [estado, setEstado] = useState<Estado>(VAZIO);
  const { fase, entornar } = useEntornar();

  const recarregar = useCallback(async () => {
    try {
      setEstado(await api.estado());
    } catch {
      /* sem rede o site fica com o que já tinha */
    }
  }, []);

  // uma leitura ao entrar e depois de cinco em cinco segundos, para o que o
  // admin marca aparecer aos outros sem ninguém recarregar a página
  useEffect(() => {
    recarregar();
    const t = window.setInterval(recarregar, 5000);
    return () => clearInterval(t);
  }, [recarregar]);

  const irPara = useCallback(
    (p: Pagina) => {
      if (p === pagina) return;
      entornar(() => {
        setPagina(p);
        if (paginaDoEndereco() !== p) window.history.pushState({}, '', enderecoDe(p));
        window.scrollTo(0, 0);
      });
    },
    [pagina, entornar]
  );

  // o voltar atrás e o seguinte do browser
  useEffect(() => {
    const aoMudar = () => {
      const nova = paginaDoEndereco();
      if (nova !== pagina) entornar(() => setPagina(nova));
    };
    window.addEventListener('popstate', aoMudar);
    return () => window.removeEventListener('popstate', aoMudar);
  }, [pagina, entornar]);

  return (
    <>
      <header className="bar">
        <div className="bar-in">
          <button
            className="marca"
            type="button"
            onClick={() => irPara('inicio')}
            style={{ background: 'none', border: 0, padding: 0, color: 'inherit' }}
          >
            <svg width="24" height="32" viewBox="0 0 30 40" aria-hidden="true">
              <path d="M5 3 h20 l-2.5 32 a4 4 0 0 1 -4 3.6 h-7 a4 4 0 0 1 -4 -3.6 Z" fill="#F0DCC0" />
              <path
                d="M6.6 14 h16.8 l-1.5 21 a4 4 0 0 1 -4 3.6 h-6 a4 4 0 0 1 -4 -3.6 Z"
                fill="#8A5A30"
              />
              <rect x="5.4" y="9" width="19.2" height="5.4" fill="#E0BD8E" />
            </svg>
            <span style={{ textAlign: 'left' }}>
              <b>Meia de Leite</b>
              <small>@_meiadeleite_</small>
            </span>
          </button>

          <nav aria-label="Secções">
            {PAGINAS.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => irPara(p.id)}
                aria-current={p.id === pagina ? 'page' : undefined}
              >
                {p.nome}
              </button>
            ))}
          </nav>
        </div>
      </header>

      <main className="troca" key={pagina}>
        {pagina === 'inicio' && <Inicio estado={estado} irPara={irPara} />}
        {pagina === 'blackjack' && <Blackjack estado={estado} recarregar={recarregar} />}
        {pagina === 'instagram' && <Mural estado={estado} />}
        {pagina === 'agenda' && <Agenda estado={estado} />}

        <Rodape irPara={irPara} />
      </main>

      <Entornar fase={fase} />
    </>
  );
}
