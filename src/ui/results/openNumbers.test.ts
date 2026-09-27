// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';

import { asId } from '@/model/ids';

import { resetAllNumbersOpen, setAllNumbersOpen } from './openNumbers';

const KEY = 'barelysig.allNumbers';
const stored = (): string[] =>
  (JSON.parse(localStorage.getItem(KEY) ?? '[]') as string[]).slice().sort();

beforeEach(() => {
  localStorage.clear();
  resetAllNumbersOpen();
});

describe('openNumbers', () => {
  it('starts with nothing remembered as open', () => {
    expect(localStorage.getItem(KEY)).toBeNull();
  });

  it('remembers which ids are open, independently of one another', () => {
    setAllNumbersOpen(asId('a1'), true);
    expect(stored()).toEqual(['a1']);
    setAllNumbersOpen(asId('a2'), true);
    expect(stored()).toEqual(['a1', 'a2']);
    setAllNumbersOpen(asId('a1'), false);
    expect(stored()).toEqual(['a2']);
  });

  it('removes the key once nothing is open, rather than keeping an empty array', () => {
    setAllNumbersOpen(asId('a1'), true);
    setAllNumbersOpen(asId('a1'), false);
    expect(localStorage.getItem(KEY)).toBeNull();
  });

  it('ignores a corrupt stored value instead of throwing', () => {
    localStorage.setItem(KEY, 'not json');
    expect(() => {
      setAllNumbersOpen(asId('a1'), true);
    }).not.toThrow();
    expect(stored()).toEqual(['a1']);
  });
});
