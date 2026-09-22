import { useMemo, useState } from 'react';
import {
  DIAS_DA_SEMANA,
  MESES,
  MESES_INTEIROS,
  TIPOS,
  dataCurta,
  hoje,
  quandoEmPalavras
} from '../lib/dados';
import type { Estado, Evento } from '../lib/tipos';

const iso = (ano: number, mes: number, dia: number) =>
  `${ano}-${String(mes + 1).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;

/** Segunda a domingo, como cá se conta. */
const colunaDoDia = (d: Date) => (d.getDay() + 6) % 7;

export function Agenda({ estado }: { estado: Estado }) {
  const primeiro = new Date();
  const [mes, setMes] = useState(() => new Date(primeiro.getFullYear(), primeiro.getMonth(), 1));
  const [escolhido, setEscolhido] = useState<string | null>(null);

  const porDia = useMemo(() => {
    const mapa = new Map<string, Evento[]>();
    for (const e of estado.agenda) {
      const lista = mapa.get(e.data) ?? [];
      lista.push(e);
      mapa.set(e.data, lista);
    }
    return mapa;
  }, [estado.agenda]);

  const ano = mes.getFullYear();
  const numeroDoMes = mes.getMonth();
  const diasNoMes = new Date(ano, numeroDoMes + 1, 0).getDate();
  const diasAntes = colunaDoDia(new Date(ano, numeroDoMes, 1));
  const diasDoMesAnterior = new Date(ano, numeroDoMes, 0).getDate();

  const celulas: { dia: number; iso: string | null }[] = [];
  for (let i = diasAntes - 1; i >= 0; i--) celulas.push({ dia: diasDoMesAnterior - i, iso: null });
  for (let d = 1; d <= diasNoMes; d++) celulas.push({ dia: d, iso: iso(ano, numeroDoMes, d) });
  while (celulas.length % 7 !== 0) celulas.push({ dia: celulas.length - diasAntes - diasNoMes + 1, iso: null });

  function andar(passo: number) {
    setEscolhido(null);
    setMes(new Date(ano, numeroDoMes + passo, 1));
  }

  const h = hoje();
  const doMes = estado.agenda.filter((e) => e.data.startsWith(`${ano}-${String(numeroDoMes + 1).padStart(2, '0')}`));
  const tiposNoMes = [...new Set(doMes.map((e) => e.tipo))];

  const futuros = estado.agenda.filter((e) => e.data >= h);
  const passados = [...estado.agenda.filter((e) => e.data < h)].reverse();
  const daEscolha = escolhido ? (porDia.get(escolhido) ?? []) : null;

  return (
    <section>
      <p className="eyebrow">Agenda do grupo</p>
      <h1 style={{ fontSize: 'clamp(28px,5vw,42px)' }}>Quem falta, falta com aviso</h1>
      <p className="lead">
        Jantares, copos, estudo, exames e reuniões de cozinha. Carrega num dia com bolinha para
        veres só o que há nesse dia.
      </p>

      <div className="cal" style={{ marginTop: 20 }}>
        <div className="cal-topo">
          <h2>
            {MESES_INTEIROS[numeroDoMes]} {ano}
          </h2>
          <button className="cal-nav" type="button" onClick={() => andar(-1)} aria-label="Mês anterior">
            ‹
          </button>
          <button
            className="btn claro mini"
            type="button"
            onClick={() => {
              const agora = new Date();
              setMes(new Date(agora.getFullYear(), agora.getMonth(), 1));
              setEscolhido(null);
            }}
          >
            Hoje
          </button>
          <button className="cal-nav" type="button" onClick={() => andar(1)} aria-label="Mês seguinte">
            ›
          </button>
        </div>

        <div className="cal-grelha">
          {DIAS_DA_SEMANA.map((d) => (
            <div key={d} className="cal-nome">
              {d}
            </div>
          ))}

          {celulas.map((c, i) => {
            if (!c.iso)
              return (
                <div key={`fora${i}`} className="cal-dia fora" aria-hidden="true">
                  {c.dia}
                </div>
              );
            const eventos = porDia.get(c.iso) ?? [];
            const classes = [
              'cal-dia',
              c.iso === h ? 'hoje' : '',
              eventos.length ? 'tem' : ''
            ]
              .filter(Boolean)
              .join(' ');

            if (!eventos.length)
              return (
                <div key={c.iso} className={classes}>
                  {c.dia}
                  <div className="pontos" />
                </div>
              );

            return (
              <button
                key={c.iso}
                type="button"
                className={classes}
                aria-pressed={escolhido === c.iso}
                aria-label={`${c.dia} de ${MESES_INTEIROS[numeroDoMes]}, ${eventos.length} coisa(s)`}
                onClick={() => setEscolhido(escolhido === c.iso ? null : c.iso)}
              >
                {c.dia}
                <div className="pontos">
                  {eventos.slice(0, 3).map((e) => (
                    <span
                      key={e.id}
                      className="ponto"
                      style={{ background: TIPOS[e.tipo]?.cor ?? 'var(--tinta-3)' }}
                    />
                  ))}
                </div>
              </button>
            );
          })}
        </div>

        {tiposNoMes.length > 0 && (
          <div className="cal-legenda">
            {tiposNoMes.map((t) => (
              <span key={t}>
                <span className="ponto" style={{ background: TIPOS[t].cor }} />
                {TIPOS[t].nome}
              </span>
            ))}
          </div>
        )}
      </div>

      {daEscolha ? (
        <div style={{ marginTop: 26 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
            <h2 style={{ fontSize: 22 }}>{dataCurta(escolhido!)}</h2>
            <button className="btn claro mini" type="button" onClick={() => setEscolhido(null)}>
              Ver tudo
            </button>
          </div>
          <div className="painel">
            {daEscolha.length ? (
              daEscolha.map((e) => <EventoEl key={e.id} evento={e} passado={e.data < h} />)
            ) : (
              <p className="vazio">Nada nesse dia.</p>
            )}
          </div>
        </div>
      ) : (
        <div style={{ marginTop: 26 }}>
          <h2 style={{ fontSize: 22, marginBottom: 12 }}>A seguir</h2>
          <div className="painel">
            {futuros.length ? (
              futuros.map((e) => <EventoEl key={e.id} evento={e} />)
            ) : (
              <p className="vazio">Não há nada marcado. Isso nunca é boa notícia.</p>
            )}
          </div>

          {passados.length > 0 && (
            <details className="arquivo">
              <summary>Já foi, {passados.length} coisa(s)</summary>
              <div className="painel" style={{ marginTop: 10 }}>
                {passados.slice(0, 20).map((e) => (
                  <EventoEl key={e.id} evento={e} passado />
                ))}
              </div>
            </details>
          )}
        </div>
      )}
    </section>
  );
}

function EventoEl({ evento, passado }: { evento: Evento; passado?: boolean }) {
  const p = (evento.data || '').split('-');
  const t = TIPOS[evento.tipo] ?? TIPOS.outro;
  return (
    <div className={`evento${passado ? ' passado' : ''}`}>
      <div className="calend">
        <div className="m">{p.length === 3 ? MESES[Number(p[1]) - 1] : '?'}</div>
        <div className="d">{p.length === 3 ? p[2] : '?'}</div>
      </div>
      <div>
        <div className="evento-cab">
          <h3>{evento.titulo}</h3>
          <span className={`tag ${t.cls}`}>{t.nome}</span>
          {!passado && <span className="quando">{quandoEmPalavras(evento.data)}</span>}
        </div>
        <p className="meta">
          <span>
            {evento.hora ? `${evento.hora}, ` : ''}
            {dataCurta(evento.data)}
          </span>
          {evento.sitio && <span>{evento.sitio}</span>}
        </p>
        {evento.notas && <p className="notas">{evento.notas}</p>}
      </div>
    </div>
  );
}
