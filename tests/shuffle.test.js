/**
 * Shuffle function tests — fairness and correctness.
 * Verifies Fisher-Yates shuffle produces varied orderings
 * and preserves all original elements.
 */

// Re-implement the same Fisher-Yates algorithm from public/js/game.js for testing
function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

describe('shuffle', () => {
  it('returns a new array without mutating the original', () => {
    const original = ['A', 'B', 'C', 'D'];
    const originalCopy = [...original];
    const result = shuffle(original);

    expect(original).toEqual(originalCopy);
    expect(result).not.toBe(original);
  });

  it('preserves all elements after shuffling', () => {
    const options = ['correct', 'wrong1', 'wrong2', 'wrong3'];

    for (let i = 0; i < 20; i++) {
      const shuffled = shuffle(options);
      expect(shuffled).toHaveLength(4);
      expect(shuffled.sort()).toEqual([...options].sort());
    }
  });

  it('correct answer is still present and identifiable after shuffle', () => {
    const answer = 'correct';
    const options = [answer, 'wrong1', 'wrong2', 'wrong3'];

    for (let i = 0; i < 50; i++) {
      const shuffled = shuffle(options);
      expect(shuffled).toContain(answer);
    }
  });

  it('produces varied orderings (not always the same)', () => {
    const options = ['A', 'B', 'C', 'D'];
    const orderings = new Set();

    for (let i = 0; i < 100; i++) {
      orderings.add(shuffle(options).join(','));
    }

    // With 4 items there are 24 possible orderings.
    // 100 iterations should produce at least 5 distinct orderings.
    expect(orderings.size).toBeGreaterThanOrEqual(5);
  });

  it('does not always place the first element at index 0', () => {
    const options = ['A', 'B', 'C', 'D'];
    let firstStayedCount = 0;
    const runs = 100;

    for (let i = 0; i < runs; i++) {
      if (shuffle(options)[0] === 'A') firstStayedCount++;
    }

    // Expected: ~25% of the time (1/4). Should be well below 75%.
    expect(firstStayedCount).toBeLessThan(runs * 0.5);
  });

  it('handles single-element arrays', () => {
    const result = shuffle(['only']);
    expect(result).toEqual(['only']);
  });

  it('handles empty arrays', () => {
    const result = shuffle([]);
    expect(result).toEqual([]);
  });

  it('handles two-element arrays', () => {
    const options = ['A', 'B'];
    const orderings = new Set();

    for (let i = 0; i < 50; i++) {
      orderings.add(shuffle(options).join(','));
    }

    expect(orderings.size).toBe(2);
  });
});
