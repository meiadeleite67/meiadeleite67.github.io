import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { MesaEm3D, useSegundos } from './MesaDePoker';
import { api, fotoDoMembro, quantosNasMesas, temServidor } from '../lib/api';
import { chaveDe, guardarChave, guardarNome, nomeGuardado } from '../lib/nick';
import { restam, useMesaViva } from '../lib/poker';
import { guardar, lido } from '../lib/dados';
import type { Estado, Membro, QuantosNaMesa } from '../lib/tipos';

/**
 * O poker do grupo: Texas Hold'em, a torrões, com os nossos a dar as cartas.
 *
 * Cada mesa tem um croupier fixo, que é um de nós, tirado da aba dos membros.
 * Sentam-se cinco pessoas por mesa e a mão começa quando houver duas. Quem se
 * senta compra dois mil e quinhentos torrões de fichas para aquela mesa; o
 * quadro de honra do blackjack não se mexe com isto, senão um blefe mal dado
 * deitava abaixo a tabela toda.
 *
 * O nome é o mesmo do blackjack, e prova-se com a mesma chave: ninguém se
 * senta com o nickname de outra pessoa.
 */

const MAX_MESAS = 5;
const ONDE_ESTAVA = 'mdl.poker.mesa';
/** O tempo que cada um tem para jogar, igual ao do servidor. */
const PRAZO = 30;

const mesaDe = (membro: Membro) => `m-${membro.id}`;

