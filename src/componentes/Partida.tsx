/**
 * A página de uma partida: /partida?jogo=<número>.
 *
 * Isto era um popup dentro da lista das apostas, e um popup é o sítio errado
 * para uma coisa destas. Uma partida tem tabela, tem histórico, tem o que
 * aconteceu ao minuto: é uma página, e uma página tem endereço que se manda a
 * alguém, botão de voltar que funciona, e espaço para respirar no telemóvel.
 *
 * Os separadores não são enfeite, são orçamento. A feed dá cem pedidos por dia
 * e por desporto: se ao abrir a partida se fosse buscar as estatísticas, a
 * classificação e o histórico de uma vez, três pessoas a abrir três jogos numa
 * noite gastavam o que dá para todo o dia. Assim só se paga o separador que se
 * abre, e cada um deles guarda-se pela pergunta que faz e não pelo jogo: a
 * tabela da Segunda Divisão é a mesma para os onze jogos da jornada, e dois
 * adversários têm sempre o mesmo histórico.
 */
import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { comEsta, guardarBoletim, lerBoletim } from '../lib/boletim';
import type {
  AClassificacao,
  Escolha,
  ComoVaiOJogo,
  JogoDeApostas,
  OsConfrontos,
  UmConfronto
} from '../lib/tipos';

/* ---------------------------- o que se sabe ---------------------------- */

const jaComecou = (jogo: { comeca: string }) => Date.parse(jogo.comeca) <= Date.now();

const temMarca = (jogo: JogoDeApostas) =>
  typeof jogo.marcaCasa === 'number' && typeof jogo.marcaFora === 'number';

/** O número do jogo, tirado do endereço. */
export function jogoDoEndereco(): string {
  return new URLSearchParams(window.location.search).get('jogo') || '';
}

/** O endereço da página de um jogo, que é o que os links da lista usam. */
export const enderecoDaPartida = (id: string) => `/partida/?jogo=${encodeURIComponent(id)}`;

/* ---- o jogo que veio de uma aposta ----

   Um jogo sai da prateleira do servidor quando arrefece, mas a aposta que
   alguém lhe fez continua a apontar para ele. Quem clica nessa perna tem de
   ver alguma coisa, e o que há é o que a própria aposta guardou do jogo: as
   equipas, a liga e a hora. Fica aqui, nesta aba do browser, e é só uma
   sugestão: se o servidor souber do jogo, é o servidor que manda. */

const GAVETA = 'mdl-jogo-de-aposta';

export function guardarJogoDeUmaAposta(jogo: JogoDeApostas) {
  try {
    window.sessionStorage.setItem(GAVETA, JSON.stringify(jogo));
  } catch {
    /* sem gaveta, a página diz que o jogo já não está à vista, que é verdade */
  }
}

function jogoDaGaveta(id: string): JogoDeApostas | null {
  try {
    const cru = window.sessionStorage.getItem(GAVETA);
    if (!cru) return null;
    const j = JSON.parse(cru);
    return j && j.id === id ? (j as JogoDeApostas) : null;
  } catch {
    return null;
  }
}

function aQueHoras(quando: string): string {
  const d = new Date(quando);
  if (Number.isNaN(d.getTime())) return 'sem hora';
  const hoje = new Date();
  const mesmoDia = d.toDateString() === hoje.toDateString();
  const horas = d.toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' });
  if (mesmoDia) return `hoje às ${horas}`;
  return `${d.toLocaleDateString('pt-PT', { day: 'numeric', month: 'long' })}, ${horas}`;
}

/* ------------------------ a probabilidade ------------------------

   A barra de cima. Não se vai buscar a lado nenhum: sai das cotações que já
   temos, porque é literalmente o que uma cotação quer dizer. Uma cotação de
   2.00 é uma casa a dizer "isto acontece metade das vezes"; somadas, as três
   passam dos cem por cento, e o que passa é a margem dela. Tira-se a margem e
   ficam as probabilidades.

   Ter isto de graça, a partir de um número que já está na página, é melhor do
   que ir buscar previsões a um pedido por jogo. E é mais honesto: diz-se de
   onde vem. */

type Fatia = { quem: string; parte: number; cls: string };

