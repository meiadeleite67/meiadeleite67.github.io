import { useCallback, useEffect, useMemo, useState } from 'react';
import { api, temServidor } from '../lib/api';
import { passeDe } from '../lib/nick';
import { quandoEmPalavras } from '../lib/dados';
import type {
  ApostaDesportiva,
  Escolha,
  JogoDeApostas,
  Pontuacao,
  QuadroDeJogos
} from '../lib/tipos';

/**
 * As apostas desportivas.
 *
 * É o único jogo da casa que não acaba enquanto se está a olhar para ele.
 * Põe-se a aposta hoje, os torrões saem da carteira logo, e o prémio só chega
 * quando o jogo acabar, que pode ser esta noite ou no domingo. Por isso esta
 * página tem duas metades: os jogos que há para apostar, e as apostas que já se
 * puseram e ainda estão de pé.
 *
 * Os jogos e as cotações vêm de uma feed a sério, mas não se vão lá buscar
 * quando alguém abre a página: vêm do que o servidor guardou na última volta,
 * que dá de seis em seis horas. O plano que temos é contado ao pedido, e um
 * pedido por cada visita gastava o mês numa tarde.
 *
 * A cotação que conta é a que estava quando se apostou, e fica guardada dentro
 * da aposta. É assim numa casa de apostas e é a única maneira honesta: de outra
 * forma o prémio mudava depois de a pessoa já não poder fazer nada quanto a ele.
 */

/** O que se pode pôr de uma vez, para não se estar a escrever números. */
const FICHAS = [10, 25, 50, 100];
const APOSTA_MINIMA = 5;
const APOSTA_MAXIMA = 500;

const DE_LADO: { escolha: Escolha; curto: string }[] = [
  { escolha: 'casa', curto: '1' },
  { escolha: 'empate', curto: 'X' },
  { escolha: 'fora', curto: '2' }
];

/**
 * A hora a que o jogo começa, como se diz em voz alta.
 *
 * A feed manda a hora em UTC e com os segundos todos. O dia tem de ser contado
 * pelo relógio de quem está a ler e não pelo texto que veio: um jogo das onze
 * da noite em Lisboa é no dia seguinte em UTC, e apareceria marcado para
 * amanhã a quem o vai ver hoje.
 */
