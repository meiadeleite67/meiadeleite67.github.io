import { useCallback, useEffect, useMemo, useState } from 'react';
import { api, temServidor } from '../lib/api';
import { passeDe } from '../lib/nick';
import { comEsta, guardarBoletim, lerBoletim } from '../lib/boletim';
import { enderecoDaPartida, guardarJogoDeUmaAposta } from './Partida';
import { quandoEmPalavras } from '../lib/dados';
import type {
  ApostaDesportiva,
  Escolha,
  Escolhida,
  JogoDeApostas,
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

/** Se o jogo ja comecou. A partir dai as cotacoes trancam-se: o servidor
 *  recusa a aposta na mesma, e isto e so para nao se carregar em vao. */
const jaComecou = (jogo: { comeca: string }) => Date.parse(jogo.comeca) <= Date.now();

/** Se ha resultado para mostrar. A fonte nova da-o; a antiga nao dava. */
const temMarca = (j: { marcaCasa?: number | null; marcaFora?: number | null }) =>
  typeof j.marcaCasa === 'number' && typeof j.marcaFora === 'number';

const quemE = (escolha: Escolha, jogo: { casa: string; fora: string }) =>
  escolha === 'casa' ? jogo.casa : escolha === 'fora' ? jogo.fora : 'Empate';

/** O número do jogo que está no endereço, se estiver algum. */

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
  /* O boletim vem do armazenamento e volta para lá a cada mudança. Uma escolha
     feita na página de uma partida tem de sobreviver à viagem de volta, e quem
     recarrega a página sem querer não perde o que já escolheu. */
  const [boletim, setBoletim] = useState<Escolhida[]>(lerBoletim);
  const [aberto, setAberto] = useState(false);
  const [quanto, setQuanto] = useState(FICHAS[0]);
  const [aPor, setAPor] = useState(false);

  /** Se se está a ver a lista dos jogos ou as apostas que já se puseram. */
  const [vista, setVista] = useState<'jogos' | 'minhas'>('jogos');

  /** O que se está a ver: um desporto, ou uma competição dentro dele. Vazio é
   *  tudo. E que jogo está aberto em detalhe. */
  const [filtro, setFiltro] = useState<{ desporto: string; liga: string }>({
    desporto: '',
    liga: ''
  });

  const passe = nome ? passeDe(nome) : '';
  const saldo = linha ? linha.torroes : 0;

  /* Os links de /apostas?jogo=<numero> sao de quando o detalhe era um popup
     desta pagina. Continuam a funcionar: levam a pagina da partida, que e onde
     essa coisa vive agora. Um link partilhado no grupo nao pode morrer por
     causa de uma arrumacao nossa. */
  useEffect(() => {
    const velho = new URLSearchParams(window.location.search).get('jogo');
    if (velho) window.location.replace(enderecoDaPartida(velho));
  }, []);

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

  /* Abrir um jogo é ir para a página dele, e não abrir um popup por cima
     desta. Uma partida tem tabela, histórico e o que aconteceu ao minuto: é
     uma página, com endereço que se manda a alguém e botão de voltar que faz o
     que se espera dele.

     Vai-se pelo endereço e não pelo irPara da casa, porque isto é uma página
     inteira a mudar e não um separador: assim o browser trata do resto. */
  const abrirJogo = useCallback(
    (id: string) => {
      if (!id) return;
      /* Uma perna de uma aposta pode apontar para um jogo que já saiu da
         prateleira. O que a aposta guardou dele vai à frente, para a página
         ter o que mostrar quando o servidor já não o conhecer. */
      const daLista = (quadro?.jogos || []).some((j) => j.id === id);
      if (!daLista) {
        for (const a of minhas) {
          const perna = (a.pernas || []).find((x) => x.jogo === id);
          if (!perna) continue;
          guardarJogoDeUmaAposta({
            id: perna.jogo,
            chave: perna.chave,
            liga: perna.liga,
            desporto: perna.desporto,
            casa: perna.casa,
            fora: perna.fora,
            comeca: perna.comeca,
            cotacoes: null
          });
          break;
        }
      }
      window.location.href = enderecoDaPartida(id);
    },
    [quadro, minhas]
  );

  /* Os jogos por desporto e por liga, para a coluna da esquerda. Sai da lista
     que veio e não de uma lista à parte: se a feed um dia trouxer outro
     desporto, ele aparece ali sozinho. */
  const arrumados = useMemo(() => {
    const por = new Map<string, { quantos: number; ligas: Map<string, number> }>();
    /* Os desportos que o servidor segue entram todos, mesmo a zero: um que
       desaparecesse da lista parecia um erro, e o que se passa e so que nao ha
       nada a jogar nele esta semana. */
    (quadro?.desportos || []).forEach((d) =>
      por.set(d, { quantos: 0, ligas: new Map<string, number>() })
    );
    (quadro?.jogos || []).forEach((j) => {
      const d = j.desporto || 'Outros';
      const ja = por.get(d) || { quantos: 0, ligas: new Map<string, number>() };
      ja.quantos += 1;
      ja.ligas.set(j.liga, (ja.ligas.get(j.liga) || 0) + 1);
      por.set(d, ja);
    });
    return por;
  }, [quadro]);

  /* Um filtro que já não existe, porque os jogos daquela competição começaram
     todos, não pode deixar a página vazia: cai para o desporto, e daí para
     tudo. */
  const aVer = filtro.desporto && arrumados.has(filtro.desporto) ? filtro.desporto : '';
  const aVerLiga = aVer && arrumados.get(aVer)?.ligas.has(filtro.liga) ? filtro.liga : '';

  const jogos = useMemo(
    () =>
      (quadro?.jogos || []).filter(
        (j) => (!aVer || j.desporto === aVer) && (!aVerLiga || j.liga === aVerLiga)
      ),
    [quadro, aVer, aVerLiga]
  );

  const abertas = minhas.filter((a) => a.estado === 'aberta');
  const fechadas = minhas.filter((a) => a.estado !== 'aberta');
  const presos = abertas.reduce((s, a) => s + a.quanto, 0);

  /* A cotação do boletim: as das escolhas todas multiplicadas umas pelas
     outras, a duas casas, que é como o servidor a vai calcular. */
  const cotacaoDoBoletim = useMemo(
    () =>
      Math.round(boletim.reduce((tudo, e) => tudo * (e.jogo.cotacoes?.[e.escolha] || 1), 1) * 100) /
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
    if (jaComecou(jogo) || !jogo.cotacoes?.[escolha]) return;
    setRecado('');
    setBoletim((antes) => {
      /* O boletim abre-se sozinho só quando a primeira escolha entra num
         boletim vazio. Dali para a frente fica como a pessoa o deixou: no
         telemóvel ele tapa meio ecrã, e abrir-se a cada escolha obrigava a
         fechá-lo outra vez para se ir buscar a seguinte. */
      if (antes.length === 0) setAberto(true);

      return comEsta(antes, jogo, escolha).boletim;
    });
  }, []);

  useEffect(() => {
    guardarBoletim(boletim);
  }, [boletim]);

  async function apostar() {
    if (boletim.length === 0 || aPor) return;
    /* Sem nome nao ha carteira de onde tirar, e por isso pede-se agora em vez
       de se ter pedido a entrada. O boletim fica como esta, para nao se perder
       o que ja se escolheu. */
    if (!nome || !passe) return pedirNome();
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
      /* Quem acaba de apostar quer ver a aposta, e não voltar para a lista dos
         jogos como se nada tivesse acontecido. */
      setVista('minhas');
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

  return (
    <section className="apo">
      <header className="apo-cima">
        <p className="eyebrow">Jogos a sério, torrões a fingir</p>
        <h1>Apostas desportivas</h1>
        {/* Os jogos veem-se sem se entrar, como numa casa de apostas: o nome
            so faz falta na hora de apostar, e e ai que ele se pede. */}
        {nome ? (
          <p className="apo-saldo">
            <b>{saldo}</b>
            <small>
              torrões de {nome}
              {presos > 0 ? `, e ${presos} presos em apostas` : ''}
            </small>
          </p>
        ) : (
          <p className="lead apo-convite">
            Futebol, basquetebol e ténis, com as cotações que as casas de apostas estão mesmo a
            dar. Vê o que há à vontade; o nome só faz falta na hora de apostar.{' '}
            <button type="button" className="como-link" onClick={pedirNome}>
              Entrar com o meu nome
            </button>
            .
          </p>
        )}
      </header>

      {aCarregar && <p className="notas">A ver o que há hoje...</p>}

      {!aCarregar && quadro && !quadro.temFeed && jogos.length === 0 && (
        <p className="recado mal">
          O servidor ainda não tem chave da feed dos jogos, por isso não há nada para apostar.
        </p>
      )}

      <div className={`apo-corpo${arrumados.size > 0 ? ' com-lado' : ''}`}>
        {/* ---- a coluna dos desportos ---- */}
        {arrumados.size > 0 && (
          <aside className="apo-lado">
            {/* As apostas em curso estavam no fundo da página, debaixo de oitenta
                jogos, o que é o mesmo que não estarem em sítio nenhum. Ficam
                aqui, com a conta das que estão por fechar à vista. */}
            {nome && (
              <>
                <h2>O teu boletim</h2>
                <ul className="apo-lado-minhas">
                  <li>
                    <button
                      type="button"
                      className={vista === 'minhas' ? 'escolhido' : ''}
                      onClick={() => setVista('minhas')}
                    >
                      <span>As minhas apostas</span>
                      <b>{abertas.length || minhas.length}</b>
                    </button>
                  </li>
                </ul>
              </>
            )}

            <h2>Desportos</h2>
            <ul>
              <li>
                <button
                  type="button"
                  className={vista === 'jogos' && aVer === '' ? 'escolhido' : ''}
                  onClick={() => {
                    setVista('jogos');
                    setFiltro({ desporto: '', liga: '' });
                  }}
                >
                  <span>Tudo</span>
                  <b>{quadro?.jogos.length || 0}</b>
                </button>
              </li>
              {[...arrumados.entries()].map(([d, contas]) => (
                <li key={d}>
                  {/* Carregar num desporto escolhe-o e mostra as competicoes dele.
                      Nao alterna: alternar fazia com que carregar num desporto
                      ja escolhido o fechasse, o que a clicar se le como se ele
                      nao abrisse. Para voltar a tudo ha o "Tudo". */}
                  <button
                    type="button"
                    className={`${vista === 'jogos' && aVer === d ? 'escolhido' : ''}${
                      contas.quantos === 0 ? ' vazio' : ''
                    }`}
                    onClick={() => {
                      setVista('jogos');
                      setFiltro({ desporto: d, liga: '' });
                    }}
                  >
                    <span>{d}</span>
                    <b>{contas.quantos}</b>
                  </button>
                  {/* As competicoes de dentro do desporto escolhido. Carregar
                      numa ve-se so ela; carregar outra vez volta ao desporto
                      inteiro. */}
                  {aVer === d && contas.ligas.size > 0 && (
                    <ul className="apo-ligas">
                      {[...contas.ligas.entries()].map(([liga, quantos]) => (
                        <li key={liga}>
                          <button
                            type="button"
                            className={aVerLiga === liga ? 'escolhido' : ''}
                            onClick={() => {
                              setVista('jogos');
                              setFiltro({ desporto: d, liga });
                            }}
                          >
                            <span>{liga}</span>
                            <b>{quantos}</b>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              ))}
            </ul>
          </aside>
        )}

        {/* ---- o meio: os jogos, ou as apostas que já se puseram ---- */}
        <div className="apo-meio">
          {vista === 'minhas' ? (
            <AsMinhas
              minhas={minhas}
              abertas={abertas}
              fechadas={fechadas}
              presos={presos}
              aosJogos={() => setVista('jogos')}
              abrirJogo={abrirJogo}
            />
          ) : (
            <>
          {!aCarregar && quadro?.temFeed && jogos.length === 0 && (
            <div className="apo-vazio">
              <b>{aVer ? `Sem ${aVer.toLowerCase()} nestes dias` : 'Sem jogos à espera'}</b>
              <span>Aparece aqui assim que houver.</span>
            </div>
          )}

          <div className="apo-jogos">
            {jogos.map((j) => (
              <article
                key={j.id}
                className={`apo-jogo${noBoletim(j.id) ? ' no-boletim' : ''}${
                  jaComecou(j) ? ' a-decorrer' : ''
                }`}
              >
                <button
                  className="apo-abrir"
                  type="button"
                  onClick={() => abrirJogo(j.id)}
                  title="Ver o jogo"
                >
                  <span className="apo-liga">
                    <span>{j.liga || j.desporto}</span>
                    {jaComecou(j) ? (
                      <span className="apo-aovivo">
                        {j.acabou ? 'Acabou' : j.minuto ? `${j.minuto}'` : 'A decorrer'}
                      </span>
                    ) : (
                      <time dateTime={j.comeca}>{aQueHoras(j.comeca)}</time>
                    )}
                  </span>
                  {/* O resultado, quando a fonte o da. Vem na mesma chamada que
                      lista os jogos, por isso nao custa nada mostra-lo. */}
                  <span className="apo-equipas">
                    <b>
                      {j.casa}
                      {temMarca(j) && <i className="apo-marca">{j.marcaCasa}</i>}
                    </b>
                    <b>
                      {j.fora}
                      {temMarca(j) && <i className="apo-marca">{j.marcaFora}</i>}
                    </b>
                  </span>
                </button>
                <div className="apo-cotacoes">
                  {DE_LADO.map(({ escolha, curto }) => {
                    const cotacao = j.cotacoes?.[escolha];
                    if (!cotacao) return null;
                    return (
                      <button
                        key={escolha}
                        type="button"
                        className={`apo-cotacao${noBoletim(j.id, escolha) ? ' escolhido' : ''}`}
                        onClick={() => escolher(j, escolha)}
                        disabled={jaComecou(j)}
                        title={jaComecou(j) ? 'Este jogo já está a decorrer' : quemE(escolha, j)}
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
            </>
          )}
        </div>
      </div>

      {recado && <p className="recado mal">{recado}</p>}

      {/* ---- as minhas apostas ---- */}

      <p className="notas apo-regras">
        A cotação que conta é a que estava quando apostaste, e fica guardada com a aposta. Numa
        múltipla as cotações multiplicam-se e todas têm de acertar. Um jogo que acabe empatado sem
        se poder ter apostado no empate conta 1,00 em vez de fazer perder o bilhete, e um jogo que
        seja adiado e nunca mais se faça faz o mesmo ao fim de uma semana. Os jogos e as cotações
        são atualizados de seis em seis horas.
      </p>

      {boletim.length > 0 && (
        <Boletim
          boletim={boletim}
          cotacao={cotacaoDoBoletim}
          aberto={aberto}
          setAberto={setAberto}
          quanto={quanto}
          setQuanto={setQuanto}
          saldo={saldo}
          temNome={!!nome && !!passe}
          aPor={aPor}
          apostar={apostar}
          tirar={(e) => setBoletim((antes) => antes.filter((x) => x !== e))}
          limpar={() => setBoletim([])}
        />
      )}
    </section>
  );
}

/* ==================== as apostas que ja se puseram ==================== */

/**
 * O que a pessoa tem em curso e o que já lhe aconteceu.
 *
 * As que estão por fechar vêm à frente, que são as que interessam: são aquelas
 * em que há torrões presos à espera de um jogo acabar.
 */
function AsMinhas({
  minhas,
  abertas,
  fechadas,
  presos,
  aosJogos,
  abrirJogo
}: {
  minhas: ApostaDesportiva[];
  abertas: ApostaDesportiva[];
  fechadas: ApostaDesportiva[];
  presos: number;
  aosJogos: () => void;
  abrirJogo: (id: string) => void;
}) {
  /* O que se ganhou ao todo, para haver um numero que nao seja so o que esta
     preso. Conta as ganhas e as anuladas, que essas devolveram o que levaram. */
  const ganhou = minhas
    .filter((a) => a.estado === 'ganha')
    .reduce((soma, a) => soma + a.lucro, 0);

  return (
    <div className="apo-minhas">
      <div className="apo-minhas-cima">
        <h2>As tuas apostas</h2>
        <button type="button" className="como-link" onClick={aosJogos}>
          Ver os jogos
        </button>
      </div>

      {minhas.length === 0 ? (
        <div className="apo-minhas-vazio">
          <p>Ainda não puseste nenhuma.</p>
          <p className="notas">
            Escolhe uma cotação na lista dos jogos. Duas ou mais fazem uma múltipla, com as
            cotações multiplicadas umas pelas outras.
          </p>
          <button type="button" className="btn azul" onClick={aosJogos}>
            Ver os jogos
          </button>
        </div>
      ) : (
        <>
          <div className="apo-resumo">
            <div>
              <b>{abertas.length}</b>
              <span>por fechar</span>
            </div>
            <div>
              <b>{presos}</b>
              <span>torrões presos</span>
            </div>
            <div className={ganhou > 0 ? 'bem' : ganhou < 0 ? 'mal' : ''}>
              <b>
                {ganhou > 0 ? '+' : ''}
                {ganhou}
              </b>
              <span>ganhos até agora</span>
            </div>
          </div>

          {abertas.length > 0 && (
            <>
              <h3>Por fechar</h3>
              <ul>
                {abertas.map((a) => (
                  <Bilhete key={a.id} aposta={a} abrirJogo={abrirJogo} />
                ))}
              </ul>
            </>
          )}

          {fechadas.length > 0 && (
            <>
              <h3>Já fechadas</h3>
              <ul>
                {fechadas.map((a) => (
                  <Bilhete key={a.id} aposta={a} abrirJogo={abrirJogo} />
                ))}
              </ul>
            </>
          )}
        </>
      )}
    </div>
  );
}

/* ======================== um bilhete já apostado ======================== */

function Bilhete({
  aposta,
  abrirJogo
}: {
  aposta: ApostaDesportiva;
  abrirJogo: (id: string) => void;
}) {
  /* Uma aposta sem pernas nao existe, mas se alguma vez aparecer uma, e melhor
     nao a mostrar do que levar a pagina toda atras dela. */
  if (!Array.isArray(aposta.pernas) || aposta.pernas.length === 0) return null;

  const multipla = aposta.pernas.length > 1;
  const cotacao = aposta.cotacaoFinal || aposta.cotacao;
  const aPagar = Math.round(aposta.quanto * cotacao);

  const selo =
    aposta.estado === 'aberta'
      ? 'Por fechar'
      : aposta.estado === 'ganha'
        ? 'Ganha'
        : aposta.estado === 'anulada'
          ? 'Anulada'
          : 'Perdida';

  return (
    <li className={`apo-minha ${aposta.estado}`}>
      <div className="apo-minha-cima">
        <span className="apo-minha-tipo">
          {multipla ? `Múltipla de ${aposta.pernas.length}` : 'Simples'}
        </span>
        <span className={`apo-selo ${aposta.estado}`}>{selo}</span>
      </div>

      {/* Cada perna abre a pagina do jogo dela. Numa multipla de quatro, e a
          unica maneira de se ir ver um dos jogos sem ter de o procurar na
          lista. */}
      <ul className="apo-minha-pernas">
        {aposta.pernas.map((p) => (
          <li key={p.jogo} className={p.estado}>
            <button type="button" onClick={() => abrirJogo(p.jogo)} title="Ver este jogo">
              <span className="apo-perna-quem">{quemE(p.escolha, p)}</span>
              <span className="apo-perna-jogo">
                {p.casa} - {p.fora}
              </span>
              <span className="apo-perna-cotacao">{p.cotacao.toFixed(2)}</span>
            </button>
          </li>
        ))}
      </ul>

      <div className="apo-minha-baixo">
        <span>
          <b>{aposta.quanto}</b> torrões a <b>{cotacao.toFixed(2)}</b>
        </span>
        <span className="apo-minha-volta">
          {aposta.estado === 'aberta'
            ? `Se acertar, voltam ${aPagar}`
            : aposta.estado === 'ganha'
              ? `Voltaram ${aposta.volta}`
              : aposta.estado === 'anulada'
                ? `Devolvidos ${aposta.volta}`
                : 'Não voltou nada'}
        </span>
      </div>
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
  temNome,
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
  temNome: boolean;
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
                  {(e.jogo.cotacoes?.[e.escolha] || 0).toFixed(2)}
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
                disabled={temNome && f > saldo}
              >
                {f}
              </button>
            ))}
            <input
              type="number"
              min={APOSTA_MINIMA}
              max={temNome ? Math.min(APOSTA_MAXIMA, saldo) : APOSTA_MAXIMA}
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
            disabled={aPor || quanto < APOSTA_MINIMA || (temNome && quanto > saldo)}
          >
            {aPor ? 'A pôr...' : temNome ? `Apostar ${quanto}` : 'Entrar para apostar'}
          </button>
        </div>
      )}
    </div>
  );
}