function probabilidades(jogo: JogoDeApostas): Fatia[] {
  const c = jogo.cotacoes;
  if (!c) return [];
  const bruto = [
    { quem: jogo.casa, valor: c.casa, cls: 'casa' },
    { quem: 'Empate', valor: c.empate, cls: 'empate' },
    { quem: jogo.fora, valor: c.fora, cls: 'fora' }
  ].filter((x) => typeof x.valor === 'number' && (x.valor as number) > 1);

  const soma = bruto.reduce((t, x) => t + 1 / (x.valor as number), 0);
  if (soma <= 0) return [];

  return bruto.map((x) => ({
    quem: x.quem,
    cls: x.cls,
    parte: (1 / (x.valor as number) / soma) * 100
  }));
}

/* ---- apostar daqui ----

   As cotações estão nesta página porque é aqui que se decide: quem acabou de
   ver que a equipa de fora leva dezassete remates não devia ter de voltar à
   lista para poder apostar nisso.

   A escolha vai para o boletim, que vive no armazenamento e não dentro de uma
   página: é por isso que ela sobrevive à viagem. Fechar o bilhete continua a
   ser na lista, onde o boletim está à vista com o saldo e as fichas, e essa é
   uma viagem só. */

const DE_LADO: { escolha: Escolha; curto: string }[] = [
  { escolha: 'casa', curto: '1' },
  { escolha: 'empate', curto: 'X' },
  { escolha: 'fora', curto: '2' }
];

const quemE = (escolha: Escolha, jogo: { casa: string; fora: string }) =>
  escolha === 'casa' ? jogo.casa : escolha === 'fora' ? jogo.fora : 'Empate';

function Cotacoes({ jogo }: { jogo: JogoDeApostas }) {
  const [boletim, setBoletim] = useState(lerBoletim);

  const escolher = (escolha: Escolha) => {
    if (jaComecou(jogo) || !jogo.cotacoes?.[escolha]) return;
    const depois = comEsta(boletim, jogo, escolha).boletim;
    setBoletim(depois);
    guardarBoletim(depois);
  };

  const escolhido = (escolha: Escolha) =>
    boletim.some((e) => e.jogo.id === jogo.id && e.escolha === escolha);

  if (!jogo.cotacoes) return null;

  const quantas = boletim.length;

  return (
    <div className="par-aposta">
      <h2>Quem ganha</h2>
      <div className="par-cotacoes">
        {DE_LADO.map(({ escolha, curto }) => {
          const cotacao = jogo.cotacoes?.[escolha];
          if (!cotacao) return null;
          return (
            <button
              key={escolha}
              type="button"
              className={`apo-cotacao${escolhido(escolha) ? ' escolhido' : ''}`}
              onClick={() => escolher(escolha)}
              disabled={jaComecou(jogo)}
              title={jaComecou(jogo) ? 'Este jogo já está a decorrer' : quemE(escolha, jogo)}
            >
              <span className="apo-quem">{quemE(escolha, jogo)}</span>
              <span className="apo-curto">{curto}</span>
              <span className="apo-preco">{cotacao.toFixed(2)}</span>
            </button>
          );
        })}
      </div>

      {jaComecou(jogo) ? (
        <p className="notas">
          As cotações ficam trancadas a partir da hora de começo, aqui e em qualquer casa de
          apostas: quem está a ver o jogo saberia sempre mais do que quem não está.
        </p>
      ) : quantas > 0 ? (
        <p className="notas par-no-boletim">
          {quantas === 1
            ? 'Uma escolha no boletim.'
            : `${quantas} escolhas no boletim, numa múltipla.`}{' '}
          Fecha-se o bilhete nas apostas, que é onde o boletim está com o saldo e as fichas.
        </p>
      ) : null}
    </div>
  );
}

/* --------------------------- os separadores --------------------------- */

type Aba = 'direto' | 'confrontos' | 'tabela';

/* ============================ a página ============================ */

