import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles.css';

/* Quem guarda o site no browser para ele existir sem internet. So no site
   publicado: em desenvolvimento so ia servir ficheiros velhos. */
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => null);
  });

  /* Quando sai uma versao nova, quem esta com a pagina aberta fica com a
     antiga ate a recarregar, e isso ja nos pregou partidas: ve-se a correcao
     publicada e continua-se a ver o problema. Assim que o guardador novo toma
     conta, a pagina recarrega-se sozinha, uma vez so. */
  let jaRecarregou = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (jaRecarregou) return;
    jaRecarregou = true;
    window.location.reload();
  });
}

const raiz = document.getElementById('raiz');
if (!raiz) throw new Error('Falta a <div id="raiz"> no index.html.');

createRoot(raiz).render(
  <StrictMode>
    <App />
  </StrictMode>
);
