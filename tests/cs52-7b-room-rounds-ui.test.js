'use strict';

/**
 * CS52-7b — UI alignment.
 *
 * The host-picks-rounds dropdown in the room-creation screen must be removed
 * because rounds is no longer client-configurable (§ Decision #8). This test
 * is a static check on `public/index.html` so the dropdown can't quietly
 * come back without breaking CI.
 */

const fs = require('fs');
const path = require('path');

describe('CS52-7b: room-creation UI', () => {
  const indexHtml = fs.readFileSync(
    path.resolve(__dirname, '..', 'public', 'index.html'),
    'utf8'
  );

  test('does NOT contain a #room-rounds dropdown', () => {
    expect(indexHtml).not.toMatch(/id=["']room-rounds["']/);
  });

  test('still has the #room-max-players dropdown (only client-configurable knob)', () => {
    expect(indexHtml).toMatch(/id=["']room-max-players["']/);
  });
});
