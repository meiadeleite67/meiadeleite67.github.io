import { Trofeu } from './Trofeu';
import { dataCurta, hoje, quandoEmPalavras } from '../lib/dados';
import type { Estado, Pagina } from '../lib/tipos';

export function Inicio({ estado, irPara }: { estado: Estado; irPara: (p: Pagina) => void }) {
  const proximo = estado.agenda.filter((e) => e.data >= hoje())[0];
  const lider = estado.ranking[0];
  const ultimo = estado.insta[0];

  return (
    <>
      <section className="hero">
        <div className="hero-texto">
          <p className="eyebrow">Projeto de um grupo de bêbados</p>
        <h1>
          Somos o <em>MEIadeLEIte</em>. Alguém tinha de ser.
        </h1>
        <p className="lead">
          Cartas para perder torrões de açúcar, o que vai saindo no Instagram, e a agenda do que
          aí vem. Desculpas para faltar, já não há.
        </p>
        <div style={{ marginTop: 18 }}>
          <span className="medalha">
            <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
              <circle cx="8" cy="6" r="5" fill="#C07734" />
              <path d="M5 10 L3 15 L8 13 L13 15 L11 10 Z" fill="#8A5A30" />
            </svg>
            Grupo do Ano, Pixel d'Ouro 25/26
            </span>
          </div>
        </div>

        <Trofeu />
      </section>

      <section className="foto-grupo">
        <img
          src="/media/grupo.jpeg"
          alt="O grupo MEIadeLEIte todo junto"
          width={1600}
          height={900}
        />
      </section>

      <section className="grelha g3">
        <div className="painel">
          <p className="rotulo">A seguir</p>
          {proximo ? (
            <>
              <h3 style={{ marginTop: 6 }}>{proximo.titulo}</h3>
              <p className="quando" style={{ marginTop: 4 }}>
                {quandoEmPalavras(proximo.data)}
              </p>
              <p className="meta">
                <span>
                  {dataCurta(proximo.data)}
                  {proximo.hora ? `, ${proximo.hora}` : ''}
                </span>
                {proximo.sitio && <span>{proximo.sitio}</span>}
              </p>
            </>
          ) : (
            <p className="vazio">Não há nada marcado. Isso nunca é boa notícia.</p>
          )}
          <button className="btn claro mini" style={{ marginTop: 12 }} onClick={() => irPara('agenda')}>
            Ver a agenda
          </button>
        </div>

        <div className="painel">
          <p className="rotulo">Rei dos torrões</p>
          {lider ? (
            <>
              <h3 style={{ marginTop: 6 }}>{lider.nome}</h3>
              <p className="num" style={{ fontSize: 24, margin: '2px 0 0' }}>
                {lider.torroes}
              </p>
              <p className="meta">
                <span>
                  {lider.maos} mãos, {lider.vitorias} ganhas
                </span>
              </p>
            </>
          ) : (
            <p className="vazio">Ainda ninguém jogou uma mão.</p>
          )}
          <button
            className="btn claro mini"
            style={{ marginTop: 12 }}
            onClick={() => irPara('blackjack')}
          >
            Ir à mesa
          </button>
        </div>

        <div className="painel">
          <p className="rotulo">Última publicação</p>
          {ultimo ? (
            <>
              <h3 style={{ marginTop: 6 }}>
                {ultimo.formato === 'reel'
                  ? 'Reel novo'
                  : ultimo.formato === 'album'
                    ? 'Álbum novo'
                    : 'Foto nova'}
              </h3>
              <p className="meta">
                <span>{dataCurta(ultimo.data)}</span>
              </p>
              {ultimo.legenda && (
                <p className="notas" style={{ marginTop: 6 }}>
                  {ultimo.legenda.slice(0, 90)}
                  {ultimo.legenda.length > 90 ? '…' : ''}
                </p>
              )}
              <button
                className="btn claro mini"
                style={{ marginTop: 12 }}
                onClick={() => irPara('instagram')}
              >
                Ver o mural
              </button>
            </>
          ) : (
            <p className="vazio">Nada no mural ainda.</p>
          )}
        </div>
      </section>
    </>
  );
}
