/**
 * Serves `public/webr/repo` over HTTP for the whole test run, so WebR under
 * Node can install packages (its downloads go through `fetch`, which has no
 * `file:` scheme). Tests read the URL with `inject('webrRepoUrl')`.
 */
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { type AddressInfo } from 'node:net';
import { join, normalize } from 'node:path';

import type { TestProject } from 'vitest/node';

declare module 'vitest' {
  export interface ProvidedContext {
    webrRepoUrl: string;
  }
}

const repo = join(import.meta.dirname, '../../public/webr/repo');

export default async function setup(project: TestProject): Promise<() => Promise<void>> {
  if (!existsSync(join(repo, 'lock.json'))) {
    throw new Error('public/webr is not staged: run `npm run webr:fetch` first');
  }
  const server = createServer((req, res) => {
    const path = normalize(
      join(repo, decodeURIComponent(new URL(req.url ?? '/', 'http://x').pathname)),
    );
    if (!path.startsWith(repo)) {
      res.writeHead(403).end();
      return;
    }
    void readFile(path).then(
      (body) => {
        res.writeHead(200).end(body);
      },
      () => {
        res.writeHead(404).end();
      },
    );
  });
  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', resolve);
  });
  const { port } = server.address() as AddressInfo;
  project.provide('webrRepoUrl', `http://127.0.0.1:${port}/`);
  return () =>
    new Promise((resolve) => {
      server.close(() => {
        resolve();
      });
    });
}
