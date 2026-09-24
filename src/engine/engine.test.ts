import { afterAll, describe, expect, it } from 'vitest';
import type { WebR } from 'webr';

import { startNodeWebR } from '@/test/webrNode';

import { CANCELLED, CRASHED, Engine, EngineError } from './engine';

const started: WebR[] = [];
const engine = new Engine(async () => {
  const w = await startNodeWebR();
  started.push(w);
  return w;
});

afterAll(() => {
  engine.close();
});

const job = (code: string, inputs = {}, packages: string[] = []) => ({ code, inputs, packages });

async function failure(p: Promise<unknown>): Promise<EngineError> {
  try {
    await p;
  } catch (e: unknown) {
    if (e instanceof EngineError) return e;
    throw e;
  }
  throw new Error('expected the job to fail');
}

describe('Engine', () => {
  it('starts on the first job and runs R with inputs bound, empty cells as NA', async () => {
    expect(engine.state.kind).toBe('idle');
    const out = await engine.run(
      job('list(n = sum(!is.na(x)), mean = mean(x, na.rm = TRUE), label = label, flag = flag)', {
        x: [1, null, 3],
        label: 'WT',
        flag: true,
      }),
    );
    expect(out).toEqual({ value: { n: 2, mean: 2, label: 'WT', flag: true }, warnings: [] });
    expect(engine.state.kind).toBe('ready');
  }, 60_000);

  it('passes messages written for the user through, and wraps any other R error', async () => {
    const mine = await failure(
      engine.run(job('stop("bs: Each group needs at least two values.")')),
    );
    expect([mine.kind, mine.message]).toEqual([
      'analysis',
      'Each group needs at least two values.',
    ]);
    const other = await failure(engine.run(job('log(-1) + undefined_thing')));
    expect(other.kind).toBe('internal');
    expect(other.message).toMatch(
      /^The statistics engine couldn’t run this analysis: .*undefined_thing/,
    );
  });

  it('collects R warnings', async () => {
    const out = await engine.run(
      job('suppressWarnings(NULL); warning("first"); warning("second"); 1'),
    );
    expect(out).toEqual({ value: 1, warnings: ['first', 'second'] });
  });

  it('keeps nothing in R between jobs', async () => {
    await engine.run(job('leaked <<- 42; 1'));
    const out = await engine.run(job('exists("leaked")'));
    expect(out.value).toBe(false);
  });

  it('loads a package the job needs', async () => {
    const out = await engine.run(job('as.character(packageVersion("mvtnorm"))', {}, ['mvtnorm']));
    expect(out.value).toBe('1.2.4');
  }, 60_000);

  it('cancels a running job by restarting, and runs the next one on a fresh engine', async () => {
    const before = started.length;
    const ac = new AbortController();
    const running = engine.run(job('repeat { Sys.sleep(0.01) }'), ac.signal);
    setTimeout(() => {
      ac.abort();
    }, 300);
    const e = await failure(running);
    expect([e.kind, e.message]).toEqual(['cancelled', CANCELLED]);
    expect((await engine.run(job('1 + 1'))).value).toBe(2);
    expect(started.length).toBe(before + 1);
  }, 60_000);

  it('refuses a job cancelled before it started', async () => {
    const ac = new AbortController();
    ac.abort();
    expect((await failure(engine.run(job('1'), ac.signal))).kind).toBe('cancelled');
  });

  it('replaces an engine that died, reporting it plainly', async () => {
    await engine.run(job('1'));
    started.at(-1)?.close();
    const e = await failure(engine.run(job('1')));
    expect([e.kind, e.message]).toEqual(['crashed', CRASHED]);
    expect((await engine.run(job('3'))).value).toBe(3);
  }, 60_000);
});
