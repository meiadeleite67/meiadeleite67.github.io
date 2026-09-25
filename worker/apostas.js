/**
 * As apostas desportivas: as regras, sem nada à volta.
 *
 * Aqui não se vai buscar nada a lado nenhum nem se escreve nada em sítio
 * nenhum. Entra o que o site pediu e o que a feed disse, e sai o que é para
 * fazer. É de propósito: assim isto prova-se todo em segundos, sem servidor,
 * sem chave de API e sem esperar que haja jogos a sério esta semana.
 *
 * A diferença para a roleta é o tempo. Na roleta aposta-se e sabe-se logo. Aqui
 * aposta-se hoje e o jogo acaba amanhã, e por isso há dois momentos: o de pôr a
 * aposta, que tira os torrões já, e o de a fechar, que os devolve com o prémio
 * ou não devolve nada. O que acontece entre um e outro é tempo a passar.
 *
 * A cotação fica guardada dentro da aposta. É a que estava no momento em que se
 * apostou, e não a que estiver quando o jogo acabar. É assim numa casa de
 * apostas e é a única maneira honesta: de outra forma o prémio mudava depois de
 * a pessoa já não poder fazer nada quanto a ele.
 */

/** Quanto se pode pôr numa aposta. */
export const APOSTA_MINIMA = 5;
export const APOSTA_MAXIMA = 500;

/** Quantas apostas por fechar uma pessoa pode ter ao mesmo tempo. Não é regra
 *  de jogo, é para a memória do banco não crescer sem fim. */
export const ABERTAS_NO_MAXIMO = 25;

/** Uma cotação abaixo disto não paga nada de jeito, e acima disto é sinal de
 *  que a feed se enganou. Serve de rede nos dois sentidos. */
const COTACAO_MINIMA = 1.01;
const COTACAO_MAXIMA = 1000;

/** Um jogo que nunca mais acaba devolve o que se pôs. Sete dias depois da hora
 *  marcada é tempo que chegue para qualquer desporto: se a esta altura a feed
 *  ainda não disse que acabou, foi adiado, cancelado ou deixou de ser seguido,
 *  e ninguém tem de ficar sem os torrões por causa disso. */
export const DESISTE_AO_FIM_DE = 7 * 24 * 60 * 60 * 1000;

/** As três coisas em que se pode apostar num jogo. O empate só existe onde
 *  existe: no ténis e no basquetebol alguém tem de ganhar. */
export const ESCOLHAS = ['casa', 'fora', 'empate'];

const inteiro = (n) => (Number.isFinite(+n) ? Math.trunc(+n) : 0);

/** Quanto volta à carteira se a aposta acertar, o que se pôs incluído. */
export const quantoPaga = (quanto, cotacao) => Math.round(inteiro(quanto) * cotacao);

/**
 * Um jogo como o site o mostra, a partir do que a feed deu.
 *
 * Devolve nada se o jogo não servir para apostar: sem cotações, já começado,
 * ou com uma cotação que não faz sentido nenhum. Mais vale não mostrar um jogo
 * do que mostrar um que vai dar erro quando alguém lhe tocar.
 */
export function jogoDaFeed(cru, agora = Date.now()) {
  if (!cru || typeof cru !== 'object') return null;
  const id = String(cru.id || '');
  const casa = String(cru.home_team || '');
  const fora = String(cru.away_team || '');
  const comeca = Date.parse(cru.commence_time);
  if (!id || !casa || !fora || !Number.isFinite(comeca)) return null;

  /* Só jogos que ainda não começaram. Apostar em jogos a decorrer daria a quem
     estivesse a ver televisão uma vantagem que não é para aqui chamada. */
  if (comeca <= agora) return null;

  const cotacoes = cotacoesDe(cru, casa, fora);
  if (!cotacoes) return null;

  return {
    id,
    /* A chave da liga na feed, que e por onde se pedem os resultados depois.
       O nome bonito do desporto vem por cima, de quem foi buscar isto. */
    chave: String(cru.sport_key || ''),
    liga: String(cru.sport_title || ''),
    casa,
    fora,
    comeca: new Date(comeca).toISOString(),
    cotacoes
  };
}

/**
 * As cotações de um jogo.
 *
 * A feed traz o mesmo jogo por várias casas de apostas, cada uma com o seu
 * preço. Fica-se pela primeira que tenha o mercado inteiro, em vez de se andar
 * à procura da melhor: escolher sempre a mais alta dava um site onde a casa
 * perde de certeza, o que com torrões não custa nada mas também não se parece
 * com nada.
 */
