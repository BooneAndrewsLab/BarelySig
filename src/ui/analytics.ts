/**
 * Usage statistics via a self-hosted Matomo instance.
 *
 * Nothing is sent unless the instance URL and site id were set at build time
 * (`VITE_MATOMO_URL`, `VITE_MATOMO_SITE_ID`) and the browser does not send a
 * Do-Not-Track signal. Events carry only coarse actions ("ran t-test",
 * "exported svg"); never data values, table or column titles, file names or
 * anything else the user typed. The tracker runs cookieless; IP
 * anonymisation is an instance setting.
 *
 * The page URL is reported without its fragment: should a link ever carry
 * data after the `#`, Matomo would otherwise send `window.location.href`
 * whole. Both `setCustomUrl` (this page view) and `discardHashTag` (any
 * later one) are set.
 *
 * What may be sent is `EVENTS`, below, and nothing else: `track` accepts a
 * category and action only from it. The list is also what "unused" is read
 * against — a feature that never shows up in the Events report is on it and
 * was not used. Ported from PlasmidPop's `src/app/analytics.ts`.
 */

export interface AnalyticsConfig {
  /** Matomo instance URL, with trailing slash. */
  readonly url: string;
  readonly siteId: string;
}

interface Env {
  readonly VITE_MATOMO_URL?: string;
  readonly VITE_MATOMO_SITE_ID?: string;
}

/** Reads the build-time config; `null` when unset, so the tracker is a no-op. */
export function readConfig(env: Env = import.meta.env): AnalyticsConfig | null {
  const url = env.VITE_MATOMO_URL?.trim() ?? '';
  const siteId = env.VITE_MATOMO_SITE_ID?.trim() ?? '';
  if (url === '' || siteId === '') return null;
  return { url: url.endsWith('/') ? url : `${url}/`, siteId };
}

/** True when the browser asks not to be tracked; nothing is sent then. */
export function doNotTrack(nav: Partial<Navigator> = globalThis.navigator): boolean {
  const flag = nav.doNotTrack ?? (globalThis as { doNotTrack?: string }).doNotTrack;
  return flag === '1' || flag === 'yes';
}

/**
 * Everything the app may report, as category → actions. The event name,
 * where there is one, is a fixed label: a file format, a panel, a view, a
 * key binding, a guide page, the app version. Never anything the user typed
 * or anything read from a document.
 */
export const EVENTS = {
  /** Once per visit: `start` (the version), `layout` (desktop/tablet). */
  app: ['start', 'layout'],
  history: ['undo', 'redo'],
  table: ['new-column', 'new-grouped'],
  data: ['paste', 'fill-down', 'exclude'],
  file: ['open', 'download'],
  analysis: [
    'new-descriptive',
    'new-t-test',
    'new-rank-test',
    'new-one-way-anova',
    'new-kruskal-wallis',
    'new-two-way-anova',
    'new-normality',
  ],
  graph: ['new-column', 'export-svg', 'export-png'],
} as const satisfies Readonly<Record<string, readonly string[]>>;

export type EventCategory = keyof typeof EVENTS;
export type EventAction<C extends EventCategory> = (typeof EVENTS)[C][number];

type PaqEntry = readonly (string | number | boolean)[];

/** This page, with any fragment cut off. Nothing of a share link is reportable. */
export function trackableUrl(href: string = globalThis.location.href): string {
  const hash = href.indexOf('#');
  return hash === -1 ? href : href.slice(0, hash);
}

/** Loads the Matomo script. Separated so tests can stub it. */
function injectScript(url: string): void {
  const doc = globalThis.document;
  const script = doc.createElement('script');
  script.async = true;
  script.src = `${url}matomo.js`;
  doc.head.appendChild(script);
}

export class Analytics {
  readonly enabled: boolean;
  /** What `trackOnce` has sent in this page load. */
  private readonly sent = new Set<string>();

  constructor(
    config: AnalyticsConfig | null,
    dnt: boolean,
    load: (url: string) => void = injectScript,
  ) {
    this.enabled = config !== null && !dnt;
    if (config === null || !this.enabled) return;
    this.push(['disableCookies']);
    this.push(['setDoNotTrack', true]);
    this.push(['setTrackerUrl', `${config.url}matomo.php`]);
    this.push(['setSiteId', config.siteId]);
    this.push(['discardHashTag', true]);
    this.push(['setCustomUrl', trackableUrl()]);
    this.push(['trackPageView']);
    this.push(['enableLinkTracking']);
    load(config.url);
  }

  /**
   * Records a coarse usage event. `name` must be a fixed label (a format,
   * a mode), never user data.
   */
  track<C extends EventCategory>(category: C, action: EventAction<C>, name?: string): void {
    if (!this.enabled) return;
    this.push(
      name === undefined
        ? ['trackEvent', category, action]
        : ['trackEvent', category, action, name],
    );
  }

  /**
   * Records the event the first time it happens in this page load and
   * ignores it after that. For things done often — edits, toggles, tab
   * switches — where what is worth knowing is whether a visit used them at
   * all: Matomo's "unique events" then reads as visits, one person toggling
   * a switch a hundred times counts once, and a visit sends a handful of
   * requests rather than one per click.
   */
  trackOnce<C extends EventCategory>(category: C, action: EventAction<C>, name?: string): void {
    if (!this.enabled) return;
    const key = `${category}\u0000${action}\u0000${name ?? ''}`;
    if (this.sent.has(key)) return;
    this.sent.add(key);
    this.track(category, action, name);
  }

  /**
   * What kind of visit this is: the version and the layout. Called once,
   * from the app's first render.
   */
  start(version: string, narrow: boolean): void {
    this.trackOnce('app', 'start', version);
    this.trackOnce('app', 'layout', narrow ? 'narrow' : 'desktop');
  }

  private push(entry: PaqEntry): void {
    const g = globalThis as { _paq?: PaqEntry[] };
    g._paq ??= [];
    g._paq.push(entry);
  }
}

export const analytics = new Analytics(readConfig(), doNotTrack());