export function Partida({ voltar }: { voltar: () => void }) {
  const [jogo, setJogo] = useState<JogoDeApostas | null>(null);
  const [aCarregar, setACarregar] = useState(true);
  const [queixa, setQueixa] = useState('');
  const [aba, setAba] = useState<Aba>('direto');

  const id = jogoDoEndereco();

  useEffect(() => {
    if (!id) {
      setQueixa('Este endereço não diz de que jogo se trata.');
      setACarregar(false);
      return;
    }
    let vivo = true;
    api
      .jogoDeApostas(id)
      .then((r) => {
        if (!vivo) return;
        setJogo(r.jogo);
        setACarregar(false);
      })
      .catch((e) => {
        if (!vivo) return;
        /* O servidor já não conhece este jogo, mas a aposta que lá levou
           guardou o que sabia dele. Mostra-se isso, sem cotações: elas já não
           existem e não se inventam. */
        const daGaveta = jogoDaGaveta(id);
        if (daGaveta) setJogo(daGaveta);
        else setQueixa(e instanceof Error ? e.message : 'Não se chegou ao servidor.');
        setACarregar(false);
      });
    return () => {
      vivo = false;
    };
  }, [id]);

  /* O resultado ao minuto: volta-se a perguntar de meio em meio minuto
     enquanto o jogo estiver a andar. Isto sai da prateleira do servidor e não
     da feed, por isso não custa crédito nenhum. */
  useEffect(() => {
    if (!jogo || !id || jogo.acabou || !jaComecou(jogo)) return;
    const t = window.setInterval(() => {
      api
        .jogoDeApostas(id)
        .then((r) => setJogo(r.jogo))
        .catch(() => {
          /* fica o que se tinha */
        });
    }, 30000);
    return () => window.clearInterval(t);
  }, [jogo, id]);

  if (aCarregar)
    return (
      <section className="secao">
        <p className="notas">A abrir a partida...</p>
      </section>
    );

  if (!jogo)
    return (
      <section className="secao par-vazia">
        <h1>Esta partida não está à vista</h1>
        <p className="notas">
          {queixa || 'Os jogos saem da página quando arrefecem, e este já saiu.'}
        </p>
        <button className="botao" type="button" onClick={voltar}>
          Voltar às apostas
        </button>
      </section>
    );

  const fatias = probabilidades(jogo);
  const comecou = jaComecou(jogo);

  return (
    <section className="secao par">
      <button className="par-voltar" type="button" onClick={voltar}>
        ← Apostas
      </button>

      {/* ---- o cabeçalho: quem joga, como vai, e quando ---- */}
      <header className="par-topo">
        <p className="eyebrow">
          {jogo.pais ? `${jogo.pais} · ` : ''}
          {jogo.liga || jogo.desporto}
        </p>

        <div className="par-placar">
          <div className="par-equipa">
            {jogo.brasaoCasa ? <img src={jogo.brasaoCasa} alt="" width={44} height={44} /> : null}
            <strong>{jogo.casa}</strong>
          </div>

          <div className="par-marca">
            {temMarca(jogo) ? (
              <>
                <b>
                  {jogo.marcaCasa} <span>-</span> {jogo.marcaFora}
                </b>
                <small>
                  {jogo.acabou
                    ? 'terminado'
                    : jogo.minuto
                      ? `${jogo.minuto} minutos`
                      : 'a decorrer'}
                </small>
              </>
            ) : (
              <>
                <b className="par-vs">vs</b>
                <small>{comecou ? 'a decorrer' : aQueHoras(jogo.comeca)}</small>
              </>
            )}
          </div>

          <div className="par-equipa">
            {jogo.brasaoFora ? <img src={jogo.brasaoFora} alt="" width={44} height={44} /> : null}
            <strong>{jogo.fora}</strong>
          </div>
        </div>
      </header>

      {/* ---- a probabilidade, das cotações que já temos ---- */}
      {fatias.length > 0 && (
        <div className="par-prob">
          <h2>Probabilidade de vitória</h2>
          <div className="par-prob-barra" aria-hidden="true">
            {fatias.map((f) => (
              <i key={f.cls} className={f.cls} style={{ width: `${f.parte}%` }} />
            ))}
          </div>
          <ul className="par-prob-legenda">
            {fatias.map((f) => (
              <li key={f.cls} className={f.cls}>
                <b>{Math.round(f.parte)}%</b>
                <span>{f.quem}</span>
              </li>
            ))}
          </ul>
          <p className="notas">
            Isto sai das cotações, já sem a margem da casa. Não é uma previsão nossa: é o que a
            casa de apostas está a dizer, dito em percentagem.
          </p>
        </div>
      )}

      <Cotacoes jogo={jogo} />

      {/* ---- os separadores ---- */}
      <nav className="par-abas" role="tablist">
        {(
          [
            ['direto', comecou ? 'Em direto' : 'O jogo'],
            ['confrontos', 'Confrontos'],
            ['tabela', 'Classificação']
          ] as [Aba, string][]
        ).map(([qual, nome]) => (
          <button
            key={qual}
            type="button"
            role="tab"
            aria-selected={aba === qual}
            className={aba === qual ? 'ativa' : ''}
            onClick={() => setAba(qual)}
          >
            {qual === 'direto' && comecou && !jogo.acabou ? <i className="par-ponto" /> : null}
            {nome}
          </button>
        ))}
      </nav>

      <div className="par-corpo" role="tabpanel">
        {aba === 'direto' && <EmDireto jogo={jogo} />}
        {aba === 'confrontos' && <Confrontos jogo={jogo} />}
        {aba === 'tabela' && <Tabela jogo={jogo} />}
      </div>
    </section>
  );
}

