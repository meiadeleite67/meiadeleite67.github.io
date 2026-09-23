import { useCallback, useEffect, useRef, useState } from 'react';
import { fotoDoMembro } from '../lib/api';
import { guardar, lido } from '../lib/dados';
import type { Estado, Membro } from '../lib/tipos';

/**
 * O jogo do dinossauro, em versão nossa: um de nós a correr pelo balcão, a
 * saltar torrões de açúcar e a baixar-se aos guardanapos. A cabeça é a foto de
 * um membro à sorte, tirada da aba dos membros, e muda a cada jogada.
 *
 * Está desenhado num canvas e não em elementos da página porque são umas
 * dezenas de coisas a mexer a sessenta imagens por segundo, e isso num canvas
 * é um desenho, enquanto em divs seria o browser a recalcular a página toda,
 * sessenta vezes por segundo.
 *
 * O estado do jogo vive todo numa referência e não em estado do React: o ciclo
 * de animação lê e escreve nele a cada imagem, e mandar o React redesenhar a
 * cada imagem seria trabalho a dobrar. Para o placard só sobem os números que
 * a pessoa vê.
 */

/* O tamanho é fixo e em unidades próprias; o canvas depois estica para a
   largura que houver, por isso o jogo é o mesmo no telemóvel e no monitor. */
const LARGURA = 640;
const ALTURA = 190;
const CHAO = 150;

const GRAVIDADE = 2400;
const IMPULSO = 700;
const VELOCIDADE_INICIAL = 330;
const VELOCIDADE_MAXIMA = 720;
/** Quanto é preciso correr para valer um ponto. */
const PASSO_DO_PONTO = 12;
/** Antes disto só há torrões; os guardanapos aparecem depois. */
const PONTOS_PARA_GUARDANAPOS = 180;

const BONECO_X = 62;
const BONECO_LARGURA = 22;
const BONECO_ALTURA = 42;
const BAIXADO_LARGURA = 34;
const BAIXADO_ALTURA = 24;

const RECORDE = 'mdl.jogo.recorde';

type Obstaculo = {
  x: number;
  largura: number;
  altura: number;
  /** Altura a que o obstáculo flutua acima do chão. Zero é pousado. */
  voo: number;
  /** Quantos torrões tem, ou zero se for guardanapo. */
  cubos: number;
};

/** Quem está a correr nesta jogada. */
type Corredor = {
  nome: string;
  iniciais: string;
  endereco: string;
  foto: HTMLImageElement | null;
};

type Fase = 'parado' | 'a-jogar' | 'acabou';

type Jogo = {
  fase: Fase;
  tempo: number;
  velocidade: number;
  distancia: number;
  /** Altura do boneco acima do chão. */
  altura: number;
  subida: number;
  baixado: boolean;
  obstaculos: Obstaculo[];
  ateAoProximo: number;
  chao: number;
  recorde: number;
  corredor: Corredor;
};

const NINGUEM: Corredor = { nome: 'um de nós', iniciais: 'ML', endereco: '', foto: null };

const jogoNovo = (recorde: number, corredor: Corredor): Jogo => ({
  fase: 'parado',
  tempo: 0,
  velocidade: VELOCIDADE_INICIAL,
  distancia: 0,
  altura: 0,
  subida: 0,
  baixado: false,
  obstaculos: [],
  ateAoProximo: 420,
  chao: 0,
  recorde,
  corredor
});

const pontosDe = (distancia: number) => Math.floor(distancia / PASSO_DO_PONTO);
const cinco = (n: number) => String(n).padStart(5, '0');

const iniciaisDe = (nome: string) =>
  nome
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('') || 'ML';

/* ======================= o desenho ======================= */

/** O balcão lá ao fundo: a luz do candeeiro e a prateleira a passar devagar.
 *  Anda a um quinto da velocidade do chão, que é o que dá a ideia de estar
 *  longe sem ser preciso desenhar nada em condições. */
