import { useEffect, useMemo, useState } from 'react';
import { temServidor } from '../lib/api';
import { nomeGuardado } from '../lib/nick';
import type { Estado, Pontuacao } from '../lib/tipos';

/**
 * O quadro de honra, com todos os jogos.
 *
 * Os torrões são uns só e servem o blackjack, o poker e a roleta, mas cada
 * jogo conta coisas diferentes, e metê-las todas na mesma tabela dava uma
 * tabela de vinte colunas que ninguém lia. Então há uma tabela por jogo e
 * vê-se uma de cada vez.
 *
 * Os jogos de um só jogador entram com o recorde e não com torrões. Correm
 * todos dentro do browser, e o servidor não tem como saber se alguém fez mesmo
 * aqueles pontos: o número serve para se comparar, e é preciso saber-se que é
 * essa a confiança que merece.
 */

const POR_PAGINA = 10;

type Coluna = {
  titulo: string;
  de: (l: Pontuacao) => number;
};

type Tabela = {
  id: string;
  nome: string;
  nota: string;
  /** A primeira coluna é por onde se ordena. */
  colunas: Coluna[];
  /** Quem ainda não jogou nada não entra: a tabela é de quem jogou. */
  entra: (l: Pontuacao) => boolean;
};

const TABELAS: Tabela[] = [
  {
    id: 'torroes',
    nome: 'Torrões',
    nota: 'A carteira de cada um. É a mesma no blackjack, no poker e na roleta.',
    colunas: [
      { titulo: 'Torrões', de: (l) => l.torroes },
      { titulo: 'Máximo', de: (l) => l.pico }
    ],
    entra: () => true
  },
  {
    id: 'blackjack',
    nome: 'Blackjack',
    nota: 'Mãos jogadas contra a casa, e quantas vezes ela ficou a ver navios.',
    colunas: [
      { titulo: 'Ganhas', de: (l) => l.vitorias },
      { titulo: 'Mãos', de: (l) => l.maos },
      { titulo: 'Blackjacks', de: (l) => l.bjs }
    ],
    entra: (l) => l.maos > 0
  },
  {
    id: 'poker',
    nome: 'Poker',
    nota: 'As mãos são contadas quando alguém se levanta da mesa.',
    colunas: [
      { titulo: 'Ganhas', de: (l) => l.poquer.ganhas },
      { titulo: 'Mãos', de: (l) => l.poquer.maos },
      { titulo: 'Maior pote', de: (l) => l.poquer.maiorPote }
    ],
    entra: (l) => l.poquer.maos > 0
  },
  {
    id: 'roleta',
    nome: 'Roleta',
    nota: 'Rodadas, quantas pagaram alguma coisa, e o maior prémio de uma vez.',
    colunas: [
      { titulo: 'Maior prémio', de: (l) => l.roleta.maior },
      { titulo: 'Ganhas', de: (l) => l.roleta.ganhas },
      { titulo: 'Rodadas', de: (l) => l.roleta.rodadas }
    ],
    entra: (l) => l.roleta.rodadas > 0
  },
  {
    id: 'jogo',
    nome: 'A fuga do balcão',
    nota: 'O recorde de cada um a saltar guardanapos.',
    colunas: [{ titulo: 'Recorde', de: (l) => l.recordes.jogo }],
    entra: (l) => l.recordes.jogo > 0
  },
  {
    id: 'cusco',
    nome: 'O Cusco',
    nota: 'Meias de leite acertadas sem o Cusco rebentar.',
    colunas: [{ titulo: 'Acertadas', de: (l) => l.recordes.cusco }],
    entra: (l) => l.recordes.cusco > 0
  },
  {
    id: 'colherada',
    nome: 'À colherada',
    nota: 'O recorde de colheradas certeiras antes de acabarem os torrões.',
    colunas: [{ titulo: 'Recorde', de: (l) => l.recordes.colherada }],
    entra: (l) => l.recordes.colherada > 0
  }
];

