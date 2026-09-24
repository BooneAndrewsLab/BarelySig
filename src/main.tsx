import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { App } from './ui/App';
import { Capture } from './ui/dev/Capture';
import './ui/theme.css';

const root = document.getElementById('root');
if (!root) throw new Error('Missing #root element');

// The clipboard capture page exists only in development (note 03).
const capture =
  import.meta.env.DEV && new URLSearchParams(globalThis.location.search).has('capture');

createRoot(root).render(<StrictMode>{capture ? <Capture /> : <App />}</StrictMode>);
