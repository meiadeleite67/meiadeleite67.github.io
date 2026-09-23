import { fotoDoMembro } from '../lib/api';
import { Galeria } from './Galeria';
import type { Estado, Membro, Pagina } from '../lib/tipos';

export function Membros({ estado, irPara }: { estado: Estado; irPara: (p: Pagina) => void }) {
  /* A mascote sai da fila e vai para cima, sozinha e com cartao proprio. */
  const mascote = estado.membros.find((m) => m.mascote);
  const restantes = estado.membros.filter((m) => !m.mascote);

  return (
    <section>
      <h1 style={{ fontSize: 'clamp(28px,5vw,42px)' }}>Membros do MEIadeLEIte</h1>

      {mascote && <CartaoDaMascote membro={mascote} irPara={irPara} />}

      {estado.membros.length === 0 ? (
        <p className="vazio" style={{ marginTop: 20 }}>
          Ainda nao ha ninguem na lista.
        </p>
      ) : (
        <>
          {mascote && restantes.length > 0 && <h2 className="titulo-do-resto">E o resto da gente</h2>}
          <div className="membros" style={{ marginTop: mascote ? 16 : 24 }}>
            {restantes.map((m) => (
              <Cartao key={m.id} membro={m} />
            ))}
          </div>
        </>
      )}
    </section>
  );
}

/** As iniciais fazem de retrato enquanto nao houver foto, ou se ela falhar. */
const iniciaisDe = (nome: string) =>
  nome
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0])
    .join('')
    .toUpperCase();

function Retrato({ membro }: { membro: Membro }) {
  return (
    <>
      {membro.temFoto ? (
        <img
          src={fotoDoMembro(membro.id)}
          alt={membro.nome}
          loading="lazy"
          onError={(e) => {
            e.currentTarget.style.display = 'none';
          }}
        />
      ) : null}
      <span className="iniciais">{iniciaisDe(membro.nome)}</span>
    </>
  );
}

function Pata() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" fill="currentColor">
      <ellipse cx="7" cy="8.4" rx="2.5" ry="3.2" />
      <ellipse cx="12" cy="6.6" rx="2.6" ry="3.4" />
      <ellipse cx="17" cy="8.4" rx="2.5" ry="3.2" />
      <path d="M12 12c3.3 0 6 2.2 6 4.6 0 2-1.8 3.2-3.8 2.8-1.5-.3-2.9-.3-4.4 0-2 .4-3.8-.8-3.8-2.8 0-2.4 2.7-4.6 6-4.6Z" />
    </svg>
  );
}

function CartaoDaMascote({ membro, irPara }: { membro: Membro; irPara: (p: Pagina) => void }) {
  return (
    <article className="mascote">
      <div className="retrato">
        <Retrato membro={membro} />
      </div>
      <div className="mascote-texto">
        <span className="mascote-faixa">
          <Pata />
          Mascote oficial
        </span>
        <h2>{membro.nome}</h2>
        {membro.descricao && <p>{membro.descricao}</p>}
        <Galeria dono={membro.id} />
        <button
          className="btn claro mini"
          type="button"
          style={{ marginTop: 14 }}
          onClick={() => irPara('cusco')}
        >
          Fazer-lhe uma meia de leite
        </button>
      </div>
    </article>
  );
}

function Cartao({ membro }: { membro: Membro }) {
  return (
    <article className="membro">
      <div className="retrato">
        <Retrato membro={membro} />
      </div>
      <h3>{membro.nome}</h3>
      {membro.descricao && <p>{membro.descricao}</p>}
    </article>
  );
}
