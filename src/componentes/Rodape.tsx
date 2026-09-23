import { JOGOS, PAGINAS } from '../lib/dados';
import type { Pagina } from '../lib/tipos';

function IconeInstagram() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect
        x="2.5"
        y="2.5"
        width="19"
        height="19"
        rx="5.5"
        stroke="currentColor"
        strokeWidth="1.9"
      />
      <circle cx="12" cy="12" r="4.2" stroke="currentColor" strokeWidth="1.9" />
      <circle cx="17.4" cy="6.6" r="1.35" fill="currentColor" />
    </svg>
  );
}

export function Rodape({ irPara }: { irPara: (p: Pagina) => void }) {
  return (
    <footer>
      <div className="rodape">
        <div className="rodape-sobre">
          <svg width="30" height="40" viewBox="0 0 30 40" aria-hidden="true">
            <path
              d="M5 3 h20 l-2.5 32 a4 4 0 0 1 -4 3.6 h-7 a4 4 0 0 1 -4 -3.6 Z"
              fill="var(--crema-2)"
            />
            <path
              d="M6.6 14 h16.8 l-1.5 21 a4 4 0 0 1 -4 3.6 h-6 a4 4 0 0 1 -4 -3.6 Z"
              fill="var(--crema)"
            />
            <rect x="5.4" y="9" width="19.2" height="5.4" fill="var(--crema-2)" />
          </svg>
          <p>
            <b>MEIadeLEIte</b>
            Grupo do ano na edição 25/26 do Pixel d'Ouro. Nem sabem o que está por vir.
          </p>
        </div>

        <div>
          <h4>Andar por aqui</h4>
          <ul>
            {[...PAGINAS, ...JOGOS].map((p) => (
              <li key={p.id}>
                <button type="button" onClick={() => irPara(p.id)}>
                  {p.nome}
                </button>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <h4>Socials</h4>
          <ul>
            <li>
              <a
                className="com-icone"
                href="https://www.instagram.com/_meiadeleite_/"
                target="_blank"
                rel="noopener"
              >
                <IconeInstagram />
                _meiadeleite_
              </a>
            </li>
          </ul>
        </div>
      </div>

      <div className="rodape-fim">
        <span className="selo">
          <svg width="13" height="13" viewBox="0 0 16 16" aria-hidden="true">
            <circle cx="8" cy="8" r="7" fill="var(--crema)" />
          </svg>
          Feito ao balcão pelo senhor Luís
        </span>
        <span>Os torrões do blackjack não valem nada em lado nenhum, nem no bar.</span>
        <span className="direita">
          © {new Date().getFullYear()} MEIadeLEIte. Todos os direitos reservados.
        </span>
      </div>
    </footer>
  );
}
