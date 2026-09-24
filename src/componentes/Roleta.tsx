import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { Entrada } from './Entrada';
import { api, temServidor } from '../lib/api';
import { nomeGuardado, passeDe } from '../lib/nick';
import type { Aposta, Pontuacao, Rodada, TipoDeAposta } from '../lib/tipos';

/**
 * A roleta, com o prato e a bola em três dimensões.
 *
 * É feita como o troféu, como o Cusco e como a mesa de poker: com as
 * transformações 3D do próprio CSS e mais nada. O prato é um disco inclinado
 * com trinta e sete casas à volta, e a bola anda numa pista por fora, ao
 * contrário do prato, como numa roleta a sério.
 *
 * O número sai no servidor e só depois é que a bola anda: o que se vê aqui é a
 * encenação de um resultado que já está decidido. É de propósito. Se a conta
 * fosse feita deste lado, bastava abrir as ferramentas do browser para saber
 * onde ela ia parar.
 *
 * A ordem das casas é a de uma roleta europeia a sério, a mesma que está no
 * servidor. Não é a ordem dos números: é a ordem em que eles estão pintados na
 * madeira, com as cores sempre a alternar.
 */

const RODA = [
  0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 5, 24, 16, 33, 1, 20, 14,
  31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26
];
const VERMELHOS = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);
const cor = (n: number) => (n === 0 ? 'verde' : VERMELHOS.has(n) ? 'vermelho' : 'preto');

/** Quanto vale cada ficha que se pode pegar da bancada. */
const FICHAS = [1, 5, 10, 25, 100];
/** Quanto tempo a bola anda antes de parar. */
const A_RODAR = 5200;
const PASSO = 360 / RODA.length;

/* O tabuleiro é o de sempre: três filas de doze, com o zero de lado. A fila de
   cima é a terceira coluna, que é a dos múltiplos de três. */
const FILAS = [
  Array.from({ length: 12 }, (_, i) => i * 3 + 3),
  Array.from({ length: 12 }, (_, i) => i * 3 + 2),
  Array.from({ length: 12 }, (_, i) => i * 3 + 1)
];

const DE_FORA: { tipo: TipoDeAposta; nome: string; paga: string }[] = [
  { tipo: 'baixo', nome: '1 a 18', paga: 'paga a dobrar' },
  { tipo: 'par', nome: 'Par', paga: 'paga a dobrar' },
  { tipo: 'vermelho', nome: 'Vermelho', paga: 'paga a dobrar' },
  { tipo: 'preto', nome: 'Preto', paga: 'paga a dobrar' },
  { tipo: 'impar', nome: 'Ímpar', paga: 'paga a dobrar' },
  { tipo: 'alto', nome: '19 a 36', paga: 'paga a dobrar' }
];

const DUZIAS: { tipo: TipoDeAposta; nome: string }[] = [
  { tipo: 'duzia1', nome: '1 a 12' },
  { tipo: 'duzia2', nome: '13 a 24' },
  { tipo: 'duzia3', nome: '25 a 36' }
];

const COLUNAS: TipoDeAposta[] = ['coluna3', 'coluna2', 'coluna1'];

/** A chave com que cada aposta fica guardada enquanto está na mesa. */
const chaveDa = (tipo: TipoDeAposta, valor?: number) =>
  tipo === 'numero' ? `numero:${valor}` : tipo;

const apostaDa = (chave: string, quanto: number): Aposta =>
  chave.startsWith('numero:')
    ? { tipo: 'numero', valor: Number(chave.slice(7)), quanto }
    : { tipo: chave as TipoDeAposta, quanto };

