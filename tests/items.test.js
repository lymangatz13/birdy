import { describe, it, expect } from 'vitest';
import { buildRoom, solidAt } from '../src/room.js';
import { makeMug, makeLaptop, stepItems, slideOffEdges } from '../src/items.js';

const g = buildRoom();
const solid = (x, y, z) => solidAt(g, x, y, z);
const settle = (items) => { for (let i = 0; i < 240; i++) stepItems(1 / 60, items, solid); };

describe('items', () => {
  it('a mug dropped over the desk lands on the desk top', () => {
    const mug = makeMug().place(36, 15, 24);
    settle([mug]);
    expect(mug.pos.y).toBeCloseTo(9);
  });
  it('a mug dropped over open floor lands on the floor', () => {
    const mug = makeMug().place(22, 15, 15);
    settle([mug]);
    expect(mug.pos.y).toBeCloseTo(1);
  });
  it('a mug dropped onto the laptop rests on top of it', () => {
    const laptop = makeLaptop().place(37, 9, 19.5);
    const mug = makeMug().place(37, 20, 19.5);
    settle([laptop, mug]);
    expect(mug.pos.y).toBeCloseTo(9 + laptop.h);
  });
  it('an item dropped with its centre past the desk edge slides off and lands on the floor', () => {
    // Desk spans z 13..26; centre at z 12.5 leaves one corner over the desk
    const laptop = makeLaptop().place(36, 14, 12.5);
    slideOffEdges(laptop, solid);
    settle([laptop]);
    expect(laptop.pos.y).toBeCloseTo(1);
    expect(laptop.pos.z + laptop.d / 2).toBeLessThanOrEqual(13.01);
  });
  it('an item mostly on the desk stays on the desk', () => {
    const laptop = makeLaptop().place(36, 14, 14.5);
    slideOffEdges(laptop, solid);
    settle([laptop]);
    expect(laptop.pos.y).toBeCloseTo(9);
    expect(laptop.pos.z).toBe(14.5);
  });
  it('a held item does not fall', () => {
    const mug = makeMug().place(36, 15, 24);
    mug.held = {};
    settle([mug]);
    expect(mug.pos.y).toBe(15);
  });
});
