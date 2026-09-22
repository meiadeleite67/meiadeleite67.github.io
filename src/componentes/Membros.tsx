import { fotoDoMembro } from '../lib/api';
import type { Estado, Membro } from '../lib/tipos';

export function Membros({ estado }: { estado: Estado }) {
  return (
    <section>
      <h1 style={{ fontSize: 'clamp(28px,5vw,42px)' }}>Membros do MEIadeLEIte</h1>

      {estado.membros.length === 0 ? (
        <p className="vazio" style={{ marginTop: 20 }}>
          Ainda não há ninguém na lista.
        </p>
      ) : (
        <div className="membros" style={{ marginTop: 24 }}>
          {estado.membros.map((m) => (
            <Cartao key={m.id} membro={m} />
          ))}
        </div>
      )}
    </section>
  );
}

function Cartao({ membro }: { membro: Membro }) {
  /* As iniciais fazem de retrato enquanto não houver foto, ou se ela falhar. */
  const iniciais = membro.nome
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0])
    .join('')
    .toUpperCase();

  return (
    <article className="membro">
      <div className="retrato">
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
        <span className="iniciais">{iniciais}</span>
      </div>
      <h3>{membro.nome}</h3>
      {membro.descricao && <p>{membro.descricao}</p>}
    </article>
  );
}
