import { useEffect, useState, type CSSProperties } from 'react';
import { Caixa, type Peca } from './Caixa';
import { fotoDoMembro } from '../lib/api';
import type { CartaVista, MesaViva, Membro, NaMao } from '../lib/tipos';

/**
 * A mesa de poker, em três dimensões.
 *
 * É feita como o troféu e como o Cusco: com as transformações 3D do próprio
 * CSS e mais nada. O tampo é uma pilha de elipses, uma por cada milímetro de
 * grossura, inclinada para trás; as cartas e as fichas estão em cima dele mas
 * viradas para a frente, que é como se vê uma mesa de casino de pé ao lado
 * dela. O croupier está do outro lado, feito de caixas, com a cara de um de
 * nós vinda da aba dos membros.
 *
 * Aqui não se decide nada. Quem dá as cartas, quem ganha e quanto, decide-se
 * no servidor: isto é só o que se vê.
 */

/* Cinco lugares à volta da mesa, com o croupier ao fundo. A cadeira está no
   plano da frente, que é onde o texto se lê; as fichas apostadas estão em cima
   do tampo, no plano inclinado. Os números são percentagens, medidos a olho
   sobre a elipse. */
const LUGARES = [
  { cadeira: [8, 32], fichas: [23, 30] },
  { cadeira: [18, 78], fichas: [32, 68] },
  { cadeira: [50, 88], fichas: [50, 78] },
  { cadeira: [82, 78], fichas: [68, 68] },
  { cadeira: [92, 32], fichas: [77, 30] }
];

/** As grossuras da pilha que faz o tampo ter espessura. */
const FOLHAS = [0, 1, 2, 3, 4, 5];

const COR_DA_FICHA = (quanto: number) =>
  quanto >= 1000
    ? '#e0b559'
    : quanto >= 500
      ? '#9d6fc4'
      : quanto >= 100
        ? '#6d6d7c'
        : quanto >= 50
          ? '#4f7fc0'
          : '#3f8d63';

/* O croupier. Um tronco, dois ombros, dois braços e um laço ao pescoço: o
   suficiente para se ver que é uma pessoa de pé do outro lado da mesa. A cara
   não é uma caixa, é a fotografia, posta à frente da cabeça. */
const CROUPIER: Peca[] = [
  { nome: 'pk-tronco', w: 74, h: 86, d: 42, x: 0, y: 16, z: 0, raio: 20, cor: '#2b2118' },
  { nome: 'pk-camisa', w: 30, h: 74, d: 44, x: 0, y: 18, z: 0, raio: 10, cor: '#efe4d4' },
  { nome: 'pk-ombro-e', w: 20, h: 26, d: 38, x: -45, y: -8, z: 0, raio: 12, cor: '#2b2118' },
  { nome: 'pk-ombro-d', w: 20, h: 26, d: 38, x: 45, y: -8, z: 0, raio: 12, cor: '#2b2118' },
  { nome: 'pk-braco-e', w: 16, h: 52, d: 16, x: -48, y: 28, z: 10, rz: 9, raio: 8, cor: '#241b13' },
  { nome: 'pk-braco-d', w: 16, h: 52, d: 16, x: 48, y: 28, z: 10, rz: -9, raio: 8, cor: '#241b13' },
  { nome: 'pk-pescoco', w: 20, h: 18, d: 20, x: 0, y: -32, z: 0, raio: 9, cor: '#c99a6c' },
  { nome: 'pk-cabeca', w: 48, h: 50, d: 44, x: 0, y: -62, z: 0, raio: 20, cor: '#3a2b1f' },
  { nome: 'pk-laco-e', w: 12, h: 9, d: 8, x: -7, y: -26, z: 20, rz: 12, raio: 4, cor: '#a3403c' },
  { nome: 'pk-laco-d', w: 12, h: 9, d: 8, x: 7, y: -26, z: 20, rz: -12, raio: 4, cor: '#a3403c' },
  { nome: 'pk-no', w: 7, h: 7, d: 8, x: 0, y: -26, z: 21, raio: 3, cor: '#7e2f2c' }
];

