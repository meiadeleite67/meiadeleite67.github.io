import { useCallback, useEffect, useRef, useState } from 'react';
import { api, enderecoDoMedia, fotoDoMembro } from '../lib/api';
import type { ItemDaGaleria, Membro } from '../lib/tipos';

const LADO = 480;
/** O lado maior de uma foto da galeria. Chega para se aproximar sem ficar
 *  esborratada, e poupa quase tudo o que uma foto de telemovel traz a mais. */
const LADO_DA_GALERIA = 1800;

/**
 * Encolhe a foto aqui no browser antes de a mandar.
 *
 * Uma foto de telemóvel tem uns quantos megabytes, e isso não tem nada que
 * fazer numa base de chave e valor. Cortamos ao quadrado, reduzimos para 480
 * pixels e gravamos em JPEG: fica nuns 40 kB e chega bem para um retrato.
 */
/**
 * As fotos do telemovel vem com quatro mil pixeis de lado e varios megabytes.
 * Para a galeria isso nao serve de nada: encolhe-se para mil e oitocentos do
 * lado maior, sem cortar nada, e fica a mesma foto a pesar um decimo.
 *
 * Os videos passam ao lado: encolher video no browser e outra historia.
 */
function encolherParaGaleria(ficheiro: File): Promise<File> {
  if (!ficheiro.type.startsWith('image/')) return Promise.resolve(ficheiro);
  return new Promise((resolve, reject) => {
    const endereco = URL.createObjectURL(ficheiro);
    const img = new Image();
    img.onerror = () => {
      URL.revokeObjectURL(endereco);
      reject(new Error('Isso nao parece uma imagem.'));
    };
    img.onload = () => {
      URL.revokeObjectURL(endereco);
      const maior = Math.max(img.width, img.height);
      // ja e pequena: vai como esta
      if (maior <= LADO_DA_GALERIA) return resolve(ficheiro);
      const escala = LADO_DA_GALERIA / maior;
      const tela = document.createElement('canvas');
      tela.width = Math.round(img.width * escala);
      tela.height = Math.round(img.height * escala);
      const pincel = tela.getContext('2d');
      if (!pincel) return reject(new Error('O browser nao deixou desenhar a imagem.'));
      pincel.drawImage(img, 0, 0, tela.width, tela.height);
      tela.toBlob(
        (b) => {
          if (!b) return reject(new Error('Nao deu para encolher a imagem.'));
          resolve(new File([b], ficheiro.name.replace(/\.[^.]+$/, '') + '.jpg', { type: 'image/jpeg' }));
        },
        'image/jpeg',
        0.85
      );
    };
    img.src = endereco;
  });
}

function encolher(ficheiro: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const leitor = new FileReader();
    leitor.onerror = () => reject(new Error('Não deu para ler o ficheiro.'));
    leitor.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('Isso não parece uma imagem.'));
      img.onload = () => {
        const lado = Math.min(img.width, img.height);
        const tela = document.createElement('canvas');
        tela.width = LADO;
        tela.height = LADO;
        const pincel = tela.getContext('2d');
        if (!pincel) return reject(new Error('O browser não deixou desenhar a imagem.'));
        pincel.drawImage(
          img,
          (img.width - lado) / 2,
          (img.height - lado) / 2,
          lado,
          lado,
          0,
          0,
          LADO,
          LADO
        );
        resolve(tela.toDataURL('image/jpeg', 0.82));
      };
      img.src = String(leitor.result);
    };
    leitor.readAsDataURL(ficheiro);
  });
}

