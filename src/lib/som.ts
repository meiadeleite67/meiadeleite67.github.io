import { guardar, lido } from './dados';

/**
 * O som da meia de leite a ser entornada.
 *
 * Não há ficheiro de áudio nenhum: o som é fabricado na hora pelo browser.
 * Um líquido a cair é, no fundo, ruído passado por um filtro que se vai
 * abrindo, mais uns quantos gluglus por cima, que é o que o ouvido reconhece
 * como líquido e não como vento. Sai mais barato do que um ficheiro e não há
 * nada para descarregar.
 *
 * O browser só deixa tocar som depois de alguém carregar em alguma coisa, o
 * que aqui calha bem: o som só acontece ao trocar de página, e trocar de
 * página é sempre um clique.
 */

let contexto: AudioContext | null = null;
let ligado = lido('mdl.som') !== 'nao';

export const somEstaLigado = () => ligado;

export function alternarSom(): boolean {
  ligado = !ligado;
  guardar('mdl.som', ligado ? 'sim' : 'nao');
  if (ligado) derramar(0.6);
  return ligado;
}

function arranjarContexto(): AudioContext | null {
  if (contexto) return contexto;
  const Classe = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Classe) return null;
  try {
    contexto = new Classe();
  } catch {
    return null;
  }
  return contexto;
}

/** Ruído branco, a matéria-prima de tudo o que é água a cair. */
function ruido(ctx: AudioContext, segundos: number): AudioBufferSourceNode {
  const quadros = Math.floor(ctx.sampleRate * segundos);
  const buffer = ctx.createBuffer(1, quadros, ctx.sampleRate);
  const dados = buffer.getChannelData(0);
  for (let i = 0; i < quadros; i++) dados[i] = Math.random() * 2 - 1;
  const fonte = ctx.createBufferSource();
  fonte.buffer = buffer;
  return fonte;
}

export function derramar(volume = 1): void {
  if (!ligado) return;
  const ctx = arranjarContexto();
  if (!ctx) return;
  if (ctx.state === 'suspended') ctx.resume().catch(() => null);

  const agora = ctx.currentTime;
  const mestre = ctx.createGain();
  mestre.gain.value = 0.55 * volume;
  mestre.connect(ctx.destination);

  /* O jorro: ruído por um filtro que abre enquanto o líquido ganha força e
     fecha quando ele se esgota. */
  const jorro = ruido(ctx, 1.2);
  const filtro = ctx.createBiquadFilter();
  filtro.type = 'bandpass';
  filtro.Q.value = 1.1;
  filtro.frequency.setValueAtTime(420, agora);
  filtro.frequency.linearRampToValueAtTime(1500, agora + 0.34);
  filtro.frequency.linearRampToValueAtTime(760, agora + 1.05);

  const volumeDoJorro = ctx.createGain();
  volumeDoJorro.gain.setValueAtTime(0.0001, agora);
  volumeDoJorro.gain.exponentialRampToValueAtTime(0.5, agora + 0.16);
  volumeDoJorro.gain.setValueAtTime(0.5, agora + 0.55);
  volumeDoJorro.gain.exponentialRampToValueAtTime(0.0001, agora + 1.15);

  jorro.connect(filtro).connect(volumeDoJorro).connect(mestre);
  jorro.start(agora);
  jorro.stop(agora + 1.2);

  /* Os gluglus: cada um é um tom grave que cai depressa, como a bolha de ar
     que entra no copo quando o líquido sai. */
  for (let i = 0; i < 5; i++) {
    const quando = agora + 0.18 + i * 0.13 + Math.random() * 0.06;
    const tom = ctx.createOscillator();
    tom.type = 'sine';
    const inicio = 150 + Math.random() * 110;
    tom.frequency.setValueAtTime(inicio, quando);
    tom.frequency.exponentialRampToValueAtTime(inicio * 0.55, quando + 0.09);

    const volumeDoGlu = ctx.createGain();
    volumeDoGlu.gain.setValueAtTime(0.0001, quando);
    volumeDoGlu.gain.exponentialRampToValueAtTime(0.22, quando + 0.015);
    volumeDoGlu.gain.exponentialRampToValueAtTime(0.0001, quando + 0.11);

    tom.connect(volumeDoGlu).connect(mestre);
    tom.start(quando);
    tom.stop(quando + 0.13);
  }

  /* O esparrinho do fim, quando aquilo bate no chão. */
  const salpico = ruido(ctx, 0.3);
  const agudos = ctx.createBiquadFilter();
  agudos.type = 'highpass';
  agudos.frequency.value = 2100;

  const volumeDoSalpico = ctx.createGain();
  volumeDoSalpico.gain.setValueAtTime(0.0001, agora + 0.6);
  volumeDoSalpico.gain.exponentialRampToValueAtTime(0.3, agora + 0.68);
  volumeDoSalpico.gain.exponentialRampToValueAtTime(0.0001, agora + 1.0);

  salpico.connect(agudos).connect(volumeDoSalpico).connect(mestre);
  salpico.start(agora + 0.6);
  salpico.stop(agora + 1.0);
}
