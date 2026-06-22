import { describe, it, expect } from 'vitest';
import { cosineSim, vecToBuffer, bufferToVec } from '../../src/utils/embeddings.js';

describe('embeddings math', () => {
  describe('cosineSim', () => {
    it('returns 1 for identical vectors', () => {
      const v = new Float32Array([1, 2, 3]);
      expect(cosineSim(v, v)).toBeCloseTo(1, 6);
    });

    it('returns 0 for orthogonal vectors', () => {
      expect(cosineSim(new Float32Array([1, 0]), new Float32Array([0, 1]))).toBeCloseTo(0, 6);
    });

    it('returns -1 for opposite vectors', () => {
      expect(cosineSim(new Float32Array([1, 2]), new Float32Array([-1, -2]))).toBeCloseTo(-1, 6);
    });

    it('returns 0 on length mismatch', () => {
      expect(cosineSim(new Float32Array([1, 2, 3]), new Float32Array([1, 2]))).toBe(0);
    });

    it('returns 0 for a zero vector', () => {
      expect(cosineSim(new Float32Array([0, 0]), new Float32Array([1, 1]))).toBe(0);
    });

    it('ranks a closer vector higher', () => {
      const q = new Float32Array([1, 1, 0]);
      const near = new Float32Array([1, 1, 0.1]);
      const far = new Float32Array([0, 0, 1]);
      expect(cosineSim(q, near)).toBeGreaterThan(cosineSim(q, far));
    });
  });

  describe('blob roundtrip', () => {
    it('preserves values through vecToBuffer → bufferToVec', () => {
      const original = new Float32Array([0.1, -0.5, 3.14159, 0, 42]);
      const restored = bufferToVec(vecToBuffer(original));
      expect(restored.length).toBe(original.length);
      for (let i = 0; i < original.length; i++) {
        expect(restored[i]).toBeCloseTo(original[i], 6);
      }
    });

    it('round-trips an independent copy (not aliased to source buffer)', () => {
      const original = new Float32Array([1, 2, 3]);
      const buf = vecToBuffer(original);
      const restored = bufferToVec(buf);
      restored[0] = 99;
      expect(original[0]).toBe(1); // mutation must not leak back
    });
  });
});
