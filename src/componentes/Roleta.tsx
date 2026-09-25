import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type RefObject
} from 'react';
import { api, temServidor } from '../lib/api';
import { passeDe } from '../lib/nick';
import { abrirRoleta, ligarSom, somLigado } from '../lib/som';
import type { Aposta, Pontuacao, Rodada, TipoDeAposta } from '../lib/tipos';

/**
 * A roleta, com o prato e a bola em três dimensões.
 *
 * É feita como o troféu, como o Cusco e como a mesa de poker: com as
 * transformações 3D do próprio CSS e mais nada. A bacia está inclinada, como
 * se estivéssemos de pé ao lado dela: é por isso que se vê como uma elipse, e
 * não porque esteja esmagada. Uma roleta a sério vista de frente também o é.
 *
 * A bola não anda em círculo até parar. Faz o que faz uma bola: corre na pista
 * de cima enquanto tem força, e quando a perde desce pela parede da bacia,
 * vai-se aproximando do meio, bate numa casa e assenta nela. O número já está
 * decidido antes de ela andar; o que se vê é a encenação dele.
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

/** Quanto vale cada ficha que se pode pegar da bancada. O servidor aceita
 *  fichas até cinco mil, por isso a de mil cabe com folga. */
const FICHAS = [1, 5, 10, 25, 100, 500, 1000];

/** A cor de cada ficha, a mesma na bancada e em cima do pano. As duas novas
 *  não repetem nenhuma das que já lá estavam: numa pilha de seis discos, duas
 *  fichas da mesma cor não se distinguem. */
const COR_DA_FICHA: Record<number, string> = {
  1: '#3f8d63',
  5: '#4f7fc0',
  10: '#a52725',
  25: '#6d6d7c',
  100: '#9d6fc4',
  500: '#c9711c',
  1000: '#1f6f78'
};

/** Quanto tempo a bola anda antes de assentar. */
const A_RODAR = 5600;
const PASSO = 360 / RODA.length;

/* Onde a bola anda, em percentagem da altura da cena a contar do topo. Na
   pista, lá em cima na madeira; e na casa, já dentro do prato. */
const NA_PISTA = 13;
const NA_CASA = 31;
/** E a que fundura, que ela desce para dentro da bacia enquanto cai. */
const Z_PISTA = -2;
const Z_CASA = -30;
/** O quanto a bacia está inclinada. A bola contra-roda isto, que uma bola é
 *  redonda de todos os lados. */
const INCLINA = 34;

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

/** Uma ficha pousada no pano: onde ficou e quanto vale. Guardam-se por ordem,
 *  que é o que deixa desfazer a última sem mexer nas outras. */
type Posta = { chave: string; ficha: number };

/** A chave com que cada aposta fica guardada enquanto está na mesa. Os
 *  cavalos e as quadras levam os números lá dentro: `cavalo:17-20`. */
const chaveDa = (tipo: TipoDeAposta, valor?: number) =>
  tipo === 'numero' ? `numero:${valor}` : tipo;
const chaveEntre = (numeros: number[]) =>
  `${numeros.length === 2 ? 'cavalo' : 'quadra'}:${numeros.join('-')}`;

const apostaDa = (chave: string, fichas: number[]): Aposta => {
  const quanto = fichas.reduce((s, f) => s + f, 0);
  if (chave.startsWith('numero:')) return { tipo: 'numero', valor: Number(chave.slice(7)), quanto };
  if (chave.startsWith('cavalo:') || chave.startsWith('quadra:')) {
    const [tipo, lista] = chave.split(':');
    return { tipo: tipo as TipoDeAposta, numeros: lista.split('-').map(Number), quanto };
  }
  return { tipo: chave as TipoDeAposta, quanto };
};

/**
 * Onde se pode pousar uma ficha entre números.
 *
 * No pano os números estão em filas de três (1 2 3, 4 5 6, ...). Há cavalo
 * entre dois que estejam lado a lado na mesma fila e entre os que estão no
 * mesmo sítio de duas filas seguidas; há quadra onde quatro fecham um
 * quadrado. Nunca com o zero: entre o zero e outro número não se põe ficha.
 *
 * Cada sítio fica preso ao mais pequeno dos seus números e sabe para que lado
 * dele fica a linha: `fila` é a linha para o número seguinte da mesma fila,
 * `lado` a linha para a fila seguinte, e `canto` o cruzamento das duas.
 */