export function Quadro({ estado }: { estado: Estado }) {
  const [qual, setQual] = useState(TABELAS[0].id);
  const [pagina, setPagina] = useState(0);
  const eu = nomeGuardado();

  const tabela = TABELAS.find((t) => t.id === qual) || TABELAS[0];

  const linhas = useMemo(() => {
    const ordena = tabela.colunas[0].de;
    return estado.ranking
      .filter(tabela.entra)
      .slice()
      .sort((a, b) => ordena(b) - ordena(a) || b.torroes - a.torroes);
  }, [estado.ranking, tabela]);

  // trocar de tabela volta ao princípio, senão abria numa página que não existe
  useEffect(() => {
    setPagina(0);
  }, [qual]);

  const paginas = Math.max(1, Math.ceil(linhas.length / POR_PAGINA));
  const naPagina = Math.min(pagina, paginas - 1);
  const primeiro = naPagina * POR_PAGINA;
  const aMostrar = linhas.slice(primeiro, primeiro + POR_PAGINA);
  const ondeEstou = linhas.findIndex((r) => r.nome === eu);

  return (
    <section className="qd">
      <p className="eyebrow">Quem manda no balcão</p>
      <h1>Quadro de honra</h1>
      <p className="lead">
        Os torrões são os mesmos em todos os jogos onde é o servidor que dá as cartas. Os outros
        entram com o recorde de cada um.
      </p>

      <div className="qd-abas" role="tablist" aria-label="Tabelas">
        {TABELAS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={t.id === qual}
            className={t.id === qual ? 'aberta' : ''}
            onClick={() => setQual(t.id)}
          >
            {t.nome}
          </button>
        ))}
      </div>

      <div className="painel qd-painel">
        <p className="notas qd-nota">{tabela.nota}</p>

        {linhas.length === 0 ? (
          <p className="vazio">
            {temServidor()
              ? 'Ainda ninguém jogou isto. Sê o primeiro a aparecer aqui.'
              : 'O quadro partilhado ainda não está ligado.'}
          </p>
        ) : (
          <table className="rank">
            <thead>
              <tr>
                <th />
                <th>Quem</th>
                {tabela.colunas.map((c) => (
                  <th key={c.titulo}>{c.titulo}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {aMostrar.map((r, i) => (
                <tr
                  key={r.nome}
                  className={`${r.nome === eu ? 'eu' : ''} ${primeiro + i < 3 ? 'podio' : ''}`.trim()}
                >
                  <td>{primeiro + i + 1}</td>
                  <td>
                    {r.nome}
                    {r.nome === eu ? ' (tu)' : ''}
                  </td>
                  {tabela.colunas.map((c) => (
                    <td key={c.titulo} className="num">
                      {c.de(r)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {paginas > 1 && (
          <div className="paginas">
            <button
              className="btn claro mini"
              type="button"
              disabled={naPagina === 0}
              onClick={() => setPagina(naPagina - 1)}
            >
              Anteriores
            </button>

            <span className="paginas-conta">
              {primeiro + 1} a {Math.min(primeiro + POR_PAGINA, linhas.length)} de {linhas.length}
            </span>

            {ondeEstou >= 0 && Math.floor(ondeEstou / POR_PAGINA) !== naPagina && (
              <button
                className="btn claro mini"
                type="button"
                onClick={() => setPagina(Math.floor(ondeEstou / POR_PAGINA))}
              >
                Onde estou
              </button>
            )}

            <button
              className="btn claro mini"
              type="button"
              disabled={naPagina >= paginas - 1}
              onClick={() => setPagina(naPagina + 1)}
            >
              Seguintes
            </button>
          </div>
        )}
      </div>

      <p className="notas qd-aviso">
        Os recordes do Cusco, da colherada e da fuga do balcão vêm do browser de quem joga, e o
        servidor não tem como os confirmar. Os torrões não: esses são todos decididos do lado de lá.
      </p>
    </section>
  );
}
