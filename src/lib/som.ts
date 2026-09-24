/**
 * O som da roleta, feito à mão.
 *
 * Não há aqui ficheiro nenhum de som. É tudo sintetizado no momento com o Web
 * Audio, pelo mesmo motivo por que a roleta é feita de CSS e não de imagens:
 * não pesa nada, não há nada para descarregar antes de se ouvir, e não há
 * gravação de ninguém a quem se tenha de pedir licença.
 *
 * O ronco do prato e o zumbido da bola são o mesmo chuvisco passado por
 * filtros diferentes: um passa-baixo grave para a madeira a girar no eixo, e um
 * passa-banda mais fino para a bola a correr na pista. O tom e a força vêm da
 * velocidade a que as coisas vão, por isso o som trava com elas em vez de ser
 * um som de cinco segundos a tocar por cima.
 *
 * Os estalos não são inventados: a roleta pede um por cada separador que a bola
 * atravessa, e como ela vai perdendo velocidade eles vão-se afastando uns dos
 * outros sozinhos. É daí que vem o "tac-tac-tac... tac.. tac. tac" do fim, que
 * é a parte da roleta que todos conhecem de ouvido.
 *
 * Um browser não deixa fazer barulho antes de alguém lhe tocar, e é por isso
 * que a aparelhagem só se liga dentro de um clique. Aqui é o do botão de rodar.
 */

const CHAVE = 'mdl:som';

/** Se o som está ligado. Fica guardado, que quem o cala uma vez cala-o para
 *  sempre até dizer o contrário. */
let ligado = (() => {
  try {
    return localStorage.getItem(CHAVE) !== 'nao';
  } catch {
    return true;
  }
})();

export const somLigado = () => ligado;

export function ligarSom(sim: boolean) {
  ligado = sim;
  try {
    localStorage.setItem(CHAVE, sim ? 'sim' : 'nao');
  } catch {
    /* sem sitio para guardar, vale para esta visita e mais nada */
  }
  /* Calar é baixar o volume geral e não desligar a aparelhagem: assim quem cala
     a roleta a meio de uma rodada cala-a mesmo, e não fica com o resto do som
     à espera de sair quando voltar a ligar. */
  if (geral && ctx) geral.gain.setTargetAtTime(sim ? VOLUME : 0, ctx.currentTime, 0.02);
}

/** O volume de tudo. Contido de propósito: isto entra em cima do que a pessoa
 *  já estiver a ouvir. */
const VOLUME = 0.9;

let ctx: AudioContext | null = null;
let geral: GainNode | null = null;
/** Dois segundos de chuvisco, feitos uma vez e reaproveitados por todos os
 *  sons. Gerar ruído é barato, mas não é de graça fazê-lo a cada estalo. */
let chuvisco: AudioBuffer | null = null;

/** Liga a aparelhagem, se ainda não estiver ligada. Tem de ser chamado de
 *  dentro de algo que a pessoa tenha feito, senão o browser não deixa. */
function aparelhagem() {
  if (typeof window === 'undefined') return null;
  if (!ctx) {
    const Classe: typeof AudioContext | undefined =
      window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Classe) return null;
    try {
      ctx = new Classe();
    } catch {
      return null;
    }
    geral = ctx.createGain();
    geral.gain.value = ligado ? VOLUME : 0;
    /* Um limitador à saída. No matraquear do princípio chegam a sobrepor-se
       três estalos, e três estalos somados passavam do que a placa aguenta, o
       que dá aquele estalar sujo de som rebentado. Isto apara os cumes e, de
       caminho, cola o matraquear, que é como ele soa numa mesa a sério. */
    const redea = ctx.createDynamicsCompressor();
    redea.threshold.value = -6;
    redea.knee.value = 0;
    redea.ratio.value = 12;
    redea.attack.value = 0.002;
    redea.release.value = 0.12;
    geral.connect(redea).connect(ctx.destination);

    const quantos = Math.floor(ctx.sampleRate * 2);
    chuvisco = ctx.createBuffer(1, quantos, ctx.sampleRate);
    const onda = chuvisco.getChannelData(0);
    for (let i = 0; i < quantos; i += 1) onda[i] = Math.random() * 2 - 1;
  }
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}

export type SomDaRoleta = {
  /** A velocidade a que o prato e a bola vão, em graus por segundo, e se a
   *  bola ainda vai na pista de cima ou já caiu para dentro da bacia. */
  andar(prato: number, bola: number, naPista: boolean): void;
  /** Um separador atravessado. A força vai de 0 a 1. */
  estalo(forca: number): void;
  /** A bola a assentar na casa, e o som a acabar. */
  assentar(): void;
  parar(): void;
};

/**
 * Abre o som de uma rodada. Devolve nada se o browser não souber fazer som,
 * e nesse caso quem chamou segue em frente sem ele.
 */
