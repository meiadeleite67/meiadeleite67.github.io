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
}

const raiz = document.getElementById('raiz');
if (!raiz) throw new Error('Falta a <div id="raiz"> no index.html.');

createRoot(raiz).render(
  <StrictMode>
    <App />
  </StrictMode>
);
