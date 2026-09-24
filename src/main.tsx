import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { App } from './ui/App';
import { Capture } from './ui/dev/Capture';
import { getSession } from './ui/state/session';
import './ui/theme.css';

const root = document.getElementById('root');
if (!root) throw new Error('Missing #root element');

// The clipboard capture page exists only in development (note 03).
const capture =
  import.meta.env.DEV && new URLSearchParams(globalThis.location.search).has('capture');

/** Waits for the last project to come back from storage, but never long: a wedged IndexedDB must not block the app. */
async function restore(): Promise<void> {
  const session = getSession();
  session.listen();
  const timeout = new Promise<void>((resolve) => setTimeout(resolve, 1500));
  await Promise.race([session.restore().catch(() => undefined), timeout]);
}

void (capture ? Promise.resolve() : restore()).finally(() => {
  createRoot(root).render(<StrictMode>{capture ? <Capture /> : <App />}</StrictMode>);
});
