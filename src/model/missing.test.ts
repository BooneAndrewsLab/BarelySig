import { describe, expect, it } from 'vitest';
import { presentValues } from './missing';

describe('presentValues', () => {
  it('drops missing cells but keeps zeros', () => {
    expect(presentValues([1, null, 0, 3, null])).toEqual([1, 0, 3]);
  });
});
