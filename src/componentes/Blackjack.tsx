import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { api, temServidor } from '../lib/api';
import { guardar, lido } from '../lib/dados';
import {
  APOSTAS,
  conta,
  distribuir,
  dividir,
  dobrar,
  emprestimo,
  ficar,
  mesaNova,
  outraMao,
  pedir,
  podeDividir,
  podeDobrar,
  porFicha,
  soma,
  suave,
  tirarFichas
} from '../lib/blackjack';
import type { Carta, Mao, Mesa, Resultado } from '../lib/blackjack';
import type { Estado, Pontuacao } from '../lib/tipos';

const LARGURA_CARTA = 64;

const DIZ: Record<Resultado, string> = {
  blackjack: 'Blackjack',
  ganhou: 'Ganhaste',
  empate: 'Empate',
  perdeu: 'Perdeste',
  rebentou: 'Rebentou'
};

export function Blackjack({ estado, recarregar }: { estado: Estado; recarregar: () => void }) {
  /* O saldo nao nasce daqui: nasce do servidor, mal se saiba o nome. O que
     esta mesa leva agora e so o ponto de partida de quem joga sem servidor
     nenhum, que nao conta para o quadro. */
  const [mesa, setMesa] = useState<Mesa>(() => mesaNova());
  const [nome, setNome] = useState(() => lido('mdl.nome') || '');
  const [aPedirNome, setAPedirNome] = useState(() => !(lido('mdl.nome') || '').trim());
  const [rascunho, setRascunho] = useState(() => lido('mdl.nome') || '');

  const campoNome = useRef<HTMLInputElement>(null);

  /* Os pedidos ao quadro vao em fila e nunca ao mesmo tempo: sao todos
     leituras e escritas da mesma linha, e dois a andar juntos perdiam-se um ao
     outro. */
  const fila = useRef<Promise<unknown>>(Promise.resolve());
  function naFila(trabalho: () => Promise<Pontuacao | null>) {
    fila.current = fila.current.then(trabalho).then(sincronizar, () => null);
  }

  /** O servidor e que sabe o saldo. Isto traz de la a verdade. */
  function sincronizar(linha: Pontuacao | null) {
    if (!linha) return;
    setMesa((m) => ({
      ...m,
      saldo: linha.torroes,
      jogadas: linha.maos,
      vitorias: linha.vitorias,
      bjs: linha.bjs,
      pico: linha.pico
    }));
    recarregar();
  }

  /* quem chega com o nome ja posto senta-se sozinho */
  useEffect(() => {
    const posto = (lido('mdl.nome') || '').trim();
    if (posto) naFila(() => api.sentar(posto));
    // uma vez, ao entrar na mesa
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (aPedirNome) campoNome.current?.focus({ preventScroll: true });
  }, [aPedirNome]);

  /** Trocar de nickname é trocar de jogador: quem já está no quadro volta com
   *  os torrões que lá tinha, quem é novo começa do princípio. */
  function sentar() {
    const limpo = rascunho.trim();
    if (limpo.length < 2) return;
    if (limpo !== nome) {
      /* Trocar de nickname e trocar de jogador. Quem ja esta no quadro volta
         com os torroes que la tinha, e quem e novo comeca do principio: as
         duas coisas vem do servidor. O que esta aqui e so para quem joga sem
         servidor nenhum. */
      const jaJogou = estado.ranking.find((r) => r.nome === limpo);
      setMesa(jaJogou ? mesaNova(jaJogou.torroes) : mesaNova());
      naFila(() => api.sentar(limpo));
    }
    setNome(limpo);
    guardar('mdl.nome', limpo);
    setAPedirNome(false);
  }

  /** Aplica a jogada e, quando a mão fecha, diz ao servidor o que aconteceu.
   *  Vai o que se apostou e o que saiu a cada mão; quanto é que isso vale em
   *  torrões é conta do servidor, não daqui. */
  function aplicar(m: Mesa) {
    setMesa(m);
    if (m.fase !== 'fim' || !nome.trim()) return;
    const quem = nome.trim();
    const maos = m.maos.map((x) => ({ aposta: x.aposta, resultado: x.resultado ?? 'perdeu' }));
    naFila(() => api.jogada(quem, maos));
  }

  /** Dar cartas: a aposta sai do saldo no servidor antes de haver cartas. */
  function darCartas() {
    const aposta = soma(mesa.fichas);
    if (aposta <= 0 || aposta > mesa.saldo) return;
    if (nome.trim()) {
      const quem = nome.trim();
      naFila(() => api.apostar(quem, aposta));
    }
    aplicar(distribuir(mesa));
  }

  function pedirEmprestado() {
    setMesa(emprestimo(mesa));
    if (nome.trim()) {
      const quem = nome.trim();
      naFila(() => api.emprestimo(quem));
    }
  }

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
                  disabled={naMesa === 0 || naMesa > b.saldo}
                  onClick={darCartas}
                >
                  Dar cartas
                </button>
                {b.fichas.length > 0 && (
                  <button className="btn claro" type="button" onClick={() => setMesa(tirarFichas(b))}>
                    Tirar as fichas
                  </button>
                )}
                {b.saldo < 5 && (
                  <button
                    className="btn claro"
                    type="button"
                    onClick={pedirEmprestado}
                  >
                    Pedir 100 emprestados ao Amílcar
                  </button>
                )}
              </>
            )}
            {b.fase === 'jogo' && (
              <>
                <button className="btn" type="button" onClick={() => aplicar(pedir(b))}>
                  Pedir
                </button>
                <button className="btn claro" type="button" onClick={() => aplicar(ficar(b))}>
                  Ficar
                </button>
                {podeDobrar(b) && (
                  <button className="btn claro" type="button" onClick={() => aplicar(dobrar(b))}>
                    Dobrar
                  </button>
                )}
                {podeDividir(b) && (
                  <button className="btn claro" type="button" onClick={() => aplicar(dividir(b))}>
                    Dividir
                  </button>
                )}
              </>
            )}
            {b.fase === 'fim' && (
              <button className="btn" type="button" onClick={() => setMesa(outraMao(b))}>
                Outra mão
              </button>
            )}
          </div>

          {nome.trim() && (
            <p className="a-jogar-como">
              A jogar como <b>{nome.trim()}</b>
              <button
                type="button"
                onClick={() => {
                  setRascunho(nome);
                  setAPedirNome(true);
                }}
              >
                mudar
              </button>
            </p>
          )}
        </div>
      </section>

      {aPedirNome && (
        <div className="modal-fundo" role="dialog" aria-modal="true" aria-labelledby="modal-titulo">
          <form
            className="modal"
            onSubmit={(e) => {
              e.preventDefault();
              sentar();
            }}
          >
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
            <h2 id="modal-titulo">Quem se senta à mesa?</h2>
            <p>
              Escreve um nome antes de jogar. É só para o quadro de honra saber a quem tirar os
              torrões.
            </p>
            <input
              id="bj-nome"
              type="text"
              maxLength={24}
              ref={campoNome}
              value={rascunho}
              placeholder="nickname"
              onChange={(e) => setRascunho(e.target.value)}
            />
            <button className="btn azul" type="submit" disabled={rascunho.trim().length < 2}>
              Sentar à mesa
            </button>
            {rascunho.trim().length > 0 && rascunho.trim().length < 2 && (
              <p className="recado">Duas letras, pelo menos.</p>
            )}
          </form>
        </div>
      )}

      <section>
        <h2 style={{ fontSize: 24, marginBottom: 14 }}>Leaderboard</h2>
        <div className="painel">
          {estado.ranking.length === 0 ? (
            <p className="vazio">
              {temServidor()
                ? 'Ainda ninguém arriscou um torrão. Sê o primeiro a perder tudo.'
                : 'O quadro partilhado ainda não está ligado. Por agora os torrões ficam só no teu browser.'}
            </p>
          ) : (
            <table className="rank">
              <thead>
                <tr>
                  <th />
                  <th>Quem</th>
                  <th>Torrões</th>
                  <th>Máximo</th>
                  <th>Mãos</th>
                  <th>Ganhas</th>
                  <th>BJ</th>
                </tr>
              </thead>
              <tbody>
                {estado.ranking.map((r, i) => (
                  <tr
                    key={r.nome}
                    className={`${r.nome === nome.trim() ? 'eu' : ''} ${i < 3 ? 'podio' : ''}`.trim()}
                  >
                    <td>{i + 1}</td>
                    <td>
                      {r.nome}
                      {r.nome === nome.trim() ? ' (tu)' : ''}
                    </td>
                    <td className="num">{r.torroes}</td>
                    <td className="num">{r.pico}</td>
                    <td className="num">{r.maos}</td>
                    <td className="num">{r.vitorias}</td>
                    <td className="num">{r.bjs}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
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