export function Roleta({ recarregar }: { recarregar: () => void }) {
  const [nome, setNome] = useState(() => {
    const posto = nomeGuardado();
    return posto && passeDe(posto) ? posto : '';
  });
  const [linha, setLinha] = useState<Pontuacao | null>(null);
  const [recado, setRecado] = useState('');
  const [ficha, setFicha] = useState(FICHAS[1]);
  /** O que está na mesa, por chave de aposta. */
  const [mesa, setMesa] = useState<Record<string, number>>({});
  const [aRodar, setARodar] = useState(false);
  const [saiu, setSaiu] = useState<Rodada | null>(null);
  /** As voltas do prato e da bola. Só crescem, para nunca andarem para trás. */
  const [giro, setGiro] = useState({ prato: 0, bola: 0 });

  const ocupado = useRef(false);
  const relogios = useRef<number[]>([]);

  const passe = nome ? passeDe(nome) : '';
  const naMesa = useMemo(() => Object.values(mesa).reduce((s, q) => s + q, 0), [mesa]);
  const saldo = linha ? linha.torroes : 0;

  useEffect(
    () => () => {
      relogios.current.forEach(clearTimeout);
    },
    []
  );

  /* Quem chega com o nome e o passe já postos vai buscar o saldo, que é o
     mesmo do blackjack e do poker. */
  const buscarSaldo = useCallback(async () => {
    if (!nome || !passe) return;
    try {
      const r = await api.sentar(nome, passe);
      setLinha(r.linha);
    } catch {
      /* sem servidor fica sem saldo, e a mesa não deixa apostar */
    }
  }, [nome, passe]);

  useEffect(() => {
    buscarSaldo();
  }, [buscarSaldo]);

  function por(tipo: TipoDeAposta, valor?: number) {
    if (aRodar) return;
    const chave = chaveDa(tipo, valor);
    const ja = mesa[chave] || 0;
    if (naMesa + ficha > saldo) return setRecado('Não tens torrões que cheguem para mais fichas.');
    setRecado('');
    setSaiu(null);
    setMesa({ ...mesa, [chave]: ja + ficha });
  }

  function tirar(chave: string) {
    if (aRodar) return;
    const resto = { ...mesa };
    delete resto[chave];
    setMesa(resto);
  }

  async function rodar() {
    if (aRodar || ocupado.current || naMesa <= 0) return;
    ocupado.current = true;
    setARodar(true);
    setRecado('');
    setSaiu(null);

    try {
      const apostas = Object.entries(mesa).map(([chave, quanto]) => apostaDa(chave, quanto));
      const r = await api.roleta(nome, passe, apostas);

      /* O prato roda até pôr a casa que saiu debaixo da marca, e a bola anda
         ao contrário até parar lá em cima. Como os dois números só crescem,
         nunca se vê nada a andar para trás entre rodadas. */
      setGiro((antes) => {
        const alvo = -r.rodada.casa * PASSO;
        const resto = ((antes.prato % 360) + 360) % 360;
        const falta = (((alvo - resto) % 360) + 360) % 360;
        return {
          prato: antes.prato + 6 * 360 + falta,
          bola: antes.bola - 5 * 360 - (((antes.bola % 360) + 360) % 360)
        };
      });

      // o número só aparece quando a bola parar, senão estragava a surpresa
      relogios.current.push(
        window.setTimeout(() => {
          setSaiu(r.rodada);
          setLinha(r.linha);
          setMesa({});
          setARodar(false);
          recarregar();
        }, A_RODAR)
      );
    } catch (e) {
      setRecado(e instanceof Error ? e.message : 'A roleta não respondeu.');
      setARodar(false);
    } finally {
      ocupado.current = false;
    }
  }

  if (!temServidor())
    return (
      <section className="rol">
        <p className="eyebrow">Mesa fechada</p>
        <h1>Roleta</h1>
        <p className="lead">
          A roleta precisa do servidor do grupo, e este site ainda não está ligado a ele. O número
          tem de sair de lá: se saísse aqui, bastava abrir as ferramentas do browser para o saber de
          antemão.
        </p>
      </section>
    );

  if (!nome)
    return (
      <section className="rol">
        <p className="eyebrow">Trinta e sete casas, um zero só</p>
        <h1>Roleta</h1>
        <p className="lead">
          Joga-se com os mesmos torrões do blackjack e do poker. Entra com o teu nome e o teu PIN.
        </p>
        <Entrada aoEntrar={setNome} />
      </section>
    );

  return (
    <section className="rol">
      <header className="rol-cima">
        <p className="eyebrow">Trinta e sete casas, um zero só</p>
        <h1>Roleta</h1>
        <p className="rol-saldo">
          <b>{saldo}</b>
          <small>torrões de {nome}</small>
        </p>
      </header>

      <Prato giro={giro} aRodar={aRodar} saiu={saiu} />

      {saiu && (
        <p className={`rol-veredito ${saiu.lucro > 0 ? 'bem' : saiu.lucro < 0 ? 'mal' : ''}`}>
          Saiu o <b>{saiu.saiu}</b> {saiu.saiu === 0 ? 'em verde' : `em ${saiu.cor}`}.{' '}
          {saiu.volta > 0
            ? `Voltaram ${saiu.volta} dos ${saiu.apostado} que puseste.`
            : `Levou os ${saiu.apostado} que estavam na mesa.`}
        </p>
      )}

      {recado && <p className="recado mal rol-recado">{recado}</p>}

      <div className="rol-bancada">
        <span className="notas">Ficha:</span>
        {FICHAS.map((f) => (
          <button
            key={f}
            type="button"
            className={`rol-ficha${ficha === f ? ' pegada' : ''}`}
            data-valor={f}
            onClick={() => setFicha(f)}
            disabled={aRodar}
          >
            {f}
          </button>
        ))}
      </div>

      <Tabuleiro mesa={mesa} por={por} tirar={tirar} aRodar={aRodar} saiu={saiu} />

      <div className="rol-fim">
        <p className="notas">
          {naMesa > 0 ? (
            <>
              Na mesa: <b>{naMesa}</b> torrões
            </>
          ) : (
            'Escolhe uma ficha e põe-na no pano. Carrega noutra vez para pôr mais.'
          )}
        </p>
        <div className="rol-botoes">
          <button type="button" className="btn" onClick={() => setMesa({})} disabled={aRodar || naMesa === 0}>
            Tirar as fichas
          </button>
          <button type="button" className="btn azul" onClick={rodar} disabled={aRodar || naMesa === 0}>
            {aRodar ? 'A rodar...' : 'Rodar'}
          </button>
        </div>
      </div>

      <p className="notas rol-regras">
        Um número em cheio paga trinta e cinco para um, as dúzias e as colunas pagam dois para um, e
        o resto paga a dobrar. No zero perde-se tudo o que está de fora, como em qualquer roleta
        europeia. A casa fica com 2,7 por cento a longo prazo, e isso não se muda: é a roleta.
      </p>
    </section>
  );
}

