import { useRef, useState } from 'react';
import { api } from '../lib/api';
import { passeDe } from '../lib/nick';
import type { Pontuacao } from '../lib/tipos';

export function PedirTorroes({ nome, saldo, aoReceber, bloqueado = false }: {
  nome: string; saldo: number | null; aoReceber: (linha: Pontuacao) => void; bloqueado?: boolean;
}) {
  const [ocupado, setOcupado] = useState(false);
  const [recado, setRecado] = useState('');
  const pedido = useRef(false);
  if (!nome || saldo === null || saldo >= 5 || !passeDe(nome)) return null;
  async function pedir() {
    if (pedido.current || bloqueado) return;
    pedido.current = true; setOcupado(true); setRecado('');
    try { aoReceber((await api.emprestimo(nome, passeDe(nome))).linha); }
    catch (e) { setRecado(e instanceof Error ? e.message : 'Não deu para pedir torrões.'); }
    finally { pedido.current = false; setOcupado(false); }
  }
  return <div className="pedir-torroes">
    <button type="button" className="btn claro mini" disabled={ocupado || bloqueado} onClick={pedir}>
      {ocupado ? 'A pedir ao Amílcar…' : 'Pedir 100 emprestados ao Amílcar'}
    </button>
    {recado && <p className="recado mal" role="status">{recado}</p>}
  </div>;
}
