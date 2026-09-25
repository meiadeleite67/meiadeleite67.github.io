import { useCallback, useEffect, useMemo, useState } from 'react';
import { api, temServidor } from '../lib/api';
import { passeDe } from '../lib/nick';
import { quandoEmPalavras } from '../lib/dados';
import type {
  ApostaDesportiva,
  Escolha,
  Escolhida,
  JogoDeApostas,
  PernaDeAposta,
  Pontuacao,
  QuadroDeJogos
} from '../lib/tipos';

/**
 * As apostas desportivas.
 *
 * É o único jogo da casa que não acaba enquanto se está a olhar para ele.
 * Põe-se a aposta hoje, os torrões saem da carteira logo, e o prémio só chega
 * quando os jogos acabarem, que pode ser esta noite ou no domingo.
 *
 * A página tem três partes, como uma casa de apostas tem: a coluna da esquerda
 * para escolher o que se quer ver, a lista dos jogos no meio, e o boletim no
 * canto de baixo, que vai juntando o que se escolheu. É o boletim que permite
 * as múltiplas: duas ou mais escolhas num bilhete só, com as cotações
 * multiplicadas umas pelas outras e todas obrigadas a acertar.
 *
 * Os jogos e as cotações vêm de uma feed a sério, mas não se vão lá buscar
 * quando alguém abre a página: vêm do que o servidor guardou na última volta,
 * que dá de seis em seis horas. O plano que temos é contado ao pedido, e um
 * pedido por cada visita gastava o mês numa tarde. É também por isso que a
 * página de cada jogo não mostra mais mercados do que o vencedor: o total de
 * golos e o handicap custariam três créditos por cada jogo aberto, e não há
 * mês que aguente isso.
 *
 * A cotação que conta é a que estava quando se apostou, e fica guardada dentro
 * da aposta. É assim numa casa de apostas e é a única maneira honesta: de outra
 * forma o prémio mudava depois de a pessoa já não poder fazer nada quanto a ele.
 */

/** O que se pode pôr de uma vez, para não se estar a escrever números. */
const FICHAS = [10, 25, 50, 100];
const APOSTA_MINIMA = 5;
const APOSTA_MAXIMA = 500;
/** O mesmo número que está no servidor. Aqui serve só para não deixar juntar
 *  mais do que ele vai aceitar. */
const PERNAS_NO_MAXIMO = 8;

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

const quemE = (escolha: Escolha, jogo: { casa: string; fora: string }) =>
  escolha === 'casa' ? jogo.casa : escolha === 'fora' ? jogo.fora : 'Empate';

