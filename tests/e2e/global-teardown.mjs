import fs from 'fs';
import path from 'path';
import os from 'os';

/** Clean up the temp DB directory created during E2E tests. */
export default function globalTeardown() {
  const tmpDir = path.join(os.tmpdir(), 'gwn-e2e');
  if (fs.existsSync(tmpDir)) {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  }
}
