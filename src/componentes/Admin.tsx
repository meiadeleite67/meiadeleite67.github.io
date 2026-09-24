import { useEffect, useRef, useState } from 'react';
import { api, temServidor } from '../lib/api';
import { AdminMembros, encolherParaGaleria } from './AdminMembros';
import { MESES_INTEIROS, TIPOS, dataCurta, hoje } from '../lib/dados';
import type { Estado, Pontuacao, Post, TipoEvento } from '../lib/tipos';

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

        <div className="painel" style={{ marginTop: 18 }}>
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
      </section>

      <section>
        <h2 style={{ fontSize: 22, marginBottom: 12 }}>O que está marcado</h2>
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

      <AdminMembros membros={estado.membros} recarregar={recarregar} />

      <MuralDoAdmin estado={estado} recarregar={recarregar} />

      <section>
        <h2 style={{ fontSize: 22, marginBottom: 12 }}>Leaderboard</h2>
        <div className="painel">
          {estado.ranking.length === 0 ? (
            <p className="vazio">Ninguém jogou ainda.</p>
          ) : (
            estado.ranking.map((r) => (
              <LinhaDoQuadro key={r.nome} linha={r} recarregar={recarregar} />
            ))
          )}

          <LimparQuadro quantos={estado.ranking.length} recarregar={recarregar} />
        </div>
      </section>
    </>
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
function LimparQuadro({ quantos, recarregar }: { quantos: number; recarregar: () => void }) {
  const [aConfirmar, setAConfirmar] = useState(false);
  const [aLimpar, setALimpar] = useState(false);
  const [recado, setRecado] = useState('');

  async function limpar() {
    setALimpar(true);
    setRecado('');
    try {
      const r = await api.limparQuadro();
      setAConfirmar(false);
      setRecado(`Quadro limpo. Saíram ${r.quantos} nomes.`);
      recarregar();
    } catch (e) {
      setRecado(e instanceof Error ? e.message : 'Não deu.');
    } finally {
      setALimpar(false);
    }
  }

  return (
    <div style={{ marginTop: 18, borderTop: '1px solid var(--linha)', paddingTop: 14 }}>
      {aConfirmar ? (
        <>
          <p className="notas" style={{ marginTop: 0 }}>
            Isto apaga os {quantos} nomes do quadro e os torrões de toda a gente. Não há volta a
            dar.
          </p>
          <div className="acoes">
            <button className="btn" type="button" onClick={limpar} disabled={aLimpar}>
              {aLimpar ? 'A limpar...' : 'Sim, limpa tudo'}
            </button>
            <button className="btn claro" type="button" onClick={() => setAConfirmar(false)}>
              Deixa estar
            </button>
          </div>
        </>
      ) : (
        <button
          className="btn claro mini"
          type="button"
          onClick={() => setAConfirmar(true)}
          disabled={quantos === 0}
        >
          Limpar o quadro
        </button>
      )}
      {recado && <p className="recado">{recado}</p>}
    </div>
  );
}

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