export function abrirRoleta(): SomDaRoleta | null {
  const c = aparelhagem();
  if (!c || !chuvisco || !geral) return null;
  const ruido = chuvisco;
  const saida = geral;

  /* o prato: madeira a girar no eixo, um ronco grave e sem tom nenhum */
  const roncoFonte = c.createBufferSource();
  roncoFonte.buffer = ruido;
  roncoFonte.loop = true;
  const roncoFiltro = c.createBiquadFilter();
  roncoFiltro.type = 'lowpass';
  roncoFiltro.frequency.value = 240;
  roncoFiltro.Q.value = 1.4;
  const ronco = c.createGain();
  ronco.gain.value = 0;
  roncoFonte.connect(roncoFiltro).connect(ronco).connect(saida);

  /* a bola na pista: mais fina e mais aguda, e sobe de tom com a velocidade */
  const rolarFonte = c.createBufferSource();
  rolarFonte.buffer = ruido;
  rolarFonte.loop = true;
  const rolarFiltro = c.createBiquadFilter();
  rolarFiltro.type = 'bandpass';
  rolarFiltro.frequency.value = 900;
  rolarFiltro.Q.value = 2.2;
  const rolar = c.createGain();
  rolar.gain.value = 0;
  rolarFonte.connect(rolarFiltro).connect(rolar).connect(saida);

  /* A bola começa a meio do chuvisco em vez do princípio, senão ouvia-se o
     mesmo ruído nos dois sítios ao mesmo tempo e soava a uma coisa só. */
  roncoFonte.start(c.currentTime, 0);
  rolarFonte.start(c.currentTime, 0.7);

  let acabado = false;

  const puxar = (p: AudioParam, valor: number, tempo = 0.06) =>
    p.setTargetAtTime(valor, c.currentTime, tempo);

  /** Um estalo: chuvisco curtíssimo com um golpe de madeira por baixo. */
  const bater = (forca: number, grave: number) => {
    if (acabado) return;
    const t = c.currentTime;
    const f = Math.max(0, Math.min(1, forca));

    const fonte = c.createBufferSource();
    fonte.buffer = ruido;
    const filtro = c.createBiquadFilter();
    filtro.type = 'bandpass';
    filtro.frequency.value = 1400 + Math.random() * 1700;
    filtro.Q.value = 3.4;
    const corta = c.createGain();
    corta.gain.setValueAtTime(0.0001, t);
    corta.gain.linearRampToValueAtTime(0.15 + 0.85 * f, t + 0.002);
    corta.gain.exponentialRampToValueAtTime(0.0001, t + 0.02 + 0.05 * f);
    fonte.connect(filtro).connect(corta).connect(saida);
    fonte.start(t, Math.random() * 1.8, 0.1);
    fonte.stop(t + 0.12);

    /* o oco da madeira por baixo do estalo. Sem isto soa a plástico. */
    const nota = c.createOscillator();
    nota.type = 'triangle';
    nota.frequency.setValueAtTime(grave, t);
    nota.frequency.exponentialRampToValueAtTime(grave * 0.72, t + 0.05);
    const oco = c.createGain();
    oco.gain.setValueAtTime(0.0001, t);
    oco.gain.linearRampToValueAtTime(0.07 + 0.34 * f, t + 0.004);
    oco.gain.exponentialRampToValueAtTime(0.0001, t + 0.06 + 0.06 * f);
    nota.connect(oco).connect(saida);
    nota.start(t);
    nota.stop(t + 0.16);
  };

  /** Arranca tudo. Chama-se sozinho depois de a bola assentar, senao ficavam
   *  duas fontes a rodar em silencio por cada rodada que se desse. */
  const parar = () => {
    if (acabado) return;
    acabado = true;
    const t = c.currentTime;
    ronco.gain.setTargetAtTime(0, t, 0.08);
    rolar.gain.setTargetAtTime(0, t, 0.08);
    /* deixa-se acabar o fecho antes de arrancar as fontes, senao dava um
       estalo na saida, que e o que se ouve sempre que se corta som a seco */
    roncoFonte.stop(t + 0.5);
    rolarFonte.stop(t + 0.5);
  };

  return {
    andar(prato, bola, naPista) {
      if (acabado) return;
      /* de graus por segundo para uma conta de 0 a 1, que e o que os filtros
         querem. Os divisores sao a velocidade a que isto anda no principio. */
      const p = Math.min(1, prato / 900);
      const b = Math.min(1, bola / 1700);
      puxar(ronco.gain, 0.05 + 0.13 * p);
      puxar(roncoFiltro.frequency, 200 + 280 * p);
      /* Dentro da bacia a bola deixa de correr e passa a bater: o zumbido
         quase se cala e o que se ouve sao os estalos. */
      puxar(rolar.gain, naPista ? 0.04 + 0.13 * b : 0.012 * b, 0.1);
      puxar(rolarFiltro.frequency, 640 + 2100 * b, 0.1);
    },

    estalo(forca) {
      bater(forca, 320 + Math.random() * 90);
    },

    assentar() {
      if (acabado) return;
      /* os ultimos dois saltinhos dentro da casa, cada vez mais fracos */
      bater(0.5, 260);
      window.setTimeout(() => bater(0.22, 220), 90);
      window.setTimeout(() => bater(0.1, 190), 165);
      puxar(rolar.gain, 0, 0.08);
      /* O prato continua a girar depois de a bola assentar, como numa mesa a
         serio, e vai-se calando devagar. So depois disso e que se arranca. */
      ronco.gain.setTargetAtTime(0, c.currentTime + 0.2, 0.5);
      window.setTimeout(parar, 1700);
    },

    parar
  };
}