export function AdminMembros({
  membros,
  recarregar
}: {
  membros: Membro[];
  recarregar: () => void;
}) {
  const [nome, setNome] = useState('');
  const [descricao, setDescricao] = useState('');
  const [foto, setFoto] = useState('');
  const [recado, setRecado] = useState('');
  const [mal, setMal] = useState(false);
  const [aTrabalhar, setATrabalhar] = useState(false);
  const campoFoto = useRef<HTMLInputElement>(null);

  function falhou(e: unknown, quando: string) {
    setMal(true);
    setRecado(e instanceof Error ? e.message : quando);
  }

  async function escolherFoto(ficheiro: File | undefined) {
    if (!ficheiro) return;
    setMal(false);
    setRecado('A preparar a foto…');
    try {
      setFoto(await encolher(ficheiro));
      setRecado('Foto pronta.');
    } catch (e) {
      falhou(e, 'Não deu para usar essa foto.');
    }
  }

  async function acrescentar() {
    setMal(false);
    setATrabalhar(true);
    setRecado('A acrescentar…');
    try {
      await api.acrescentarMembro({ nome, descricao, foto: foto || undefined });
      setNome('');
      setDescricao('');
      setFoto('');
      if (campoFoto.current) campoFoto.current.value = '';
      setRecado('Acrescentado.');
      recarregar();
    } catch (e) {
      falhou(e, 'Não deu para acrescentar.');
    } finally {
      setATrabalhar(false);
    }
  }

  return (
    <section>
      <h2 style={{ fontSize: 22, marginBottom: 12 }}>Membros</h2>

      <div className="painel">
        <p className="rotulo" style={{ marginBottom: 9 }}>
          Acrescentar alguém
        </p>
        <div className="campos duplo">
          <label>
            <span className="rotulo">Nome</span>
            <input
              id="mb-nome"
              type="text"
              maxLength={40}
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              placeholder="Zé Pedro"
            />
          </label>
          <label>
            <span className="rotulo">Foto</span>
            <input
              id="mb-foto"
              type="file"
              accept="image/*"
              ref={campoFoto}
              onChange={(e) => escolherFoto(e.target.files?.[0])}
            />
          </label>
        </div>
        <label style={{ marginTop: 11 }}>
          <span className="rotulo">Descrição (uma linha chega)</span>
          <input
            id="mb-descricao"
            type="text"
            maxLength={200}
            value={descricao}
            onChange={(e) => setDescricao(e.target.value)}
            placeholder="O que faz o café durar a tarde toda."
          />
        </label>

        {foto && (
          <div className="previsao">
            <img src={foto} alt="" />
            <span className="rotulo">Assim vai ficar</span>
            <button className="btn claro mini" type="button" onClick={() => setFoto('')}>
              Tirar
            </button>
          </div>
        )}

        <div style={{ marginTop: 12 }}>
          <button
            className="btn azul"
            type="button"
            disabled={!nome.trim() || aTrabalhar}
            onClick={acrescentar}
          >
            Acrescentar
          </button>
        </div>
        {recado && <p className={`recado${mal ? ' mal' : ''}`}>{recado}</p>}
      </div>

      <div className="painel" style={{ marginTop: 14 }}>
        {membros.length === 0 ? (
          <p className="vazio">Ainda não há ninguém.</p>
        ) : (
          membros.map((m) => (
            <Linha key={m.id} membro={m} recarregar={recarregar} aoFalhar={falhou} />
          ))
        )}
      </div>
    </section>
  );
}

function Linha({
  membro,
  recarregar,
  aoFalhar
}: {
  membro: Membro;
  recarregar: () => void;
  aoFalhar: (e: unknown, quando: string) => void;
}) {
  const [aEditar, setAEditar] = useState(false);
  const [nome, setNome] = useState(membro.nome);
  const [descricao, setDescricao] = useState(membro.descricao);
  const campo = useRef<HTMLInputElement>(null);

  async function gravar() {
    try {
      await api.mudarMembro(membro.id, { nome, descricao });
      setAEditar(false);
      recarregar();
    } catch (e) {
      aoFalhar(e, 'Não deu para gravar.');
    }
  }

  async function trocarFoto(ficheiro: File | undefined) {
    if (!ficheiro) return;
    try {
      await api.mudarMembro(membro.id, { foto: await encolher(ficheiro) });
      recarregar();
    } catch (e) {
      aoFalhar(e, 'Não deu para trocar a foto.');
    }
  }

  async function aclamar(sim: boolean) {
    try {
      await api.mudarMembro(membro.id, { mascote: sim });
      recarregar();
    } catch (e) {
      aoFalhar(e, sim ? 'Nao deu para aclamar.' : 'Nao deu para tirar o titulo.');
    }
  }

  async function apagar() {
    if (!window.confirm(`Tirar ${membro.nome} da lista?`)) return;
    try {
      await api.apagarMembro(membro.id);
      recarregar();
    } catch (e) {
      aoFalhar(e, 'Não deu para apagar.');
    }
  }

  return (
    <>
    <div className="linha-admin">
      <div className="retrato pequeno">
        {membro.temFoto && <img src={fotoDoMembro(membro.id)} alt="" />}
        <span className="iniciais">{membro.nome.slice(0, 1).toUpperCase()}</span>
      </div>

      {aEditar ? (
        <div className="corpo" style={{ display: 'grid', gap: 8 }}>
          <input type="text" maxLength={40} value={nome} onChange={(e) => setNome(e.target.value)} />
          <input
            type="text"
            maxLength={200}
            value={descricao}
            onChange={(e) => setDescricao(e.target.value)}
          />
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button className="btn mini" type="button" onClick={gravar}>
              Gravar
            </button>
            <button className="btn claro mini" type="button" onClick={() => setAEditar(false)}>
              Deixa estar
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="corpo">
            <b>{membro.nome}</b>
            <small>{membro.descricao || 'sem descrição'}</small>
          </div>
          <input
            type="file"
            accept="image/*"
            ref={campo}
            style={{ display: 'none' }}
            onChange={(e) => trocarFoto(e.target.files?.[0])}
          />
          <button className="btn claro mini" type="button" onClick={() => campo.current?.click()}>
            {membro.temFoto ? 'Trocar foto' : 'Pôr foto'}
          </button>
          <button
            className={`btn mini${membro.mascote ? '' : ' claro'}`}
            type="button"
            title={membro.mascote ? 'Deixa de ser a mascote' : 'Passa a ser a mascote do grupo'}
            onClick={() => aclamar(!membro.mascote)}
          >
            {membro.mascote ? 'E a mascote' : 'Aclamar mascote'}
          </button>
          <button className="btn claro mini" type="button" onClick={() => setAEditar(true)}>
            Editar
          </button>
          <button className="btn claro mini" type="button" onClick={apagar}>
            Apagar
          </button>
        </>
      )}
    </div>
    {membro.mascote && <GaleriaDoAdmin dono={membro.id} aoFalhar={aoFalhar} />}
    </>
  );
}

