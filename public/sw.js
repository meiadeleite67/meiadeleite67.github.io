/**
 * O que faz o site existir sem internet.
 *
 * Um site estático normal, sem rede, não é nada: o browser não chega a
 * descarregar nada e mostra a sua própria página de erro, que é onde mora o
 * dinossauro. Isto mete-se pelo meio: guarda o site no browser à medida que
 * ele vai sendo usado e, quando a rede falta, serve o que tem guardado. É por
 * isso que o jogo aparece em vez da página de erro.
 *
 * Três regras, conforme o que se pede:
 *
 *   paginas      rede primeiro, e sem rede vale a última que ficou guardada.
 *                Assim, logo que a rede volte, ninguém fica preso a uma versão
 *                velha do site.
 *   /conteudo/   idem: é a agenda, o mural e o resto, que muda.
 *   o resto      guardado primeiro, porque os ficheiros do build trazem o
 *                código no nome e um nome novo é sempre um ficheiro novo.
 *                Vai à rede por trás, para a próxima visita já ter o mais
 *                recente.
 */

const CACHE = 'mdl-v1';
const ESSENCIAIS = ['/', '/jogo/', '/favicon.svg'];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches
      .open(CACHE)
      // se algum destes falhar, não vale a pena deitar a instalação abaixo
      .then((c) => Promise.allSettled(ESSENCIAIS.map((u) => c.add(u))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((nomes) => Promise.all(nomes.filter((n) => n !== CACHE).map((n) => caches.delete(n))))
      .then(() => self.clients.claim())
  );
});

function guardar(pedido, resposta) {
  if (!resposta) return;
  const nossa = resposta.ok && resposta.type === 'basic';
  /* As fotos dos membros vêm do servidor da agenda, que é outra origem: a
     resposta chega fechada e não dá para ver se correu bem. Guarda-se na
     mesma, porque é o que põe as caras no jogo quando não há rede. */
  const fotoDeFora = resposta.type === 'opaque' && pedido.destination === 'image';
  if (!nossa && !fotoDeFora) return;
  caches.open(CACHE).then((c) => c.put(pedido, resposta));
}

async function doQueHa(pedido, alternativa) {
  const guardada = await caches.match(pedido, { ignoreSearch: true });
  if (guardada) return guardada;
  if (alternativa) {
    const outra = await caches.match(alternativa);
    if (outra) return outra;
  }
  return Response.error();
}

self.addEventListener('fetch', (e) => {
  const pedido = e.request;
  if (pedido.method !== 'GET') return;

  const url = new URL(pedido.url);
  if (url.origin !== self.location.origin) {
    if (pedido.destination !== 'image') return;
    e.respondWith(
      caches.match(pedido).then(
        (guardada) =>
          guardada ||
          fetch(pedido)
            .then((r) => {
              guardar(pedido, r.clone());
              return r;
            })
            .catch(() => Response.error())
      )
    );
    return;
  }

  const eNavegacao = pedido.mode === 'navigate';
  const eConteudo = url.pathname.startsWith('/conteudo/');

  if (eNavegacao || eConteudo) {
    e.respondWith(
      fetch(pedido)
        .then((r) => {
          guardar(pedido, r.clone());
          return r;
        })
        .catch(() => doQueHa(pedido, eNavegacao ? '/' : null))
    );
    return;
  }

  e.respondWith(
    caches.match(pedido).then((guardada) => {
      const daRede = fetch(pedido)
        .then((r) => {
          guardar(pedido, r.clone());
          return r;
        })
        .catch(() => guardada || Response.error());
      return guardada || daRede;
    })
  );
});