/* ====================== o separador de em direto ====================== */

function EmDireto({ jogo }: { jogo: JogoDeApostas }) {
  const [dados, setDados] = useState<ComoVaiOJogo | null>(null);
  const [aCarregar, setACarregar] = useState(true);

  useEffect(() => {
    let vivo = true;
    let relogio = 0;
    setACarregar(true);

    /* O travão da feed é de dez pedidos por minuto e é partilhado com a volta
       que traz os jogos. Numa noite de jogos isso bate, e isso não é uma
       partida sem estatísticas: é um minuto cheio. Tenta-se outra vez, uma só
       vez, que insistir em roda livre era ser parte do problema. */
    const ir = (aindaPodeTentar: boolean) =>
      api
        .comoVaiOJogo(jogo.id)
        .then((r) => {
          if (!vivo) return;
          if (r.ocupado && aindaPodeTentar && (r.estatisticas || []).length === 0) {
            relogio = window.setTimeout(() => ir(false), 7000);
            return;
          }
          setDados(r);
          setACarregar(false);
        })
        .catch(() => {
          if (vivo) setACarregar(false);
        });

    ir(true);
    return () => {
      vivo = false;
      window.clearTimeout(relogio);
    };
  }, [jogo.id]);

  if (!jaComecou(jogo))
    return (
      <p className="notas par-nada">
        O jogo ainda não começou. As estatísticas aparecem quando a bola rolar.
      </p>
    );

  if (aCarregar) return <p className="notas par-nada">A ver como vai o jogo...</p>;
  if (!dados) return <p className="notas par-nada">Não se chegou ao servidor.</p>;

  const linhas = dados.estatisticas || [];
  const eventos = dados.eventos || [];

  if (linhas.length === 0 && eventos.length === 0)
    return (
      <p className="notas par-nada">
        {dados.ocupado
          ? 'Muita gente a ver jogos ao mesmo tempo. Volta a abrir daqui a pouco.'
          : dados.semOrcamento
            ? 'Hoje já não dá para ir buscar estatísticas novas. Voltam amanhã.'
            : dados.semFonte
              ? 'Este desporto não dá estatísticas, e não há volta a dar-lhe.'
              : dados.semEstatisticas
                ? 'Esta competição não dá estatísticas. As grandes ligas dão, as pequenas quase nunca.'
                : (jogo.minuto || 0) > 0 && (jogo.minuto || 0) < 15
                  ? 'O jogo começou agora. As estatísticas aparecem quando houver alguma coisa para contar.'
                  : 'Ainda não há estatísticas deste jogo.'}
      </p>
    );

  return (
    <>
      {/* O resultado entra como primeira linha da tabela, como na casa de
          apostas: quem olha para isto quer o resultado e a posse de bola lado
          a lado, e não o resultado num sítio e as contas noutro. */}
      {linhas.length > 0 && (
        <ul className="par-stats">
          {temMarca(jogo) && (
            <li className="marca">
              <span className="par-stat-valor">{jogo.marcaCasa}</span>
              <span className="par-stat-nome">Golos</span>
              <span className="par-stat-valor direita">{jogo.marcaFora}</span>
            </li>
          )}
          {linhas.map((l) => {
            /* A barra só se desenha quando os dois lados dão número. Uma
               estatística de texto mostra-se só com os valores. */
            const a = l.casa.numero;
            const b = l.fora.numero;
            const total = (a || 0) + (b || 0);
            const podeBarra = a !== null && b !== null && total > 0;
            const doLado = podeBarra ? ((a || 0) / total) * 100 : 0;
            return (
              <li key={l.nome}>
                <span className={`par-stat-valor${(a || 0) >= (b || 0) ? ' manda' : ''}`}>
                  {l.casa.mostra}
                </span>
                <span className="par-stat-nome">{l.nome}</span>
                <span className={`par-stat-valor direita${(b || 0) > (a || 0) ? ' manda' : ''}`}>
                  {l.fora.mostra}
                </span>
                {podeBarra && (
                  <span className="par-stat-barra" aria-hidden="true">
                    <i className="casa" style={{ width: `${doLado / 2}%` }} />
                    <i className="fora" style={{ width: `${(100 - doLado) / 2}%` }} />
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {eventos.length > 0 && (
        <>
          <h2 className="par-titulo">O que aconteceu</h2>
          <ul className="par-eventos">
            {eventos.map((e, i) => (
              <li key={`${e.minuto}-${i}`} className={e.tipo}>
                <b>
                  {e.minuto}'{e.extra ? `+${e.extra}` : ''}
                </b>
                <span className="par-evento-que">
                  {e.tipo === 'golo'
                    ? 'Golo'
                    : e.tipo === 'cartao'
                      ? e.detalhe.toLowerCase().includes('red')
                        ? 'Cartão vermelho'
                        : 'Cartão amarelo'
                      : e.tipo === 'troca'
                        ? 'Substituição'
                        : e.detalhe}
                </span>
                <span className="par-evento-quem">
                  {e.quem}
                  {e.tipo === 'troca' && e.outro ? ` sai, ${e.outro} entra` : ''}
                  {e.equipa ? ` · ${e.equipa}` : ''}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}

      {dados.quando && (
        <p className="notas par-quando">
          Atualizado a{' '}
          {new Date(dados.quando).toLocaleTimeString('pt-PT', {
            hour: '2-digit',
            minute: '2-digit'
          })}
          {dados.daCopia ? ', da última vez que se foi buscar' : ''}.
        </p>
      )}
    </>
  );
}

/* ====================== o separador dos confrontos ====================== */

function Confrontos({ jogo }: { jogo: JogoDeApostas }) {
  const [dados, setDados] = useState<OsConfrontos | null>(null);
  const [aCarregar, setACarregar] = useState(true);

  useEffect(() => {
    let vivo = true;
    setACarregar(true);
    api
      .confrontosDoJogo(jogo.id)
      .then((r) => {
        if (!vivo) return;
        setDados(r);
        setACarregar(false);
      })
      .catch(() => {
        if (vivo) setACarregar(false);
      });
    return () => {
      vivo = false;
    };
  }, [jogo.id]);

  if (aCarregar) return <p className="notas par-nada">A ver os confrontos...</p>;

  const lista = dados?.confrontos || [];
  if (lista.length === 0)
    return (
      <p className="notas par-nada">
        {dados?.ocupado
          ? 'Muita gente a ver jogos ao mesmo tempo. Volta a abrir daqui a pouco.'
          : dados?.semOrcamento
            ? 'Hoje já não dá para ir buscar isto. Volta amanhã.'
            : dados?.semFonte
              ? 'Este jogo não tem histórico nesta fonte.'
              : 'Estas duas equipas não têm histórico à vista. Pode ser que nunca se tenham encontrado.'}
      </p>
    );

  /* As contas do histórico, do ponto de vista de quem joga em casa hoje. */
  const meu = jogo.casa;
  const ganhou = (c: UmConfronto) =>
    (c.casa === meu && (c.marcaCasa || 0) > (c.marcaFora || 0)) ||
    (c.fora === meu && (c.marcaFora || 0) > (c.marcaCasa || 0));
  const empatou = (c: UmConfronto) => c.marcaCasa === c.marcaFora;

  const vitorias = lista.filter((c) => ganhou(c)).length;
  const empates = lista.filter((c) => empatou(c)).length;
  const derrotas = lista.length - vitorias - empates;

  return (
    <>
      <ul className="par-contas">
        <li className="ganha">
          <b>{vitorias}</b>
          <span>{jogo.casa}</span>
        </li>
        <li className="empate">
          <b>{empates}</b>
          <span>empates</span>
        </li>
        <li className="perde">
          <b>{derrotas}</b>
          <span>{jogo.fora}</span>
        </li>
      </ul>

      <ul className="par-confrontos">
        {lista.map((c, i) => (
          <li key={`${c.quando}-${i}`}>
            <time dateTime={c.quando}>
              {new Date(c.quando).toLocaleDateString('pt-PT', {
                day: '2-digit',
                month: '2-digit',
                year: 'numeric'
              })}
            </time>
            <span className="par-confronto-jogo">
              <b className={c.casa === meu ? 'meu' : ''}>{c.casa}</b>
              <em>
                {c.marcaCasa} - {c.marcaFora}
              </em>
              <b className={c.fora === meu ? 'meu' : ''}>{c.fora}</b>
            </span>
            {c.liga ? <small>{c.liga}</small> : null}
          </li>
        ))}
      </ul>

      {dados?.quando && (
        <p className="notas par-quando">
          O histórico guarda-se por uma semana: dois adversários não mudam de passado.
        </p>
      )}
    </>
  );
}

/* ===================== o separador da classificação ===================== */

function Tabela({ jogo }: { jogo: JogoDeApostas }) {
  const [dados, setDados] = useState<AClassificacao | null>(null);
  const [aCarregar, setACarregar] = useState(true);

  useEffect(() => {
    let vivo = true;
    setACarregar(true);
    api
      .classificacaoDoJogo(jogo.id)
      .then((r) => {
        if (!vivo) return;
        setDados(r);
        setACarregar(false);
      })
      .catch(() => {
        if (vivo) setACarregar(false);
      });
    return () => {
      vivo = false;
    };
  }, [jogo.id]);

  if (aCarregar) return <p className="notas par-nada">A ver a classificação...</p>;

  const grupos = dados?.grupos || [];
  if (grupos.length === 0)
    return (
      <p className="notas par-nada">
        {dados?.ocupado
          ? 'Muita gente a ver jogos ao mesmo tempo. Volta a abrir daqui a pouco.'
          : dados?.semOrcamento
            ? 'Hoje já não dá para ir buscar isto. Volta amanhã.'
            : 'Esta competição não dá classificação. Uma taça a eliminar não tem tabela, e as competições pequenas muitas vezes também não.'}
      </p>
    );

  const nossa = (nome: string) => nome === jogo.casa || nome === jogo.fora;

  return (
    <>
      {grupos.map((g, i) => (
        <div key={g.nome || i} className="par-tabela-caixa">
          {g.nome && <h2 className="par-titulo">{g.nome}</h2>}
          <table className="par-tabela">
            <thead>
              <tr>
                <th scope="col" className="lugar">
                  #
                </th>
                <th scope="col">Equipa</th>
                <th scope="col">J</th>
                <th scope="col">V</th>
                <th scope="col">E</th>
                <th scope="col">D</th>
                <th scope="col">P</th>
              </tr>
            </thead>
            <tbody>
              {g.linhas.map((l) => (
                <tr key={`${l.lugar}-${l.equipa}`} className={nossa(l.equipa) ? 'nossa' : ''}>
                  <td className="lugar">{l.lugar}</td>
                  <td className="par-tabela-equipa">
                    {l.brasao ? <img src={l.brasao} alt="" width={18} height={18} /> : null}
                    <span>{l.equipa}</span>
                  </td>
                  <td>{l.jogos ?? '-'}</td>
                  <td>{l.vitorias ?? '-'}</td>
                  <td>{l.empates ?? '-'}</td>
                  <td>{l.derrotas ?? '-'}</td>
                  <td className="pontos">{l.pontos ?? '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}

      <p className="notas par-quando">
        A tabela guarda-se seis horas, e é a mesma para todos os jogos desta competição: é por isso
        que dá para a mostrar sem estourar a conta de pedidos do dia.
      </p>
    </>
  );
}