/**
 * A galeria da mascote, aqui no painel: por fotos e videos, ver o que la esta
 * e tirar de la. So aparece para quem for mascote, porque e a galeria dela.
 */
function GaleriaDoAdmin({
  dono,
  aoFalhar
}: {
  dono: string;
  aoFalhar: (e: unknown, porOmissao: string) => void;
}) {
  const [itens, setItens] = useState<ItemDaGaleria[]>([]);
  const [legenda, setLegenda] = useState('');
  const [aEnviar, setAEnviar] = useState(false);
  const campo = useRef<HTMLInputElement>(null);

  const reler = useCallback(() => {
    api
      .galeria(dono)
      .then(setItens)
      .catch(() => setItens([]));
  }, [dono]);

  useEffect(reler, [reler]);

  async function por(ficheiro: File | undefined) {
    if (!ficheiro) return;
    setAEnviar(true);
    try {
      // as fotos encolhem antes de viajar; os videos vao como vieram
      const pronto = await encolherParaGaleria(ficheiro);
      if (pronto.size > 8 * 1024 * 1024) {
        throw new Error('Isso tem mais de oito megabytes. Corta o video, que e o que costuma ser.');
      }
      await api.porNaGaleria(dono, pronto, legenda.trim());
      setLegenda('');
      reler();
    } catch (e) {
      aoFalhar(e, 'Nao deu para por isso la.');
    } finally {
      setAEnviar(false);
      if (campo.current) campo.current.value = '';
    }
  }

  async function tirar(item: ItemDaGaleria) {
    if (!window.confirm('Tirar isto da galeria?')) return;
    try {
      await api.tirarDaGaleria(dono, item.id);
      reler();
    } catch (e) {
      aoFalhar(e, 'Nao deu para tirar.');
    }
  }

  return (
    <div className="galeria-admin">
      <p className="rotulo">A galeria da mascote</p>

      {itens.length > 0 && (
        <div className="galeria-admin-tiras">
          {itens.map((item) => (
            <div className="galeria-admin-tira" key={item.id}>
              {item.tipo === 'video' ? (
                <video src={enderecoDoMedia(item)} muted playsInline preload="metadata" />
              ) : (
                <img src={enderecoDoMedia(item)} alt={item.legenda} loading="lazy" />
              )}
              <button type="button" aria-label="Tirar da galeria" onClick={() => tirar(item)}>
                &times;
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="galeria-admin-por">
        <input
          type="text"
          maxLength={120}
          value={legenda}
          placeholder="legenda, se quiseres"
          onChange={(e) => setLegenda(e.target.value)}
        />
        <input
          type="file"
          accept="image/*,video/*"
          ref={campo}
          style={{ display: 'none' }}
          onChange={(e) => por(e.target.files?.[0])}
        />
        <button
          className="btn claro mini"
          type="button"
          disabled={aEnviar}
          onClick={() => campo.current?.click()}
        >
          {aEnviar ? 'A enviar...' : 'Por foto ou video'}
        </button>
      </div>
    </div>
  );
}
