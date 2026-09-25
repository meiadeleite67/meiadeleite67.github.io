import { useEffect, useRef, useState } from 'react';
import { api } from '../lib/api';

/**
 * A caixa de avisar que alguma coisa está partida.
 *
 * Abre-se de qualquer página, e é de propósito: o aviso mais útil é o que se
 * escreve no momento em que se apanha o erro, e não o que se escreve dez
 * minutos depois já sem se saber bem o que se estava a fazer. Por isso ela
 * aponta sozinha a página onde a pessoa estava e o tamanho do ecrã, que são as
 * duas coisas que quem for corrigir vai querer saber primeiro e que ninguém se
 * lembra de escrever.
 *
 * Não é preciso ter nome para avisar. Obrigar a entrar para se poder dizer que
 * uma coisa está partida era perder metade dos avisos: quem encontra um erro
 * muitas vezes nem sequer tem sessão iniciada, e às vezes o erro é não
 * conseguir entrar.
 */
export function Avisar({ nome, fechar }: { nome: string; fechar: () => void }) {
  const [texto, setTexto] = useState('');
  const [aMandar, setAMandar] = useState(false);
  const [feito, setFeito] = useState(false);
  const [recado, setRecado] = useState('');
  const caixa = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    caixa.current?.focus();
    const tecla = (e: KeyboardEvent) => {
      if (e.key === 'Escape') fechar();
    };
    window.addEventListener('keydown', tecla);
    return () => window.removeEventListener('keydown', tecla);
  }, [fechar]);

  /* O que o browser sabe e a pessoa não tem de escrever. O aparelho é o que
     costuma explicar metade dos erros: quase todos são de um tamanho de ecrã
     ou de um browser em particular. */
  const onde = `${window.location.pathname}${window.location.search}`;
  const aparelho = `${window.innerWidth}x${window.innerHeight}, ${navigator.userAgent.slice(0, 140)}`;

  async function mandar() {
    if (aMandar) return;
    setAMandar(true);
    setRecado('');
    try {
      await api.avisarDeErro({ texto, onde, aparelho, quem: nome });
      setFeito(true);
    } catch (e) {
      setRecado(e instanceof Error ? e.message : 'Não deu para mandar o aviso.');
    } finally {
      setAMandar(false);
    }
  }

  return (
    <div
      className="modal-fundo"
      role="dialog"
      aria-modal="true"
      aria-labelledby="avisar-titulo"
      onClick={fechar}
    >
      <div className="modal avisar" onClick={(e) => e.stopPropagation()}>
        <button className="modal-x" type="button" onClick={fechar} aria-label="Fechar">
          ×
        </button>

        {feito ? (
          <>
            <h2 id="avisar-titulo">Apanhado</h2>
            <p>
              O aviso ficou guardado e aparece na cozinha. Obrigado: um erro que ninguém conta é um
              erro que fica.
            </p>
            <button className="btn azul" type="button" onClick={fechar}>
              Fechar
            </button>
          </>
        ) : (
          <>
            <h2 id="avisar-titulo">Alguma coisa está partida?</h2>
            <p>
              Conta o que estavas a fazer e o que correu mal. Quanto mais parecido com o que viste,
              mais depressa se arranja.
            </p>

            <label className="avisar-campo">
              <span className="rotulo">O que aconteceu</span>
              <textarea
                ref={caixa}
                value={texto}
                onChange={(e) => setTexto(e.target.value)}
                maxLength={1200}
                rows={5}
                placeholder="Carreguei em rodar na roleta e a bola nunca mais parou."
              />
            </label>

            {/* Fica à vista o que vai junto com o aviso. Mandar coisas sobre o
                aparelho de alguém sem lhe dizer não se faz, por mais inofensivas
                que sejam. */}
            <p className="avisar-junto">
              Vai também a página onde estás (<b>{onde}</b>), o tamanho do ecrã e o nome do browser
              {nome ? (
                <>
                  , e o teu nickname (<b>{nome}</b>)
                </>
              ) : (
                ''
              )}
              .
            </p>

            {recado && <p className="recado mal">{recado}</p>}

            <button
              className="btn azul"
              type="button"
              onClick={mandar}
              disabled={aMandar || texto.trim().length < 10}
            >
              {aMandar ? 'A mandar...' : 'Mandar o aviso'}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
