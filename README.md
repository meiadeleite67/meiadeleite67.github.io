# meiadeleite.pt

Site do grupo **MEIadeLEIte**: blackjack a torrões de açúcar, mural do Instagram e agenda,
com uma meia de leite a ser entornada a cada troca de página.

Feito em React com Vite. Está publicado no GitHub Pages: cada push para `main` constrói e
publica sozinho.

## Correr aqui no computador

```bash
npm install
npm run dev
```

Abre em http://localhost:5173. Para ver exatamente o que vai para o ar:

```bash
npm run build
npm run preview
```

## Mudar o que está no site

Não há página de administração: o GitHub Pages só entrega ficheiros e não corre programas.
O conteúdo é um ficheiro, e mexer nele é publicar.

**A agenda e o mural** estão em [`public/conteudo/estado.json`](public/conteudo/estado.json).
Editas, fazes commit, e o site atualiza-se em dois ou três minutos.

Um evento é assim:

```json
{
  "id": "jantar-natal",
  "titulo": "Jantar de Natal",
  "data": "2026-12-12",
  "hora": "20:30",
  "sitio": "A combinar",
  "tipo": "jantar",
  "notas": "Levem dinheiro trocado.",
  "criadoEm": "2026-09-22T00:00:00.000Z"
}
```

O `tipo` é um de `copos`, `jantar`, `estudo`, `exame`, `festa`, `cozinha`, `outro`. Cada um
tem a sua cor no calendário.

Uma publicação do Instagram é assim:

```json
{
  "id": "DdEBMy7DJtL",
  "url": "https://www.instagram.com/p/DdEBMy7DJtL/",
  "formato": "album",
  "data": "2026-09-09",
  "legenda": "...",
  "temImagem": true,
  "slides": 2
}
```

O `id` é o código que aparece no endereço da publicação. O `formato` é `foto`, `reel` ou
`album`. A capa é `public/media/<id>.jpg`; as fotos de um álbum são `<id>-1.jpg`, `<id>-2.jpg`,
e por aí fora, e o `slides` diz quantas são. Os reels abrem no leitor do próprio Instagram, que
é o único sítio onde o vídeo toca.

## O quadro de honra

O blackjack joga-se no browser, mas as pontuações têm de ser gravadas nalgum lado. Quem grava
é um Worker da Cloudflare, o código está em [`worker/`](worker/). Montagem, uma vez só:

```bash
cd worker
npx wrangler kv namespace create QUADRO
```

Mete o `id` que ele devolve no `wrangler.toml`, e depois:

```bash
npx wrangler deploy
```

Fica com um endereço do género `https://meiadeleite-quadro.<conta>.workers.dev`. Copia-o para
o campo `quadro` em [`public/conteudo/config.json`](public/conteudo/config.json), faz commit, e
o quadro passa a ser o mesmo para toda a gente.

Enquanto esse campo estiver vazio o site funciona na mesma: os torrões ficam guardados só no
browser de cada um e a tabela avisa que ainda não está ligada.

O Worker não tem palavras-passe: quem souber o endereço consegue escrever no quadro. Para
torrões de açúcar entre amigos, chega bem.

## O domínio

O `CNAME` aponta para `meiadeleite.pt`. Para o domínio funcionar, nas definições do repositório,
em Pages, o Source tem de estar em **GitHub Actions** e o Custom domain preenchido com
`meiadeleite.pt`.

No DNS do domínio ficam os registos que o GitHub pede: quatro `A` para o apex e um `CNAME` do
`www` para `meiadeleite67.github.io`. Se o DNS passar a ser gerido pela Cloudflare, esses
registos têm de ficar com o proxy desligado (nuvem cinzenta), senão o GitHub não consegue
emitir o certificado.

## O que aqui não está

Houve uma versão com servidor próprio, com página de administração protegida por Google
Authenticator e sincronização automática com a API do Instagram. Isso precisa de uma máquina
sempre ligada, coisa que o GitHub Pages não é, por isso ficou de fora. O código dessa versão
está na pasta `meia-de-leite`, ao lado desta.
