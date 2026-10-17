import { describe, it, expect } from 'vitest';
import { Terrain, generateChunk, buildGeometry } from '../src/world.js';

describe('world', () => {
  it('same seed -> same chunk', () => {
    expect(generateChunk(new Terrain(42), 3, -2)).toEqual(generateChunk(new Terrain(42), 3, -2));
  });
  it('different seed -> different chunk', () => {
    expect(generateChunk(new Terrain(1), 0, 0)).not.toEqual(generateChunk(new Terrain(2), 0, 0));
  });
  it('builds a non-empty mesh', () => {
    const g = buildGeometry(generateChunk(new Terrain(7), 0, 0), 7);
    expect(g.getAttribute('position').count).toBeGreaterThan(0);
  });
});