function aQueHoras(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const aqui = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate()
  ).padStart(2, '0')}`;
  const hora = d.toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' });
  return `${quandoEmPalavras(aqui)}, às ${hora}`;
}

const nomeDaEscolha = (a: ApostaDesportiva) =>
  a.escolha === 'casa' ? a.casa : a.escolha === 'fora' ? a.fora : 'Empate';

export function Apostas({
  nome,
  pedirNome,
  recarregar
}: {
  nome: string;
  pedirNome: () => void;
  recarregar: () => void;
}) {
  const [quadro, setQuadro] = useState<QuadroDeJogos | null>(null);
  const [linha, setLinha] = useState<Pontuacao | null>(null);
  const [minhas, setMinhas] = useState<ApostaDesportiva[]>([]);
  const [recado, setRecado] = useState('');
  const [aCarregar, setACarregar] = useState(true);

  /** O jogo e a escolha que estão em cima da mesa, e quanto se vai pôr. */
  const [posta, setPosta] = useState<{ jogo: JogoDeApostas; escolha: Escolha } | null>(null);
  const [quanto, setQuanto] = useState(FICHAS[0]);
  const [aPor, setAPor] = useState(false);

  const passe = nome ? passeDe(nome) : '';
  const saldo = linha ? linha.torroes : 0;

  const buscarJogos = useCallback(async () => {
    try {
      setQuadro(await api.jogosDeApostas());
    } catch {
      /* sem servidor não há jogos, e o site diz isso mais abaixo */
    } finally {
      setACarregar(false);
    }
  }, []);

  const buscarMinhas = useCallback(async () => {
    if (!nome || !passe) return;
    try {
      const r = await api.minhasApostas(nome, passe);
      setMinhas(r.apostas);
      setLinha(r.linha);
    } catch {
      /* sem saldo não se aposta, e os botões ficam quietos */
    }
  }, [nome, passe]);

  useEffect(() => {
    void buscarJogos();
  }, [buscarJogos]);

  useEffect(() => {
    void buscarMinhas();
  }, [buscarMinhas]);

  /* Os jogos por desporto, para se poder ver um de cada vez. Sai da lista e
     não de uma lista à parte: se a feed um dia trouxer outro desporto, ele
     aparece aqui sozinho. */
  const porDesporto = useMemo(() => {
    const por = new Map<string, JogoDeApostas[]>();
    (quadro?.jogos || []).forEach((j) => {
      const chave = j.desporto || 'Outros';
      por.set(chave, [...(por.get(chave) || []), j]);
    });
    return por;
  }, [quadro]);

  const [desporto, setDesporto] = useState('');
  const desportos = [...porDesporto.keys()];
  const aVer = desporto && porDesporto.has(desporto) ? desporto : '';
  const jogos = aVer ? porDesporto.get(aVer) || [] : quadro?.jogos || [];

  const abertas = minhas.filter((a) => a.estado === 'aberta');
  const fechadas = minhas.filter((a) => a.estado !== 'aberta');
  const presos = abertas.reduce((s, a) => s + a.quanto, 0);

  async function apostar() {
    if (!posta || aPor) return;
    setAPor(true);
    setRecado('');
    try {
      const r = await api.apostarNoJogo(nome, passe, posta.jogo.id, posta.escolha, quanto);
      setLinha(r.linha);
      setMinhas((antes) => [r.aposta, ...antes]);
      setPosta(null);
      recarregar();
    } catch (e) {
      setRecado(e instanceof Error ? e.message : 'A aposta não foi aceite.');
    } finally {
      setAPor(false);
    }
  }

  if (!temServidor())
    return (
      <section className="apo">
        <p className="eyebrow">Fechado</p>
        <h1>Apostas desportivas</h1>
        <p className="lead">
          Isto precisa do servidor do grupo, e este site ainda não está ligado a ele.
        </p>
      </section>
    );

  if (!nome)
    return (
      <section className="apo">
        <p className="eyebrow">Jogos a sério, torrões a fingir</p>
        <h1>Apostas desportivas</h1>
        <p className="lead">
          Futebol, basquetebol e ténis, com as cotações que as casas de apostas estão mesmo a dar.
          Joga-se com os mesmos torrões do blackjack, do poker e da roleta, e eles continuam a não
          valer nada em lado nenhum.
        </p>
        <button className="btn azul" type="button" onClick={pedirNome}>
          Entrar com o meu nome
        </button>
      </section>
    );

  return (
    <section className="apo">
      <header className="apo-cima">
        <p className="eyebrow">Jogos a sério, torrões a fingir</p>
        <h1>Apostas desportivas</h1>
        <p className="apo-saldo">
          <b>{saldo}</b>
          <small>
            torrões de {nome}
            {presos > 0 ? `, e ${presos} presos em apostas` : ''}
          </small>
        </p>
      </header>

      {/* ---- os jogos ---- */}

      {aCarregar && <p className="notas">A ver o que há hoje...</p>}

      {/* O aviso da chave so faz sentido quando nao ha nada para mostrar. Com
          jogos guardados de antes, ele era so barulho por cima deles. */}
      {!aCarregar && quadro && !quadro.temFeed && jogos.length === 0 && (
        <p className="recado mal">
          O servidor ainda não tem chave da feed dos jogos, por isso não há nada para apostar. É
          preciso pô-la nos segredos do Worker.
        </p>
      )}

      {!aCarregar && quadro?.temFeed && jogos.length === 0 && (
        <p className="notas">
          Não há jogos à espera. Ou já começaram todos, ou a próxima volta ainda não trouxe os
          de hoje.
        </p>
      )}

      {desportos.length > 1 && (
        <div className="apo-desportos">
          <button
            type="button"
            className={aVer === '' ? 'escolhido' : ''}
            onClick={() => setDesporto('')}
          >
            Todos
          </button>
          {desportos.map((d) => (
            <button
              key={d}
              type="button"
              className={aVer === d ? 'escolhido' : ''}
              onClick={() => setDesporto(d)}
            >
              {d}
            </button>
          ))}
        </div>
      )}

      <div className="apo-jogos">
        {jogos.map((j) => (
          <article key={j.id} className="apo-jogo">
            <p className="apo-liga">
              <span>{j.liga || j.desporto}</span>
              <time dateTime={j.comeca}>{aQueHoras(j.comeca)}</time>
            </p>
            <div className="apo-equipas">
              <b>{j.casa}</b>
              <span>vs</span>
              <b>{j.fora}</b>
            </div>
            <div className="apo-cotacoes">
              {DE_LADO.map(({ escolha, curto }) => {
                const cotacao = j.cotacoes[escolha];
                if (!cotacao) return null;
                const escolhido = posta?.jogo.id === j.id && posta.escolha === escolha;
                return (
                  <button
                    key={escolha}
                    type="button"
                    className={`apo-cotacao${escolhido ? ' escolhido' : ''}`}
                    onClick={() => {
                      setRecado('');
                      setPosta(escolhido ? null : { jogo: j, escolha });
                    }}
                  >
                    <span className="apo-quem">
                      {escolha === 'casa' ? j.casa : escolha === 'fora' ? j.fora : 'Empate'}
                    </span>
                    <span className="apo-curto">{curto}</span>
                    <span className="apo-preco">{cotacao.toFixed(2)}</span>
                  </button>
                );
              })}
            </div>
          </article>
        ))}
      </div>

      {recado && <p className="recado mal">{recado}</p>}

      {/* ---- o talão, que só aparece quando há uma escolha em cima da mesa ---- */}

      {posta && (
        <div className="apo-talao">
          <p className="apo-talao-quem">
            <b>
              {posta.escolha === 'casa'
                ? posta.jogo.casa
                : posta.escolha === 'fora'
                  ? posta.jogo.fora
                  : 'Empate'}
            </b>
            <span>
              {posta.jogo.casa} vs {posta.jogo.fora}, a{' '}
              {posta.jogo.cotacoes[posta.escolha]?.toFixed(2)}
            </span>
          </p>

          <div className="apo-fichas">
            {FICHAS.map((f) => (
              <button
                key={f}
                type="button"
                className={quanto === f ? 'escolhido' : ''}
                onClick={() => setQuanto(f)}
                disabled={f > saldo}
              >
                {f}
              </button>
            ))}
            <input
              type="number"
              min={APOSTA_MINIMA}
              max={Math.min(APOSTA_MAXIMA, saldo)}
              value={quanto}
              onChange={(e) => setQuanto(Math.trunc(Number(e.target.value) || 0))}
              aria-label="Quanto pôr"
            />
          </div>

          <p className="apo-paga">
            Se acertares, voltam{' '}
            <b>{Math.round(quanto * (posta.jogo.cotacoes[posta.escolha] || 0))}</b> torrões.
          </p>

          <div className="apo-talao-botoes">
            <button className="btn" type="button" onClick={() => setPosta(null)}>
              Deixa estar
            </button>
            <button
              className="btn azul"
              type="button"
              onClick={apostar}
              disabled={aPor || quanto < APOSTA_MINIMA || quanto > saldo}
            >
              {aPor ? 'A pôr...' : `Apostar ${quanto}`}
            </button>
          </div>
        </div>
      )}

      {/* ---- as minhas apostas ---- */}

      {minhas.length > 0 && (
        <div className="apo-minhas">
          <h2>As tuas apostas</h2>
          {abertas.length === 0 && <p className="notas">Não tens nenhuma por fechar.</p>}
          <ul>
            {[...abertas, ...fechadas].map((a) => (
              <li key={a.id} className={`apo-minha ${a.estado}`}>
                <div>
                  <b>{nomeDaEscolha(a)}</b>
                  <span className="apo-minha-jogo">
                    {a.casa} vs {a.fora}
                  </span>
                </div>
                <div className="apo-minha-numeros">
                  <span className="apo-minha-posta">
                    {a.quanto} a {a.cotacao.toFixed(2)}
                  </span>
                  <span className="apo-minha-estado">
                    {a.estado === 'aberta'
                      ? aQueHoras(a.comeca)
                      : a.estado === 'ganha'
                        ? `Ganhaste ${a.volta}`
                        : a.estado === 'anulada'
                          ? `Anulada, voltaram ${a.volta}`
                          : 'Não deu'}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      <p className="notas apo-regras">
        A cotação que conta é a que estava quando apostaste, e fica guardada com a aposta. Um jogo
        que acabe empatado sem se poder ter apostado no empate devolve o que puseste, e um jogo que
        seja adiado e nunca mais se faça devolve tudo ao fim de uma semana. Os jogos e as
        cotações são atualizados de seis em seis horas.
      </p>
    </section>
  );
}
