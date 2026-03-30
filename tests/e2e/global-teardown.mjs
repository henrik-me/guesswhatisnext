import fs from 'fs';
import path from 'path';
import os from 'os';

/** Clean up temp DB files created during E2E tests. */
export default function globalTeardown() {
  const tmpBase = os.tmpdir();
  const entries = fs.readdirSync(tmpBase);
  for (const entry of entries) {
    if (entry.startsWith('gwn-e2e-')) {
      const fullPath = path.join(tmpBase, entry);
      try {
        fs.rmSync(fullPath, { recursive: true, force: true });
      } catch {
        // Ignore cleanup errors
      }
    }
  }
}
