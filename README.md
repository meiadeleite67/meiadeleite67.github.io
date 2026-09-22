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

**A agenda** muda-se na página de admin, em https://meiadeleite.pt/admin. Entras com um código
do Google Authenticator e marcas ou apagas eventos ali mesmo, sem commits.

**O mural** está em [`public/conteudo/estado.json`](public/conteudo/estado.json). Editas, fazes
commit, e o site atualiza-se em dois ou três minutos.

Uma publicação é assim:

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

O `estado.json` também tem uma agenda: é a que o site mostra enquanto o Worker não tiver
nenhuma guardada. Na primeira vez que entrares no admin, o botão "Trazer a agenda do ficheiro"
leva-a para lá.

## O servidor do grupo

O GitHub Pages só entrega ficheiros. Tudo o que precisa de ser gravado (o quadro de honra do
blackjack, a agenda, a entrada no admin) vive num Worker da Cloudflare, e o código está em
[`worker/`](worker/).

### Montar, uma vez só

**1. O sítio onde as coisas ficam guardadas:**

```bash
cd worker
npx wrangler kv namespace create QUADRO
```

Mete o `id` que ele devolve no `wrangler.toml`.

**2. O autenticador**, a partir da raiz do projeto:

```bash
npm run admin
```

Apaga primeiro na app as entradas antigas com o nome "Meia de Leite", lê o QR que aparece no
terminal, e está feito: o comando entrega a chave ao Worker sozinho.

O wrangler vem instalado com o `npm install`, por isso os comandos com `npx wrangler` usam essa
cópia e não andam a descarregar nada.

Não há nada para copiar nem colar, e isso é de propósito. Colar a chave à mão no
`wrangler secret put` é onde isto costuma partir-se: o terminal nem sempre recebe o paste
inteiro, a chave fica cortada, e depois nenhum código da app bate certo sem se perceber porquê.

A chave nunca entra no repositório. Vive como segredo do Worker e, por omissão, nem sequer
aparece escrita no terminal — só o QR. Se precisares dela para a meter à mão noutro telemóvel,
corre `npm run admin -- --mostrar-chave`, mas trata-a como uma palavra-passe: quem a tiver entra
no admin. Correr o comando outra vez inventa uma chave nova e a anterior deixa de servir.

**3. Publicar:**

```bash
cd worker && npx wrangler deploy
```

No fim ele diz o endereço, do género `https://meiadeleite-quadro.<conta>.workers.dev`. Esse
endereço vai para o campo `quadro` em
[`public/conteudo/config.json`](public/conteudo/config.json).

O `wrangler.toml` tem, comentada, uma rota alternativa para o Worker atender em
`meiadeleite.pt/api`, no próprio domínio. Fica na mesma origem do site e dispensa CORS, mas o
`workers.dev` funciona tal e qual.

Enquanto o Worker não estiver publicado o site funciona na mesma: mostra a agenda do ficheiro,
os torrões ficam no browser de cada um e o `/admin` diz que não há por onde entrar.

### O que o Worker aceita

| | |
| --- | --- |
| `GET /quadro` | o quadro de honra |
| `PUT /quadro` | grava a pontuação de um nome |
| `GET /agenda` | a agenda |
| `POST /admin/entrar` | troca um código de 6 dígitos por uma chave de sessão, que dura 8 horas |
| `POST`, `PATCH`, `DELETE` em `/agenda` | marcar, mudar e apagar, com essa chave |

Ao fim de oito códigos errados o endereço fica dois minutos de castigo, para ninguém andar a
adivinhar os seis dígitos à bruta.

## O domínio

O `CNAME` aponta para `meiadeleite.pt`. Para o domínio funcionar, nas definições do repositório,
em Pages, o Source tem de estar em **GitHub Actions** e o Custom domain preenchido com
`meiadeleite.pt`.

O DNS é gerido pela Cloudflare, com o proxy ligado (nuvem laranja). É a Cloudflare que trata do
certificado e serve o site a partir do GitHub Pages. Se algum dia desligarem o proxy, é preciso
deixar o GitHub emitir o certificado dele, o que só acontece com os registos expostos: quatro
`A` para o apex e um `CNAME` do `www` para `meiadeleite67.github.io`.

## O que aqui não está

A sincronização automática com a API do Instagram, que existia na versão com servidor próprio.
Precisa de um token da Meta e de alguém a ir buscar as publicações de tempos a tempos. O código
dessa versão está na pasta `meia-de-leite`, ao lado desta.
