import { useEffect, useRef } from 'react';
import type { Resposta } from '../lib/idade';
import type { Pagina } from '../lib/tipos';

/**
 * O porteiro: a pergunta da idade à entrada, e o aviso que fica nas mesas
 * fechadas a quem disse que ainda não tem 18.
 *
 * A janela não se fecha com Escape nem com um clique ao lado, ao contrário de
 * todas as outras do site. Uma porta que se empurra não é uma porta, e esta
 * pergunta só tem duas saídas, que são as duas respostas.
 */

const SINAL = (
  <svg width="54" height="54" viewBox="0 0 48 48" aria-hidden="true">
    <circle cx="24" cy="24" r="21" fill="var(--crema-2)" />
    <circle cx="24" cy="24" r="17" fill="var(--papel)" />
    <text
      x="24"
      y="24"
      textAnchor="middle"
      dominantBaseline="central"
      fontFamily="var(--mono)"
      fontSize="15"
      fontWeight="700"
      fill="var(--crema)"
    >
      18
    </text>
  </svg>
);

export function Porteiro({
  aoResponder,
  irPara
}: {
  aoResponder: (r: Resposta) => void;
  irPara: (p: Pagina) => void;
}) {
  const primeiro = useRef<HTMLButtonElement>(null);

  /* O teclado tem de ir dar à janela, senão quem anda de tabulador continuava
     a passear pelo site por trás dela sem nunca lhe tocar. */
  useEffect(() => {
    primeiro.current?.focus();
  }, []);

  return (
    <div
      className="modal-fundo porteiro"
      role="dialog"
      aria-modal="true"
      aria-labelledby="idade-titulo"
    >
      <div className="modal">
        {SINAL}
        <h2 id="idade-titulo">Tens 18 anos?</h2>
        <p>
          Aqui em casa há blackjack, poker, roleta e apostas desportivas. Joga-se com torrões, que
          não valem nada, não se compram nem se trocam por nada, mas são na mesma jogos de casino e
          por isso perguntamos à entrada.
        </p>
        <button className="btn azul" type="button" ref={primeiro} onClick={() => aoResponder('sim')}>
          Tenho 18 ou mais
        </button>
        <button className="btn claro" type="button" onClick={() => aoResponder('nao')}>
          Ainda não tenho
        </button>
        {/* A porta faz aqui uma promessa a respeito de dados, e quem a ouve tem
            de poder ir confirmá-la antes de responder. Por isso a papelada
            abre-se daqui, e nessas duas páginas a porta afasta-se. */}
        <p className="porteiro-miudinho">
          A resposta fica só neste aparelho. Não vai para o servidor nem é ligada a nome nenhum, e
          podes ler isso por extenso na{' '}
          <button type="button" className="como-link" onClick={() => irPara('privacidade')}>
            privacidade
          </button>{' '}
          e nos{' '}
          <button type="button" className="como-link" onClick={() => irPara('termos')}>
            termos
          </button>
          .
        </p>
      </div>
    </div>
  );
}

/** O que aparece no lugar de uma mesa fechada. */
export function MesaFechada({ aoCorrigir }: { aoCorrigir: () => void }) {
  return (
    <section className="fechada">
      {SINAL}
      <p className="eyebrow">Porta fechada</p>
      <h1>Esta mesa é só para maiores de 18</h1>
      <p className="lead">
        Disseste à entrada que ainda não tens 18 anos, e por isso as mesas e as apostas ficam
        fechadas. É só isto que fica: o resto da casa é todo teu, e o Cusco, a Colherada, o jogo da
        meia de leite e a Leader Board estão à espera.
      </p>
      <button className="btn claro" type="button" onClick={aoCorrigir}>
        Enganei-me na idade
      </button>
    </section>
  );
}
