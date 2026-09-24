import { useCallback, useEffect, useRef, useState } from 'react';
import { Cusco, type Pose } from './Cusco';
import { mandarRecorde } from '../lib/api';
import { guardar, lido } from '../lib/dados';

/**
 * Fazer uma meia de leite ao Cusco.
 *
 * O copo enche-se às cegas: não há números, nem barras, nem contas à vista.
 * O que há é o líquido a subir e a mudar de cor conforme a mistura, e é isso
 * que a pessoa tem de aprender a ler. Quando o copo enche, já não há nada a
 * fazer: vai para o Cusco e ele que decida.
 *
 * A receita certa é um quinto de café para quatro quintos de leite, com uma
 * folga de cinco pontos para cada lado que nunca é dita a ninguém. Fora dessa
 * folga não há meio termo: ou sai bem, ou o Cusco rebenta.
 */

const CAPACIDADE = 100;
const POR_SEGUNDO = 34;
const CAFE_CERTO = 20;
const FOLGA = 5;
/** Acima disto o leite começa a ser demais para a barriga dele. */
const LEITE_A_MAIS = 85;

const COR_CAFE = [74, 44, 24];
const COR_LEITE = [242, 230, 210];
const RECORDE = 'mdl.cusco.certas';

type Fase = 'a-encher' | 'a-entregar' | 'acabou';
/** Quando rebenta, ainda interessa saber porquê: é o que ele diz a seguir. */
type Fim = 'perfeita' | 'lactose' | 'receita' | null;

const misturar = (a: number[], b: number[], t: number) =>
  `rgb(${a.map((v, i) => Math.round(v + (b[i] - v) * t)).join(', ')})`;