/* ======================== o prato, em três dimensões ======================== */

function Prato({
  giro,
  aRodar,
  saiu
}: {
  giro: { prato: number; bola: number };
  aRodar: boolean;
  saiu: Rodada | null;
}) {
  /* As trinta e sete casas pintam-se de uma vez num gradiente em leque, em vez
     de trinta e sete triangulos. A primeira fica centrada em cima, que e onde
     a bola para. */
  const casas = useMemo(() => {
    const partes = RODA.map((n, i) => {
      const c = cor(n) === 'verde' ? '#1d7a4c' : cor(n) === 'vermelho' ? '#a52725' : '#1a1a1c';
      return `${c} ${i * PASSO}deg ${(i + 1) * PASSO}deg`;
    });
    return `conic-gradient(from ${-PASSO / 2}deg, ${partes.join(', ')})`;
  }, []);

  const estilo = {
    '--prato': `${giro.prato}deg`,
    '--bola': `${giro.bola}deg`,
    '--anda': `${A_RODAR}ms`,
    '--passo': `${PASSO}deg`,
    '--casas': casas
  } as CSSProperties;

  return (
    <div className="rol-cena" style={estilo} role="img" aria-label="A roleta">
      <div className="rol-mundo">
        {/* a bacia de madeira, feita de discos uns atrás dos outros */}
        <div className="rol-bacia">
          {[0, 1, 2, 3, 4].map((f) => (
            <i key={f} className="rol-folha" style={{ '--f': f } as CSSProperties} />
          ))}
          <i className="rol-pista" />
        </div>

        {/* o prato que roda, com as casas todas */}
        <div className="rol-prato" data-a-rodar={aRodar ? 'sim' : 'nao'}>
          {RODA.map((n, i) => (
            <div key={n} className={`rol-casa ${cor(n)}`} style={{ '--i': i } as CSSProperties}>
              <span>{n}</span>
            </div>
          ))}
          <i className="rol-meio" />
        </div>

        {/* a bola, numa pista por fora, ao contrário do prato */}
        <div className="rol-orbita">
          <i className="rol-bola" />
        </div>
      </div>

      <span className="rol-marca" aria-hidden="true" />
      {saiu && !aRodar && (
        <span className={`rol-saiu ${saiu.cor}`}>
          {saiu.saiu}
        </span>
      )}
    </div>
  );
}

