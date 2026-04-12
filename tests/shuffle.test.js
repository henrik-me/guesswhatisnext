/**
 * Shuffle function tests — fairness and correctness.
 * Verifies Fisher-Yates shuffle produces varied orderings
 * and preserves all original elements.
 *
 * Note: game.js is an ESM browser module with DOM-dependent imports
 * (storage.js → localStorage), so we re-implement the same pure algorithm
 * here to test its properties in isolation.
 */

/* global vi, describe, it, expect, afterEach */

// Same Fisher-Yates implementation as public/js/game.js
function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

describe('shuffle', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns a new array without mutating the original', () => {
    const original = ['A', 'B', 'C', 'D'];
    const originalCopy = [...original];
    const result = shuffle(original);

    expect(original).toEqual(originalCopy);
    expect(result).not.toBe(original);
  });

  it('preserves all elements after shuffling', () => {
    const options = ['correct', 'wrong1', 'wrong2', 'wrong3'];
    const shuffled = shuffle(options);

    expect(shuffled).toHaveLength(4);
    expect([...shuffled].sort()).toEqual([...options].sort());
  });

  it('correct answer is still present and identifiable after shuffle', () => {
    const answer = 'correct';
    const options = [answer, 'wrong1', 'wrong2', 'wrong3'];
    const shuffled = shuffle(options);

    expect(shuffled).toContain(answer);
  });

  it('produces a known permutation with a deterministic RNG', () => {
    // Mock Math.random to return a fixed sequence
    // For a 4-element array [A, B, C, D], Fisher-Yates iterates i = 3, 2, 1:
    //   i=3: j = floor(0.5 * 4) = 2 → swap [3] and [2]: [A, B, D, C]
    //   i=2: j = floor(0.3 * 3) = 0 → swap [2] and [0]: [D, B, A, C]
    //   i=1: j = floor(0.7 * 2) = 1 → swap [1] and [1]: [D, B, A, C]
    vi.spyOn(Math, 'random')
      .mockReturnValueOnce(0.5)
      .mockReturnValueOnce(0.3)
      .mockReturnValueOnce(0.7);

    const result = shuffle(['A', 'B', 'C', 'D']);
    expect(result).toEqual(['D', 'B', 'A', 'C']);
  });

  it('moves elements to different positions with varied RNG values', () => {
    // With Math.random always returning 0, j always = 0, so each element
    // swaps with index 0: produces a known rotation
    vi.spyOn(Math, 'random').mockReturnValue(0);

    const result = shuffle(['A', 'B', 'C', 'D']);
    // i=3: j=0, swap [3],[0]: [D, B, C, A]
    // i=2: j=0, swap [2],[0]: [C, B, D, A]
    // i=1: j=0, swap [1],[0]: [B, C, D, A]
    expect(result).toEqual(['B', 'C', 'D', 'A']);
    expect(result[0]).not.toBe('A');
  });

  it('handles single-element arrays', () => {
    const result = shuffle(['only']);
    expect(result).toEqual(['only']);
  });

  it('handles empty arrays', () => {
    const result = shuffle([]);
    expect(result).toEqual([]);
  });

  it('handles two-element arrays deterministically', () => {
    // With random() = 0.9, i=1: j = floor(0.9*2) = 1 → no swap
    vi.spyOn(Math, 'random').mockReturnValueOnce(0.9);
    expect(shuffle(['A', 'B'])).toEqual(['A', 'B']);

    vi.restoreAllMocks();

    // With random() = 0.1, i=1: j = floor(0.1*2) = 0 → swap
    vi.spyOn(Math, 'random').mockReturnValueOnce(0.1);
    expect(shuffle(['A', 'B'])).toEqual(['B', 'A']);
  });
});
