import type { Pagina } from '../lib/tipos';

/**
 * Os termos e condições.
 *
 * Escritos em português de gente e não em juridiquês, que uma regra que
 * ninguém lê não é uma regra. Dizem o que o site é, o que os torrões não são,
 * e o que se espera de quem cá anda.
 */

export function Termos({
  atualizado,
  irPara
}: {
  atualizado: string;
  irPara: (p: Pagina) => void;
}) {
  return (
    <section className="legal">
      <p className="eyebrow">A papelada</p>
      <h1>Termos e condições</h1>
      <p className="lead">
        Isto é o site de um grupo de amigos, não é uma empresa nem uma casa de apostas. Ainda assim
        há coisas que é melhor ficarem escritas, e são estas.
      </p>
      <p className="legal-data">Última vez mexido a {atualizado}.</p>

      <h2>Quem somos</h2>
      <p>
        O MEIadeLEIte é um grupo de estudantes. Este site é feito e mantido pelo grupo, por gosto e
        sem ganhar nada com isso. Não se vende nada aqui, não há publicidade e não há patrocínio
        nenhum. Fala-se connosco pelo Instagram, em{' '}
        <a href="https://www.instagram.com/_meiadeleite_/" target="_blank" rel="noopener">
          @_meiadeleite_
        </a>
        .
      </p>

      <h2>Os torrões não valem nada</h2>
      <p>
        O blackjack, o poker, a roleta e as apostas desportivas jogam-se com torrões de açúcar,
        que são um número guardado num servidor e mais nada. Não se compram, não se vendem, não se trocam por dinheiro, por
        bebidas nem por seja o que for, no bar ou fora dele. Não há pagamentos neste site e nunca
        houve, nem é pedido nenhum dado de pagamento.
      </p>
      <p>
        Como não há dinheiro, também não há jogo a dinheiro. São jogos de casino a fingir, e é
        assim que devem ser levados. Se alguma vez sentires que isto deixou de ser brincadeira, o
        melhor é fechar o site e ir tomar um café.
      </p>

      <h2>A idade</h2>
      <p>
        Pergunta-se à entrada se tens 18 anos. Quem responde que ainda não tem fica com o
        blackjack, o poker, a roleta e as apostas desportivas fechados, e o resto da casa aberto na
        mesma. A pergunta não prova nada,
        como não prova em sítio nenhum, mas é feita às claras e a resposta é respeitada.
      </p>

      <h2>O teu nome e o teu PIN</h2>
      <p>
        Escolhes um nickname e um PIN. O PIN é o que prova que o nome é teu, e por isso é contigo:
        não o dês a ninguém, e não uses um que já uses noutro sítio qualquer. Não é uma
        palavra-passe a sério e não deve ser tratado como tal.
      </p>
      <p>
        O nickname aparece na Leader Board, que toda a gente vê. Escolhe um que não te incomode ver
        lá, que não se faça passar por outra pessoa e que não seja ofensivo. Podemos apagar nomes
        que sejam insultuosos, que finjam ser outra pessoa ou que estejam a ser usados para chatear
        alguém.
      </p>

      <h2>O que não se faz</h2>
      <ul>
        <li>Andar a experimentar PINs de nomes que não são teus.</li>
        <li>Tentar arrancar torrões ao servidor por fora dos jogos.</li>
        <li>Pôr no site, num nickname ou numa foto, coisas que não podias pôr em voz alta.</li>
      </ul>
      <p>
        Quem faça disto um hábito perde o nome e os torrões, e não há aqui recurso nenhum a não ser
        falar connosco.
      </p>

      <h2>As apostas desportivas</h2>
      <p>
        Os jogos, as cotações e os resultados vêm de uma feed de fora. Uma feed engana-se, perde
        jogos e às vezes muda o nome de uma equipa a meio da época. Quando isso acontece, somos nós
        que decidimos o caso, e decidimos a favor de quem apostou: um jogo que não se faça devolve
        o que lá foi posto, e um empate onde não se podia apostar no empate devolve também. A
        cotação que vale é a que estava guardada com a aposta no momento em que a puseste.
      </p>

      <h2>Não prometemos nada</h2>
      <p>
        O site é o que é e está como está. Pode ir abaixo, pode ter erros, pode ficar dias sem
        ninguém lhe mexer. Os torrões, as contas dos jogos e a Leader Board podem ser postos a zero
        se for preciso, e ninguém fica a dever nada a ninguém por causa disso. Guarda-se o que se
        pode, mas não se garante que nada se perca.
      </p>

      <h2>O que é de quem</h2>
      <p>
        O texto, os desenhos e as fotos do grupo são nossos. As fotos das pessoas estão cá com
        autorização de quem aparece nelas, e quem quiser a sua fora só tem de dizer. Se puseres cá
        alguma coisa, continua a ser tua, mas dás-nos licença para a mostrar no site.
      </p>

      <h2>Isto pode mudar</h2>
      <p>
        Se estas regras mudarem, muda-se esta página e a data lá em cima. Não há aviso por correio
        porque não temos o correio de ninguém.
      </p>

      <p className="legal-fim">
        O que se faz com os teus dados está na página da{' '}
        <button type="button" className="como-link" onClick={() => irPara('privacidade')}>
          privacidade
        </button>
        .
      </p>
    </section>
  );
}