function desenharFundo(c: CanvasRenderingContext2D, j: Jogo) {
  const luz = c.createRadialGradient(LARGURA * 0.5, -40, 20, LARGURA * 0.5, -40, 250);
  luz.addColorStop(0, 'rgba(224, 158, 89, 0.20)');
  luz.addColorStop(1, 'rgba(224, 158, 89, 0)');
  c.fillStyle = luz;
  c.fillRect(0, 0, LARGURA, CHAO);

  const volta = 118;
  const desvio = (j.chao * 0.2) % volta;
  c.fillStyle = '#2b1e15';
  c.fillRect(0, 62, LARGURA, 3);
  for (let i = -1; i < LARGURA / volta + 1; i++) {
    const x = i * volta - desvio;
    // garrafas e copos na prateleira, sempre os mesmos e sempre a fugir
    c.fillRect(x + 12, 44, 8, 18);
    c.fillRect(x + 14, 38, 4, 6);
    c.fillRect(x + 28, 48, 10, 14);
    c.fillRect(x + 46, 41, 7, 21);
    c.fillRect(x + 62, 50, 12, 12);
    c.fillRect(x + 84, 46, 8, 16);
  }
}

function desenharChao(c: CanvasRenderingContext2D, j: Jogo) {
  // mosaico do chão, às tiras, a passar à velocidade a sério
  const volta = 68;
  const desvio = j.chao % volta;
  for (let i = -1; i < LARGURA / volta + 1; i++) {
    const x = i * volta - desvio;
    c.fillStyle = i % 2 === 0 ? 'rgba(255, 244, 227, 0.035)' : 'rgba(255, 244, 227, 0.015)';
    c.fillRect(x, CHAO + 3, volta, ALTURA - CHAO - 3);
  }

  c.strokeStyle = '#5a4231';
  c.lineWidth = 2;
  c.beginPath();
  c.moveTo(0, CHAO + 1);
  c.lineTo(LARGURA, CHAO + 1);
  c.stroke();

  /* migalhas espalhadas pelo chão, sempre nas mesmas distâncias mas a correr:
     é o que faz ver que o boneco anda em vez de estar a marcar passo */
  c.fillStyle = '#7b5f49';
  for (let i = 0; i < 26; i++) {
    const base = i * 61.3;
    const passo = LARGURA + 60;
    const x = (((base - j.chao) % passo) + passo) % passo - 30;
    const alto = i % 3 === 0;
    c.fillRect(x, CHAO + (alto ? 7 : 11), alto ? 7 : 4, 2);
  }
}

