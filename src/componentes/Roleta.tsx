import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { api, temServidor } from '../lib/api';
import { passeDe } from '../lib/nick';
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

/** A chave com que cada aposta fica guardada enquanto está na mesa. */
const chaveDa = (tipo: TipoDeAposta, valor?: number) =>
  tipo === 'numero' ? `numero:${valor}` : tipo;

const apostaDa = (chave: string, quanto: number): Aposta =>
  chave.startsWith('numero:')
    ? { tipo: 'numero', valor: Number(chave.slice(7)), quanto }
    : { tipo: chave as TipoDeAposta, quanto };

export function Roleta({
  nome,
  pedirNome,
  recarregar
}: {
  nome: string;
  pedirNome: () => void;
  recarregar: () => void;
}) {
  const [linha, setLinha] = useState<Pontuacao | null>(null);
  const [recado, setRecado] = useState('');
  const [ficha, setFicha] = useState(FICHAS[1]);
  /** O que está na mesa, por chave de aposta. */
  const [mesa, setMesa] = useState<Record<string, number>>({});
  const [aRodar, setARodar] = useState(false);
  const [aPedir, setAPedir] = useState(false);
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

  /** Os cem do costume, para quem está mesmo sem nada. A carteira é a mesma de
   *  todos os jogos, por isso o empréstimo também. */
  async function pedirEmprestado() {
    if (aPedir) return;
    setAPedir(true);
    setRecado('');
    try {
      const r = await api.emprestimo(nome, passe);
      setLinha(r.linha);
      recarregar();
    } catch (e) {
      setRecado(e instanceof Error ? e.message : 'Não deu para pedir.');
    } finally {
      setAPedir(false);
    }
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
        <button className="btn azul" type="button" onClick={pedirNome}>
          Entrar com o meu nome
        </button>
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

      {saldo < 5 && (
        <p className="rol-sem-nada">
          Ficaste sem torrões.
          <button type="button" onClick={pedirEmprestado} disabled={aPedir}>
            Pedir 100 emprestados ao Amílcar
          </button>
        </p>
      )}

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
        {/* a bacia de madeira e a pista da bola, as duas em anel para se ver
            lá para dentro: um disco cheio tapava a roda, que está mais fundo */}
        <div className="rol-bacia">
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

/* ============================== o pano ==============================

   O tabuleiro e uma grelha so, e cada casa sabe dois sitios: o que ocupa com a
   mesa deitada e o que ocupa com ela ao alto. Assim a mesa roda de orientacao
   no telemovel sem o HTML mudar nada, e deixa de ser preciso arrasta-la para o
   lado para se ver os numeros todos.

   Deitada sao tres filas de doze, como numa mesa de casino vista de lado. Ao
   alto sao doze filas de tres, com o zero em cima e as duzias de lado, que e
   como as mesas a serio estao viradas para quem esta de pe ao lado delas. */

type Sitio = {
  /** deitado: fila, coluna, e quantas ocupa de cada */
  l: number;
  c: number;
  ls?: number;
  cs?: number;
  /** ao alto: o mesmo */
  lv: number;
  cv: number;
  lvs?: number;
  cvs?: number;
};

const ondeFica = (s: Sitio) =>
  ({
    '--l': s.l,
    '--c': s.c,
    '--ls': s.ls ?? 1,
    '--cs': s.cs ?? 1,
    '--lv': s.lv,
    '--cv': s.cv,
    '--lvs': s.lvs ?? 1,
    '--cvs': s.cvs ?? 1
  }) as CSSProperties;

/** Onde cada numero fica nas duas orientacoes. */
const sitioDoNumero = (n: number): Sitio => ({
  l: n % 3 === 0 ? 1 : n % 3 === 2 ? 2 : 3,
  c: Math.floor((n - 1) / 3) + 2,
  lv: Math.floor((n - 1) / 3) + 2,
  cv: ((n - 1) % 3) + 1
});

const SITIO_DAS_COLUNAS: Record<string, Sitio> = {
  coluna3: { l: 1, c: 14, lv: 14, cv: 3 },
  coluna2: { l: 2, c: 14, lv: 14, cv: 2 },
  coluna1: { l: 3, c: 14, lv: 14, cv: 1 }
};

const SITIO_DAS_DUZIAS: Record<string, Sitio> = {
  duzia1: { l: 4, c: 2, cs: 4, lv: 2, cv: 4, lvs: 4 },
  duzia2: { l: 4, c: 6, cs: 4, lv: 6, cv: 4, lvs: 4 },
  duzia3: { l: 4, c: 10, cs: 4, lv: 10, cv: 4, lvs: 4 }
};

const SITIO_DE_FORA: Record<string, Sitio> = {
  baixo: { l: 5, c: 2, cs: 2, lv: 15, cv: 1, cvs: 2 },
  alto: { l: 5, c: 12, cs: 2, lv: 15, cv: 3, cvs: 2 },
  par: { l: 5, c: 4, cs: 2, lv: 16, cv: 1, cvs: 2 },
  impar: { l: 5, c: 10, cs: 2, lv: 16, cv: 3, cvs: 2 },
  vermelho: { l: 5, c: 6, cs: 2, lv: 17, cv: 1, cvs: 2 },
  preto: { l: 5, c: 8, cs: 2, lv: 17, cv: 3, cvs: 2 }
};

const ACERTA: Record<string, (n: number) => boolean> = {
  baixo: (n) => n >= 1 && n <= 18,
  alto: (n) => n >= 19 && n <= 36,
  par: (n) => n !== 0 && n % 2 === 0,
  impar: (n) => n % 2 === 1,
  vermelho: (n) => cor(n) === 'vermelho',
  preto: (n) => cor(n) === 'preto',
  duzia1: (n) => n >= 1 && n <= 12,
  duzia2: (n) => n >= 13 && n <= 24,
  duzia3: (n) => n >= 25 && n <= 36,
  coluna1: (n) => n !== 0 && n % 3 === 1,
  coluna2: (n) => n !== 0 && n % 3 === 2,
  coluna3: (n) => n !== 0 && n % 3 === 0
};

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
  /** A ficha que esta em cima de uma casa, se houver. Carregar com o botao do
   *  lado direito tira-a de la. */
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

  const casa = (
    chave: string,
    classe: string,
    sitio: Sitio,
    texto: string,
    aoTocar: () => void,
    acerta: (n: number) => boolean
  ) => (
    <button
      key={chave}
      type="button"
      className={`rol-cela ${classe}${brilha(acerta)}`}
      style={ondeFica(sitio)}
      onClick={aoTocar}
      disabled={aRodar}
    >
      <span>{texto}</span>
      {emCima(chave)}
    </button>
  );

  return (
    <div className={`rol-pano${aRodar ? ' fechado' : ''}`}>
      {casa(
        'numero:0',
        'zero',
        { l: 1, c: 1, ls: 3, lv: 1, cv: 1, cvs: 4 },
        '0',
        () => por('numero', 0),
        (n) => n === 0
      )}

      {Array.from({ length: 36 }, (_, i) => i + 1).map((n) =>
        casa(
          `numero:${n}`,
          cor(n),
          sitioDoNumero(n),
          String(n),
          () => por('numero', n),
          (x) => x === n
        )
      )}

      {(['coluna3', 'coluna2', 'coluna1'] as TipoDeAposta[]).map((t) =>
        casa(t, 'lado', SITIO_DAS_COLUNAS[t], '2:1', () => por(t), ACERTA[t])
      )}

      {DUZIAS.map((d) =>
        casa(d.tipo, 'larga', SITIO_DAS_DUZIAS[d.tipo], d.nome, () => por(d.tipo), ACERTA[d.tipo])
      )}

      {DE_FORA.map((o) =>
        casa(
          o.tipo,
          o.tipo === 'vermelho' || o.tipo === 'preto' ? o.tipo : 'larga',
          SITIO_DE_FORA[o.tipo],
          o.nome,
          () => por(o.tipo),
          ACERTA[o.tipo]
        )
      )}
    </div>
  );
}