/* ============================== o pano ============================== */

function Tabuleiro({
  mesa,
  por,
  tirar,
  aRodar,
  saiu
}: {
  mesa: Record<string, number>;
  por: (tipo: TipoDeAposta, valor?: number) => void;
  tirar: (chave: string) => void;
  aRodar: boolean;
  saiu: Rodada | null;
}) {
  /** A ficha que está em cima de uma casa, se houver. */
  const emCima = (chave: string) => {
    const quanto = mesa[chave];
    if (!quanto) return null;
    return (
      <b
        className="rol-posta"
        onContextMenu={(e) => {
          e.preventDefault();
          tirar(chave);
        }}
      >
        {quanto}
      </b>
    );
  };

  const brilha = (acerta: (n: number) => boolean) =>
    saiu && !aRodar && acerta(saiu.saiu) ? ' acertou' : '';

  return (
    <div className={`rol-pano${aRodar ? ' fechado' : ''}`}>
      <button
        type="button"
        className={`rol-cela zero${brilha((n) => n === 0)}`}
        onClick={() => por('numero', 0)}
        disabled={aRodar}
      >
        <span>0</span>
        {emCima('numero:0')}
      </button>

      <div className="rol-numeros">
        {FILAS.map((fila, f) => (
          <div key={f} className="rol-fila">
            {fila.map((n) => (
              <button
                key={n}
                type="button"
                className={`rol-cela ${cor(n)}${brilha((x) => x === n)}`}
                onClick={() => por('numero', n)}
                disabled={aRodar}
              >
                <span>{n}</span>
                {emCima(`numero:${n}`)}
              </button>
            ))}
            <button
              type="button"
              className={`rol-cela lado${brilha((x) => x !== 0 && x % 3 === (3 - f) % 3)}`}
              onClick={() => por(COLUNAS[f])}
              disabled={aRodar}
              title="Esta coluna paga dois para um"
            >
              <span>2:1</span>
              {emCima(COLUNAS[f])}
            </button>
          </div>
        ))}

        <div className="rol-fila rol-duzias">
          {DUZIAS.map((d, i) => (
            <button
              key={d.tipo}
              type="button"
              className={`rol-cela larga${brilha((x) => x >= i * 12 + 1 && x <= i * 12 + 12)}`}
              onClick={() => por(d.tipo)}
              disabled={aRodar}
            >
              <span>{d.nome}</span>
              {emCima(d.tipo)}
            </button>
          ))}
        </div>

        <div className="rol-fila rol-fora">
          {DE_FORA.map((o) => (
            <button
              key={o.tipo}
              type="button"
              className={`rol-cela${o.tipo === 'vermelho' || o.tipo === 'preto' ? ' ' + o.tipo : ''}${brilha(
                (x) =>
                  o.tipo === 'baixo'
                    ? x >= 1 && x <= 18
                    : o.tipo === 'alto'
                      ? x >= 19 && x <= 36
                      : o.tipo === 'par'
                        ? x !== 0 && x % 2 === 0
                        : o.tipo === 'impar'
                          ? x % 2 === 1
                          : o.tipo === 'vermelho'
                            ? cor(x) === 'vermelho'
                            : cor(x) === 'preto'
              )}`}
              onClick={() => por(o.tipo)}
              disabled={aRodar}
            >
              <span>{o.nome}</span>
              {emCima(o.tipo)}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
