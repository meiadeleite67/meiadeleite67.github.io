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
 *
 * Uma aposta tem uma perna ou tem várias. Uma perna é uma simples; várias são
 * uma múltipla, em que as cotações se multiplicam umas pelas outras e todas
 * têm de acertar. É por isso que tudo aqui dentro fala em pernas mesmo quando
 * só há uma: assim há um caminho só, e não dois caminhos parecidos que é
 * preciso manter iguais à mão.
 */

/** Quanto se pode pôr numa aposta. */
export const APOSTA_MINIMA = 5;
export const APOSTA_MAXIMA = 500;

/** Quantas apostas por fechar uma pessoa pode ter ao mesmo tempo. Não é regra
 *  de jogo, é para a memória do banco não crescer sem fim. */
export const ABERTAS_NO_MAXIMO = 25;

/** Quantos jogos cabem numa múltipla. Oito já é uma cotação de quatro dígitos
 *  e a probabilidade de acertar é quase nenhuma, que é meio graça. */
export const PERNAS_NO_MAXIMO = 8;

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

/** Duas casas, que é como as cotações se escrevem. Sem isto, multiplicar três
 *  pernas dava um número com dezasseis casas decimais. */
const aDuasCasas = (n) => Math.round(n * 100) / 100;

/** Quanto volta à carteira se a aposta acertar, o que se pôs incluído. */
export const quantoPaga = (quanto, cotacao) => Math.round(inteiro(quanto) * cotacao);

/** A cotação de um bilhete: as das pernas todas multiplicadas umas pelas
 *  outras. Com uma perna só, é a dela. */
export const cotacaoDe = (pernas) =>
  aDuasCasas(pernas.reduce((tudo, p) => tudo * p.cotacao, 1));

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
    /* A chave da liga na feed, que é por onde se pedem os resultados depois.
       O nome bonito do desporto vem por cima, de quem foi buscar isto. */
    chave: String(cru.sport_key || ''),
    liga: String(cru.sport_title || ''),
    casa,
    fora,
    comeca: new Date(comeca).toISOString(),
    cotacoes,
    /* Quantas casas de apostas deram preço a este jogo, e qual foi a que se
       usou. Não muda nada no jogo; serve para a página de detalhe poder dizer
       de onde veio o número, em vez de o mostrar como se tivesse caído do céu. */
    casasDeApostas: (Array.isArray(cru.bookmakers) ? cru.bookmakers : []).length,
    fonte: cotacoes.fonte || ''
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
    const fonte = String(b.title || b.key || '');
    return empate === null
      ? { casa: emCasa, fora: laFora, fonte }
      : { casa: emCasa, fora: laFora, empate, fonte };
  }
  return null;
}

/**
 * Confere um bilhete antes de ele sair da carteira.
 *
 * Recebe as escolhas como o site as mandou e os jogos como o servidor os tem.
 * As cotações saem sempre dos jogos do servidor e nunca do que o site mandou:
 * se viessem de lá, bastava mexer no pedido para apostar a cinquenta para um.
 */
