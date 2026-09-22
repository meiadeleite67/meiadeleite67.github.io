import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles.css';

const raiz = document.getElementById('raiz');
if (!raiz) throw new Error('Falta a <div id="raiz"> no index.html.');

createRoot(raiz).render(
  <StrictMode>
    <App />
  </StrictMode>
);