export function JogoDoPoker({ estado, recarregar }: { estado: Estado; recarregar: () => void }) {
  /* Um nome sem chave e um nome que nao se pode provar: e de antes de as
     chaves existirem, ou de outro browser. Pede-se outra vez, como no
     blackjack, senao a mesa dizia so que nao sabe quem somos. */
  const [nome, setNome] = useState(() => {
    const posto = nomeGuardado();
    return posto && chaveDe(posto) ? posto : '';
  });
  const [rascunho, setRascunho] = useState(nomeGuardado);
  const [aSentar, setASentar] = useState(false);
  const [queixa, setQueixa] = useState('');
  const [mesa, setMesa] = useState<string | null>(() => lido(ONDE_ESTAVA) || null);
  const [quantos, setQuantos] = useState<QuantosNaMesa[]>([]);
  const [subida, setSubida] = useState(0);

  const ocupado = useRef(false);

  /* As mesas são os primeiros cinco membros, por ordem, e cada um dá as cartas
     na sua. A mascote fica de fora: quem dá as cartas é gente. */
  const croupiers = useMemo(
    () =>
      [...estado.membros]
        .filter((m) => !m.mascote)
        .sort((a, b) => a.ordem - b.ordem)
        .slice(0, MAX_MESAS),
    [estado.membros]
  );

  const croupierDaMesa = useMemo(
    () => croupiers.find((m) => mesaDe(m) === mesa) || null,
    [croupiers, mesa]
  );

  const chave = nome ? chaveDe(nome) : '';
  const { estado: viva, ligacao, recado, limparRecado, manda } = useMesaViva(mesa, nome, chave);

  const mao = viva ? viva.mao : null;
  const meuLugar = viva && viva.eu ? viva.eu.lugar : -1;
  const minhaVez = !!mao && mao.vez >= 0 && mao.vez === meuLugar;
  const podes = minhaVez && mao ? mao.podes : null;

  const agora = useSegundos(!!mao && mao.vez >= 0);
  const faltam = restam(viva, agora);

  /* Quanta gente está em cada mesa. Pergunta-se ao chegar e quando se volta à
     entrada, e não de segundo a segundo: para saber o que se passa numa mesa
     entra-se nela. */
  const contar = useCallback(async () => {
    if (croupiers.length === 0 || !temServidor()) return;
    try {
      setQuantos(await quantosNasMesas(croupiers.map(mesaDe)));
    } catch {
      setQuantos([]);
    }
  }, [croupiers]);

  useEffect(() => {
    if (!mesa) contar();
  }, [mesa, contar]);

  useEffect(() => {
    if (mesa) guardar(ONDE_ESTAVA, mesa);
  }, [mesa]);

  /* O recado do servidor fica à vista uns segundos e desaparece. */
  useEffect(() => {
    if (!recado) return;
    const t = window.setTimeout(limparRecado, 4000);
    return () => window.clearTimeout(t);
  }, [recado, limparRecado]);

  /* A subida arranca sempre no mínimo permitido, e nunca fica fora dele. */
  useEffect(() => {
    if (!podes) return;
    setSubida((s) => (s < podes.minimo || s > podes.maximo ? podes.minimo : s));
  }, [podes]);

  /** Estrear ou reclamar um nickname. É a mesma porta do blackjack. */
  async function tratarDoNome() {
    const limpo = rascunho.trim();
    if (limpo.length < 2 || ocupado.current) return;
    ocupado.current = true;
    setASentar(true);
    setQueixa('');
    try {
      const r = await api.sentar(limpo, chaveDe(limpo));
      if (r.chave) guardarChave(limpo, r.chave);
      guardarNome(limpo);
      setNome(limpo);
      recarregar();
    } catch (e) {
      setQueixa(e instanceof Error ? e.message : 'Não deu para guardar o nome.');
    } finally {
      ocupado.current = false;
      setASentar(false);
    }
  }

  const jogar = (acao: string, valor?: number) => {
    if (!mao) return;
    manda({ a: 'jogada', passo: mao.passo, acao, valor });
  };

  if (!temServidor())
    return (
      <section className="pk">
        <p className="eyebrow">Mesa fechada</p>
        <h1>Poker</h1>
        <p className="lead">
          O poker precisa do servidor do grupo, e este site ainda não está ligado a ele. Sem isso
          não há mesa: cinco pessoas à volta da mesma mão não se guardam no browser de cada uma.
        </p>
      </section>
    );

  /* ---------------- a entrada: o nome e a escolha da mesa ---------------- */

  if (!nome)
    return (
      <section className="pk">
        <p className="eyebrow">Texas Hold'em a torrões</p>
        <h1>Poker</h1>
        <p className="lead">
          À mesa senta-se com o mesmo nickname do blackjack. É ele que prova de quem são as fichas,
          e por isso ninguém se pode sentar com o nome de outra pessoa.
        </p>
        <form
          className="pk-nome"
          onSubmit={(e) => {
            e.preventDefault();
            tratarDoNome();
          }}
        >
          <input
            value={rascunho}
            onChange={(e) => setRascunho(e.target.value)}
            placeholder="O teu nickname"
            maxLength={24}
            aria-label="O teu nickname"
          />
          <button className="btn azul" type="submit" disabled={aSentar || rascunho.trim().length < 2}>
            {aSentar ? 'Um instante...' : 'Entrar'}
          </button>
        </form>
        {queixa && <p className="recado mal">{queixa}</p>}
      </section>
    );

  if (!mesa)
    return (
      <section className="pk">
        <p className="eyebrow">Texas Hold'em a torrões</p>
        <h1>Escolhe uma mesa</h1>
        <p className="lead">
          Cinco lugares por mesa, e a mão começa assim que houver dois. Cada mesa tem o seu croupier,
          e quem se senta compra 2500 torrões de fichas para aquela mesa.
        </p>

        {croupiers.length === 0 ? (
          <p className="notas">
            Ainda não há membros na aba dos membros, e sem eles não há quem dê as cartas.
          </p>
        ) : (
          <div className="pk-mesas">
            {croupiers.map((m) => {
              const conta = quantos.find((q) => q.mesa === mesaDe(m));
              return (
                <button key={m.id} type="button" className="pk-escolha" onClick={() => setMesa(mesaDe(m))}>
                  <span className="pk-escolha-cara">
                    {m.temFoto ? (
                      <img src={fotoDoMembro(m.id)} alt={m.nome} loading="lazy" />
                    ) : (
                      <i />
                    )}
                  </span>
                  <span className="pk-escolha-quem">
                    <b>Mesa do {m.nome}</b>
                    <small>
                      {conta
                        ? conta.sentados > 0
                          ? `${conta.sentados} ${conta.sentados === 1 ? 'sentado' : 'sentados'}`
                          : 'ninguém à mesa'
                        : 'a contar...'}
                    </small>
                  </span>
                  <span className="pk-escolha-ir">Entrar</span>
                </button>
              );
            })}
          </div>
        )}

        <p className="notas">
          Estás com o nome <b>{nome}</b>.
        </p>
      </section>
    );

  /* ------------------------------ a mesa ------------------------------ */

  const meuLugarNaMesa = viva ? viva.lugares.find((l) => l.lugar === meuLugar) : null;
  const semFichas = !!meuLugarNaMesa && meuLugarNaMesa.fichas === 0;
  const naMao = !!mao && !!mao.jogadores.find((j) => j.lugar === meuLugar);

  return (
    <section className="pk pk-a-jogar">
      <header className="pk-cima">
        <button type="button" className="pk-voltar" onClick={() => setMesa(null)}>
          &lsaquo; As mesas
        </button>
        <p className="pk-titulo">
          <b>Mesa do {croupierDaMesa ? croupierDaMesa.nome : '?'}</b>
          <small>
            {ligacao === 'ligada'
              ? mao
                ? `Mão ${mao.numero}`
                : viva && viva.lugares.length >= 2
                  ? 'a dar as cartas...'
                  : 'à espera de gente'
              : ligacao === 'caiu'
                ? 'a ligação caiu, a voltar'
                : 'a ligar...'}
          </small>
        </p>
        <span className={`pk-luz ${ligacao}`} aria-label={`Ligação: ${ligacao}`} />
      </header>

      {viva ? (
        <MesaEm3D
          estado={viva}
          dealer={croupierDaMesa}
          restamSegundos={faltam}
          aoSentar={(lugar) => manda({ a: 'sentar', lugar })}
        />
      ) : (
        <p className="notas pk-espera">A ligar à mesa...</p>
      )}

      {recado && <p className="recado mal pk-recado">{recado}</p>}

      <div className="pk-comandos">
        {minhaVez && podes ? (
          <>
            <div className="pk-relogio" style={{ '--volta': `${(faltam / PRAZO) * 100}%` } as never}>
              <b>{faltam}</b>
              <small>segundos</small>
            </div>

            <div className="pk-acoes">
              <button type="button" className="btn" onClick={() => jogar('desistir')}>
                Desistir
              </button>
              {podes.passar ? (
                <button type="button" className="btn azul" onClick={() => jogar('passar')}>
                  Passar
                </button>
              ) : (
                <button type="button" className="btn azul" onClick={() => jogar('igualar')}>
                  Igualar {podes.igualar}
                </button>
              )}
              {podes.podeSubir && (
                <button type="button" className="btn claro" onClick={() => jogar('subir', subida)}>
                  {subida >= podes.maximo ? `Tudo, ${podes.maximo}` : `Subir para ${subida}`}
                </button>
              )}
            </div>

            {podes.podeSubir && (
              <div className="pk-quanto">
                <input
                  type="range"
                  min={podes.minimo}
                  max={podes.maximo}
                  step={5}
                  value={Math.min(Math.max(subida, podes.minimo), podes.maximo)}
                  onChange={(e) => setSubida(Number(e.target.value))}
                  aria-label="Quanto subir"
                />
                <div className="pk-atalhos">
                  {mao && mao.pote > 0 && (
                    <button
                      type="button"
                      onClick={() =>
                        setSubida(
                          Math.min(
                            podes.maximo,
                            Math.max(podes.minimo, Math.round(mao.pote / 2 / 5) * 5)
                          )
                        )
                      }
                    >
                      meio pote
                    </button>
                  )}
                  {mao && mao.pote > 0 && (
                    <button
                      type="button"
                      onClick={() =>
                        setSubida(Math.min(podes.maximo, Math.max(podes.minimo, mao.pote)))
                      }
                    >
                      pote
                    </button>
                  )}
                  <button type="button" onClick={() => setSubida(podes.maximo)}>
                    tudo
                  </button>
                </div>
              </div>
            )}
          </>
        ) : (
          <div className="pk-parado">
            {meuLugar < 0 ? (
              <p className="notas">
                {viva && viva.lugares.length >= 5
                  ? 'A mesa está cheia. Fica a ver, ou escolhe outra.'
                  : 'Escolhe um lugar para te sentares.'}
              </p>
            ) : semFichas ? (
              <>
                <p className="notas">Ficaste sem fichas nesta mesa.</p>
                <button type="button" className="btn azul" onClick={() => manda({ a: 'comprar' })}>
                  Comprar 2500
                </button>
              </>
            ) : (
              <p className="notas">
                {naMao
                  ? mao && mao.fase === 'acabou'
                    ? 'A mão acabou. Já vem outra.'
                    : 'À espera dos outros.'
                  : mao
                    ? 'Entras na mão seguinte.'
                    : 'À espera de mais alguém para começar.'}
              </p>
            )}
            {meuLugar >= 0 && (
              <button type="button" className="pk-levantar" onClick={() => manda({ a: 'levantar' })}>
                Levantar-me
              </button>
            )}
          </div>
        )}
      </div>

      {viva && viva.narracao.length > 0 && (
        <ul className="pk-narracao">
          {viva.narracao.map((l, i) => (
            <li key={`${i}-${l}`}>{l}</li>
          ))}
        </ul>
      )}

      <p className="notas pk-regras">
        Cegos de 25 e 50. Trinta segundos por jogada, e quem demorar passa ou desiste. As cartas são
        dadas no servidor e as dos outros só chegam aqui quando a mão é mostrada.
      </p>
    </section>
  );
}
