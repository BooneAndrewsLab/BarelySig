import { useEffect } from 'react';

import { analytics } from './analytics';
import { Logo } from './Logo';

export function App() {
  useEffect(() => {
    analytics.start(__APP_VERSION__, globalThis.matchMedia('(max-width: 900px)').matches);
  }, []);

  return (
    <main className="hello">
      <h1>
        <Logo height={72} />
      </h1>
      <p className="tagline">No license required. Asterisks included.</p>
      <p className="version">v{__APP_VERSION__}</p>
    </main>
  );
}
