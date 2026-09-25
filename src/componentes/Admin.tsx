import { useEffect, useMemo, useRef, useState } from 'react';
import { api, temServidor } from '../lib/api';
import { AdminMembros, encolherParaGaleria } from './AdminMembros';
import { MESES_INTEIROS, TIPOS, dataCurta, hoje } from '../lib/dados';
import type { ContasDosTickets, Estado, Pontuacao, Post, Ticket, TipoEvento } from '../lib/tipos';

/** Quantos nomes cabem numa pagina do quadro. O mesmo numero da Leader Board
 *  publica, que e onde toda a gente ja se habituou a ele. */
const POR_PAGINA = 10;

export function Admin({ estado, recarregar }: { estado: Estado; recarregar: () => void }) {
  const [codigo, setCodigo] = useState('');
  const [dentro, setDentro] = useState(false);
  const [erro, setErro] = useState('');
  const [aEntrar, setAEntrar] = useState(false);
  const campo = useRef<HTMLInputElement>(null);

  useEffect(() => {
    campo.current?.focus({ preventScroll: true });
  }, []);

  async function entrar() {
    setErro('');
    setAEntrar(true);
    try {
      await api.entrar(codigo);
      setDentro(true);
      setCodigo('');
    } catch (e) {
      setCodigo('');
      campo.current?.focus({ preventScroll: true });
      setErro(e instanceof Error ? e.message : 'Não deu.');
    } finally {
      setAEntrar(false);
    }
  }

  if (dentro) return <Cozinha estado={estado} recarregar={recarregar} sair={() => setDentro(false)} />;

  return (
    <section className="entrada">
      <form
        className="painel"
        onSubmit={(e) => {
          e.preventDefault();
          entrar();
        }}
      >
        <svg width="34" height="46" viewBox="0 0 30 40" aria-hidden="true">
          <path d="M5 3 h20 l-2.5 32 a4 4 0 0 1 -4 3.6 h-7 a4 4 0 0 1 -4 -3.6 Z" fill="var(--crema-2)" />
          <path
            d="M6.6 14 h16.8 l-1.5 21 a4 4 0 0 1 -4 3.6 h-6 a4 4 0 0 1 -4 -3.6 Z"
            fill="var(--crema)"
          />
          <rect x="5.4" y="9" width="19.2" height="5.4" fill="var(--crema-2)" />
        </svg>
        <h1>Cozinha</h1>
        <p>Código da app.</p>
        <label>
          <span className="rotulo" style={{ position: 'absolute', left: -9999 }}>
            Código de seis dígitos
          </span>
          <input
            id="admin-codigo"
            className="codigo-campo"
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            ref={campo}
            value={codigo}
            placeholder="000000"
            onChange={(e) => setCodigo(e.target.value.replace(/\D/g, ''))}
          />
        </label>
        <button className="btn azul" type="submit" disabled={codigo.length !== 6 || aEntrar}>
          Entrar
        </button>
        {erro && <p className="recado mal">{erro}</p>}
        {!temServidor() && (
          <p className="recado">
            Este site ainda não está ligado ao servidor do grupo, por isso não há por onde entrar.
          </p>
        )}
      </form>
    </section>
  );
}

/* ===================== já dentro ===================== */

