import { useRef, useState } from 'react';
import { api } from '../lib/api';
import { guardarNome, guardarPasse, nomeGuardado, tinhaChaveAntiga } from '../lib/nick';

/**
 * A porta de entrada: o nickname e o PIN.
 *
 * É a mesma para o blackjack e para o poker, que é a mesma mesa vista de dois
 * sítios. Há três coisas que podem acontecer, e do lado de cá não é preciso
 * saber qual delas antes de perguntar: o nome é novo e fica com este PIN; o
 * nome já existia sem PIN e fica com este; ou o nome já tem PIN e é preciso
 * acertá-lo. O servidor responde dizendo o que aconteceu.
 *
 * Antes disto o nome era de quem o estreasse e a prova ficava no browser. Dava
 * jeito a ninguém: quem mudava de telemóvel perdia o nome e os torrões com
 * ele, e quem limpasse o histórico também.
 */

export function Entrada({
  aoEntrar,
  nota
}: {
  aoEntrar: (nome: string) => void;
  /** Uma linha a dizer para que é a entrada, se a página quiser. */
  nota?: string;
}) {
  const [nome, setNome] = useState(nomeGuardado);
  const [pin, setPin] = useState('');
  const [aEsperar, setAEsperar] = useState(false);
  const [queixa, setQueixa] = useState('');
  /** Quando o PIN acaba de ser posto, fica um recado à vista antes de seguir. */
  const [estreou, setEstreou] = useState('');
  const ocupado = useRef(false);

  const limpo = nome.trim();
  const algarismos = pin.replace(/\D/g, '');
  const pode = limpo.length >= 2 && algarismos.length >= 4 && !aEsperar;

  async function entrar() {
    if (!pode || ocupado.current) return;
    ocupado.current = true;
    setAEsperar(true);
    setQueixa('');
    try {
      const r = await api.entrarComPin(limpo, algarismos);
      if (r.passe) guardarPasse(limpo, r.passe);
      guardarNome(limpo);
      setPin('');
      // quem só entrou segue direito; quem acabou de pôr um PIN lê o recado
      if (r.estreou) setEstreou(r.estreou);
      else aoEntrar(limpo);
    } catch (e) {
      setQueixa(e instanceof Error ? e.message : 'Não deu para entrar.');
    } finally {
      ocupado.current = false;
      setAEsperar(false);
    }
  }

  if (estreou)
    return (
      <div className="porta-feita">
        <p className="recado bem">
          {estreou === 'nome'
            ? `O nome ${limpo} é teu, e o PIN também.`
            : `O nome ${limpo} ainda não tinha PIN, e ficou com o teu.`}
        </p>
        <p className="notas">
          Guarda o PIN. É com ele que entras neste nome noutro telemóvel, e sem ele não há como
          provar que o nome é teu.
          {estreou === 'pin' &&
            ' Se este nome já era de outra pessoa, diz-lhe: o admin consegue limpar o PIN para ela voltar a pô-lo.'}
        </p>
        <button className="btn azul" type="button" onClick={() => aoEntrar(limpo)}>
          Continuar
        </button>
      </div>
    );

  return (
    <form
      className="porta"
      onSubmit={(e) => {
        e.preventDefault();
        entrar();
      }}
    >
      {nota && <p className="notas">{nota}</p>}
      <div className="porta-campos">
        <input
          value={nome}
          onChange={(e) => setNome(e.target.value)}
          placeholder="O teu nickname"
          maxLength={24}
          autoComplete="username"
          aria-label="O teu nickname"
        />
        <input
          value={pin}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 8))}
          placeholder="PIN"
          type="password"
          inputMode="numeric"
          autoComplete="current-password"
          aria-label="O teu PIN"
        />
        <button className="btn azul" type="submit" disabled={!pode}>
          {aEsperar ? 'Um instante...' : 'Entrar'}
        </button>
      </div>

      <p className="notas porta-dica">
        {tinhaChaveAntiga(limpo)
          ? 'Este nome era teu neste browser. Escolhe-lhe um PIN agora, que passa a ser ele a prová-lo em qualquer telemóvel.'
          : 'Quatro a oito algarismos. Se o nome for novo, ou ainda não tiver PIN, fica com o que escreveres aqui.'}
      </p>

      {queixa && <p className="recado mal">{queixa}</p>}
    </form>
  );
}
