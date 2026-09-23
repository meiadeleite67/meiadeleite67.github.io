import { guardar, lido } from './dados';

/**
 * O som da meia de leite a ser entornada.
 *
 * Já foi ruído fabricado na hora pelo browser, e soava a areia a ser
 * arrastada. Agora é uma gravação a sério, cortada nos primeiros dois
 * segundos, que é o tempo que a animação demora a passar.
 *
 * Toca pelo Web Audio e não por uma tag <audio> porque assim dá para baixar
 * o volume no fim sem aquele estalo de quem corta um som a meio, e para
 * tocar outra vez antes de o anterior ter acabado.
 *
 * O browser só deixa tocar som depois de alguém carregar em alguma coisa, o
 * que aqui calha bem: o som só acontece ao trocar de página, e trocar de
 * página é sempre um clique.
 */

const FICHEIRO = '/media/entornar.mp3';
/** Os últimos instantes vão a baixar, para não acabar de repente. */
const DESVANECER = 0.25;

let contexto: AudioContext | null = null;
let gravacao: Promise<AudioBuffer | null> | null = null;
let ligado = lido('mdl.som') !== 'nao';

/* O ficheiro começa a vir mal a página abre, para o primeiro derrame já o
   encontrar cá. São uns poucos quilobytes e não trava nada. */
const bytes: Promise<ArrayBuffer | null> =
  typeof fetch === 'function'
    ? fetch(FICHEIRO).then((r) => (r.ok ? r.arrayBuffer() : null)).catch(() => null)
    : Promise.resolve(null);

export const somEstaLigado = () => ligado;

export function alternarSom(): boolean {
  ligado = !ligado;
  guardar('mdl.som', ligado ? 'sim' : 'nao');
  if (ligado) derramar(0.6);
  return ligado;
}

function arranjarContexto(): AudioContext | null {
  if (contexto) return contexto;
  const Classe =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Classe) return null;
  try {
    contexto = new Classe();
  } catch {
    return null;
  }
  return contexto;
}

function arranjarGravacao(ctx: AudioContext): Promise<AudioBuffer | null> {
  if (gravacao) return gravacao;
  gravacao = bytes
    .then((b) => (b ? ctx.decodeAudioData(b.slice(0)) : null))
    .catch(() => null);
  return gravacao;
}

export function derramar(volume = 1): void {
  if (!ligado) return;
  const ctx = arranjarContexto();
  if (!ctx) return;
  if (ctx.state === 'suspended') ctx.resume().catch(() => null);

  arranjarGravacao(ctx).then((buffer) => {
    /* Entre pedir o som e ele chegar pode ter havido tempo para desligar. */
    if (!buffer || !ligado) return;

    const fonte = ctx.createBufferSource();
    fonte.buffer = buffer;

    const mestre = ctx.createGain();
    const agora = ctx.currentTime;
    const fim = agora + buffer.duration;
    mestre.gain.setValueAtTime(volume, agora);
    mestre.gain.setValueAtTime(volume, fim - DESVANECER);
    mestre.gain.linearRampToValueAtTime(0.0001, fim);

    fonte.connect(mestre).connect(ctx.destination);
    fonte.start(agora);
    fonte.stop(fim);
  });
}
