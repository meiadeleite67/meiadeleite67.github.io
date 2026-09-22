import { useEffect, useState } from 'react';
import { capaDe, slideDe } from '../lib/api';
import { dataCurta } from '../lib/dados';
import type { Estado, Post } from '../lib/tipos';

const ETIQUETA = { foto: 'Foto', reel: 'Reel', album: 'Álbum' } as const;

export function Mural({ estado }: { estado: Estado }) {
  const [aberta, setAberta] = useState<Post | null>(null);

  return (
    <section>
      <p className="eyebrow">Mural</p>
      <h1 style={{ fontSize: 'clamp(28px,5vw,42px)' }}>O que vai saindo no Instagram</h1>
      <p className="lead">
        As publicações e os reels do @_meiadeleite_, do mais recente para o mais antigo. Carrega em
        qualquer um para o ver aqui mesmo.
      </p>

      <div className="perfil-fita">
        <span className="arroba">@_meiadeleite_</span>
        <span className="rotulo">{estado.insta.length} publicações aqui</span>
        <a
          className="btn claro mini"
          style={{ textDecoration: 'none' }}
          href="https://www.instagram.com/_meiadeleite_/"
          target="_blank"
          rel="noopener"
        >
          Ir ao perfil
        </a>
      </div>

      <div className="posts" style={{ marginTop: 20 }}>
        {estado.insta.length === 0 ? (
          <p className="vazio">Mural vazio.</p>
        ) : (
          estado.insta.map((p) => <Cartao key={p.id} post={p} abrir={() => setAberta(p)} />)
        )}
      </div>

      {aberta && <Janela post={aberta} fechar={() => setAberta(null)} />}
    </section>
  );
}

function Cartao({ post, abrir }: { post: Post; abrir: () => void }) {
  return (
    <button className="post" type="button" onClick={abrir}>
      <div className="capa">
        {post.temImagem ? (
          <img src={capaDe(post.id)} alt="" loading="lazy" />
        ) : (
          <div className="ring" />
        )}
        <span className="marca-formato">
          {post.formato === 'reel' && (
            <svg width="15" height="15" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M8 5.5 L19 12 L8 18.5 Z" fill="currentColor" />
            </svg>
          )}
          {post.formato === 'album' && (
            <svg width="15" height="15" viewBox="0 0 24 24" aria-hidden="true">
              <rect x="7" y="3" width="14" height="14" rx="3" fill="none" stroke="currentColor" strokeWidth="2.2" />
              <path d="M17 20.5 H6 A2.5 2.5 0 0 1 3.5 18 V7" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
            </svg>
          )}
          {ETIQUETA[post.formato] ?? 'Foto'}
        </span>
      </div>
      <div className="corpo">
        <span className="data">{dataCurta(post.data)}</span>
        <p className={`leg${post.legenda ? '' : ' sem'}`}>{post.legenda || 'Sem legenda.'}</p>
      </div>
    </button>
  );
}

/** A publicação aberta por cima do mural, dentro do visualizador do próprio
 *  Instagram: é ele que trata dos slides e de pôr o vídeo a andar. */
function Janela({ post, fechar }: { post: Post; fechar: () => void }) {
  const [slide, setSlide] = useState(1);

  /* As fotos que temos guardadas abrem no visualizador do site, onde as setas
     do teclado funcionam. Os reels abrem no leitor do Instagram, que é o único
     sítio onde o vídeo toca. */
  const nossas = post.formato !== 'reel' && post.slides > 0;

  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      if (e.key === 'Escape') fechar();
      if (!nossas || post.slides < 2) return;
      if (e.key === 'ArrowRight') setSlide((n) => (n % post.slides) + 1);
      if (e.key === 'ArrowLeft') setSlide((n) => (n === 1 ? post.slides : n - 1));
    };
    window.addEventListener('keydown', tecla);
    const antes = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', tecla);
      document.body.style.overflow = antes;
    };
  }, [fechar, nossas, post.slides]);

  return (
    <div
      className="janela-fundo"
      role="dialog"
      aria-modal="true"
      aria-label="Publicação do Instagram"
      onClick={fechar}
    >
      <div className="janela" onClick={(e) => e.stopPropagation()}>
        <div className="janela-topo">
          <span className="rotulo">
            {ETIQUETA[post.formato] ?? 'Foto'} · {dataCurta(post.data)}
          </span>
          <a className="btn claro mini" href={post.url} target="_blank" rel="noopener">
            Abrir no Instagram
          </a>
          <button className="btn claro mini" type="button" onClick={fechar}>
            Fechar
          </button>
        </div>

        {nossas ? (
          <div className="album">
            <img src={slideDe(post.id, slide)} alt="" />
            {post.slides > 1 && (
              <>
                <button
                  className="seta esquerda"
                  type="button"
                  aria-label="Foto anterior"
                  onClick={() => setSlide((n) => (n === 1 ? post.slides : n - 1))}
                >
                  ‹
                </button>
                <button
                  className="seta direita"
                  type="button"
                  aria-label="Foto seguinte"
                  onClick={() => setSlide((n) => (n % post.slides) + 1)}
                >
                  ›
                </button>
                <div className="bolinhas">
                  {Array.from({ length: post.slides }, (_, i) => (
                    <button
                      key={i}
                      type="button"
                      className={i + 1 === slide ? 'agora' : ''}
                      aria-label={`Foto ${i + 1}`}
                      onClick={() => setSlide(i + 1)}
                    />
                  ))}
                </div>
                <span className="contador">
                  {slide}/{post.slides}
                </span>
              </>
            )}
          </div>
        ) : (
          <div className="janela-caixa">
            <iframe
              title="Publicação do Instagram"
              src={`${post.url}embed/captioned/`}
              scrolling="no"
              allow="encrypted-media; picture-in-picture; fullscreen"
            />
          </div>
        )}

        {post.legenda && <p className="janela-legenda">{post.legenda}</p>}
      </div>
    </div>
  );
}
