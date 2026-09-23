import { useCallback, useEffect, useRef, useState } from 'react';
import { fotoDoMembro } from '../lib/api';
import { guardar, lido } from '../lib/dados';
import type { Estado, Membro } from '../lib/tipos';

/**
 * A toupeira da feira, em versão de balcão.
 *
 * Em vez de buracos há nove chávenas, e em vez da toupeira sai de lá de dentro
 * um de nós, escolhido por quem joga. Bate-se com a colher antes que ele volte
 * a meter-se na chávena. Cada um que escapa custa um torrão, e com os três
 * torrões gastos acabou-se.
 *
 * Fica difícil com os acertos e não com o relógio: quem acerta mais vê-os
 * sair mais depressa, ficar menos tempo cá fora e, a partir de certa altura,
 * sair dois e três ao mesmo tempo. Quem vai falhando fica no ritmo em que está.
 */

const CHAVENAS = 9;
const VIDAS = 3;

/** Quanto tempo cada um fica cá fora, e de quanto em quanto sai outro. */
const FORA_NO_INICIO = 1150;
const FORA_NO_MINIMO = 430;
const INTERVALO_NO_INICIO = 850;
const INTERVALO_NO_MINIMO = 260;
/** Cada acerto encurta os dois tempos nesta proporção. */
const APERTO = 0.965;
/** De tantos em tantos acertos pode sair mais um ao mesmo tempo, até três. */
const ACERTOS_POR_CABECA = 10;
const MAX_CA_FORA = 3;
/** O nível que se mostra: só para se ver que a coisa está a apertar. */
const ACERTOS_POR_NIVEL = 5;

const RECORDE = 'mdl.colherada.recorde';
const ESCOLHIDO = 'mdl.colherada.quem';

const GRITOS = ['Pumba!', 'Toma!', 'Ai!', 'Apanhado!', 'Na mouche!', 'Ui!'];

type Fase = 'escolher' | 'a-jogar' | 'acabou';
type Chavena = { estado: 'vazia' | 'fora' | 'levou'; vez: number; grito: string };

const vazias = (): Chavena[] =>
  Array.from({ length: CHAVENAS }, () => ({ estado: 'vazia', vez: 0, grito: '' }));

const tempoFora = (acertos: number) =>
  Math.max(FORA_NO_MINIMO, FORA_NO_INICIO * APERTO ** acertos);
const intervalo = (acertos: number) =>
  Math.max(INTERVALO_NO_MINIMO, INTERVALO_NO_INICIO * APERTO ** acertos);
const quantosFora = (acertos: number) =>
  Math.min(MAX_CA_FORA, 1 + Math.floor(acertos / ACERTOS_POR_CABECA));

/* No teclado, as chávenas estão como no teclado numérico: 7 8 9 em cima. */
const TECLAS = ['7', '8', '9', '4', '5', '6', '1', '2', '3'];

const iniciaisDe = (nome: string) =>
  nome
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0])
    .join('')
    .toUpperCase();

/** Sem servidor ou sem membros ainda carregados, joga-se com isto. */
const UM_DE_NOS: Membro = { id: '', nome: 'Um de nós', descricao: '', temFoto: false, ordem: 0 };

function Cara({ membro }: { membro: Membro }) {
  return (
    <>
      {membro.temFoto && membro.id ? (
        <img
          src={fotoDoMembro(membro.id)}
          alt=""
          draggable={false}
          onError={(e) => {
            e.currentTarget.style.display = 'none';
          }}
        />
      ) : null}
      <span className="iniciais">{iniciaisDe(membro.nome)}</span>
    </>
  );
}

