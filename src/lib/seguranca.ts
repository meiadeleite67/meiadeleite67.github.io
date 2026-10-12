type Turnstile = {
  render: (el: HTMLElement, options: Record<string, unknown>) => string;
  remove: (id: string) => void;
};
let script: Promise<Turnstile> | null = null;
let verificacao: Promise<string> | null = null;
let visita = '';
let ate = 0;
let bloqueadoAte = 0;
export function adiarPedidos(segundos: number) {
  bloqueadoAte = Math.max(bloqueadoAte, Date.now() + segundos * 1000);
}
export function confirmarEspera() {
  if (bloqueadoAte > Date.now()) throw new Error(`Espera ${Math.ceil((bloqueadoAte - Date.now()) / 1000)} segundos antes de voltar a tentar.`);
}
export function esquecerVisita() { visita = ''; ate = 0; }
function carregarScript(): Promise<Turnstile> {
  if (script) return script;
  script = new Promise((resolve, reject) => {
    const el = document.createElement('script');
    el.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
    el.async = true;
    el.onload = () => resolve((window as unknown as { turnstile: Turnstile }).turnstile);
    el.onerror = () => { script = null; el.remove(); reject(new Error('Não foi possível carregar a verificação de segurança.')); };
    document.head.appendChild(el);
  });
  return script;
}
export async function confirmarVisita(base: string, sitekey: string): Promise<string> {
  confirmarEspera();
  if (visita && ate > Date.now() + 5000) return visita;
  if (verificacao) return verificacao;
  verificacao = (async () => {
    if (!sitekey) throw new Error('Recarrega a página para atualizar a proteção do site.');
    const turnstile = await carregarScript();
    return new Promise<string>((resolve, reject) => {
      const dialogo = document.createElement('dialog');
      dialogo.className = 'seguranca-dialogo';
      const titulo = document.createElement('h2'); titulo.textContent = 'Só confirmar que és tu';
      const texto = document.createElement('p'); texto.textContent = 'Estamos a proteger os jogos de bots. Aguarda a verificação.';
      const widget = document.createElement('div');
      const cancelar = document.createElement('button'); cancelar.className = 'btn claro'; cancelar.textContent = 'Fechar';
      dialogo.append(titulo, texto, widget, cancelar); document.body.appendChild(dialogo); dialogo.showModal();
      let id: string | undefined;
      let terminado = false;
      const concluir = (erro?: Error) => {
        if (terminado) return; terminado = true;
        clearTimeout(prazo); if (id !== undefined) turnstile.remove(id); dialogo.remove();
        if (erro) reject(erro); else resolve(visita);
      };
      const prazo = window.setTimeout(() => concluir(new Error('A verificação expirou. Tenta outra vez.')), 120000);
      cancelar.onclick = () => concluir(new Error('Verificação cancelada.'));
      dialogo.addEventListener('cancel', () => concluir(new Error('Verificação cancelada.')));
      id = turnstile.render(widget, {
        sitekey, action: 'site', language: 'pt',
        callback: async (token: string) => {
          try {
            const r = await fetch(base + '/seguranca/verificar', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token }) });
            const dados = await r.json();
            if (!r.ok) { if (r.status === 429) adiarPedidos(Number(r.headers.get('Retry-After')) || 60); throw new Error(dados.erro || 'A verificação falhou.'); }
            if (terminado) return;
            visita = dados.visita; ate = dados.ate; concluir();
          } catch (e) { concluir(e instanceof Error ? e : new Error('A verificação falhou.')); }
        },
        'error-callback': () => { concluir(new Error('A verificação falhou. Tenta outra vez.')); return true; },
        'expired-callback': () => concluir(new Error('A verificação expirou. Tenta outra vez.'))
      });
    });
  })();
  try { return await verificacao; } finally { verificacao = null; }
}