/** A cabeça: a foto recortada num círculo, ou as iniciais se não houver foto. */
function desenharCabeca(
  c: CanvasRenderingContext2D,
  corredor: Corredor,
  cx: number,
  cy: number,
  raio: number
) {
  const foto = corredor.foto;
  if (foto && foto.complete && foto.naturalWidth > 0) {
    /* a foto raramente é quadrada: corta-se o quadrado do meio, senão a cara
       saía esticada */
    const lado = Math.min(foto.naturalWidth, foto.naturalHeight);
    const sx = (foto.naturalWidth - lado) / 2;
    const sy = (foto.naturalHeight - lado) / 2;
    c.save();
    c.beginPath();
    c.arc(cx, cy, raio, 0, Math.PI * 2);
    c.clip();
    c.drawImage(foto, sx, sy, lado, lado, cx - raio, cy - raio, raio * 2, raio * 2);
    c.restore();
  } else {
    c.fillStyle = '#e09e59';
    c.beginPath();
    c.arc(cx, cy, raio, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = '#2b1d13';
    c.font = `600 ${Math.round(raio)}px system-ui, sans-serif`;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText(corredor.iniciais, cx, cy + 1);
  }

  c.strokeStyle = '#f7ebda';
  c.lineWidth = 2;
  c.beginPath();
  c.arc(cx, cy, raio, 0, Math.PI * 2);
  c.stroke();
}

function desenharBoneco(c: CanvasRenderingContext2D, j: Jogo) {
  const base = CHAO - j.altura;
  const x = BONECO_X;
  const noAr = j.altura > 0.5;
  // com os pés no chão as pernas alternam; no ar ficam esticadas
  const passada = noAr ? -1 : Math.floor(j.tempo * 11) % 2;

  // a sombra encolhe com o salto, que é o que diz a que altura ele vai
  const perto = Math.max(0.2, 1 - j.altura / 120);
  c.fillStyle = `rgba(0, 0, 0, ${0.38 * perto})`;
  c.beginPath();
  c.ellipse(x + 11, CHAO + 2, 14 * perto, 3.4 * perto, 0, 0, Math.PI * 2);
  c.fill();

  c.lineCap = 'round';

  if (j.baixado) {
    // agachado e inclinado para a frente, a passar por baixo do guardanapo
    c.fillStyle = '#e09e59';
    c.fillRect(x + 2, base - 14, 18, 10);
    c.strokeStyle = '#f7ebda';
    c.lineWidth = 2.4;
    c.beginPath();
    c.moveTo(x + 6, base - 4);
    c.lineTo(x + (passada === 1 ? 2 : 9), base);
    c.moveTo(x + 15, base - 4);
    c.lineTo(x + (passada === 1 ? 20 : 13), base);
    c.stroke();
    desenharCabeca(c, j.corredor, x + 26, base - 14, 9);
    return;
  }

  // pernas
  c.strokeStyle = '#f7ebda';
  c.lineWidth = 2.6;
  c.beginPath();
  if (noAr) {
    c.moveTo(x + 8, base - 9);
    c.lineTo(x + 3, base);
    c.moveTo(x + 14, base - 9);
    c.lineTo(x + 19, base - 3);
  } else {
    c.moveTo(x + 8, base - 9);
    c.lineTo(x + (passada ? 3 : 11), base);
    c.moveTo(x + 14, base - 9);
    c.lineTo(x + (passada ? 18 : 10), base);
  }
  c.stroke();

  // tronco
  c.fillStyle = '#e09e59';
  c.fillRect(x + 4, base - 21, 14, 13);

  // braços a bombar
  c.strokeStyle = '#f7ebda';
  c.lineWidth = 2.2;
  c.beginPath();
  if (noAr) {
    c.moveTo(x + 5, base - 19);
    c.lineTo(x, base - 25);
    c.moveTo(x + 17, base - 19);
    c.lineTo(x + 22, base - 25);
  } else {
    c.moveTo(x + 5, base - 19);
    c.lineTo(x + (passada ? 1 : 8), base - (passada ? 13 : 24));
    c.moveTo(x + 17, base - 19);
    c.lineTo(x + (passada ? 20 : 14), base - (passada ? 24 : 13));
  }
  c.stroke();

  desenharCabeca(c, j.corredor, x + 11, base - 31, 11);
}

function desenharObstaculo(c: CanvasRenderingContext2D, o: Obstaculo, tempo: number) {
  const base = CHAO - o.voo;

  if (o.cubos > 0) {
    c.fillStyle = 'rgba(0, 0, 0, 0.32)';
    c.beginPath();
    c.ellipse(o.x + o.largura / 2, CHAO + 2, o.largura * 0.55, 3, 0, 0, Math.PI * 2);
    c.fill();

    for (let i = 0; i < o.cubos; i++) {
      const largura = o.largura / o.cubos;
      const x = o.x + i * largura;
      // o torrão: um cubo com o lado iluminado e o de baixo na sombra
      c.fillStyle = '#f3ebdf';
      c.fillRect(x, base - o.altura, largura - 2, o.altura);
      c.fillStyle = '#d3c6b3';
      c.fillRect(x, base - o.altura, largura - 2, 3);
      c.fillStyle = '#b8a894';
      c.fillRect(x, base - 4, largura - 2, 4);
      c.strokeStyle = '#8d7c68';
      c.lineWidth = 1;
      c.strokeRect(x + 0.5, base - o.altura + 0.5, largura - 3, o.altura - 1);
    }
    return;
  }

  /* o guardanapo vai a abanar, e é o abanar que se vê de longe */
  const aba = Math.sin(tempo * 13) * 3;
  c.fillStyle = '#ede2d0';
  c.beginPath();
  c.moveTo(o.x, base - o.altura + aba);
  c.lineTo(o.x + o.largura, base - o.altura - aba);
  c.lineTo(o.x + o.largura, base - aba);
  c.lineTo(o.x, base + aba);
  c.closePath();
  c.fill();
  c.strokeStyle = '#a8977f';
  c.lineWidth = 1;
  c.stroke();
}

/* ======================= o jogo ======================= */

export function Jogo({ estado, semRede }: { estado: Estado; semRede: boolean }) {
  const tela = useRef<HTMLCanvasElement>(null);
  const jogo = useRef<Jogo>(jogoNovo(Number(lido(RECORDE)) || 0, NINGUEM));
  /* as fotos já descarregadas ficam aqui: quem sai a jogo duas vezes não as
     volta a pedir */
  const fotos = useRef(new Map<string, HTMLImageElement>());
  const [fase, setFase] = useState<Fase>('parado');
  const [pontos, setPontos] = useState(0);
  const [recorde, setRecorde] = useState(jogo.current.recorde);
  const [cara, setCara] = useState<Corredor>(NINGUEM);
  /** Quanto fez na jogada que acabou de acabar. */
  const [feitos, setFeitos] = useState(0);

  const membros = estado.membros;

  /** Um membro à sorte, com a foto já a caminho. */
  const sortearCorredor = useCallback((): Corredor => {
    if (membros.length === 0) return NINGUEM;
    const membro: Membro = membros[Math.floor(Math.random() * membros.length)];
    const corredor: Corredor = {
      nome: membro.nome,
      iniciais: iniciaisDe(membro.nome),
      endereco: '',
      foto: null
    };
    if (!membro.temFoto) return corredor;

    const endereco = fotoDoMembro(membro.id);
    if (!endereco) return corredor;
    corredor.endereco = endereco;

    const guardada = fotos.current.get(membro.id);
    if (guardada) {
      corredor.foto = guardada;
      return corredor;
    }
    const img = new Image();
    img.src = endereco;
    fotos.current.set(membro.id, img);
    corredor.foto = img;
    return corredor;
  }, [membros]);

  const comecar = useCallback(() => {
    const j = jogo.current;
    if (j.fase === 'a-jogar') return;
    const corredor = sortearCorredor();
    jogo.current = jogoNovo(j.recorde, corredor);
    jogo.current.fase = 'a-jogar';
    setFase('a-jogar');
    setPontos(0);
    setCara(corredor);
  }, [sortearCorredor]);

  /* antes de a primeira jogada começar já se vê quem é que vai correr */
  useEffect(() => {
    if (jogo.current.fase !== 'parado') return;
    const corredor = sortearCorredor();
    jogo.current.corredor = corredor;
    setCara(corredor);
  }, [sortearCorredor]);

  const saltar = useCallback(() => {
    const j = jogo.current;
    if (j.fase !== 'a-jogar') {
      comecar();
      return;
    }
    if (j.altura <= 0.5) {
      j.subida = IMPULSO;
      j.baixado = false;
    }
  }, [comecar]);

  const baixar = useCallback((sim: boolean) => {
    const j = jogo.current;
    if (j.fase !== 'a-jogar') return;
    j.baixado = sim;
    // baixar-se no ar puxa o boneco para baixo, senão era só desvantagem
    if (sim && j.altura > 0.5) j.subida = Math.min(j.subida, -260);
  }, []);

  /* teclado */
  useEffect(() => {
    const carregou = (e: KeyboardEvent) => {
      if (e.repeat) return;
      if (e.code === 'Space' || e.code === 'ArrowUp' || e.code === 'KeyW') {
        e.preventDefault();
        saltar();
      }
      if (e.code === 'ArrowDown' || e.code === 'KeyS') {
        e.preventDefault();
        baixar(true);
      }
    };
    const largou = (e: KeyboardEvent) => {
      if (e.code === 'ArrowDown' || e.code === 'KeyS') baixar(false);
    };
    window.addEventListener('keydown', carregou);
    window.addEventListener('keyup', largou);
    return () => {
      window.removeEventListener('keydown', carregou);
      window.removeEventListener('keyup', largou);
    };
  }, [saltar, baixar]);

  /* o ciclo: uma imagem, contas, outra imagem */
  useEffect(() => {
    const canvas = tela.current;
    if (!canvas) return;
    const c = canvas.getContext('2d');
    if (!c) return;

    /* o canvas é desenhado à resolução do ecrã e não à da página, senão em
       telemóveis com ecrã denso saía tudo desfocado */
    const pontosPorPixel = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = LARGURA * pontosPorPixel;
    canvas.height = ALTURA * pontosPorPixel;
    c.scale(pontosPorPixel, pontosPorPixel);

    let pedido = 0;
    let anterior = performance.now();

    const imagem = (agora: number) => {
      pedido = requestAnimationFrame(imagem);
      /* se o separador esteve escondido, o salto de tempo é enorme: em vez de
         teletransportar tudo, damos um passo normal */
      const dt = Math.min((agora - anterior) / 1000, 0.05);
      anterior = agora;
      const j = jogo.current;
      j.tempo += dt;

      if (j.fase === 'a-jogar') {
        j.velocidade = Math.min(VELOCIDADE_MAXIMA, VELOCIDADE_INICIAL + j.distancia * 0.018);
        const passo = j.velocidade * dt;
        j.distancia += passo;
        j.chao += passo;

        if (j.subida !== 0 || j.altura > 0) {
          j.altura += j.subida * dt;
          j.subida -= GRAVIDADE * dt;
          if (j.altura <= 0) {
            j.altura = 0;
            j.subida = 0;
          }
        }

        j.ateAoProximo -= passo;
        if (j.ateAoProximo <= 0) {
          j.obstaculos.push(obstaculoNovo(pontosDe(j.distancia)));
          j.ateAoProximo = j.velocidade * (0.78 + Math.random() * 0.72);
        }
        for (const o of j.obstaculos) o.x -= passo;
        j.obstaculos = j.obstaculos.filter((o) => o.x + o.largura > -20);

        if (bateu(j)) {
          j.fase = 'acabou';
          const fez = pontosDe(j.distancia);
          if (fez > j.recorde) {
            j.recorde = fez;
            guardar(RECORDE, String(fez));
            setRecorde(fez);
          }
          setFeitos(fez);
          setFase('acabou');
        }
      } else {
        // parado, o cenário continua a passar devagarinho por trás
        j.chao += 26 * dt;
      }

      // o placard só mexe quando o número muda, não a cada imagem
      const agoraPontos = pontosDe(j.distancia);
      setPontos((p) => (p === agoraPontos ? p : agoraPontos));

      c.clearRect(0, 0, LARGURA, ALTURA);
      desenharFundo(c, j);
      desenharChao(c, j);
      for (const o of j.obstaculos) desenharObstaculo(c, o, j.tempo);
      desenharBoneco(c, j);
    };

    pedido = requestAnimationFrame(imagem);
    return () => cancelAnimationFrame(pedido);
  }, []);

  const eRecorde = fase === 'acabou' && feitos > 0 && feitos >= recorde;

  return (
    <section className="jogo">
      <p className="eyebrow">{semRede ? 'Sem internet' : 'Enquanto não há nada para fazer'}</p>
      <h1>{semRede ? 'A net foi-se. Os torrões não.' : 'Alguém anda a fugir pelo balcão'}</h1>
      <p className="lead">
        {semRede
          ? 'Alguém se esqueceu de pagar a net. Até ela voltar, salta o que vier pela frente.'
          : 'Salta os torrões, baixa-te aos guardanapos, e vê quanto é que ele aguenta.'}
      </p>

      <div className="jogo-barra">
        <div className="jogo-quem">
          <span className="jogo-cara">
            {cara.endereco ? (
              <img src={cara.endereco} alt="" width={40} height={40} />
            ) : (
              <b>{cara.iniciais}</b>
            )}
          </span>
          <span className="jogo-etiqueta">
            <small>A correr</small>
            <b>{cara.nome}</b>
          </span>
        </div>

        <div className="jogo-marcas">
          <span className="jogo-etiqueta">
            <small>Pontos</small>
            <b className="num">{cinco(pontos)}</b>
          </span>
          <span className="jogo-etiqueta">
            <small>Recorde</small>
            <b className="num">{cinco(recorde)}</b>
          </span>
        </div>
      </div>

      <div className="jogo-tela" onPointerDown={saltar}>
        <canvas ref={tela} style={{ aspectRatio: `${LARGURA} / ${ALTURA}` }} />
        {fase !== 'a-jogar' && (
          <div className="jogo-aviso">
            <div className="jogo-cartao">
              {fase === 'acabou' ? (
                <>
                  <p className="jogo-titulo">Foi ao chão.</p>
                  <p className="jogo-conta">
                    {eRecorde ? 'Recorde novo, ' : 'Ficou-se pelos '}
                    <b>{cinco(feitos)}</b>
                  </p>
                </>
              ) : (
                <p className="jogo-titulo">Vai sair à rua {cara.nome}.</p>
              )}
              <button className="btn claro" type="button" onClick={comecar}>
                {fase === 'acabou' ? 'Outra vez, com outra cara' : 'Começar'}
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="jogo-botoes">
        <button
          className="btn"
          type="button"
          onPointerDown={(e) => {
            e.preventDefault();
            saltar();
          }}
        >
          Saltar
        </button>
        <button
          className="btn"
          type="button"
          onPointerDown={(e) => {
            e.preventDefault();
            baixar(true);
          }}
          onPointerUp={() => baixar(false)}
          onPointerLeave={() => baixar(false)}
        >
          Baixar
        </button>
      </div>

      <p className="notas jogo-ajuda">
        <b>Espaço</b> ou <b>seta para cima</b> para saltar, <b>seta para baixo</b> para te
        baixares. A cada jogada sai outra cara, e o recorde fica guardado neste telemóvel.
      </p>
    </section>
  );
}

/** Um torrão, ou uma pilha deles, ou um guardanapo a voar. */
function obstaculoNovo(pontos: number): Obstaculo {
  if (pontos > PONTOS_PARA_GUARDANAPOS && Math.random() < 0.28) {
    return { x: LARGURA + 10, largura: 30, altura: 16, voo: 40, cubos: 0 };
  }
  const cubos = 1 + Math.floor(Math.random() * 3);
  return {
    x: LARGURA + 10,
    largura: cubos * 17,
    altura: Math.random() < 0.25 ? 32 : 16,
    voo: 0,
    cubos
  };
}

/** Caixa contra caixa, com uma folga que perdoa os quase. */
function bateu(j: Jogo): boolean {
  const largura = j.baixado ? BAIXADO_LARGURA : BONECO_LARGURA;
  const altura = j.baixado ? BAIXADO_ALTURA : BONECO_ALTURA;
  const folga = 4;
  const ex = BONECO_X + folga;
  const ed = BONECO_X + largura - folga;
  const eb = CHAO - j.altura;
  const et = eb - altura + folga;

  for (const o of j.obstaculos) {
    const ob = CHAO - o.voo;
    if (
      ed > o.x + folga &&
      ex < o.x + o.largura - folga &&
      eb > ob - o.altura + folga &&
      et < ob - folga
    ) {
      return true;
    }
  }
  return false;
}
