// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';

import { commandFor } from './shortcuts';

const key = (
  k: string,
  mods: Partial<{ ctrl: boolean; meta: boolean; shift: boolean; alt: boolean }> = {},
  target: EventTarget | null = document.body,
) => ({
  key: k,
  ctrlKey: mods.ctrl ?? false,
  metaKey: mods.meta ?? false,
  shiftKey: mods.shift ?? false,
  altKey: mods.alt ?? false,
  target,
});

describe('commandFor', () => {
  it('maps undo and redo with Ctrl or Cmd', () => {
    expect(commandFor(key('z', { ctrl: true }))).toBe('undo');
    expect(commandFor(key('Z', { meta: true, shift: true }))).toBe('redo');
    expect(commandFor(key('y', { ctrl: true }))).toBe('redo');
    expect(commandFor(key('z'))).toBeNull();
    expect(commandFor(key('z', { ctrl: true, alt: true }))).toBeNull();
  });

  it('leaves Ctrl+Z to text fields, but not open and download', () => {
    const input = document.createElement('input');
    document.body.append(input);
    expect(commandFor(key('z', { ctrl: true }, input))).toBeNull();
    expect(commandFor(key('s', { ctrl: true }, input))).toBe('download');
    expect(commandFor(key('o', { meta: true }, input))).toBe('open');
  });
});