const iniciais = (nome: string) =>
  nome
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0] || '')
    .join('')
    .toUpperCase();

export function PkCarta({
  c,
  tapada,
  vazia,
  i = 0
}: {
  c?: CartaVista | null;
  tapada?: boolean;
  vazia?: boolean;
  i?: number;
}) {
  if (vazia) return <span className="pk-carta vaga" aria-hidden="true" />;
  if (tapada || !c)
    return <span className="pk-carta tapa" style={{ '--i': i } as CSSProperties} />;
  return (
    <span
      className={`pk-carta${c.verm ? ' verm' : ''}`}
      style={{ '--i': i } as CSSProperties}
      aria-label={`${c.v} de ${c.n}`}
    >
      <b>{c.v}</b>
      <i>{c.n}</i>
    </span>
  );
}

/** Uma pilha de fichas, com o número ao lado. */
function Fichas({ quanto, classe = '' }: { quanto: number; classe?: string }) {
  if (quanto <= 0) return null;
  const altura = Math.min(4, 1 + Math.floor(Math.log10(Math.max(1, quanto))));
  return (
    <span className={`pk-fichas ${classe}`} style={{ '--cor': COR_DA_FICHA(quanto) } as CSSProperties}>
      <span className="pk-pilha">
        {Array.from({ length: altura }, (_, i) => (
          <i key={i} style={{ '--n': i } as CSSProperties} />
        ))}
      </span>
      <b>{quanto}</b>
    </span>
  );
}

function Croupier({ membro }: { membro: Membro | null }) {
  const foto = membro && membro.temFoto ? fotoDoMembro(membro.id) : '';
  return (
    <div className="pk-croupier">
      <div className="pk-figura">
        {CROUPIER.map((p) => (
          <Caixa key={p.nome} peca={p} />
        ))}
        <div className="pk-cara">
          {foto ? (
            <img src={foto} alt={membro ? membro.nome : 'O croupier'} draggable={false} />
          ) : (
            <span>{membro ? iniciais(membro.nome) : '?'}</span>
          )}
        </div>
      </div>
    </div>
  );
}

function Cadeira({
  n,
  quem,
  naMao,
  souEu,
  eVez,
  volta,
  temBotao,
  podeSentar,
  aoSentar
}: {
  n: number;
  quem: { nome: string; fichas: number; ligado: boolean } | null;
  naMao: NaMao | null;
  souEu: boolean;
  eVez: boolean;
  volta: number;
  temBotao: boolean;
  podeSentar: boolean;
  aoSentar: (lugar: number) => void;
}) {
  const [x, y] = LUGARES[n].cadeira;
  const estilo = { '--px': `${x}%`, '--py': `${y}%`, '--volta': `${volta}%` } as CSSProperties;

  if (!quem)
    return (
      <div className="pk-cadeira vaga" data-lugar={n} style={estilo}>
        {podeSentar ? (
          <button type="button" className="pk-sentar" onClick={() => aoSentar(n)}>
            Sentar
          </button>
        ) : (
          <span className="pk-vago">Lugar {n + 1}</span>
        )}
      </div>
    );

  const passou = naMao && naMao.estado === 'passou';
  const tudo = naMao && naMao.estado === 'tudo';

  return (
    <div
      className={`pk-cadeira${souEu ? ' eu' : ''}${eVez ? ' vez' : ''}${passou ? ' passou' : ''}`}
      data-lugar={n}
      style={estilo}
    >
      <div className="pk-maozinha">
        {naMao && !passou ? (
          naMao.cartas ? (
            naMao.cartas.map((c, i) => <PkCarta key={i} c={c} i={i} />)
          ) : (
            Array.from({ length: naMao.quantas }, (_, i) => <PkCarta key={i} tapada i={i} />)
          )
        ) : null}
      </div>

      <div className="pk-placa">
        <b>
          {quem.nome}
          {temBotao && (
            <em className="pk-botao" title="O botão">
              D
            </em>
          )}
        </b>
        <span>
          {naMao ? naMao.fichas : quem.fichas}
          {!quem.ligado && <i className="pk-caiu" title="Desligou-se" />}
        </span>
        {naMao && naMao.mao && <small>{naMao.mao}</small>}
        {tudo && <small className="pk-tudo">com tudo</small>}
        {passou && <small>desistiu</small>}
        {naMao && naMao.ganhou > 0 && <small className="pk-ganhou">+{naMao.ganhou}</small>}
      </div>
    </div>
  );
}