function cotacoesDe(cru, casa, fora) {
  const casas = Array.isArray(cru.bookmakers) ? cru.bookmakers : [];
  for (const b of casas) {
    const mercado = (Array.isArray(b.markets) ? b.markets : []).find((m) => m.key === 'h2h');
    if (!mercado || !Array.isArray(mercado.outcomes)) continue;

    const preco = (nome) => {
      const achado = mercado.outcomes.find((o) => o && o.name === nome);
      const p = achado ? +achado.price : NaN;
      return Number.isFinite(p) && p >= COTACAO_MINIMA && p <= COTACAO_MAXIMA ? p : null;
    };

    const emCasa = preco(casa);
    const laFora = preco(fora);
    if (emCasa === null || laFora === null) continue;

    /* O empate vem com este nome e só nos desportos que o têm. Onde não vier,
       não se inventa: o site mostra dois botões em vez de três. */
    const empate = preco('Draw');
    return empate === null
      ? { casa: emCasa, fora: laFora }
      : { casa: emCasa, fora: laFora, empate };
  }
  return null;
}

/**
 * Confere uma aposta antes de ela sair da carteira.
 *
 * Tudo o que aqui se confirma tem de ser confirmado outra vez do lado do
 * servidor, e é por isso que a cotação não vem do site: vem do jogo que o
 * servidor tem à frente. Se viesse do site, bastava mexer no pedido para
 * apostar a cinquenta para um.
 */
export function limparAposta(veio, jogo, saldo, jaAbertas = 0) {
  if (!jogo) return { erro: 'Esse jogo já não está aberto a apostas.' };

  const escolha = String(veio?.escolha || '');
  if (!ESCOLHAS.includes(escolha)) return { erro: 'Aposta inválida.' };

  const cotacao = jogo.cotacoes[escolha];
  if (!cotacao) return { erro: 'Nesse jogo não se aposta nisso.' };

  const quanto = inteiro(veio?.quanto);
  if (quanto < APOSTA_MINIMA) return { erro: `A aposta mais pequena é de ${APOSTA_MINIMA}.` };
  if (quanto > APOSTA_MAXIMA) return { erro: `Não se pode pôr mais de ${APOSTA_MAXIMA} de uma vez.` };
  if (quanto > saldo) return { erro: 'Não tens torrões que cheguem.' };

  if (jaAbertas >= ABERTAS_NO_MAXIMO)
    return { erro: `Já tens ${ABERTAS_NO_MAXIMO} apostas por fechar. Espera que alguma acabe.` };

  if (Date.parse(jogo.comeca) <= Date.now())
    return { erro: 'Esse jogo já começou.' };

  return { escolha, quanto, cotacao };
}

/**
 * Quem ganhou, a partir do resultado que a feed deu.
 *
 * Devolve nada enquanto o jogo não estiver mesmo acabado e com resultado, que
 * é quando ainda não há nada a decidir. Um jogo dado como acabado mas sem
 * resultado nenhum conta como não acabado: mais vale esperar do que pagar a
 * quem não ganhou.
 */
export function quemGanhou(cru, casa, fora) {
  if (!cru || cru.completed !== true) return null;
  const marcas = Array.isArray(cru.scores) ? cru.scores : [];
  const marca = (nome) => {
    const achado = marcas.find((m) => m && m.name === nome);
    const n = achado ? Number(achado.score) : NaN;
    return Number.isFinite(n) ? n : null;
  };
  const emCasa = marca(casa);
  const laFora = marca(fora);
  if (emCasa === null || laFora === null) return null;
  return emCasa > laFora ? 'casa' : laFora > emCasa ? 'fora' : 'empate';
}

/**
 * O que fazer a uma aposta, agora.
 *
 * Três saídas: ainda nada, ganhou, ou acabou sem ser a favor dela. Uma aposta
 * anulada devolve o que se pôs e não conta para as contas de ninguém, que não
 * foi ganha nem perdida: o jogo é que não se fez.
 */
export function fecharAposta(aposta, ganhou, agora = Date.now()) {
  if (aposta.estado !== 'aberta') return null;

  if (ganhou === null || ganhou === undefined) {
    /* O jogo não acabou, ou acabou e a feed não diz quem ganhou. Espera-se,
       mas não para sempre. */
    const marcada = Date.parse(aposta.comeca);
    if (Number.isFinite(marcada) && agora - marcada > DESISTE_AO_FIM_DE)
      return { estado: 'anulada', volta: aposta.quanto, lucro: 0 };
    return null;
  }

  /* Um empate onde não se podia apostar no empate devolve o que se pôs, como
     fazem as casas de apostas. Não é generosidade: quem apostou num dos dois
     não teve maneira nenhuma de se defender disto. */
  if (ganhou === 'empate' && !aposta.tinhaEmpate)
    return { estado: 'anulada', volta: aposta.quanto, lucro: 0 };

  if (ganhou === aposta.escolha) {
    const volta = quantoPaga(aposta.quanto, aposta.cotacao);
    return { estado: 'ganha', volta, lucro: volta - aposta.quanto };
  }
  return { estado: 'perdida', volta: 0, lucro: -aposta.quanto };
}
