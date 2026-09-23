import { useCallback, useEffect, useRef, useState } from 'react';
import { Entornar, useEntornar } from './componentes/Entornar';
import { Inicio } from './componentes/Inicio';
import { Membros } from './componentes/Membros';
import { Blackjack } from './componentes/Blackjack';
import { Mural } from './componentes/Mural';
import { Agenda } from './componentes/Agenda';
import { Admin } from './componentes/Admin';
import { Jogo } from './componentes/Jogo';
import { JogoDoCusco } from './componentes/JogoDoCusco';
import { Rodape } from './componentes/Rodape';
import { api } from './lib/api';
import { PAGINAS, TODAS_AS_PAGINAS } from './lib/dados';
import type { Estado, Pagina } from './lib/tipos';

const VAZIO: Estado = { agenda: [], insta: [], ranking: [], membros: [] };

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
  const [menuAberto, setMenuAberto] = useState(false);
  const [semRede, setSemRede] = useState(() => navigator.onLine === false);
  const { fase, entornar } = useEntornar();

  const recarregar = useCallback(async () => {
    try {
      setEstado(await api.estado());
    } catch {
      /* sem rede o site fica com o que já tinha */
    }
  }, []);

  /* Uma leitura ao entrar e depois de meio em meio minuto, para o que o admin
     marca aparecer aos outros sem ninguem recarregar a pagina.

     Com o separador escondido nao se pergunta nada: um separador esquecido
     numa janela atras nao tem novidades para mostrar a ninguem, e a perguntar
     de cinco em cinco segundos gastava sozinho uma conta inteira de pedidos ao
     fim do mes. Quando volta a estar a vista, pergunta logo. */
  useEffect(() => {
    let t = 0;
    const parar = () => {
      clearInterval(t);
      t = 0;
    };
    const andar = () => {
      parar();
      t = window.setInterval(() => {
        if (document.visibilityState === 'visible') recarregar();
      }, 30000);
    };

    /* A primeira leitura e sempre, escondido ou nao: uma pagina aberta num
       separador atras tem de ter o que mostrar quando alguem la chegar. O que
       para enquanto esta escondida e so a pergunta de meio em meio minuto. */
    recarregar();
    if (document.visibilityState === 'visible') andar();

    const aoMudar = () => {
      if (document.visibilityState !== 'visible') return parar();
      recarregar();
      andar();
    };
    document.addEventListener('visibilitychange', aoMudar);
    return () => {
      parar();
      document.removeEventListener('visibilitychange', aoMudar);
    };
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

  /* Quando a rede cai, o site manda jogar, que e o que o browser faria com o
     dinossauro dele se nao tivessemos nada guardado. So uma vez por falha:
     quem sair do jogo estando ainda sem rede nao volta la parar sozinho. */
  const jaMandouJogar = useRef(false);
  useEffect(() => {
    const caiu = () => setSemRede(true);
    const voltou = () => {
      setSemRede(false);
      jaMandouJogar.current = false;
    };
    window.addEventListener('offline', caiu);
    window.addEventListener('online', voltou);
    return () => {
      window.removeEventListener('offline', caiu);
      window.removeEventListener('online', voltou);
    };
  }, []);

  useEffect(() => {
    if (!semRede || jaMandouJogar.current) return;
    jaMandouJogar.current = true;
    irPara('jogo');
    // so depende da rede: o irPara muda a cada navegacao e nao deve reativar isto
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [semRede]);

  useEffect(() => {
    if (!menuAberto) return;
    const tecla = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuAberto(false);
    };
    window.addEventListener('keydown', tecla);
    return () => window.removeEventListener('keydown', tecla);
  }, [menuAberto]);

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

          {/* no telemóvel o menu é uma gaveta que abre de lado */}
          <button
            className="hamburguer"
            type="button"
            aria-label={menuAberto ? 'Fechar o menu' : 'Abrir o menu'}
            aria-expanded={menuAberto}
            onClick={() => setMenuAberto((a) => !a)}
          >
            <span className={menuAberto ? 'x' : ''} />
            <span className={menuAberto ? 'x' : ''} />
            <span className={menuAberto ? 'x' : ''} />
          </button>

          <nav className={menuAberto ? 'aberta' : ''} aria-label="Secções">
            {PAGINAS.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => {
                  setMenuAberto(false);
                  irPara(p.id);
                }}
                aria-current={p.id === pagina ? 'page' : undefined}
              >
                {p.nome}
              </button>
            ))}
          </nav>
          {menuAberto && <div className="gaveta-fundo" onClick={() => setMenuAberto(false)} />}
        </div>
      </header>

      <main className="troca" key={pagina}>
        {pagina === 'inicio' && <Inicio estado={estado} irPara={irPara} />}
        {pagina === 'membros' && <Membros estado={estado} irPara={irPara} />}
        {pagina === 'blackjack' && <Blackjack estado={estado} recarregar={recarregar} />}
        {pagina === 'instagram' && <Mural estado={estado} />}
        {pagina === 'agenda' && <Agenda estado={estado} />}
        {pagina === 'admin' && <Admin estado={estado} recarregar={recarregar} />}
        {pagina === 'jogo' && <Jogo estado={estado} semRede={semRede} />}
        {pagina === 'cusco' && <JogoDoCusco />}

        <Rodape irPara={irPara} />
      </main>

      <Entornar fase={fase} />
    </>
  );
}
