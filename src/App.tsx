import { useCallback, useEffect, useRef, useState } from 'react';
import { Entornar, useEntornar } from './componentes/Entornar';
import { Inicio } from './componentes/Inicio';
import { Membros } from './componentes/Membros';
import { Blackjack } from './componentes/Blackjack';
import { JogoDoPoker } from './componentes/JogoDoPoker';
import { Roleta } from './componentes/Roleta';
import { Apostas } from './componentes/Apostas';
import { Quadro } from './componentes/Quadro';
import { Mural } from './componentes/Mural';
import { Agenda } from './componentes/Agenda';
import { Admin } from './componentes/Admin';
import { Jogo } from './componentes/Jogo';
import { JogoDoCusco } from './componentes/JogoDoCusco';
import { Colherada } from './componentes/Colherada';
import { Rodape } from './componentes/Rodape';
import { Entrada } from './componentes/Entrada';
import { MesaFechada, Porteiro } from './componentes/Porteiro';
import { Avisar } from './componentes/Avisar';
import { Termos } from './componentes/Termos';
import { Privacidade } from './componentes/Privacidade';
import { api } from './lib/api';
import { nomeGuardado } from './lib/nick';
import { guardarIdade, idadeSabida, SO_PARA_MAIORES, type Resposta } from './lib/idade';
import { PAPELADA_MEXIDA } from './lib/dados';
import { JOGOS, MENU, TODAS_AS_PAGINAS, eJogo } from './lib/dados';
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
  /** A lista dos jogos, aberta ou fechada. Na gaveta do telemóvel está sempre
   *  aberta, que aí há espaço para ela. */
  const [jogosAbertos, setJogosAbertos] = useState(false);
  /* O nickname vive aqui e nao dentro de cada jogo. Antes cada jogo pedia o
     nome por sua conta e cada um tinha o seu botao de mudar, o que dava tres
     sitios para fazer a mesma coisa. Agora pede-se uma vez, no cabecalho, e os
     jogos so mostram com que nome se esta a jogar. */
  const [nome, setNome] = useState(nomeGuardado);
  const [aPedirNome, setAPedirNome] = useState(false);
  const [aAvisar, setAAvisar] = useState(false);
  /* Quem chega pela primeira vez leva com a pergunta da idade antes de mais
     nada. Quem já respondeu não volta a ser chateado, a não ser que peça. */
  const [idade, setIdade] = useState<Resposta | null>(idadeSabida);
  const [aPerguntarIdade, setAPerguntarIdade] = useState(false);
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

  /* a janela do nome fecha-se com Escape, como tudo o resto que abre por cima */
  useEffect(() => {
    if (!aPedirNome) return;
    const fechar = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setAPedirNome(false);
    };
    window.addEventListener('keydown', fechar);
    return () => window.removeEventListener('keydown', fechar);
  }, [aPedirNome]);

  /* a lista dos jogos fecha-se com Escape, como tudo o resto que abre por cima */
  useEffect(() => {
    if (!jogosAbertos) return;
    const fechar = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setJogosAbertos(false);
    };
    window.addEventListener('keydown', fechar);
    return () => window.removeEventListener('keydown', fechar);
  }, [jogosAbertos]);

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

  /* Esta mesa está fechada a quem cá está. Fecha-se a página e não os botões:
     de outra forma bastava escrever o endereço à mão para entrar na mesma. */
  const mesaFechada = idade === 'nao' && SO_PARA_MAIORES.includes(pagina);

  /* A papelada lê-se sem ter de responder a nada. A porta promete que a
     resposta não sai do aparelho, e ninguém tem de acreditar numa promessa
     sem poder ir ver o que ela quer dizer. */
  const papelada = pagina === 'termos' || pagina === 'privacidade';

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
            {MENU.map((item) =>
              'jogos' in item ? (
                <div
                  key="jogos"
                  className="menu-jogos"
                  data-aberto={jogosAbertos ? 'sim' : 'nao'}
                >
                  <button
                    type="button"
                    className="jogos-botao"
                    aria-expanded={jogosAbertos}
                    aria-current={eJogo(pagina) ? 'page' : undefined}
                    onClick={() => setJogosAbertos((v) => !v)}
                  >
                    Jogos
                    <svg width="10" height="7" viewBox="0 0 10 7" aria-hidden="true">
                      <path
                        d="M1 1.5 L5 5.5 L9 1.5"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.8"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </button>

                  <div className="jogos-lista">
                    {JOGOS.map((j) => (
                      <button
                        key={j.id}
                        type="button"
                        aria-current={j.id === pagina ? 'page' : undefined}
                        onClick={() => {
                          setJogosAbertos(false);
                          setMenuAberto(false);
                          irPara(j.id);
                        }}
                      >
                        <b>{j.nome}</b>
                        <small>{j.nota}</small>
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    setJogosAbertos(false);
                    setMenuAberto(false);
                    irPara(item.id);
                  }}
                  aria-current={item.id === pagina ? 'page' : undefined}
                >
                  {item.nome}
                </button>
              )
            )}
          </nav>
          {/* quem esta a jogar, e onde se muda de nome */}
          <button
            className={`quem${nome ? '' : ' sem-nome'}`}
            type="button"
            onClick={() => setAPedirNome(true)}
            title={nome ? 'Mudar de nickname' : 'Entrar com um nickname'}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" aria-hidden="true">
              <circle cx="12" cy="8" r="3.6" fill="none" stroke="currentColor" strokeWidth="1.9" />
              <path
                d="M4.8 20.5c0-3.8 3.2-6.2 7.2-6.2s7.2 2.4 7.2 6.2"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.9"
                strokeLinecap="round"
              />
            </svg>
            <span>{nome || 'Entrar'}</span>
          </button>

          {menuAberto && <div className="gaveta-fundo" onClick={() => setMenuAberto(false)} />}
          {jogosAbertos && (
            <div className="jogos-fundo" onClick={() => setJogosAbertos(false)} aria-hidden="true" />
          )}
        </div>
      </header>

      <main className="troca" key={pagina}>
        {/* Quem disse que ainda não tem 18 encontra as mesas de apostas
            fechadas. O resto da casa fica como estava. */}
        {pagina === 'inicio' && <Inicio estado={estado} irPara={irPara} />}
        {pagina === 'membros' && <Membros estado={estado} irPara={irPara} />}
        {mesaFechada && <MesaFechada aoCorrigir={() => setAPerguntarIdade(true)} />}
        {!mesaFechada && pagina === 'blackjack' && (
          <Blackjack
            nome={nome}
            pedirNome={() => setAPedirNome(true)}
            recarregar={recarregar}
            irPara={irPara}
          />
        )}
        {!mesaFechada && pagina === 'poker' && (
          <JogoDoPoker
            estado={estado}
            nome={nome}
            pedirNome={() => setAPedirNome(true)}
            recarregar={recarregar}
          />
        )}
        {!mesaFechada && pagina === 'roleta' && (
          <Roleta nome={nome} pedirNome={() => setAPedirNome(true)} recarregar={recarregar} />
        )}
        {!mesaFechada && pagina === 'apostas' && (
          <Apostas nome={nome} pedirNome={() => setAPedirNome(true)} recarregar={recarregar} />
        )}
        {pagina === 'quadro' && <Quadro estado={estado} />}
        {pagina === 'instagram' && <Mural estado={estado} />}
        {pagina === 'agenda' && <Agenda estado={estado} />}
        {pagina === 'admin' && <Admin estado={estado} recarregar={recarregar} />}
        {pagina === 'jogo' && <Jogo estado={estado} semRede={semRede} />}
        {pagina === 'cusco' && <JogoDoCusco />}
        {pagina === 'colherada' && <Colherada estado={estado} />}
        {pagina === 'termos' && <Termos atualizado={PAPELADA_MEXIDA} irPara={irPara} />}
        {pagina === 'privacidade' && <Privacidade atualizado={PAPELADA_MEXIDA} irPara={irPara} />}

        <Rodape irPara={irPara} avisar={() => setAAvisar(true)} />
      </main>

      {aPedirNome && (
        /* Ha sempre por onde sair daqui: o x, um toque no fundo, o Escape e o
           botao de baixo. Antes a saida so aparecia a quem ja tinha nome, e
           por isso quem abrisse isto sem nome ficava presa: no telemovel nao
           ha Escape, e o unico caminho era recarregar a pagina. O nome nao e
           obrigatorio em sitio nenhum, logo esta janela nao tem de ser uma
           porta fechada. */
        <div
          className="modal-fundo"
          role="dialog"
          aria-modal="true"
          aria-labelledby="nome-titulo"
          onClick={() => setAPedirNome(false)}
        >
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <button
              className="modal-x"
              type="button"
              onClick={() => setAPedirNome(false)}
              aria-label="Fechar"
            >
              ×
            </button>
            <svg width="40" height="54" viewBox="0 0 30 40" aria-hidden="true">
              <path
                d="M5 3 h20 l-2.5 32 a4 4 0 0 1 -4 3.6 h-7 a4 4 0 0 1 -4 -3.6 Z"
                fill="var(--crema-2)"
              />
              <path
                d="M6.6 14 h16.8 l-1.5 21 a4 4 0 0 1 -4 3.6 h-6 a4 4 0 0 1 -4 -3.6 Z"
                fill="var(--crema)"
              />
              <rect x="5.4" y="9" width="19.2" height="5.4" fill="var(--crema-2)" />
            </svg>
            <h2 id="nome-titulo">{nome ? 'Mudar de nickname' : 'Com que nome jogas?'}</h2>
            <p>
              O nome é o da Leader Board, e o PIN é o que prova que ele é teu. Serve para o
              blackjack, para o poker e para a roleta, que os torrões são os mesmos.
            </p>
            <Entrada
              aoEntrar={(quem) => {
                setNome(quem);
                setAPedirNome(false);
                recarregar();
              }}
            />
            <button className="btn claro" type="button" onClick={() => setAPedirNome(false)}>
              Deixa estar
            </button>
          </div>
        </div>
      )}

      {/* Por último de todos, que é uma porta: fica por cima de tudo o resto. */}
      {(idade === null || aPerguntarIdade) && !papelada && (
        <Porteiro
          irPara={irPara}
          aoResponder={(r) => {
            guardarIdade(r);
            setIdade(r);
            setAPerguntarIdade(false);
          }}
        />
      )}

      {aAvisar && <Avisar nome={nome} fechar={() => setAAvisar(false)} />}

      <Entornar fase={fase} />
    </>
  );
}
