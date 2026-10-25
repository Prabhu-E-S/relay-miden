import { describe, expect, it } from 'vitest';
import { sha256HexFallback } from './sha256.js';

describe('sha256HexFallback', () => {
  it('matches the standard SHA-256 digest for PaperBridge-compatible UTF-8 content', () => {
    expect(sha256HexFallback(new TextEncoder().encode('abc'))).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
  });
});