type Entre = { chave: string; numeros: number[]; de: number; onde: 'fila' | 'lado' | 'canto' };

const ENTRE: Entre[] = (() => {
  const lista: Entre[] = [];
  for (let a = 1; a <= 36; a++) {
    const temDireita = a % 3 !== 0;
    if (temDireita) lista.push({ chave: '', numeros: [a, a + 1], de: a, onde: 'fila' });
    if (a + 3 <= 36) lista.push({ chave: '', numeros: [a, a + 3], de: a, onde: 'lado' });
    if (temDireita && a + 4 <= 36)
      lista.push({ chave: '', numeros: [a, a + 1, a + 3, a + 4], de: a, onde: 'canto' });
  }
  return lista.map((e) => ({ ...e, chave: chaveEntre(e.numeros) }));
})();

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
  /* O que está na mesa, ficha a ficha e pela ordem em que se pousaram. Guardar
     a ordem e não só as somas é o que deixa haver um desfazer: tira-se a
     última que se pôs, seja em que casa for. */
  const [postas, setPostas] = useState<Posta[]>([]);
  const [comSom, setComSom] = useState(somLigado);
  const [aRodar, setARodar] = useState(false);
  const [aPedir, setAPedir] = useState(false);
  const [saiu, setSaiu] = useState<Rodada | null>(null);
  /** A casa onde a bola tem de assentar, e a conta das rodadas. */
  const [alvo, setAlvo] = useState<{ casa: number; n: number } | null>(null);

  const ocupado = useRef(false);
  const relogios = useRef<number[]>([]);
  const cena = useRef<HTMLDivElement>(null);

  /* As fichas de cada casa, para as empilhar. Sai da lista e não o contrário:
     a lista é que manda, e isto é só a mesma coisa vista por casas. */
  const mesa = useMemo(() => {
    const por: Record<string, number[]> = {};
    postas.forEach((p) => {
      (por[p.chave] = por[p.chave] || []).push(p.ficha);
    });
    return por;
  }, [postas]);

  const passe = nome ? passeDe(nome) : '';
  const naMesa = useMemo(() => postas.reduce((s, p) => s + p.ficha, 0), [postas]);
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
    porNa(chaveDa(tipo, valor));
  }

  function porNa(chave: string) {
    if (aRodar) return;
    if (naMesa + ficha > saldo) return setRecado('Não tens torrões que cheguem para mais fichas.');
    setRecado('');
    setSaiu(null);
    setPostas((antes) => [...antes, { chave, ficha }]);
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
    setPostas((antes) => antes.filter((p) => p.chave !== chave));
  }

  /** Tira a última ficha que se pôs, onde quer que ela tenha ficado. */
  function desfazer() {
    if (aRodar || postas.length === 0) return;
    setRecado('');
    setSaiu(null);
    setPostas((antes) => antes.slice(0, -1));
  }

  /**
   * Põe a roleta à vista antes de ela girar.
   *
   * No telemóvel o pano das apostas é comprido e quem carrega em rodar está lá
   * em baixo a olhar para as fichas, com a roleta fora do ecrã: girava e não se
   * via nada. Só mexe se ela não estiver toda à vista, por isso no computador,
   * onde cabe tudo, isto não faz nada.
   */
  function mostrarARoleta() {
    const oQuadro = cena.current;
    if (!oQuadro) return;
    const aVista = () => {
      const caixa = oQuadro.getBoundingClientRect();
      const altura = window.innerHeight || document.documentElement.clientHeight;
      return caixa.top >= 0 && caixa.bottom <= altura;
    };
    if (aVista()) return;

    const devagar = !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    oQuadro.scrollIntoView({ behavior: devagar ? 'smooth' : 'auto', block: 'center' });

    /* Há sítios onde o scroll suave simplesmente não acontece, e aí não se
       mexia nada e a bola girava fora do ecrã. Se daqui a um instante a roleta
       ainda não estiver à vista, vai-se lá de uma vez. Mais vale um salto seco
       do que rodar às escondidas. */
    if (!devagar) return;
    relogios.current.push(
      window.setTimeout(() => {
        if (!aVista()) oQuadro.scrollIntoView({ behavior: 'auto', block: 'center' });
      }, 400)
    );
  }

  async function rodar() {
    if (aRodar || ocupado.current || naMesa <= 0) return;
    ocupado.current = true;
    mostrarARoleta();
    setARodar(true);
    setRecado('');
    setSaiu(null);

    try {
      const apostas = Object.entries(mesa).map(([chave, fichas]) => apostaDa(chave, fichas));
      const r = await api.roleta(nome, passe, apostas);

      // a casa já está decidida; o que se segue é só a bola a lá chegar
      setAlvo((antes) => ({ casa: r.rodada.casa, n: (antes?.n ?? 0) + 1 }));

      // o número só aparece quando a bola parar, senão estragava a surpresa
      relogios.current.push(
        window.setTimeout(() => {
          setSaiu(r.rodada);
          setLinha(r.linha);
          setPostas([]);
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
        <button
          className={`rol-som${comSom ? '' : ' calada'}`}
          type="button"
          onClick={() => {
            setComSom(!comSom);
            ligarSom(!comSom);
          }}
          aria-pressed={comSom}
          title={comSom ? 'Calar a roleta' : 'Ouvir a roleta'}
        >
          <svg width="17" height="17" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M3.6 9.3h3.3L11.6 5v14l-4.7-4.3H3.6Z" fill="currentColor" />
            {comSom ? (
              <g fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                <path d="M15 9.4a3.7 3.7 0 0 1 0 5.2" />
                <path d="M17.6 6.9a7.2 7.2 0 0 1 0 10.2" />
              </g>
            ) : (
              <g fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                <path d="M15.2 9.6l5.2 4.8" />
                <path d="M20.4 9.6l-5.2 4.8" />
              </g>
            )}
          </svg>
          <span>{comSom ? 'Som' : 'Calada'}</span>
        </button>
      </header>

      <Prato cena={cena} alvo={alvo} aRodar={aRodar} saiu={saiu} />

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
            /* Uma ficha que nao da para pagar apaga-se em vez de dar recado
               depois de se carregar nela. Com fichas de quinhentos e de mil,
               isso passou a acontecer a muita gente. */
            disabled={aRodar || naMesa + f > saldo}
          >
            {f}
          </button>
        ))}
      </div>

      <Tabuleiro
        mesa={mesa}
        por={por}
        porNa={porNa}
        tirar={tirar}
        aRodar={aRodar}
        saiu={saiu}
      />

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
          <button
            type="button"
            className="btn"
            onClick={desfazer}
            disabled={aRodar || postas.length === 0}
            title="Tirar a última ficha que puseste"
          >
            Desfazer
          </button>
          <button
            type="button"
            className="btn"
            onClick={() => setPostas([])}
            disabled={aRodar || naMesa === 0}
          >
            Tirar todas
          </button>
          <button type="button" className="btn azul" onClick={rodar} disabled={aRodar || naMesa === 0}>
            {aRodar ? 'A rodar...' : 'Rodar'}
          </button>
        </div>
      </div>

      <p className="notas rol-regras">
        Um número em cheio devolve 36 vezes o que apostaste. Uma ficha na linha entre dois números
        (a cavalo) devolve 18 vezes, e no cruzamento de quatro (em quadra) devolve 8, se sair
        qualquer um deles. Com o zero não há cavalo nem quadra. As dúzias e as colunas pagam dois
        para um, e o resto paga a dobrar. No zero perde-se tudo o que está de fora, como em qualquer roleta
        europeia. A casa fica com 2,7 por cento a longo prazo, e isso não se muda: é a roleta.
      </p>
    </section>
  );
}

