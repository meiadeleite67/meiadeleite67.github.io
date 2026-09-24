import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { api } from '../lib/api';
import { passeDe } from '../lib/nick';
import { APOSTAS, conta, mesaNova, porFicha, soma, suave, tirarFichas } from '../lib/blackjack';
import type { Carta, Mao, Mesa, Resultado } from '../lib/blackjack';
import type { Pagina, RespostaDaMesa } from '../lib/tipos';

const LARGURA_CARTA = 64;

const DIZ: Record<Resultado, string> = {
  blackjack: 'Blackjack',
  ganhou: 'Ganhaste',
  empate: 'Empate',
  perdeu: 'Perdeste',
  rebentou: 'Rebentou'
};

/** Uma carta qualquer para o lugar da tapada: dela so se mostra o verso, e a
 *  verdadeira nem chega a sair do servidor enquanto estiver por virar. */
const TAPADA: Carta = { v: 'A', n: '\u2660', verm: false };

export function Blackjack({
  nome,
  pedirNome,
  recarregar,
  irPara
}: {
  nome: string;
  pedirNome: () => void;
  recarregar: () => void;
  irPara: (p: Pagina) => void;
}) {
  /* Esta mesa e so o que se ve. Quem tem as cartas a serio e o servidor: aqui
     nao ha sapato nenhum, nem contas de quem ganhou. */
  const [mesa, setMesa] = useState<Mesa>(() => mesaNova(0));
  const [podem, setPodem] = useState({ dobrar: false, dividir: false });
  const [passo, setPasso] = useState(0);
  const [aEsperar, setAEsperar] = useState(false);
  const [recado, setRecado] = useState('');

  /* Um pedido de cada vez: dois a andar juntos davam uma carta a mais. */
  const ocupado = useRef(false);

  /** Poe no ecra o que o servidor mandou, e mais nada. */
  function mostrar(r: RespostaDaMesa) {
    const v = r.mesa;
    setPodem({ dobrar: v?.podeDobrar ?? false, dividir: v?.podeDividir ?? false });
    setPasso(v?.passo ?? 0);
    setMesa((antes) => ({
      ...antes,
      saldo: r.linha.torroes,
      jogadas: r.linha.maos,
      vitorias: r.linha.vitorias,
      bjs: r.linha.bjs,
      pico: r.linha.pico,
      // a tapada entra aqui so para haver um verso desenhado no lugar dela
      casa: v ? (v.tapada ? [...v.casa, TAPADA] : v.casa) : [],
      maos: v ? v.maos.map((m) => ({ ...m, resultado: m.resultado as Resultado | null })) : [],
      atual: v?.atual ?? 0,
      revelar: v?.revelar ?? false,
      fase: v ? (v.fase === 'fim' ? 'fim' : 'jogo') : 'aposta',
      // as fichas ja foram para a mesa quando as cartas sairam
      fichas: v ? [] : antes.fichas
    }));
  }

  async function aoServidor(trabalho: () => Promise<RespostaDaMesa>) {
    if (ocupado.current) return;
    ocupado.current = true;
    setAEsperar(true);
    setRecado('');
    try {
      mostrar(await trabalho());
      recarregar();
    } catch (e) {
      setRecado(e instanceof Error ? e.message : 'O servidor nao respondeu como devia.');
    } finally {
      ocupado.current = false;
      setAEsperar(false);
    }
  }

  /* O nome vem do cabecalho. Sempre que ele muda, volta-se a mesa desse nome:
     a mao que estivesse a meio e as fichas sao de quem la estava. */
  useEffect(() => {
    if (!nome || !passeDe(nome)) return;
    setMesa(mesaNova(0));
    aoServidor(() => api.sentar(nome, passeDe(nome)));
    // so depende do nome; o aoServidor muda a cada render e nao deve reativar isto
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nome]);

  function darCartas() {
    const aposta = soma(mesa.fichas);
    if (aposta <= 0 || aposta > mesa.saldo) return;
    aoServidor(() => api.apostarNaMesa(nome.trim(), passeDe(nome.trim()), aposta));
  }

  const jogar = (acao: string) =>
    aoServidor(() => api.jogar(nome.trim(), passeDe(nome.trim()), acao, passo));

  const pedirEmprestado = () =>
    aoServidor(() => api.emprestimo(nome.trim(), passeDe(nome.trim())));

  /** Limpar a mesa para a proxima aposta. So muda o que se ve: a mao anterior
   *  ja esta fechada e paga do lado de la. */
  const outraMao = () =>
    setMesa((m) => ({ ...m, maos: [], casa: [], atual: 0, fase: 'aposta', revelar: false }));

  const b = mesa;
  const naMesa = soma(b.fichas);
  const emJogo = b.maos.reduce((t, m) => t + m.aposta, 0);
  const totalCasa = b.revelar
    ? String(conta(b.casa))
    : b.casa.length
      ? `${conta([b.casa[0]])} e tapada`
      : '';

  return (
    <>
      <section>
        <p className="eyebrow">Mesa do café, sem dinheiro, só açúcar</p>
        <h1 style={{ fontSize: 'clamp(28px,5vw,42px)' }}>Blackjack dos Torrões</h1>
        <p className="lead">
          Começas com 250 torrões de açúcar. Não valem nada, não se compram e não se trocam. Só
          servem para te armares em bom no grupo. A casa paga 3:2 no blackjack, fica nos 17, e dá
          para dividir quando as duas primeiras cartas valem o mesmo.
        </p>

        <div className="mesa" style={{ marginTop: 22 }}>
          <div className="mesa-topo">
            <div>
              <span className="rotulo" style={{ display: 'block' }}>
                Os teus torrões
              </span>
              <span className="saldo">{b.saldo}</span>
            </div>
            <div style={{ marginLeft: 'auto', textAlign: 'right' }}>
              <span className="rotulo" style={{ display: 'block' }}>
                Mãos, ganhas, blackjacks
              </span>
              <span className="num" style={{ fontSize: 17 }}>
                {b.jogadas} · {b.vitorias} · {b.bjs}
              </span>
            </div>
          </div>

          <div className="lado">
            <div className="lado-cab">
              <span className="rotulo">A casa</span>
              {b.casa.length > 0 && (
                <span className="total">
                  <b>{totalCasa}</b>
                </span>
              )}
            </div>
            <div className="cartas">
              {b.casa.map((c, i) => (
                <CartaEl
                  key={`c${i}`}
                  carta={c}
                  tapada={!b.revelar && i === 1}
                  i={i}
                  total={b.casa.length}
                  deBaixo
                />
              ))}
            </div>
          </div>

          <div className="centro">
            <div className="baralho" aria-hidden="true">
              <i />
              <i />
              <i />
            </div>
          </div>

          {/* uma coluna por mão: com o split passam a ser duas ou mais */}
          <div className={`maos${b.maos.length > 1 ? ' varias' : ''}`}>
            {b.maos.length === 0 ? (
              <div className="cartas" />
            ) : (
              b.maos.map((mao, i) => (
                <MaoEl
                  key={i}
                  mao={mao}
                  aJogar={b.fase === 'jogo' && i === b.atual}
                  numero={i + 1}
                  quantas={b.maos.length}
                />
              ))
            )}
          </div>

          {b.fase === 'aposta' ? (
            <div className="aposta-zona">
              <div className="pilha-caixa">
                <span className="rotulo" style={{ textAlign: 'center' }}>
                  Na mesa
                </span>
                <div className="pilha">
                  {b.fichas.length === 0 && <div className="pilha-vazia" />}
                  {b.fichas.map((v, i) => (
                    <button
                      key={`${i}-${v}`}
                      type="button"
                      className={`ficha v${v}`}
                      tabIndex={-1}
                      aria-hidden="true"
                      style={{
                        bottom: `calc(${Math.min(i, 7)} * var(--desvio-ficha, 12px))`,
                        left: `${(i % 3) - 1}px`,
                        zIndex: i + 1,
                        animationDelay: '0ms'
                      }}
                    >
                      <span>{v}</span>
                    </button>
                  ))}
                </div>
                <span className="total-aposta">{naMesa} torrões</span>
              </div>

              <div>
                <span className="rotulo" style={{ display: 'block', marginBottom: 8 }}>
                  Pôr fichas
                </span>
                <div className="fichas">
                  {APOSTAS.map((v) => (
                    <button
                      key={v}
                      className={`ficha v${v}`}
                      type="button"
                      disabled={naMesa + v > b.saldo}
                      onClick={() => setMesa(porFicha(b, v))}
                      aria-label={`Pôr ficha de ${v}`}
                    >
                      <span>{v}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <p className="em-jogo">
              <span className="rotulo">Em jogo</span> <b className="num">{emJogo}</b> torrões
              {b.maos.length > 1 && ` em ${b.maos.length} mãos`}
            </p>
          )}

          <div className="acoes">
            {b.fase === 'aposta' && (
              <>
                <button
                  className="btn"
                  type="button"
                  disabled={aEsperar || naMesa === 0 || naMesa > b.saldo}
                  onClick={darCartas}
                >
                  Dar cartas
                </button>
                {b.fichas.length > 0 && (
                  <button
                    className="btn claro"
                    type="button"
                    disabled={aEsperar}
                    onClick={() => setMesa(tirarFichas(b))}
                  >
                    Tirar as fichas
                  </button>
                )}
                {b.saldo < 5 && (
                  <button
                    className="btn claro"
                    type="button"
                    disabled={aEsperar}
                    onClick={pedirEmprestado}
                  >
                    Pedir 100 emprestados ao Amílcar
                  </button>
                )}
              </>
            )}
            {b.fase === 'jogo' && (
              <>
                <button
                  className="btn"
                  type="button"
                  disabled={aEsperar}
                  onClick={() => jogar('pedir')}
                >
                  Pedir
                </button>
                <button
                  className="btn claro"
                  type="button"
                  disabled={aEsperar}
                  onClick={() => jogar('ficar')}
                >
                  Ficar
                </button>
                {podem.dobrar && (
                  <button
                    className="btn claro"
                    type="button"
                    disabled={aEsperar}
                    onClick={() => jogar('dobrar')}
                  >
                    Dobrar
                  </button>
                )}
                {podem.dividir && (
                  <button
                    className="btn claro"
                    type="button"
                    disabled={aEsperar}
                    onClick={() => jogar('dividir')}
                  >
                    Dividir
                  </button>
                )}
              </>
            )}
            {b.fase === 'fim' && (
              <button className="btn" type="button" disabled={aEsperar} onClick={outraMao}>
                Outra mão
              </button>
            )}
          </div>

          {recado && <p className="recado mal">{recado}</p>}

          {nome.trim() && (
            <p className="a-jogar-como">
              A jogar como <b>{nome.trim()}</b>
            </p>
          )}
        </div>
      </section>

      <section className="bj-quadro">
        <h2 style={{ fontSize: 24, marginBottom: 6 }}>Leader Board</h2>
        <p className="notas">
          Os torrões são os mesmos no poker e na roleta, e o quadro mostra tudo o que cada um fez
          em cada jogo.
        </p>
        <button className="btn claro" type="button" onClick={() => irPara('quadro')}>
          Ver a Leader Board
        </button>
      </section>
    </>
  );
}

function MaoEl({
  mao,
  aJogar,
  numero,
  quantas
}: {
  mao: Mao;
  aJogar: boolean;
  numero: number;
  quantas: number;
}) {
  const total = conta(mao.cartas);
  return (
    <div className={`lado mao${aJogar ? ' a-jogar' : ''}${mao.resultado ? ' fechada' : ''}`}>
      <div className="cartas">
        {mao.cartas.map((c, i) => (
          <CartaEl key={i} carta={c} i={i} total={mao.cartas.length} />
        ))}
      </div>
      <div className="lado-cab">
        <span className="rotulo">{quantas > 1 ? `Mão ${numero}` : 'Tu'}</span>
        {mao.cartas.length > 0 && (
          <span className="total">
            <b>{total}</b>
            {suave(mao.cartas) && total !== 21 ? ' (suave)' : ''}
          </span>
        )}
        {quantas > 1 && <span className="aposta-da-mao num">{mao.aposta}</span>}
        {mao.resultado && <span className={`fim-da-mao ${mao.resultado}`}>{DIZ[mao.resultado]}</span>}
      </div>
    </div>
  );
}

/** A carta entra a partir do baralho do centro, por isso o ponto de partida
 *  depende de onde ela vai ficar na mão. */
function CartaEl({
  carta,
  tapada,
  i,
  total,
  deBaixo
}: {
  carta: Carta;
  tapada?: boolean;
  i: number;
  total: number;
  deBaixo?: boolean;
}) {
  const estilo = {
    '--dx': `${-(i - (total - 1) / 2) * LARGURA_CARTA}px`,
    '--dy': deBaixo ? '108px' : '-108px',
    '--rot': `${deBaixo ? -7 : 7}deg`,
    animationDelay: `${i * 90}ms`
  } as CSSProperties;

  if (tapada) return <div className="carta tapa" style={estilo} aria-label="carta tapada" />;
  return (
    <div className={`carta${carta.verm ? ' verm' : ''}`} style={estilo}>
      <span>{carta.v}</span>
      <span className="naipe">{carta.n}</span>
    </div>
  );
}
