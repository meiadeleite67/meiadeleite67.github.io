import type { Pagina } from '../lib/tipos';

/**
 * A política de privacidade.
 *
 * Esta página é o retrato do que o código faz, e não um texto tirado de um
 * modelo. Cada coisa que aqui está dita foi lida no código antes de ser
 * escrita: as chaves que ficam no aparelho, o que o servidor guarda de cada
 * nome, onde entra o endereço de IP e quem são os três de fora que veem
 * alguma coisa. Se o código mudar, esta página tem de mudar com ele.
 */

export function Privacidade({
  atualizado,
  irPara
}: {
  atualizado: string;
  irPara: (p: Pagina) => void;
}) {
  return (
    <section className="legal">
      <p className="eyebrow">A papelada</p>
      <h1>Privacidade</h1>
      <p className="lead">
        Em duas linhas: pedimos-te um nickname à tua escolha e um PIN, e mais nada. Não há cookies
        nossos, não há publicidade, não há contadores de visitas e não se vende nada a ninguém.
      </p>
      <p className="legal-data">Última vez mexido a {atualizado}.</p>

      <h2>Quem trata disto</h2>
      <p>
        O grupo MEIadeLEIte, que é quem faz e mantém o site. Para qualquer coisa a ver com os teus
        dados, manda mensagem no Instagram, em{' '}
        <a href="https://www.instagram.com/_meiadeleite_/" target="_blank" rel="noopener">
          @_meiadeleite_
        </a>
        . É o caminho que temos.
      </p>

      <h2>O que fica no teu aparelho</h2>
      <p>
        Nada disto são cookies. É armazenamento do próprio browser, fica no teu aparelho e só sai
        de lá quando é preciso provar ao servidor que o nome é teu.
      </p>
      <ul>
        <li>
          <b>mdl.nome</b>, o nickname que escolheste, para não to voltarmos a perguntar.
        </li>
        <li>
          <b>mdl.passes</b>, um passe por cada nome que acertaste neste aparelho. É o passe que
          viaja a cada jogada, e não o PIN.
        </li>
        <li>
          <b>mdl.idade</b>, a resposta que deste à pergunta dos 18 anos.
        </li>
        <li>
          <b>mdl:som</b>, se quiseste ou não ouvir a roleta.
        </li>
        <li>
          <b>mdl.chaves</b>, um resto do tempo em que o nome era de quem o estreasse no browser. Já
          não abre nada e só serve para te explicarmos porque é que agora há um PIN.
        </li>
      </ul>
      <p>
        O site deixa também uma cópia das suas próprias páginas, letras e imagens no teu aparelho,
        para abrir depressa e para aguentar ficar sem rede. São ficheiros do site e mais nada: não
        há aí nada a teu respeito.
      </p>
      <p>
        Apagas isto tudo a limpar os dados do site no teu browser. Ficas sem o nome guardado e
        tens de o pôr outra vez com o PIN, mas não perdes torrões nenhuns: esses estão do outro
        lado.
      </p>

      <h2>O que fica no servidor</h2>
      <p>De cada nickname guarda-se:</p>
      <ul>
        <li>o nickname, que escolheste tu e não tem de ser o teu nome verdadeiro;</li>
        <li>os torrões que tens e o máximo a que já chegaste;</li>
        <li>as contas dos jogos: mãos, vitórias, blackjacks, mãos de poker, rodadas de roleta,
        apostas desportivas feitas e ganhas, o maior pote, o maior prémio e os recordes do Cusco,
        da Colherada e do jogo do balcão;</li>
        <li>as apostas desportivas que puseste: em que jogo, em quem, quanto, a que cotação e como
        acabaram. As que já fecharam vão saindo à medida que entram outras;</li>
        <li>a data da última vez que jogaste.</li>
      </ul>
      <p>
        <b>O PIN nunca é guardado.</b> Guarda-se um resumo dele, feito com PBKDF2 e com um sal
        próprio de cada nome, que serve para confirmar o PIN certo e não serve para o descobrir. Os
        passes também só ficam em resumo. Nem nós conseguimos ler o teu PIN.
      </p>
      <p>
        Não pedimos nem guardamos nome verdadeiro, correio eletrónico, telefone, morada, data de
        nascimento nem nada de pagamentos.
      </p>

      <h2>O endereço de IP</h2>
      <p>
        Há um sítio onde ele entra. Quando alguém erra o PIN vezes demais, fica um travão ligado ao
        endereço de onde vieram as tentativas, para que ninguém possa ficar a experimentar PINs até
        acertar. Essa marca guarda o endereço, apaga-se sozinha ao fim de uma hora e desaparece
        logo que se acerte no PIN. O mesmo se faz na entrada da administração, com quinze minutos.
      </p>
      <p>
        Fora disso não registamos endereços de IP nem guardamos histórico de visitas.
      </p>

      <h2>Os de fora que veem alguma coisa</h2>
      <ul>
        <li>
          <b>Google Fonts</b>. Os tipos de letra do site vêm de servidores do Google, e por isso o
          Google vê o endereço de IP de quem abre qualquer página daqui.
        </li>
        <li>
          <b>Instagram</b>. A página do Instagram mostra as publicações dentro de janelas do
          próprio Instagram. Essas janelas são deles, podem pôr cookies deles e podem dar-lhes a
          saber que estiveste aqui, ainda mais se tiveres sessão iniciada. É a única página do site
          onde isso acontece: quem não quiser, não a abre.
        </li>
      </ul>
      <p>Não há mais ninguém. Sem análise de tráfego, sem publicidade, sem redes de anúncios.</p>

      <h2>Os jogos e as cotações</h2>
      <p>
        Os jogos, as cotações e os resultados das apostas desportivas vêm da The Odds API. O
        servidor vai lá uma vez por dia e traz a lista; não é feito nenhum pedido quando abres a
        página, e não lhes vai daqui nada a teu respeito. Eles não sabem quem tu és nem que
        apostaste.
      </p>

      <h2>As fotos</h2>
      <p>
        As fotos das pessoas do grupo estão cá com a autorização de quem aparece nelas. Quem
        quiser a sua fora diz, e sai.
      </p>

      <h2>Quanto tempo fica</h2>
      <p>
        A linha do teu nickname fica enquanto o site existir, ou até pedires para a apagar. As
        apostas por fechar ficam até o jogo acabar, e as já fechadas vão saindo à medida que
        entram outras. As marcas dos PINs errados apagam-se sozinhas em uma hora. As sessões da
        administração duram oito horas.
      </p>

      <h2>O que podes exigir</h2>
      <p>
        Podes pedir para ver o que está guardado a respeito do teu nickname, para o corrigir, para o
        apagar, ou para deixarmos de o usar. Pede pelo Instagram e trata-se. Se acharmos que não
        conseguimos saber que o nome é teu, podemos pedir-te que o proves com o PIN, que é a única
        prova que existe aqui.
      </p>

      <h2>Menores</h2>
      <p>
        Pergunta-se a idade à entrada e quem diz que ainda não tem 18 fica sem as mesas de apostas.
        Se fores pai ou mãe de alguém que ache que pôs aqui alguma coisa que não devia, diz e
        apaga-se.
      </p>

      <h2>Isto pode mudar</h2>
      <p>
        Se o site passar a guardar outra coisa, esta página muda no mesmo dia e a data lá em cima
        muda com ela.
      </p>

      <p className="legal-fim">
        As regras de andar por aqui estão nos{' '}
        <button type="button" className="como-link" onClick={() => irPara('termos')}>
          termos e condições
        </button>
        .
      </p>
    </section>
  );
}
