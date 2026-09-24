# meiadeleite.pt

Site do grupo **MEIadeLEIte**: blackjack, poker e roleta a torrões de açúcar, mural do Instagram
e agenda, com uma meia de leite a ser entornada a cada troca de página.

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

**A agenda e os membros** mudam-se na página de admin, em https://meiadeleite.pt/admin. Entras
com um código do Google Authenticator e mexes ali mesmo, sem commits.

As fotos dos membros são encolhidas no browser antes de subirem: ficam quadradas, com 480
pixels de lado, em JPEG. Uma foto de telemóvel passa de uns megabytes para uns 40 kB, que é o
que faz sentido guardar no KV.

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
| `GET /membros` | os membros, e `/membros/<id>/foto` a fotografia de cada um |
| `POST /quadro/entrar` | o nome e o PIN; devolve o passe deste aparelho |
| `POST /quadro/pin/apagar` | tira o PIN a um nome, com a chave de admin |
| `GET /poker` | quanta gente está em cada mesa, com `?mesas=a,b,c` |
| `GET /poker/<mesa>` | a ligação viva a uma mesa (WebSocket) |
| `POST /admin/entrar` | troca um código de 6 dígitos por uma chave de sessão, que dura 8 horas |
| `POST`, `PATCH`, `DELETE` em `/agenda` | marcar, mudar e apagar, com essa chave |
| `POST`, `PATCH`, `DELETE` em `/membros` | o mesmo, para os membros |

Ao fim de oito códigos errados o endereço fica dois minutos de castigo, para ninguém andar a
adivinhar os seis dígitos à bruta.

Sempre que se mexer no `worker/index.js` é preciso publicar outra vez, senão o site pede coisas
que o Worker ainda não sabe responder:

```bash
cd worker && npx wrangler deploy
```

### O banco, e os torrões

Os torrões são uns só e servem os três jogos onde é o servidor que dá as cartas: o blackjack, o
poker e a roleta. No poker as fichas de cada mesa são compradas à carteira e voltam para lá quando
alguém se levanta; na roleta as fichas saem da carteira e o que voltar entra nela.

Uma carteira partilhada não podia viver no KV. Ele é consistente só com o tempo, e quem se
sentasse em duas mesas ao mesmo tempo lia o mesmo saldo duas vezes e gastava os mesmos torrões
duas vezes. Por isso há um **Banco**, outro Durable Object: um sítio só, a atender um pedido de
cada vez, e daqui nunca sai um saldo negativo. Da primeira vez que arranca traz para dentro o
quadro que estava no KV; o que lá está fica lá, sem se lhe tocar, como rede por baixo da mudança.

Os jogos de um só jogador — o Cusco, a colherada e a fuga do balcão — **não pagam torrões**.
Correm todos dentro do browser e o servidor não tem como saber se alguém fez mesmo aqueles pontos:
pagá-los reabria o buraco que se fechou no blackjack. Entram no quadro com o recorde, e o quadro
diz de onde é que esse número vem.

### A Leader Board

Está em [meiadeleite.pt/quadro](https://meiadeleite.pt/quadro), a primeira da lista dos Jogos, e é
uma tabela por jogo com uma à vista de cada vez: torrões, blackjack, poker, roleta, e o recorde de
cada um dos outros três. Metê-las todas na mesma dava uma tabela de vinte colunas que ninguém lia.

### O nome de cada um, e o PIN

Quem joga escreve um nickname e um PIN de quatro a oito algarismos. Se o nome for novo, fica com
esse PIN. Se já existir e ainda não tiver PIN, fica com o primeiro que lhe puserem. Se já tiver,
é preciso acertá-lo.

O PIN nunca fica guardado: fica um resumo dele, com sal e com cento e vinte mil voltas. Quem
acerta recebe um **passe**, e é o passe que fica no browser daí em diante, por seis meses. Assim
o PIN escreve-se uma vez por aparelho e não anda a viajar a cada jogada, e quem mudar de
telemóvel volta a entrar no seu nome — o que com o sistema antigo, em que a prova vivia só no
browser que estreasse o nome, não dava.

Um PIN de quatro algarismos são dez mil hipóteses, o que a um computador não é nada. Quem o
defende a sério é o limite de tentativas: **cinco enganos e o nome fica quinze minutos de
castigo**, mesmo para quem acerte à sexta. Há também um limite por endereço, mas folgado, porque
o grupo sai todo pelo mesmo Wi-Fi.

Se alguém se meter no nome de outra pessoa, o remédio está no painel de admin: **Limpar PIN**
tira o PIN daquele nome e deita fora os passes todos. O nome fica outra vez à espera de um PIN e
os torrões não se mexem.

### As mesas de poker

Cada mesa é um **Durable Object**, e não uma chave no KV. O KV é consistente com o tempo: duas
jogadas ao mesmo tempo podiam ler a mesa como ela estava há um instante e gravar uma por cima
da outra, o que numa mesa com cinco pessoas era o suficiente para dar cartas a mais. Um Durable
Object é um sítio só, a atender um pedido de cada vez, com as ligações de quem lá está agarradas
a ele.

Isso quer dizer que o Worker precisa do plano pago da Cloudflare. A ligação `[[durable_objects]]`
e a migração estão no [`wrangler.toml`](worker/wrangler.toml) e publicam-se com o resto:

```bash
cd worker && npx wrangler deploy
```

As mesas são cinco, uma por membro, e o nome de cada uma é `m-<id do membro>`. Mudar a ordem dos
membros muda a quem pertence cada mesa, e as fichas de uma mesa vivem nela: são compradas ali e
não mexem no quadro de honra do blackjack.

Um lugar não fica tomado por quem já lá não está. Quem deixa passar a vez três vezes seguidas
sai da mesa, e quem está oito minutos sentado sem fazer nada também; a segunda vez que se deixa
passar já só dá dez segundos em vez de trinta, para a mesa não ficar meio minuto parada de cada
vez. Quem está a ver sem jogar tem um botão para dizer que ainda ali está.

### As provas

As regras do Hold'em estão em [`worker/poker.js`](worker/poker.js), sem saberem nada de rede, e
provam-se sozinhas:

```bash
npm run provas
```

São as do Hold'em e as da roleta. As da roleta correm duzentas mil rodadas para confirmar que a
casa fica com perto de 2,7 por cento e que nenhuma casa da roda sai mais vezes do que as outras.

As outras precisam do Worker a correr ao lado, e falam com ele a sério:

```bash
cd worker && npx wrangler dev --port 8787 --local
npm run provas-ao-vivo
```

São a porta de entrada (PINs, tentativas, limpar o PIN), o banco e a roleta (os torrões que não
se inventam, as apostas que não passam, os recordes que não valem dinheiro), uma mesa com três
ligações (as cartas dos outros, jogar fora da vez, as fichas contadas do princípio ao fim da mão,
e a ida e volta das fichas à carteira) e o lugar de quem deixa de jogar. As duas últimas precisam de um autenticador conhecido para entrar no admin: põe
um `worker/.dev.vars` com `TOTP_SEGREDO=JBSWY3DPEHPK3PXP`, que esse ficheiro não entra no
repositório.

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