export function limparBilhete(veio, jogosPorId, saldo, jaAbertas = 0, agora = Date.now()) {
  const vieram = Array.isArray(veio?.pernas) ? veio.pernas : [];
  if (vieram.length === 0) return { erro: 'Não escolheste nada.' };
  if (vieram.length > PERNAS_NO_MAXIMO)
    return { erro: `Uma múltipla leva ${PERNAS_NO_MAXIMO} jogos no máximo.` };

  const pernas = [];
  const jaLa = new Set();

  for (const veioPerna of vieram) {
    const jogo = jogosPorId.get(String(veioPerna?.jogo || ''));
    if (!jogo) return { erro: 'Um dos jogos já não está aberto a apostas.' };

    /* Duas escolhas do mesmo jogo numa múltipla não podem ser: ou se excluem
       uma à outra, e nunca acertava, ou andavam juntas, e não era aposta
       nenhuma. As casas de apostas também não deixam. */
    if (jaLa.has(jogo.id)) return { erro: 'Não podes pôr o mesmo jogo duas vezes na múltipla.' };
    jaLa.add(jogo.id);

    const escolha = String(veioPerna?.escolha || '');
    if (!ESCOLHAS.includes(escolha)) return { erro: 'Aposta inválida.' };

    const cotacao = jogo.cotacoes[escolha];
    if (!cotacao) return { erro: 'Nesse jogo não se aposta nisso.' };
    if (Date.parse(jogo.comeca) <= agora) return { erro: `O ${jogo.casa} - ${jogo.fora} já começou.` };

    pernas.push({
      jogo: jogo.id,
      chave: jogo.chave,
      /* De que fonte veio o jogo. E isto que deixa trocar de fonte sem estragar
         as apostas ja feitas: cada perna fecha-se por onde nasceu, e as que
         vem de antes da troca nao tem isto posto. */
      fonte: jogo.fonte || '',
      desporto: jogo.desporto || '',
      liga: jogo.liga || '',
      casa: jogo.casa,
      fora: jogo.fora,
      comeca: jogo.comeca,
      escolha,
      cotacao,
      /* Se neste jogo se podia apostar no empate. Fica guardado com a perna
         porque é o que decide, lá mais para a frente, se um empate a anula ou
         se a faz perder, e a essa altura o jogo já não está à mão. */
      tinhaEmpate: !!jogo.cotacoes.empate,
      estado: 'aberta'
    });
  }

  const quanto = inteiro(veio?.quanto);
  if (quanto < APOSTA_MINIMA) return { erro: `A aposta mais pequena é de ${APOSTA_MINIMA}.` };
  if (quanto > APOSTA_MAXIMA) return { erro: `Não se pode pôr mais de ${APOSTA_MAXIMA} de uma vez.` };
  if (quanto > saldo) return { erro: 'Não tens torrões que cheguem.' };

  if (jaAbertas >= ABERTAS_NO_MAXIMO)
    return { erro: `Já tens ${ABERTAS_NO_MAXIMO} apostas por fechar. Espera que alguma acabe.` };

  return { pernas, quanto, cotacao: cotacaoDe(pernas) };
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
 * O que acontece a uma perna, agora.
 *
 * Três saídas, e uma quarta que é não haver saída nenhuma: ganha, perdida,
 * anulada, ou ainda nada. Anulada é a que não chegou a valer, e vale 1,00 na
 * conta da múltipla: não faz perder o bilhete todo, mas também não o paga.
 */
function fecharPerna(perna, ganhou, agora) {
  if (perna.estado !== 'aberta') return perna.estado;

  if (ganhou === null || ganhou === undefined) {
    /* O jogo não acabou, ou acabou e a feed não diz quem ganhou. Espera-se,
       mas não para sempre. */
    const marcada = Date.parse(perna.comeca);
    if (Number.isFinite(marcada) && agora - marcada > DESISTE_AO_FIM_DE) return 'anulada';
    return null;
  }

  /* Um empate onde não se podia apostar no empate não faz perder ninguém: quem
     pôs num dos dois não teve maneira nenhuma de se defender disto. É o que as
     casas de apostas fazem, e é o que faz sentido. */
  if (ganhou === 'empate' && !perna.tinhaEmpate) return 'anulada';

  return ganhou === perna.escolha ? 'ganha' : 'perdida';
}

/**
 * O que fazer a um bilhete, agora.
 *
 * Uma múltipla é tudo ou nada: basta uma perna perdida para o bilhete acabar
 * ali, e nesse caso nem é preciso esperar pelas outras. Se nenhuma se perdeu
 * mas ainda faltam resultados, espera-se. Quando estiverem todas decididas,
 * paga-se pelas que ganharam, contando as anuladas a 1,00.
 *
 * Recebe uma função que diz, para cada jogo, quem ganhou, ou nada se ainda não
 * se sabe. Devolve nada se não houver ainda nada a fazer.
 */
export function fecharBilhete(aposta, ganhouDe, agora = Date.now()) {
  if (aposta.estado !== 'aberta') return null;

  const pernas = aposta.pernas.map((p) => ({ ...p }));
  let mudou = false;
  let faltam = 0;
  let perdeuAlguma = false;

  for (const perna of pernas) {
    const fim = fecharPerna(perna, ganhouDe(perna.jogo), agora);
    if (fim === null) {
      faltam += 1;
      continue;
    }
    if (fim !== perna.estado) {
      perna.estado = fim;
      mudou = true;
    }
    if (perna.estado === 'perdida') perdeuAlguma = true;
  }

  /* Uma perna perdida acaba com o bilhete, mesmo que as outras ainda estejam
     por jogar. Não vale a pena ficar à espera do que já não pode mudar nada. */
  if (perdeuAlguma)
    return { estado: 'perdida', volta: 0, lucro: -aposta.quanto, pernas };

  if (faltam > 0) return mudou ? { estado: 'aberta', pernas } : null;

  /* Todas decididas e nenhuma perdida. As anuladas contam a 1,00, por isso um
     bilhete com todas anuladas devolve exatamente o que se pôs. */
  const cotacao = aDuasCasas(
    pernas.reduce((tudo, p) => tudo * (p.estado === 'ganha' ? p.cotacao : 1), 1)
  );
  const volta = quantoPaga(aposta.quanto, cotacao);
  const soAnuladas = pernas.every((p) => p.estado === 'anulada');

  return {
    estado: soAnuladas ? 'anulada' : 'ganha',
    volta,
    lucro: volta - aposta.quanto,
    cotacaoFinal: cotacao,
    pernas
  };
}