/* ======================== o prato, em três dimensões ======================== */

function Prato({
  cena,
  alvo,
  aRodar,
  saiu
}: {
  cena: RefObject<HTMLDivElement>;
  alvo: { casa: number; n: number } | null;
  aRodar: boolean;
  saiu: Rodada | null;
}) {
  const prato = useRef<HTMLDivElement>(null);
  const eixo = useRef<HTMLDivElement>(null);
  /** Onde o prato e a bola ficaram da última vez. Só crescem, para nunca se
   *  ver nada a andar para trás de uma rodada para a outra. */
  const parado = useRef({ prato: 0, bola: 0 });
  const pedido = useRef(0);

  /* As casas pintam-se de uma vez num gradiente em leque, em vez de trinta e
     sete triângulos. A primeira fica centrada em cima, que é onde a bola para. */
  const casas = useMemo(() => {
    const partes = RODA.map((n, i) => {
      const c = cor(n) === 'verde' ? '#1d7a4c' : cor(n) === 'vermelho' ? '#a52725' : '#1a1a1c';
      return `${c} ${i * PASSO}deg ${(i + 1) * PASSO}deg`;
    });
    return `conic-gradient(from ${-PASSO / 2}deg, ${partes.join(', ')})`;
  }, []);

  /**
   * A bola, imagem a imagem.
   *
   * Não se faz isto com uma transição do CSS porque uma transição leva um valor
   * a outro e mais nada. Aqui há três coisas ao mesmo tempo: a bola trava, vai
   * descendo pela parede da bacia para dentro, e dá um saltinho quando bate na
   * casa. O prato anda com ela, e acaba com a casa que saiu debaixo da marca.
   *
   * O som sai daqui e não de um ficheiro a tocar por cima: o tom vem da
   * velocidade a que as coisas vão nesta imagem, e cada estalo é um separador
   * que a bola atravessou de verdade. É por isso que os estalos se vão
   * afastando sozinhos à medida que ela perde força.
   */
  useEffect(() => {
    if (!alvo || !prato.current || !eixo.current) return;
    const de = { ...parado.current };

    const queroPrato = -alvo.casa * PASSO;
    const restoP = ((de.prato % 360) + 360) % 360;
    const faltaP = (((queroPrato - restoP) % 360) + 360) % 360;
    const paraPrato = de.prato + 5 * 360 + faltaP;
    // a bola corre ao contrário do prato e acaba em cima, onde a casa vai estar
    const paraBola = de.bola - (8 * 360 + (((de.bola % 360) + 360) % 360));

    const inicio = performance.now();
    const oPrato = prato.current;
    const oEixo = eixo.current;
    const som = abrirRoleta();

    /* Por cima de que separador ia a bola em relação ao prato. É a diferença
       dos dois ângulos e não o da bola: o prato também anda, e ao contrário. */
    let separador = Math.floor((de.bola - de.prato) / PASSO);
    let ultimoEstalo = 0;
    let largouAPista = false;

    const imagem = (agora: number) => {
      const t = Math.min(1, (agora - inicio) / A_RODAR);
      // depressa ao princípio, quase nada no fim: é uma bola a perder força
      const trava = 1 - Math.pow(1 - t, 3);

      const angPrato = de.prato + (paraPrato - de.prato) * trava;
      const angBola = de.bola + (paraBola - de.bola) * trava;
      oPrato.style.setProperty('--prato', `${angPrato}deg`);
      oEixo.style.setProperty('--ang', `${angBola}deg`);

      /* Só começa a cair depois de perder velocidade. Antes disso a força
         chega-lhe para se manter encostada à pista, como numa roleta a sério. */
      const cai = Math.min(1, Math.max(0, (t - 0.5) / 0.4));
      const suave = cai * cai * (3 - 2 * cai);
      const salto = t > 0.86 ? Math.sin(((t - 0.86) / 0.14) * Math.PI) * 1.8 : 0;

      oEixo.style.setProperty('--raio', `${NA_PISTA + (NA_CASA - NA_PISTA) * suave - salto}%`);
      oEixo.style.setProperty('--z', `${Z_PISTA + (Z_CASA - Z_PISTA) * suave}px`);

      if (som) {
        /* A velocidade vem da conta da travagem e não de comparar esta imagem
           com a anterior: uma imagem perdida dava um salto na velocidade, e um
           salto na velocidade ouve-se logo. */
        const porSegundo = (3 * Math.pow(1 - t, 2) * 1000) / A_RODAR;
        const vPrato = Math.abs(paraPrato - de.prato) * porSegundo;
        const vBola = Math.abs(paraBola - de.bola) * porSegundo;
        som.andar(vPrato, vBola, cai === 0);

        if (cai > 0) {
          if (!largouAPista) {
            largouAPista = true;
            // o momento em que ela larga a pista e bate na primeira pedra
            som.estalo(0.45);
            ultimoEstalo = agora;
          }
          const passou = Math.floor((angBola - angPrato) / PASSO);
          /* Ao princípio a bola atravessa separadores mais depressa do que o
             ouvido os separa, e por isso não se põe um estalo por cada um:
             ficaria uma metralhadora em vez de um matraquear. */
          if (passou !== separador && agora - ultimoEstalo > 26) {
            const rapidez = Math.min(1, (vPrato + vBola) / 1400);
            som.estalo(0.2 + 0.7 * (1 - rapidez));
            ultimoEstalo = agora;
          }
          separador = passou;
        }
      }

      if (t < 1) pedido.current = requestAnimationFrame(imagem);
      else {
        parado.current = { prato: paraPrato, bola: paraBola };
        som?.assentar();
      }
    };

    pedido.current = requestAnimationFrame(imagem);
    return () => {
      cancelAnimationFrame(pedido.current);
      /* Quem sai da página a meio de uma rodada, ou manda girar outra vez, não
         fica com o som da anterior a acabar sozinho. */
      som?.parar();
    };
  }, [alvo]);

  return (
    <div
      className="rol-cena"
      ref={cena}
      style={
        {
          '--casas': casas,
          '--inclina': `${INCLINA}deg`,
          '--passo': `${PASSO}deg`
        } as CSSProperties
      }
      role="img"
      aria-label="A roleta"
    >
      <div className="rol-mundo">
        {/* A bacia: o aro em cima, a pista por onde a bola corre, e a parede a
            descer para dentro. Tudo em anel, senão tapavam a roda, que está
            mais fundo do que eles. */}
        <i className="rol-aro" />
        <i className="rol-pista" />
        <i className="rol-parede" />

        <div className="rol-prato" ref={prato}>
          {RODA.map((n, i) => (
            <div key={n} className={`rol-casa ${cor(n)}`} style={{ '--i': i } as CSSProperties}>
              <span>{n}</span>
            </div>
          ))}
          <i className="rol-meio" />
        </div>

        {/* a bola, no seu eixo: o ângulo roda-a à volta e o raio afasta-a do meio */}
        <div className="rol-bola-eixo" ref={eixo}>
          <i className="rol-bola" />
        </div>
      </div>

      <span className="rol-marca" aria-hidden="true" />
      {saiu && !aRodar && <span className={`rol-saiu ${saiu.cor}`}>{saiu.saiu}</span>}
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
  porNa,
  tirar,
  aRodar,
  saiu
}: {
  mesa: Record<string, number[]>;
  por: (tipo: TipoDeAposta, valor?: number) => void;
  porNa: (chave: string) => void;
  tirar: (chave: string) => void;
  aRodar: boolean;
  saiu: Rodada | null;
}) {
  /** As fichas que estao em cima de uma casa, empilhadas como numa mesa a
   *  serio. Carregar com o botao do lado direito tira-as de la. */
  const emCima = (chave: string) => {
    const fichas = mesa[chave];
    if (!fichas || fichas.length === 0) return null;
    const total = fichas.reduce((s, f) => s + f, 0);
    // desenham-se as ultimas: uma pilha de trinta nao se ve nem cabe
    const aVista = fichas.slice(-6);
    return (
      <span
        className="rol-pilha"
        onContextMenu={(e) => {
          e.preventDefault();
          tirar(chave);
        }}
      >
        {aVista.map((f, i) => (
          <i
            key={i}
            style={{ '--n': i, '--cor': COR_DA_FICHA[f] || COR_DA_FICHA[1] } as CSSProperties}
          />
        ))}
        <b>{total}</b>
      </span>
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

      {/* as linhas e os cruzamentos entre números, por cima das casas: é aqui
          que se põem as fichas a cavalo e em quadra */}
      {ENTRE.map((e) => (
        <button
          key={e.chave}
          type="button"
          className={`rol-entre ${e.onde}${mesa[e.chave] ? ' com-fichas' : ''}`}
          style={ondeFica(sitioDoNumero(e.de))}
          onClick={() => porNa(e.chave)}
          disabled={aRodar}
          aria-label={
            e.numeros.length === 2
              ? `A cavalo entre o ${e.numeros[0]} e o ${e.numeros[1]}`
              : `Em quadra: ${e.numeros.join(', ')}`
          }
          title={e.numeros.join(' · ')}
        >
          {emCima(e.chave)}
        </button>
      ))}
    </div>
  );
}
