import { useState } from 'react';
import { trofeusDe, proximosTrofeus, type TrofeuDoJogador } from '../lib/trofeus';
import type { Estado, Pagina } from '../lib/tipos';
import { PedirTorroes } from './PedirTorroes';

const numero = (n: number) => n.toLocaleString('pt-PT');
function Medalha({ ganha = false }: { ganha?: boolean }) {
  return <svg viewBox="0 0 64 64" className={`pf-medalha${ganha ? ' ganha' : ''}`} aria-hidden="true"><path d="M14 5h14l8 22-13 6Z" fill="currentColor" opacity=".55"/><path d="M36 5h14L41 33l-13-6Z" fill="currentColor" opacity=".8"/><circle cx="32" cy="40" r="19" fill="none" stroke="currentColor" strokeWidth="3"/><circle cx="32" cy="40" r="14" fill="currentColor" opacity=".16"/><path d="m32 29 3 7 8 1-6 5 2 8-7-4-7 4 2-8-6-5 8-1Z" fill="currentColor"/></svg>;
}
function TrofeuEl({ trofeu: t }: { trofeu: TrofeuDoJogador }) {
  return <article className={`pf-trofeu${t.conquistado ? ' conquistado' : ''}`}>
    <Medalha ganha={t.conquistado}/><div><span className="rotulo">{t.categoria}</span><h3>{t.nome}</h3><p>{t.descricao}</p>
      <span className="pf-estado">{t.conquistado ? 'Conquistado' : `${numero(t.valor)} / ${numero(t.meta)}`}</span>
      {!t.conquistado && <progress value={Math.min(t.valor, t.meta)} max={t.meta} aria-label={`${t.nome}: ${numero(t.valor)} de ${numero(t.meta)}`} />}
    </div>
  </article>;
}
export function Perfil({ estado, nome, jogador, irPara, recarregar }: {
  estado: Estado; nome: string; jogador: string; irPara: (p: Pagina, procura?: string) => void; recarregar: () => void;
}) {
  const [filtro, setFiltro] = useState('Todos');
  const [busca, setBusca] = useState('');
  const [aviso, setAviso] = useState('');
  const escolhido = jogador || nome;
  const p = estado.ranking.find(linha => linha.nome === escolhido);
  const abrir = (quem: string) => { setFiltro('Todos'); setAviso(''); irPara('perfil', `nome=${encodeURIComponent(quem)}`); };
  const lista = estado.ranking.filter(l => l.nome.toLocaleLowerCase('pt-PT').includes(busca.toLocaleLowerCase('pt-PT'))).slice().sort((a, b) => a.nome.localeCompare(b.nome, 'pt-PT'));
  const trofeus = p ? trofeusDe(p) : [];
  const ganhos = trofeus.filter(t => t.conquistado);
  const categorias = ['Todos', 'Conquistados', 'Por conquistar', 'Torrões', 'Blackjack', 'Poker', 'Roleta', 'Apostas'];
  const aMostrar = trofeus.filter(t => filtro === 'Todos' || (filtro === 'Conquistados' ? t.conquistado : filtro === 'Por conquistar' ? !t.conquistado : t.categoria === filtro));
  const partilhar = async () => {
    try {
      const url = new URL('/perfil/', window.location.origin); url.searchParams.set('nome', escolhido);
      await navigator.clipboard.writeText(url.toString()); setAviso('Ligação do perfil copiada.');
    } catch { setAviso('Podes copiar o endereço desta página para partilhar o perfil.'); }
  };
  return <section className="pf">
    <p className="eyebrow">A malta do balcão</p><h1>Perfis e troféus</h1>
    <p className="lead">Cada nome tem a sua história. Os torrões vêm e vão; os marcos ficam.</p>
    <div className="pf-escolha">
      <label>Procurar jogador<input type="search" value={busca} onChange={e => setBusca(e.target.value)} placeholder="Nickname"/></label>
      <label>Ver perfil<select value={p?.nome || ''} onChange={e => abrir(e.target.value)}><option value="" disabled>Escolhe um jogador</option>{lista.map(l => <option key={l.nome} value={l.nome}>{l.nome}{l.nome === nome ? ' (tu)' : ''}</option>)}</select></label>
      {nome && <button className="btn claro mini" onClick={() => abrir(nome)}>O meu perfil</button>}
    </div>
    {!p ? <p className="vazio">{estado.ranking.length === 0 ? 'Ainda não há jogadores para mostrar. O perfil aparece depois de entrares com um nickname.' : escolhido ? 'Este jogador não aparece no quadro. Escolhe outro nome acima.' : 'Escolhe um jogador para ver as estatísticas e os troféus.'}</p> : <>
      <header className="pf-cabecalho"><div className="pf-avatar" aria-hidden="true">{p.nome.slice(0, 1).toLocaleUpperCase('pt-PT')}</div><div><p className="rotulo">{p.nome === nome ? 'O teu perfil' : 'Perfil do jogador'}</p><h2>{p.nome}</h2><p>{ganhos.length} de {trofeus.length} troféus conquistados</p></div><button className="btn claro mini" onClick={partilhar}>Copiar ligação</button></header>
      {aviso && <p role="status" className="notas">{aviso}</p>}
      <div className="pf-resumo"><article><span>Na carteira</span><b>{numero(p.torroes)}</b><small>torrões</small></article><article><span>Máximo atingido</span><b>{numero(p.pico)}</b><small>torrões</small></article><article><span>Troféus</span><b>{ganhos.length}</b><small>marcos conquistados</small></article></div>
      {p.nome === nome && <PedirTorroes nome={nome} saldo={p.torroes} aoReceber={() => recarregar()} />}
      <h2>À mesa</h2><div className="pf-estatisticas">
        <article><h3>Blackjack</h3><dl><dt>Mãos</dt><dd>{numero(p.maos)}</dd><dt>Vitórias</dt><dd>{numero(p.vitorias)}</dd><dt>Blackjacks</dt><dd>{numero(p.bjs)}</dd><dt>Taxa de vitória</dt><dd>{p.maos ? `${Math.round(p.vitorias / p.maos * 100)}%` : '—'}</dd></dl></article>
        <article><h3>Poker</h3><dl><dt>Mãos</dt><dd>{numero(p.poquer.maos)}</dd><dt>Vitórias</dt><dd>{numero(p.poquer.ganhas)}</dd><dt>Maior pote</dt><dd>{numero(p.poquer.maiorPote)}</dd></dl><p className="notas">As contas são atualizadas quando te levantas da mesa.</p></article>
        <article><h3>Roleta</h3><dl><dt>Rodadas</dt><dd>{numero(p.roleta.rodadas)}</dd><dt>Rodadas com prémio</dt><dd>{numero(p.roleta.ganhas)}</dd><dt>Maior prémio</dt><dd>{numero(p.roleta.maior)}</dd></dl></article>
        <article><h3>Apostas</h3><dl><dt>Feitas</dt><dd>{numero(p.desporto.apostas)}</dd><dt>Ganhas</dt><dd>{numero(p.desporto.ganhas)}</dd><dt>Maior prémio</dt><dd>{numero(p.desporto.maior)}</dd></dl></article>
      </div>
      <h2>Os outros recordes</h2><div className="pf-recordes"><p>O Cusco <b>{numero(p.recordes.cusco)}</b></p><p>À colherada <b>{numero(p.recordes.colherada)}</b></p><p>A fuga do balcão <b>{numero(p.recordes.jogo)}</b></p></div><p className="notas">Estes recordes vêm do browser. Os troféus abaixo usam apenas as contas dos jogos guardadas pelo servidor.</p>
      {proximosTrofeus(trofeus).length > 0 && <><h2>Os próximos marcos</h2><div className="pf-trofeus">{proximosTrofeus(trofeus).map(t => <TrofeuEl key={t.id} trofeu={t}/>)}</div></>}
      <h2>A prateleira dos troféus</h2><p className="notas">São conquistas visuais, sem prémios em torrões. O máximo atingido conta mesmo depois de perderes saldo.</p>
      <div className="qd-abas" aria-label="Filtrar troféus">{categorias.map(c => <button key={c} className={filtro === c ? 'aberta' : ''} aria-pressed={filtro === c} onClick={() => setFiltro(c)}>{c}</button>)}</div>
      <div className="pf-trofeus">{aMostrar.map(t => <TrofeuEl key={t.id} trofeu={t}/>)}</div>{aMostrar.length === 0 && <p className="vazio">Ainda não há troféus nesta seleção.</p>}
    </>}
  </section>;
}