export function JogoDoCusco() {
  const [fase, setFase] = useState<Fase>('a-encher');
  const [fim, setFim] = useState<Fim>(null);
  const [pose, setPose] = useState<Pose>('parado');
  const [certas, setCertas] = useState(() => Number(lido(RECORDE)) || 0);
  /** Só aparece no fim: durante o jogo ninguém vê contas nenhumas. */
  const [receita, setReceita] = useState({ cafe: 0, leite: 0 });
  /* So para o fio de liquido aparecer: muda uma vez por carregar, nao a cada
     imagem. */
  const [aVerter, setAVerter] = useState<'cafe' | 'leite' | null>(null);
  /** Enquanto ele bebe, o copo esvazia-se. Se ele torcer o nariz, fica cheio. */
  const [aBeber, setABeber] = useState(false);

  /* Os volumes vivem numa referência: mudam a cada imagem e não vale a pena
     mandar o React redesenhar a página sessenta vezes por segundo por causa
     disso. Quem muda é o próprio líquido, no seu estilo. */
  const volume = useRef({ cafe: 0, leite: 0 });
  const aDeitar = useRef<'cafe' | 'leite' | null>(null);
  const liquido = useRef<HTMLDivElement>(null);
  const relogios = useRef<number[]>([]);

  const desenharLiquido = useCallback(() => {
    const el = liquido.current;
    if (!el) return;
    const { cafe, leite } = volume.current;
    const total = cafe + leite;
    el.style.height = `${(total / CAPACIDADE) * 100}%`;
    el.style.background = total
      ? misturar(COR_CAFE, COR_LEITE, leite / total)
      : 'transparent';
  }, []);

  const arrumar = () => {
    relogios.current.forEach(clearTimeout);
    relogios.current = [];
  };

  const daqui = (ms: number, o: () => void) => {
    relogios.current.push(window.setTimeout(o, ms));
  };

  /** O copo está cheio: a partir daqui já não há nada a fazer. */
  const entregar = useCallback(() => {
    aDeitar.current = null;
    setAVerter(null);
    const { cafe, leite } = volume.current;
    const total = cafe + leite;
    const pctCafe = (cafe / total) * 100;
    const pctLeite = 100 - pctCafe;
    setReceita({ cafe: Math.round(pctCafe), leite: Math.round(pctLeite) });
    setFase('a-entregar');

    const perfeita = Math.abs(pctCafe - CAFE_CERTO) <= FOLGA;

    daqui(900, () => {
      setPose('bebe');
      // ele bebe sempre: o que muda e o que acontece a seguir
      setABeber(true);
    });
    daqui(2300, () => {
      if (perfeita) {
        setPose('feliz');
        setFim('perfeita');
        setCertas((n) => {
          const novo = n + 1;
          guardar(RECORDE, String(novo));
          mandarRecorde('cusco', novo);
          return novo;
        });
      } else {
        // fora da folga nao ha meio termo: rebenta sempre
        setPose('rebenta');
        setFim(pctLeite > LEITE_A_MAIS ? 'lactose' : 'receita');
      }
      setFase('acabou');
    });
  }, []);

  /* O ciclo de encher: só anda enquanto houver um dedo ou um rato em cima de
     um dos pacotes. */
  useEffect(() => {
    let pedido = 0;
    let anterior = performance.now();
    const imagem = (agora: number) => {
      pedido = requestAnimationFrame(imagem);
      const dt = Math.min((agora - anterior) / 1000, 0.05);
      anterior = agora;
      const qual = aDeitar.current;
      if (!qual) return;

      const v = volume.current;
      const cabe = CAPACIDADE - (v.cafe + v.leite);
      if (cabe <= 0) return;
      v[qual] += Math.min(POR_SEGUNDO * dt, cabe);
      desenharLiquido();
      if (v.cafe + v.leite >= CAPACIDADE - 0.01) entregar();
    };
    pedido = requestAnimationFrame(imagem);
    return () => {
      cancelAnimationFrame(pedido);
      arrumar();
    };
  }, [desenharLiquido, entregar]);

  const comecarADeitar = (qual: 'cafe' | 'leite') => {
    if (fase !== 'a-encher') return;
    aDeitar.current = qual;
    setAVerter(qual);
  };
  const parar = () => {
    aDeitar.current = null;
    setAVerter(null);
  };

  function outraVez() {
    arrumar();
    volume.current = { cafe: 0, leite: 0 };
    desenharLiquido();
    setFim(null);
    setABeber(false);
    setPose('parado');
    setFase('a-encher');
  }

  const aDeitarAgora = fase === 'a-encher';

  return (
    <section className="cusco-jogo">
      <p className="eyebrow">A mascote tem sede</p>
      <h1>Faz uma meia de leite ao Cusco</h1>
      <p className="lead">
        Café de um lado, leite do outro, e um copo pelo meio. Carrega e segura para deitar. Não há
        contas nem medidas à vista: é como ao balcão, ou sai bem ou ouve-se.
      </p>

      <div className="cusco-palco">
        <Cusco pose={pose} />
        <div className={`cusco-balao${fim ? ' visivel' : ''}`}>
          {fim === 'perfeita' && 'Isto é que é uma meia de leite!'}
          {fim === 'lactose' && 'Leite a mais... não aguento...'}
          {fim === 'receita' && 'Mas o que é que me deste?'}
        </div>
      </div>

      <div className="bancada">
        <button
          className="pacote cafe"
          type="button"
          disabled={!aDeitarAgora}
          aria-label="Deitar café"
          onPointerDown={(e) => {
            e.preventDefault();
            comecarADeitar('cafe');
          }}
          onPointerUp={parar}
          onPointerLeave={parar}
          onPointerCancel={parar}
        >
          <span className="pacote-corpo">
            <b>Café</b>
          </span>
        </button>

        <div
          className={`copo${fase === 'a-encher' ? '' : ' entregue'}${aBeber ? ' a-beber' : ''}${
            fim && fim !== 'perfeita' ? ' caiu' : ''
          }`}
          data-verter={aVerter ?? ''}
        >
          <div className="copo-vidro">
            <div className="copo-liquido" ref={liquido} />
            <div className="copo-brilho" />
          </div>
          <div className="copo-base" />
        </div>

        <button
          className="pacote leite"
          type="button"
          disabled={!aDeitarAgora}
          aria-label="Deitar leite"
          onPointerDown={(e) => {
            e.preventDefault();
            comecarADeitar('leite');
          }}
          onPointerUp={parar}
          onPointerLeave={parar}
          onPointerCancel={parar}
        >
          <span className="pacote-corpo">
            <b>Leite</b>
          </span>
        </button>
      </div>

      {fase === 'acabou' && (
        <div className="cusco-fim">
          <p className="cusco-veredito">
            {fim === 'perfeita' && 'Perfeita. Ele bebeu tudo e ainda lambeu o copo.'}
            {fim === 'lactose' && 'Leite a mais. O Cusco é intolerante à lactose, e isso viu-se.'}
            {fim === 'receita' && 'Isso não era uma meia de leite. O estômago dele não perdoa.'}
          </p>
          <p className="cusco-conta">
            Deste-lhe <b>{receita.cafe}</b> de café para <b>{receita.leite}</b> de leite.
            {fim !== 'perfeita' && ' A boa é vinte para oitenta.'}
          </p>
          <button className="btn azul" type="button" onClick={outraVez}>
            Outro copo
          </button>
        </div>
      )}

      <p className="notas cusco-marca">
        Meias de leite acertadas neste telemóvel: <b>{certas}</b>
      </p>
    </section>
  );
}
