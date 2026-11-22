import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './index.css';
import { ensureSeeded } from './storage/seed';

// Автосидинг при первом запуске (docs/02-architecture-mvp.md, раздел 4).
ensureSeeded();

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('Не найден контейнер #root для монтирования приложения.');
}

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