function Cozinha({
  estado,
  recarregar,
  sair
}: {
  estado: Estado;
  recarregar: () => void;
  sair: () => void;
}) {
  const [titulo, setTitulo] = useState('');
  const [data, setData] = useState(hoje());
  const [hora, setHora] = useState('21:00');
  const [sitio, setSitio] = useState('');
  const [tipo, setTipo] = useState<TipoEvento>('copos');
  const [notas, setNotas] = useState('');
  const [recado, setRecado] = useState('');
  const [mal, setMal] = useState(false);

  function falhou(e: unknown, quando: string) {
    setMal(true);
    setRecado(e instanceof Error ? e.message : quando);
  }

  async function marcar() {
    setMal(false);
    setRecado('A marcar…');
    try {
      await api.marcar({ titulo, data, hora, sitio, tipo, notas });
      setTitulo('');
      setSitio('');
      setNotas('');
      setRecado('Marcado.');
      recarregar();
    } catch (e) {
      falhou(e, 'Não deu para marcar.');
    }
  }

  async function apagar(id: string, nome: string) {
    if (!window.confirm(`Apagar “${nome}” da agenda?`)) return;
    try {
      await api.apagarEvento(id);
      recarregar();
    } catch (e) {
      falhou(e, 'Não deu para apagar.');
    }
  }

  /** Na primeira vez, traz para o servidor a agenda que está no ficheiro. */
  async function importar() {
    setMal(false);
    setRecado('A trazer…');
    try {
      const r = await api.importarAgenda(estado.agenda);
      setRecado(`Trazidos ${r.quantos} evento(s). A agenda passa a viver aqui.`);
      recarregar();
    } catch (e) {
      falhou(e, 'Não deu para trazer.');
    }
  }

  /* A cozinha tinha tudo empilhado numa pagina so, e chegou a um ponto em que
     era preciso rolar meia hora para chegar ao quadro. Cada coisa passa a ter
     a sua aba, como a Leader Board ja tinha. */
  const ABAS = [
    { id: 'agenda', nome: 'Agenda' },
    { id: 'membros', nome: 'Membros' },
    { id: 'mural', nome: 'Mural' },
    { id: 'quadro', nome: 'Leader Board' },
    { id: 'avisos', nome: 'Avisos' }
  ] as const;

  const [aba, setAba] = useState<'agenda' | 'membros' | 'mural' | 'quadro' | 'avisos'>('agenda');
  /** Quantos avisos estao por ler, para o numero na aba. */
  const [porLer, setPorLer] = useState(0);

  const porMes = new Map<string, typeof estado.agenda>();
  for (const e of estado.agenda) {
    const chave = e.data.slice(0, 7);
    porMes.set(chave, [...(porMes.get(chave) ?? []), e]);
  }

  return (
    <>
      <section>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 14, flexWrap: 'wrap' }}>
          <div>
            <p className="eyebrow">Estás dentro</p>
            <h1 style={{ fontSize: 'clamp(26px,4.4vw,38px)' }}>Cozinha</h1>
          </div>
          <button
            className="btn claro mini"
            type="button"
            style={{ marginLeft: 'auto' }}
            onClick={() => {
              api.sair().finally(sair);
            }}
          >
            Sair
          </button>
        </div>

        <div className="qd-abas admin-abas" role="tablist" aria-label="Secções da cozinha">
          {ABAS.map((a) => (
            <button
              key={a.id}
              type="button"
              role="tab"
              aria-selected={a.id === aba}
              className={a.id === aba ? 'aberta' : ''}
              onClick={() => setAba(a.id)}
            >
              {a.nome}
              {a.id === 'avisos' && porLer > 0 && <b className="admin-conta">{porLer}</b>}
            </button>
          ))}
        </div>
      </section>

      {aba === 'agenda' && (
      <section>
        <div className="painel">
          <p className="rotulo" style={{ marginBottom: 9 }}>
            Marcar coisa nova
          </p>
          <div className="campos triplo">
            <label>
              <span className="rotulo">O quê</span>
              <input
                id="ag-titulo"
                type="text"
                value={titulo}
                onChange={(e) => setTitulo(e.target.value)}
                placeholder="Jantar de curso"
              />
            </label>
            <label>
              <span className="rotulo">Quando</span>
              <input id="ag-data" type="date" value={data} onChange={(e) => setData(e.target.value)} />
            </label>
            <label>
              <span className="rotulo">Horas</span>
              <input id="ag-hora" type="time" value={hora} onChange={(e) => setHora(e.target.value)} />
            </label>
          </div>
          <div className="campos duplo" style={{ marginTop: 11 }}>
            <label>
              <span className="rotulo">Sítio</span>
              <input
                id="ag-sitio"
                type="text"
                value={sitio}
                onChange={(e) => setSitio(e.target.value)}
                placeholder="Café do costume"
              />
            </label>
            <label>
              <span className="rotulo">Tipo</span>
              <select id="ag-tipo" value={tipo} onChange={(e) => setTipo(e.target.value as TipoEvento)}>
                {Object.entries(TIPOS).map(([k, t]) => (
                  <option key={k} value={k}>
                    {t.nome}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label style={{ marginTop: 11 }}>
            <span className="rotulo">Notas (aparecem no cartão)</span>
            <textarea
              id="ag-notas"
              value={notas}
              onChange={(e) => setNotas(e.target.value)}
              placeholder="Levem dinheiro trocado."
            />
          </label>
          <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
            <button className="btn azul" type="button" disabled={!titulo.trim()} onClick={marcar}>
              Meter na agenda
            </button>
            <button className="btn claro" type="button" onClick={importar}>
              Trazer a agenda do ficheiro
            </button>
          </div>
          {recado && <p className={`recado${mal ? ' mal' : ''}`}>{recado}</p>}
        </div>

        <h2 style={{ fontSize: 22, margin: '26px 0 12px' }}>O que está marcado</h2>
        <div className="painel">
          {estado.agenda.length === 0 ? (
            <p className="vazio">A agenda está vazia.</p>
          ) : (
            [...porMes.entries()].map(([chave, eventos]) => (
              <div key={chave}>
                <p className="rotulo" style={{ marginTop: 14 }}>
                  {MESES_INTEIROS[Number(chave.slice(5)) - 1]} {chave.slice(0, 4)}
                </p>
                {eventos.map((e) => (
                  <div className="linha-admin" key={e.id}>
                    <div className="corpo">
                      <b>{e.titulo}</b>
                      <small>
                        {dataCurta(e.data)}
                        {e.hora ? `, ${e.hora}` : ''}
                        {e.sitio ? ` · ${e.sitio}` : ''} · {TIPOS[e.tipo]?.nome}
                      </small>
                    </div>
                    <button
                      className="btn claro mini"
                      type="button"
                      onClick={() => apagar(e.id, e.titulo)}
                    >
                      Apagar
                    </button>
                  </div>
                ))}
              </div>
            ))
          )}
        </div>
      </section>
      )}

      {aba === 'membros' && <AdminMembros membros={estado.membros} recarregar={recarregar} />}

      {aba === 'mural' && <MuralDoAdmin estado={estado} recarregar={recarregar} />}

      {aba === 'quadro' && <QuadroDoAdmin ranking={estado.ranking} recarregar={recarregar} />}

      {aba === 'avisos' && <AvisosDoAdmin aoContar={setPorLer} />}
    </>
  );
}

/* ======================== o quadro, por paginas ========================

   Sao perto de cem nomes, e antes vinham todos de uma vez: para chegar ao
   ultimo era preciso rolar a pagina inteira, e para encontrar um nome a meio
   era preciso conhece-lo de cor. Dez de cada vez, com uma caixa de procura por
   cima, que e o que se usa quando se vem aqui para tratar de um nome so. */

function QuadroDoAdmin({
  ranking,
  recarregar
}: {
  ranking: Pontuacao[];
  recarregar: () => void;
}) {
  const [procura, setProcura] = useState('');
  const [pagina, setPagina] = useState(0);

  const achados = useMemo(() => {
    const q = procura.trim().toLowerCase();
    return q ? ranking.filter((r) => r.nome.toLowerCase().includes(q)) : ranking;
  }, [ranking, procura]);

  const paginas = Math.max(1, Math.ceil(achados.length / POR_PAGINA));
  const naPagina = Math.min(pagina, paginas - 1);
  const primeiro = naPagina * POR_PAGINA;
  const aMostrar = achados.slice(primeiro, primeiro + POR_PAGINA);

  return (
    <section>
      <h2 style={{ fontSize: 22, marginBottom: 12 }}>Leader Board</h2>
      <div className="painel">
        <label style={{ marginBottom: 12, display: 'block' }}>
          <span className="rotulo">Procurar um nome</span>
          <input
            type="search"
            value={procura}
            onChange={(e) => {
              setProcura(e.target.value);
              setPagina(0);
            }}
            placeholder={`Entre ${ranking.length} nomes`}
          />
        </label>

        {achados.length === 0 ? (
          <p className="vazio">
            {ranking.length === 0 ? 'Ninguém jogou ainda.' : 'Nenhum nome dá com essa procura.'}
          </p>
        ) : (
          aMostrar.map((r) => <LinhaDoQuadro key={r.nome} linha={r} recarregar={recarregar} />)
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
              {primeiro + 1} a {Math.min(primeiro + POR_PAGINA, achados.length)} de{' '}
              {achados.length}
            </span>
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

        {/* Aqui havia um "Limpar o quadro", que apagava os nomes e os torroes
            de toda a gente sem volta a dar. Saiu: um botao desses nao tem nada
            que fazer ao lado dos botoes do dia a dia, por muitas confirmacoes
            que leve. O servidor ainda sabe fazer isso, e quem precisar mesmo
            de reiniciar o quadro tem de o pedir a mao. */}
      </div>
    </section>
  );
}

/* ======================== os avisos de coisas partidas ========================

   A caixa onde cai o que a malta escreve quando encontra um erro. Vem por
   ordem: primeiro os que ninguem viu, depois os que estao a ser tratados, e os
   resolvidos por ultimo, que esses ja nao pedem nada a ninguem. */

const COMO_ESTAO: Record<Ticket['estado'], string> = {
  aberto: 'Por ver',
  'a-tratar': 'A tratar',
  resolvido: 'Resolvido'
};

function AvisosDoAdmin({ aoContar }: { aoContar: (n: number) => void }) {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [contas, setContas] = useState<ContasDosTickets | null>(null);
  const [aCarregar, setACarregar] = useState(true);
  const [recado, setRecado] = useState('');

  const guardar = (r: { tickets: Ticket[]; contas: ContasDosTickets }) => {
    setTickets(r.tickets);
    setContas(r.contas);
    aoContar(r.contas.abertos);
  };

  useEffect(() => {
    let vivo = true;
    api
      .tickets()
      .then((r) => {
        if (vivo) guardar(r);
      })
      .catch((e) => {
        if (vivo) setRecado(e instanceof Error ? e.message : 'Não deu para ler os avisos.');
      })
      .finally(() => {
        if (vivo) setACarregar(false);
      });
    return () => {
      vivo = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function mudar(id: string, estado: Ticket['estado']) {
    setRecado('');
    try {
      guardar(await api.mudarTicket(id, estado));
    } catch (e) {
      setRecado(e instanceof Error ? e.message : 'Não deu para mudar.');
    }
  }

  async function apagar(id: string) {
    if (!window.confirm('Apagar este aviso de vez?')) return;
    setRecado('');
    try {
      guardar(await api.apagarTicket(id));
    } catch (e) {
      setRecado(e instanceof Error ? e.message : 'Não deu para apagar.');
    }
  }

  return (
    <section>
      <h2 style={{ fontSize: 22, marginBottom: 12 }}>Avisos de coisas partidas</h2>

      {contas && (
        <p className="notas" style={{ marginBottom: 12 }}>
          {contas.abertos} por ver, {contas.aTratar} a tratar, {contas.resolvidos} resolvidos.
        </p>
      )}

      {recado && <p className="recado mal">{recado}</p>}

      <div className="painel">
        {aCarregar && <p className="vazio">A abrir a caixa...</p>}

        {!aCarregar && tickets.length === 0 && (
          <p className="vazio">
            Ainda ninguém avisou de nada. Ou está tudo bem, ou ninguém encontrou o botão.
          </p>
        )}

        {tickets.map((t) => (
          <article key={t.id} className={`aviso ${t.estado}`}>
            <div className="aviso-cima">
              <span className={`aviso-selo ${t.estado}`}>{COMO_ESTAO[t.estado]}</span>
              <span className="aviso-quando">
                {new Date(t.quando).toLocaleString('pt-PT', {
                  day: '2-digit',
                  month: '2-digit',
                  hour: '2-digit',
                  minute: '2-digit'
                })}
                {t.quem ? ` · ${t.quem}` : ' · sem nome'}
              </span>
            </div>

            <p className="aviso-texto">{t.texto}</p>

            {(t.onde || t.aparelho) && (
              <p className="aviso-onde">
                {t.onde && <code>{t.onde}</code>}
                {t.aparelho && <span>{t.aparelho}</span>}
              </p>
            )}

            <div className="aviso-botoes">
              {t.estado !== 'a-tratar' && (
                <button className="btn claro mini" type="button" onClick={() => mudar(t.id, 'a-tratar')}>
                  A tratar
                </button>
              )}
              {t.estado !== 'resolvido' && (
                <button className="btn claro mini" type="button" onClick={() => mudar(t.id, 'resolvido')}>
                  Resolvido
                </button>
              )}
              {t.estado !== 'aberto' && (
                <button className="btn claro mini" type="button" onClick={() => mudar(t.id, 'aberto')}>
                  Voltar a abrir
                </button>
              )}
              <button className="btn claro mini" type="button" onClick={() => apagar(t.id)}>
                Apagar
              </button>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

/** Uma linha do quadro, com o botão de a tirar de lá. */
function LinhaDoQuadro({ linha, recarregar }: { linha: Pontuacao; recarregar: () => void }) {
  const [aConfirmar, setAConfirmar] = useState(false);
  const [aApagar, setAApagar] = useState(false);
  /** O PIN e outra conversa: tira-se sem tirar o nome nem os torroes. */
  const [aTirarPin, setATirarPin] = useState(false);
  const [semPin, setSemPin] = useState(false);

  async function apagar() {
    setAApagar(true);
    try {
      await api.apagarDoQuadro(linha.nome);
      recarregar();
    } finally {
      setAApagar(false);
      setAConfirmar(false);
    }
  }

  /* Alguem se meteu no nome de outra pessoa? Tira-se o PIN e o nome fica
     outra vez a espera de quem lhe ponha um. Os torroes ficam onde estao. */
  async function tirarPin() {
    setAApagar(true);
    try {
      await api.limparPin(linha.nome);
      setSemPin(true);
    } finally {
      setAApagar(false);
      setATirarPin(false);
    }
  }

  return (
    <div className="linha-admin">
      <div className="corpo">
        <b>{linha.nome}</b>
        <small>
          {linha.torroes} torrões · máximo {linha.pico} · {linha.maos} mãos
        </small>
      </div>
      {aConfirmar ? (
        <div className="acoes">
          <button className="btn mini" type="button" onClick={apagar} disabled={aApagar}>
            {aApagar ? 'A tirar...' : 'Tirar mesmo'}
          </button>
          <button className="btn claro mini" type="button" onClick={() => setAConfirmar(false)}>
            Não
          </button>
        </div>
      ) : aTirarPin ? (
        <div className="acoes">
          <button className="btn mini" type="button" onClick={tirarPin} disabled={aApagar}>
            {aApagar ? 'A limpar...' : 'Limpar mesmo'}
          </button>
          <button className="btn claro mini" type="button" onClick={() => setATirarPin(false)}>
            Não
          </button>
        </div>
      ) : (
        <div className="acoes">
          <button
            className="btn claro mini"
            type="button"
            onClick={() => setATirarPin(true)}
            title="O nome volta a poder receber um PIN novo"
          >
            {semPin ? 'PIN limpo' : 'Limpar PIN'}
          </button>
          <button className="btn claro mini" type="button" onClick={() => setAConfirmar(true)}>
            Tirar do quadro
          </button>
        </div>
      )}
    </div>
  );
}

/** Deitar o quadro abaixo. Como não há volta a dar, pergunta primeiro. */
/**
 * O mural do Instagram, aqui no painel.
 *
 * O Instagram fechou as portas a quem quer ler um perfil de fora: nem o
 * servidor nem o browser conseguem ir la buscar as publicacoes sozinhos. Ha
 * duas maneiras de as ter aqui, e estao as duas neste sitio: a automatica, que
 * e a via oficial da Meta e precisa de um token, e a de as por a mao, que
 * funciona sempre.
 */
function MuralDoAdmin({ estado, recarregar }: { estado: Estado; recarregar: () => void }) {
  const [endereco, setEndereco] = useState('');
  const [legenda, setLegenda] = useState('');
  const [data, setData] = useState(hoje());
  const [formato, setFormato] = useState('foto');
  const [aEnviar, setAEnviar] = useState(false);
  const [recado, setRecado] = useState('');
  const campo = useRef<HTMLInputElement>(null);

  const postas = estado.insta.filter((p: Post) => p.daNuvem);

  async function sincronizar() {
    setRecado('');
    setAEnviar(true);
    try {
      const r = await api.sincronizarMural();
      setRecado(
        r.postas > 0
          ? `Foram buscar ${r.postas} publicações novas.`
          : 'Não havia nenhuma por trazer.'
      );
      recarregar();
    } catch (e) {
      setRecado(e instanceof Error ? e.message : 'Não deu.');
    } finally {
      setAEnviar(false);
    }
  }

  async function acrescentar(ficheiro: File | undefined) {
    if (!ficheiro) return;
    setRecado('');
    setAEnviar(true);
    try {
      const capa = await encolherParaGaleria(ficheiro);
      await api.acrescentarAoMural({ url: endereco.trim(), legenda: legenda.trim(), data, formato }, capa);
      setEndereco('');
      setLegenda('');
      recarregar();
      setRecado('Está no mural.');
    } catch (e) {
      setRecado(e instanceof Error ? e.message : 'Não deu.');
    } finally {
      setAEnviar(false);
      if (campo.current) campo.current.value = '';
    }
  }

  async function tirar(post: Post) {
    if (!window.confirm(`Tirar esta publicação do mural?`)) return;
    try {
      await api.tirarDoMural(post.id);
      recarregar();
    } catch (e) {
      setRecado(e instanceof Error ? e.message : 'Não deu para tirar.');
    }
  }

  return (
    <section>
      <h2 style={{ fontSize: 22, marginBottom: 12 }}>Mural do Instagram</h2>
      <div className="painel">
        <p className="notas" style={{ marginTop: 0 }}>
          O Instagram não deixa o site ir buscar as publicações sozinho. O botão aqui ao lado só
          funciona depois de haver um token da Meta; até lá, põem-se à mão aqui em baixo.
        </p>

        <div className="acoes" style={{ marginBottom: 16 }}>
          <button className="btn claro mini" type="button" disabled={aEnviar} onClick={sincronizar}>
            Ir buscar as que faltam
          </button>
        </div>

        <div className="por-no-mural">
          <input
            type="text"
            value={endereco}
            placeholder="https://www.instagram.com/p/..."
            onChange={(e) => setEndereco(e.target.value)}
          />
          <input
            type="text"
            maxLength={2200}
            value={legenda}
            placeholder="a legenda da publicação"
            onChange={(e) => setLegenda(e.target.value)}
          />
          <div className="por-no-mural-linha">
            <input type="date" value={data} onChange={(e) => setData(e.target.value)} />
            <select value={formato} onChange={(e) => setFormato(e.target.value)}>
              <option value="foto">Foto</option>
              <option value="album">Álbum</option>
              <option value="reel">Reel</option>
            </select>
            <input
              type="file"
              accept="image/*"
              ref={campo}
              style={{ display: 'none' }}
              onChange={(e) => acrescentar(e.target.files?.[0])}
            />
            <button
              className="btn mini"
              type="button"
              disabled={aEnviar || endereco.trim().length < 10}
              onClick={() => campo.current?.click()}
            >
              {aEnviar ? 'A enviar...' : 'Escolher a capa e pôr no mural'}
            </button>
          </div>
        </div>

        {recado && <p className="recado">{recado}</p>}

        {postas.length > 0 && (
          <div style={{ marginTop: 16 }}>
            <p className="rotulo">Postas por aqui</p>
            {postas.map((p: Post) => (
              <div className="linha-admin" key={p.id}>
                <div className="corpo">
                  <b>{p.id}</b>
                  <small>
                    {dataCurta(p.data)} · {p.legenda.slice(0, 60) || 'sem legenda'}
                  </small>
                </div>
                <button className="btn claro mini" type="button" onClick={() => tirar(p)}>
                  Tirar do mural
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