export function MesaEm3D({
  estado,
  dealer,
  restamSegundos,
  aoSentar
}: {
  estado: MesaViva;
  dealer: Membro | null;
  restamSegundos: number;
  aoSentar: (lugar: number) => void;
}) {
  const mao = estado.mao;
  const meuLugar = estado.eu ? estado.eu.lugar : -1;
  const sentado = meuLugar >= 0;
  const volta = Math.max(0, Math.min(100, (restamSegundos / 30) * 100));

  const naMaoDe = (lugar: number) =>
    mao ? mao.jogadores.find((j) => j.lugar === lugar) || null : null;
  const lugarDe = (lugar: number) => estado.lugares.find((l) => l.lugar === lugar) || null;

  return (
    <div className="pk-cena" role="img" aria-label="A mesa de poker">
      {/* o mundo inclinado: o tampo, o croupier e o que está em cima do pano.
          Vive dentro do seu proprio sitio para as cadeiras, que sao planas,
          poderem ficar por cima dele sem entrar na conta das tres dimensoes. */}
      <div className="pk-3d">
        <div className="pk-mundo">
        <div className="pk-tampo">
          {FOLHAS.map((f) => (
            <i key={f} className="pk-folha" style={{ '--f': f } as CSSProperties} />
          ))}
          <i className="pk-pano" />
          <i className="pk-linha" />
          <span className="pk-marca">Meia de Leite</span>
        </div>

        <Croupier membro={dealer} />

        <div className="pk-meio">
          {/* o pote fica atras das cartas: em baixo delas ficava enterrado no
              pano, que num plano inclinado e o que esta mais a frente */}
          {mao && mao.pote > 0 && (
            <div className="pk-pote">
              <Fichas quanto={mao.pote} classe="grande" />
            </div>
          )}
          <div className="pk-comunidade">
            {Array.from({ length: 5 }, (_, i) => {
              const c = mao ? mao.comunidade[i] : undefined;
              return c ? <PkCarta key={i} c={c} i={i} /> : <PkCarta key={i} vazia />;
            })}
          </div>
        </div>

        {mao &&
          mao.jogadores.map((j) =>
            j.posto > 0 ? (
              <div
                key={j.lugar}
                className="pk-aposta"
                style={
                  {
                    '--px': `${LUGARES[j.lugar].fichas[0]}%`,
                    '--py': `${LUGARES[j.lugar].fichas[1]}%`
                  } as CSSProperties
                }
              >
                <Fichas quanto={j.posto} />
              </div>
            ) : null
          )}
        </div>
      </div>

      {/* o plano da frente: as cadeiras, que é onde há texto para ler */}
      <div className="pk-plano">
        {LUGARES.map((_, n) => (
          <Cadeira
            key={n}
            n={n}
            quem={lugarDe(n)}
            naMao={naMaoDe(n)}
            souEu={n === meuLugar}
            eVez={!!mao && mao.vez === n}
            volta={volta}
            temBotao={!!mao && mao.botao === n}
            podeSentar={!sentado}
            aoSentar={aoSentar}
          />
        ))}
      </div>
    </div>
  );
}

/** Um relógio que bate de segundo a segundo, e só quando é preciso. */
export function useSegundos(anda: boolean) {
  const [agora, setAgora] = useState(() => Date.now());
  useEffect(() => {
    if (!anda) return;
    const t = window.setInterval(() => setAgora(Date.now()), 500);
    return () => window.clearInterval(t);
  }, [anda]);
  return agora;
}
