/**
 * Starts WebR from the copy the site serves itself (`public/webr/`, staged by
 * `scripts/webr/fetch.ts`): the runtime and the package repository both come
 * from our own origin, never from r-wasm.org. WebR runs R in its own Web
 * Worker, so nothing here blocks the main thread.
 */
import { ChannelType, WebR } from 'webr';

export type Channel = 'postmessage' | 'sharedarraybuffer' | 'automatic';

const CHANNELS: Readonly<Record<Channel, (typeof ChannelType)[keyof typeof ChannelType]>> = {
  postmessage: ChannelType.PostMessage,
  sharedarraybuffer: ChannelType.SharedArrayBuffer,
  automatic: ChannelType.Automatic,
};

/** Absolute URL of the self-hosted WebR directory, under the site's base path. */
export function webrBaseUrl(base: string = import.meta.env.BASE_URL): string {
  return new URL(`${base}webr/`, globalThis.location.href).href;
}

export async function startWebR(channel: Channel = 'postmessage'): Promise<WebR> {
  const baseUrl = webrBaseUrl();
  const webR = new WebR({
    baseUrl,
    repoUrl: `${baseUrl}repo/`,
    channelType: CHANNELS[channel],
    interactive: false,
  });
  await webR.init();
  return webR;
}