/** O número do jogo que está no endereço, se estiver algum. */
const jogoNoEndereco = () => new URLSearchParams(window.location.search).get('jogo') || '';

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

  /** O boletim: o que está escolhido e ainda não foi apostado. */
  const [boletim, setBoletim] = useState<Escolhida[]>([]);
  const [aberto, setAberto] = useState(false);
  const [quanto, setQuanto] = useState(FICHAS[0]);
  const [aPor, setAPor] = useState(false);

  /** Que desporto se está a ver, e que jogo está aberto em detalhe. */
  const [desporto, setDesporto] = useState('');
  const [aVerJogo, setAVerJogo] = useState(jogoNoEndereco);

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

  /* O jogo aberto em detalhe vive no endereço, para se poder mandar a alguém e
     para o botão de voltar do browser fazer o que se espera dele. */
  useEffect(() => {
    const aoVoltar = () => setAVerJogo(jogoNoEndereco());
    window.addEventListener('popstate', aoVoltar);
    return () => window.removeEventListener('popstate', aoVoltar);
  }, []);

  const abrirJogo = useCallback((id: string) => {
    setAVerJogo(id);
    const url = new URL(window.location.href);
    if (id) url.searchParams.set('jogo', id);
    else url.searchParams.delete('jogo');
    window.history.pushState({}, '', url);
  }, []);

  /* Os jogos por desporto e por liga, para a coluna da esquerda. Sai da lista
     que veio e não de uma lista à parte: se a feed um dia trouxer outro
     desporto, ele aparece ali sozinho. */
  const arrumados = useMemo(() => {
    const por = new Map<string, { quantos: number; ligas: Map<string, number> }>();
    (quadro?.jogos || []).forEach((j) => {
      const d = j.desporto || 'Outros';
      const ja = por.get(d) || { quantos: 0, ligas: new Map<string, number>() };
      ja.quantos += 1;
      ja.ligas.set(j.liga, (ja.ligas.get(j.liga) || 0) + 1);
      por.set(d, ja);
    });
    return por;
  }, [quadro]);

  const aVer = desporto && arrumados.has(desporto) ? desporto : '';
  const jogos = useMemo(
    () => (quadro?.jogos || []).filter((j) => !aVer || j.desporto === aVer),
    [quadro, aVer]
  );

  const oJogoAberto = useMemo(
    () => (quadro?.jogos || []).find((j) => j.id === aVerJogo) || null,
    [quadro, aVerJogo]
  );

  const abertas = minhas.filter((a) => a.estado === 'aberta');
  const fechadas = minhas.filter((a) => a.estado !== 'aberta');
  const presos = abertas.reduce((s, a) => s + a.quanto, 0);

  /* A cotação do boletim: as das escolhas todas multiplicadas umas pelas
     outras, a duas casas, que é como o servidor a vai calcular. */
  const cotacaoDoBoletim = useMemo(
    () =>
      Math.round(boletim.reduce((tudo, e) => tudo * (e.jogo.cotacoes[e.escolha] || 1), 1) * 100) /
      100,
    [boletim]
  );

  const noBoletim = useCallback(
    (jogo: string, escolha?: Escolha) =>
      boletim.some((e) => e.jogo.id === jogo && (escolha === undefined || e.escolha === escolha)),
    [boletim]
  );

  /** Põe ou tira uma escolha do boletim. Duas escolhas do mesmo jogo não podem
   *  ir juntas na mesma múltipla, por isso a segunda substitui a primeira. */
  const escolher = useCallback((jogo: JogoDeApostas, escolha: Escolha) => {
    setRecado('');
    setBoletim((antes) => {
      const igual = antes.find((e) => e.jogo.id === jogo.id && e.escolha === escolha);
      if (igual) return antes.filter((e) => e !== igual);
      const semEste = antes.filter((e) => e.jogo.id !== jogo.id);
      if (semEste.length >= PERNAS_NO_MAXIMO) return antes;
      return [...semEste, { jogo, escolha }];
    });
    setAberto(true);
  }, []);

  async function apostar() {
    if (boletim.length === 0 || aPor) return;
    setAPor(true);
    setRecado('');
    try {
      const r = await api.apostar(
        nome,
        passe,
        boletim.map((e) => ({ jogo: e.jogo.id, escolha: e.escolha })),
        quanto
      );
      setLinha(r.linha);
      setMinhas((antes) => [r.aposta, ...antes]);
      setBoletim([]);
      setAberto(false);
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

      {aCarregar && <p className="notas">A ver o que há hoje...</p>}

      {!aCarregar && quadro && !quadro.temFeed && jogos.length === 0 && (
        <p className="recado mal">
          O servidor ainda não tem chave da feed dos jogos, por isso não há nada para apostar.
        </p>
      )}

      <div className="apo-corpo">
        {/* ---- a coluna dos desportos ---- */}
        {arrumados.size > 0 && (
          <aside className="apo-lado">
            <h2>Desportos</h2>
            <ul>
              <li>
                <button
                  type="button"
                  className={aVer === '' ? 'escolhido' : ''}
                  onClick={() => setDesporto('')}
                >
                  <span>Tudo</span>
                  <b>{quadro?.jogos.length || 0}</b>
                </button>
              </li>
              {[...arrumados.entries()].map(([d, contas]) => (
                <li key={d}>
                  <button
                    type="button"
                    className={aVer === d ? 'escolhido' : ''}
                    onClick={() => setDesporto(d)}
                  >
                    <span>{d}</span>
                    <b>{contas.quantos}</b>
                  </button>
                  {aVer === d && contas.ligas.size > 0 && (
                    <ul className="apo-ligas">
                      {[...contas.ligas.entries()].map(([liga, quantos]) => (
                        <li key={liga}>
                          <span>{liga}</span>
                          <b>{quantos}</b>
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              ))}
            </ul>
          </aside>
        )}

        {/* ---- os jogos ---- */}
        <div className="apo-meio">
          {!aCarregar && quadro?.temFeed && jogos.length === 0 && (
            <p className="notas">
              Não há jogos à espera. Ou já começaram todos, ou a próxima volta ainda não trouxe os
              de hoje.
            </p>
          )}

          <div className="apo-jogos">
            {jogos.map((j) => (
              <article key={j.id} className={`apo-jogo${noBoletim(j.id) ? ' no-boletim' : ''}`}>
                <button
                  className="apo-abrir"
                  type="button"
                  onClick={() => abrirJogo(j.id)}
                  title="Ver o jogo"
                >
                  <span className="apo-liga">
                    <span>{j.liga || j.desporto}</span>
                    <time dateTime={j.comeca}>{aQueHoras(j.comeca)}</time>
                  </span>
                  <span className="apo-equipas">
                    <b>{j.casa}</b>
                    <b>{j.fora}</b>
                  </span>
                </button>
                <div className="apo-cotacoes">
                  {DE_LADO.map(({ escolha, curto }) => {
                    const cotacao = j.cotacoes[escolha];
                    if (!cotacao) return null;
                    return (
                      <button
                        key={escolha}
                        type="button"
                        className={`apo-cotacao${noBoletim(j.id, escolha) ? ' escolhido' : ''}`}
                        onClick={() => escolher(j, escolha)}
                        title={quemE(escolha, j)}
                      >
                        <span className="apo-curto">{curto}</span>
                        <span className="apo-preco">{cotacao.toFixed(2)}</span>
                      </button>
                    );
                  })}
                </div>
              </article>
            ))}
          </div>
        </div>
      </div>

      {recado && <p className="recado mal">{recado}</p>}

      {/* ---- as minhas apostas ---- */}

      {minhas.length > 0 && (
        <div className="apo-minhas">
          <h2>As tuas apostas</h2>
          {abertas.length === 0 && <p className="notas">Não tens nenhuma por fechar.</p>}
          <ul>
            {[...abertas, ...fechadas].map((a) => (
              <Bilhete key={a.id} aposta={a} />
            ))}
          </ul>
        </div>
      )}

      <p className="notas apo-regras">
        A cotação que conta é a que estava quando apostaste, e fica guardada com a aposta. Numa
        múltipla as cotações multiplicam-se e todas têm de acertar. Um jogo que acabe empatado sem
        se poder ter apostado no empate conta 1,00 em vez de fazer perder o bilhete, e um jogo que
        seja adiado e nunca mais se faça faz o mesmo ao fim de uma semana. Os jogos e as cotações
        são atualizados de seis em seis horas.
      </p>

      {oJogoAberto && (
        <DetalheDoJogo
          jogo={oJogoAberto}
          minhas={minhas}
          noBoletim={noBoletim}
          escolher={escolher}
          fechar={() => abrirJogo('')}
        />
      )}

      {boletim.length > 0 && (
        <Boletim
          boletim={boletim}
          cotacao={cotacaoDoBoletim}
          aberto={aberto}
          setAberto={setAberto}
          quanto={quanto}
          setQuanto={setQuanto}
          saldo={saldo}
          aPor={aPor}
          apostar={apostar}
          tirar={(e) => setBoletim((antes) => antes.filter((x) => x !== e))}
          limpar={() => setBoletim([])}
        />
      )}
    </section>
  );
}

/* ======================== um bilhete já apostado ======================== */

function Bilhete({ aposta }: { aposta: ApostaDesportiva }) {
  /* Uma aposta sem pernas nao existe, mas se alguma vez aparecer uma, e melhor
     nao a mostrar do que levar a pagina toda atras dela. */
  if (!Array.isArray(aposta.pernas) || aposta.pernas.length === 0) return null;

  const multipla = aposta.pernas.length > 1;
  const cabeca = multipla
    ? `Múltipla de ${aposta.pernas.length}`
    : quemE(aposta.pernas[0].escolha, aposta.pernas[0]);

  return (
    <li className={`apo-minha ${aposta.estado}`}>
      <div className="apo-minha-cima">
        <b>{cabeca}</b>
        <span className="apo-minha-posta">
          {aposta.quanto} a {(aposta.cotacaoFinal || aposta.cotacao).toFixed(2)}
        </span>
      </div>
      <ul className="apo-minha-pernas">
        {aposta.pernas.map((p) => (
          <li key={p.jogo} className={p.estado}>
            <span className="apo-perna-quem">{quemE(p.escolha, p)}</span>
            <span className="apo-perna-jogo">
              {p.casa} - {p.fora}
            </span>
            <span className="apo-perna-cotacao">{p.cotacao.toFixed(2)}</span>
          </li>
        ))}
      </ul>
      <p className="apo-minha-estado">
        {aposta.estado === 'aberta'
          ? `Por fechar. Se acertar, voltam ${Math.round(aposta.quanto * aposta.cotacao)}.`
          : aposta.estado === 'ganha'
            ? `Ganhaste ${aposta.volta}.`
            : aposta.estado === 'anulada'
              ? `Anulada, voltaram ${aposta.volta}.`
              : 'Não deu.'}
      </p>
    </li>
  );
}

/* ======================== o detalhe de um jogo ======================== */

/**
 * O que se sabe de um jogo: tudo o que já temos guardado, e nada de novo.
 *
 * Não se vai buscar nada à feed ao abrir isto, e é de propósito. Mercados como
 * o total de golos ou o handicap custam três créditos por cada jogo que alguém
 * abrisse, e com o plano que temos isso davam uns cento e cinquenta cliques no
 * mês inteiro, para o grupo todo. Aqui mostra-se o que não custa nada: quem
 * joga, quando, a cotação de cada lado com a casa de apostas de onde ela veio,
 * a margem que essa casa está a levar, e o que a pessoa já apostou neste jogo.
 */
function DetalheDoJogo({
  jogo,
  minhas,
  noBoletim,
  escolher,
  fechar
}: {
  jogo: JogoDeApostas;
  minhas: ApostaDesportiva[];
  noBoletim: (jogo: string, escolha?: Escolha) => boolean;
  escolher: (jogo: JogoDeApostas, escolha: Escolha) => void;
  fechar: () => void;
}) {
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      if (e.key === 'Escape') fechar();
    };
    window.addEventListener('keydown', tecla);
    return () => window.removeEventListener('keydown', tecla);
  }, [fechar]);

  /** As pernas que a pessoa já tem neste jogo, de qualquer bilhete. */
  const pernasAqui: { aposta: ApostaDesportiva; perna: PernaDeAposta }[] = [];
  minhas.forEach((a) =>
    (a.pernas || []).forEach((p) => {
      if (p.jogo === jogo.id) pernasAqui.push({ aposta: a, perna: p });
    })
  );

  /* A margem da casa. Somadas as probabilidades que cada cotação implica, o que
     passa dos cem por cento é o que a casa de apostas está a levar. Não muda
     nada no jogo, mas é o número que explica porque é que as cotações não são
     justas, e não custa nada mostrá-lo. */
  const implicita = (c?: number) => (c ? 1 / c : 0);
  const soma =
    implicita(jogo.cotacoes.casa) + implicita(jogo.cotacoes.fora) + implicita(jogo.cotacoes.empate);
  const margem = soma > 1 ? (soma - 1) * 100 : 0;

  return (
    <div className="modal-fundo apo-detalhe" role="dialog" aria-modal="true" onClick={fechar}>
      <div className="apo-detalhe-caixa" onClick={(e) => e.stopPropagation()}>
        <button className="apo-fechar" type="button" onClick={fechar} aria-label="Fechar">
          ×
        </button>

        <p className="eyebrow">{jogo.liga || jogo.desporto}</p>
        <h2 className="apo-detalhe-titulo">
          {jogo.casa} <span>vs</span> {jogo.fora}
        </h2>
        <p className="apo-detalhe-quando">
          <time dateTime={jogo.comeca}>{aQueHoras(jogo.comeca)}</time>
        </p>

        <h3>Quem ganha</h3>
        <div className="apo-cotacoes grandes">
          {DE_LADO.map(({ escolha, curto }) => {
            const cotacao = jogo.cotacoes[escolha];
            if (!cotacao) return null;
            return (
              <button
                key={escolha}
                type="button"
                className={`apo-cotacao${noBoletim(jogo.id, escolha) ? ' escolhido' : ''}`}
                onClick={() => escolher(jogo, escolha)}
              >
                <span className="apo-quem">{quemE(escolha, jogo)}</span>
                <span className="apo-curto">{curto}</span>
                <span className="apo-preco">{cotacao.toFixed(2)}</span>
              </button>
            );
          })}
        </div>

        <h3>A ficha do jogo</h3>
        <dl className="apo-ficha">
          <div>
            <dt>Desporto</dt>
            <dd>{jogo.desporto || 'não diz'}</dd>
          </div>
          <div>
            <dt>Competição</dt>
            <dd>{jogo.liga || 'não diz'}</dd>
          </div>
          <div>
            <dt>Em casa</dt>
            <dd>{jogo.casa}</dd>
          </div>
          <div>
            <dt>Visitante</dt>
            <dd>{jogo.fora}</dd>
          </div>
          {jogo.cotacoes.fonte && (
            <div>
              <dt>Cotações de</dt>
              <dd>{jogo.cotacoes.fonte}</dd>
            </div>
          )}
          {!!jogo.casasDeApostas && (
            <div>
              <dt>Casas com preço</dt>
              <dd>{jogo.casasDeApostas}</dd>
            </div>
          )}
          {margem > 0 && (
            <div>
              <dt>Margem da casa</dt>
              <dd>{margem.toFixed(1)} por cento</dd>
            </div>
          )}
          <div>
            <dt>Empate</dt>
            <dd>{jogo.cotacoes.empate ? 'dá para apostar' : 'não há neste desporto'}</dd>
          </div>
        </dl>

        {pernasAqui.length > 0 && (
          <>
            <h3>O que já apostaste aqui</h3>
            <ul className="apo-detalhe-minhas">
              {pernasAqui.map(({ aposta, perna }) => (
                <li key={aposta.id} className={perna.estado}>
                  <b>{quemE(perna.escolha, perna)}</b>
                  <span>
                    {aposta.quanto} torrões a {perna.cotacao.toFixed(2)}
                    {aposta.pernas.length > 1 ? `, numa múltipla de ${aposta.pernas.length}` : ''}
                  </span>
                </li>
              ))}
            </ul>
          </>
        )}

        <p className="notas">
          Aqui só se aposta em quem ganha. Mais mercados, como o total de golos ou o handicap,
          custariam à feed três créditos por cada jogo aberto, e o plano que temos não dá para isso.
        </p>
      </div>
    </div>
  );
}

/* ============================== o boletim ============================== */

/**
 * O boletim, no canto de baixo.
 *
 * Fechado é uma barra com o número de escolhas e a cotação total; aberto é a
 * lista delas, a quantia e o botão de apostar. Uma escolha é uma simples e
 * várias são uma múltipla, sem ninguém ter de escolher qual: o que manda é
 * quantas coisas estão aqui dentro.
 */
function Boletim({
  boletim,
  cotacao,
  aberto,
  setAberto,
  quanto,
  setQuanto,
  saldo,
  aPor,
  apostar,
  tirar,
  limpar
}: {
  boletim: Escolhida[];
  cotacao: number;
  aberto: boolean;
  setAberto: (b: boolean) => void;
  quanto: number;
  setQuanto: (n: number) => void;
  saldo: number;
  aPor: boolean;
  apostar: () => void;
  tirar: (e: Escolhida) => void;
  limpar: () => void;
}) {
  const multipla = boletim.length > 1;
  return (
    <div className={`apo-boletim${aberto ? ' aberto' : ''}`}>
      <button
        className="apo-boletim-barra"
        type="button"
        onClick={() => setAberto(!aberto)}
        aria-expanded={aberto}
      >
        <span className="apo-boletim-conta">
          <svg width="19" height="19" viewBox="0 0 24 24" aria-hidden="true">
            <path
              d="M5.5 3h9l4 4v14h-13z"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinejoin="round"
            />
            <path d="M8.5 10h7M8.5 14h7M8.5 18h4" stroke="currentColor" strokeWidth="1.8" />
          </svg>
          <b>{boletim.length}</b>
        </span>
        <span className="apo-boletim-cotacao">{cotacao.toFixed(2)}</span>
        <span className="apo-boletim-seta" aria-hidden="true">
          {aberto ? '▾' : '▴'}
        </span>
      </button>

      {aberto && (
        <div className="apo-boletim-dentro">
          <p className="apo-boletim-cabeca">
            <span>{multipla ? `Múltipla de ${boletim.length}` : 'Aposta simples'}</span>
            <button type="button" onClick={limpar}>
              Limpar
            </button>
          </p>

          <ul className="apo-boletim-lista">
            {boletim.map((e) => (
              <li key={`${e.jogo.id}:${e.escolha}`}>
                <div>
                  <b>{quemE(e.escolha, e.jogo)}</b>
                  <span>
                    {e.jogo.casa} - {e.jogo.fora}
                  </span>
                </div>
                <span className="apo-boletim-preco">
                  {(e.jogo.cotacoes[e.escolha] || 0).toFixed(2)}
                </span>
                <button type="button" onClick={() => tirar(e)} aria-label="Tirar do boletim">
                  ×
                </button>
              </li>
            ))}
          </ul>

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
            Se acertar{multipla ? ' tudo' : ''}, voltam <b>{Math.round(quanto * cotacao)}</b>{' '}
            torrões.
          </p>

          <button
            className="btn azul apo-apostar"
            type="button"
            onClick={apostar}
            disabled={aPor || quanto < APOSTA_MINIMA || quanto > saldo}
          >
            {aPor ? 'A pôr...' : `Apostar ${quanto}`}
          </button>
        </div>
      )}
    </div>
  );
}