export function Colherada({ estado }: { estado: Estado }) {
  const [fase, setFase] = useState<Fase>('escolher');
  const [quemId, setQuemId] = useState(() => lido(ESCOLHIDO) || '');
  const [chavenas, setChavenas] = useState<Chavena[]>(vazias);
  const [acertos, setAcertos] = useState(0);
  const [vidas, setVidas] = useState(VIDAS);
  const [recorde, setRecorde] = useState(() => Number(lido(RECORDE)) || 0);
  const [bateuRecorde, setBateuRecorde] = useState(false);
  /** Onde a colher caiu da última vez. O número muda a cada pancada, para a
   *  animação voltar a correr mesmo que seja na mesma chávena. */
  const [pancada, setPancada] = useState({ onde: -1, n: 0 });

  /* O que o relógio precisa de ler vive em referências: os temporizadores
     foram marcados antes e veriam valores velhos se lessem o estado. */
  const jogo = useRef({ chavenas: vazias(), acertos: 0, vidas: VIDAS, vez: 0, aJogar: false });
  const relogios = useRef<number[]>([]);

  const membros = estado.membros;
  const quem = membros.find((m) => m.id === quemId) ?? membros[0] ?? UM_DE_NOS;

  const daqui = (ms: number, o: () => void) => {
    relogios.current.push(window.setTimeout(o, ms));
  };
  const arrumar = () => {
    relogios.current.forEach(clearTimeout);
    relogios.current = [];
  };

  const mostrar = () => setChavenas(jogo.current.chavenas.map((c) => ({ ...c })));

  const acabar = useCallback(() => {
    const j = jogo.current;
    j.aJogar = false;
    arrumar();
    j.chavenas = vazias();
    mostrar();
    setFase('acabou');
    const antes = Number(lido(RECORDE)) || 0;
    if (j.acertos > antes) {
      guardar(RECORDE, String(j.acertos));
      setRecorde(j.acertos);
      setBateuRecorde(true);
    }
  }, []);

  /** Mete um cá fora e marca o próximo. É isto que faz andar o jogo. */
  const lancar = useCallback(() => {
    const j = jogo.current;
    if (!j.aJogar) return;

    const fora = j.chavenas.filter((c) => c.estado !== 'vazia').length;
    const livres = j.chavenas.map((c, i) => (c.estado === 'vazia' ? i : -1)).filter((i) => i >= 0);

    if (fora < quantosFora(j.acertos) && livres.length > 0) {
      const onde = livres[Math.floor(Math.random() * livres.length)];
      const vez = ++j.vez;
      j.chavenas[onde] = { estado: 'fora', vez, grito: '' };
      mostrar();

      daqui(tempoFora(j.acertos), () => {
        const c = j.chavenas[onde];
        // se ja levou, ou se ja e outro que la esta, este ja nao conta
        if (!j.aJogar || c.vez !== vez || c.estado !== 'fora') return;
        j.chavenas[onde] = { estado: 'vazia', vez, grito: '' };
        j.vidas -= 1;
        setVidas(j.vidas);
        mostrar();
        if (j.vidas <= 0) acabar();
      });
    }

    daqui(intervalo(j.acertos), lancar);
  }, [acabar]);

  function comecar() {
    arrumar();
    jogo.current = { chavenas: vazias(), acertos: 0, vidas: VIDAS, vez: 0, aJogar: true };
    mostrar();
    setAcertos(0);
    setVidas(VIDAS);
    setBateuRecorde(false);
    setFase('a-jogar');
    // um instante para a pessoa pousar os olhos no balcão antes do primeiro
    daqui(600, lancar);
  }

  function bater(i: number) {
    const j = jogo.current;
    setPancada((p) => ({ onde: i, n: p.n + 1 }));
    if (!j.aJogar) return;
    const c = j.chavenas[i];
    if (c.estado !== 'fora') return;

    j.chavenas[i] = {
      estado: 'levou',
      vez: c.vez,
      grito: GRITOS[Math.floor(Math.random() * GRITOS.length)]
    };
    j.acertos += 1;
    setAcertos(j.acertos);
    mostrar();
    daqui(380, () => {
      if (j.chavenas[i].vez !== c.vez) return;
      j.chavenas[i] = { estado: 'vazia', vez: c.vez, grito: '' };
      mostrar();
    });
  }

  /* Com o separador escondido o jogo para: os temporizadores do browser andam
     aos solavancos nesse estado e fugiam todos sem ninguém estar a ver. Quando
     se volta, continua de onde estava. */
  useEffect(() => {
    const aoMudar = () => {
      const j = jogo.current;
      if (fase !== 'a-jogar') return;
      if (document.visibilityState === 'hidden') {
        j.aJogar = false;
        arrumar();
        j.chavenas = vazias();
        mostrar();
      } else if (!j.aJogar && j.vidas > 0) {
        j.aJogar = true;
        daqui(600, lancar);
      }
    };
    document.addEventListener('visibilitychange', aoMudar);
    return () => document.removeEventListener('visibilitychange', aoMudar);
  }, [fase, lancar]);

  // sair da página a meio arruma os temporizadores todos
  useEffect(() => () => arrumar(), []);

  useEffect(() => {
    if (fase !== 'a-jogar') return;
    const tecla = (e: KeyboardEvent) => {
      const i = TECLAS.indexOf(e.key);
      if (i < 0 || e.repeat) return;
      e.preventDefault();
      bater(i);
    };
    window.addEventListener('keydown', tecla);
    return () => window.removeEventListener('keydown', tecla);
    // o bater le tudo de referencias, por isso nao precisa de ser refeito
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fase]);

  function escolher(m: Membro) {
    setQuemId(m.id);
    guardar(ESCOLHIDO, m.id);
  }

  const nivel = 1 + Math.floor(acertos / ACERTOS_POR_NIVEL);

  return (
    <section className="colherada">
      <p className="eyebrow">A toupeira da feira, mas ao balcão</p>
      <h1>À colherada</h1>
      <p className="lead">
        Escolhe quem vai para dentro das chávenas e dá-lhe com a colher sempre que ele espreitar.
        Cada um que te foge custa um torrão, e só tens três. Quanto mais acertas, mais depressa
        eles saem.
      </p>

      {fase === 'escolher' && (
        <div className="colherada-escolha">
          <p className="rotulo">Quem vai levar?</p>
          {membros.length === 0 ? (
            <p className="notas">Os membros ainda não chegaram. Podes jogar com um de nós.</p>
          ) : (
            <div className="colherada-membros" role="radiogroup" aria-label="Quem vai levar">
              {membros.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  role="radio"
                  aria-checked={m.id === quem.id}
                  className={`colherada-membro${m.id === quem.id ? ' escolhido' : ''}`}
                  onClick={() => escolher(m)}
                >
                  <span className="retrato pequeno">
                    <Cara membro={m} />
                  </span>
                  <span>{m.nome}</span>
                </button>
              ))}
            </div>
          )}
          <button className="btn azul colherada-comecar" type="button" onClick={comecar}>
            Começar com {quem.nome}
          </button>
        </div>
      )}

      {fase !== 'escolher' && (
        <>
          <div className="jogo-placard colherada-placard">
            <span>
              Acertos<b>{acertos}</b>
            </span>
            <span>
              Nível<b>{nivel}</b>
            </span>
            <span>
              Recorde<b>{recorde}</b>
            </span>
            <span className="colherada-vidas" aria-label={`${vidas} torrões`}>
              Torrões
              {Array.from({ length: VIDAS }, (_, i) => (
                <i key={i} className={i < vidas ? 'cheio' : ''} />
              ))}
            </span>
          </div>

          <div className={`colherada-balcao${fase === 'acabou' ? ' parado' : ''}`}>
            {chavenas.map((c, i) => (
              <button
                key={i}
                type="button"
                className={`chavena ${c.estado}`}
                aria-label={c.estado === 'fora' ? `Bater em ${quem.nome}` : 'Chávena vazia'}
                onPointerDown={(e) => {
                  e.preventDefault();
                  bater(i);
                }}
              >
                <span className="chavena-boca">
                  <span className="colherada-cara retrato" key={c.vez}>
                    <Cara membro={quem} />
                  </span>
                </span>
                <span className="chavena-corpo">
                  <span className="chavena-cafe" />
                </span>
                <span className="chavena-asa" />
                <span className="chavena-pires" />
                {c.estado === 'levou' && <span className="colherada-grito">{c.grito}</span>}
                {pancada.onde === i && <span className="colher" key={pancada.n} aria-hidden="true" />}
              </button>
            ))}
          </div>

          {fase === 'acabou' && (
            <div className="cusco-fim colherada-fim">
              <p className="cusco-veredito">
                {acertos === 0
                  ? `Nem uma colherada. ${quem.nome} agradece.`
                  : `${bateuRecorde ? 'Recorde novo: ' : ''}${acertos} ${
                      acertos === 1 ? 'colherada' : 'colheradas'
                    } em cheio.`}
              </p>
              <p className="cusco-conta">
                Chegaste ao nível <b>{nivel}</b>. O teu melhor é <b>{recorde}</b>.
              </p>
              <div className="acoes">
                <button className="btn azul" type="button" onClick={comecar}>
                  Outra vez
                </button>
                <button className="btn claro" type="button" onClick={() => setFase('escolher')}>
                  Trocar de membro
                </button>
              </div>
            </div>
          )}

          <p className="notas colherada-ajuda">
            No computador também dá com o teclado numérico: o 7, 8 e 9 são a fila de cima.
          </p>
        </>
      )}
    </section>
  );
}
