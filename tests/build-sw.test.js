import { describe, it, expect, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { main, extractStaticAssets, computeDigest, generate, PLACEHOLDER, HEADER } = require('../scripts/build-sw.js');

/**
 * Create an isolated fixture directory with a template and fake asset files.
 */
function createFixture(overrides = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'build-sw-test-'));
  const publicDir = path.join(dir, 'public');
  fs.mkdirSync(publicDir, { recursive: true });
  fs.mkdirSync(path.join(publicDir, 'css'), { recursive: true });
  fs.mkdirSync(path.join(publicDir, 'js'), { recursive: true });

  const templateText = overrides.templateText || `const CACHE_NAME = '${PLACEHOLDER}';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/css/style.css',
  '/js/app.js',
];
self.addEventListener('install', () => {});
`;

  const templatePath = path.join(publicDir, 'sw.template.js');
  fs.writeFileSync(templatePath, templateText);

  // Create asset files
  const assets = overrides.assets || {
    'index.html': '<html><body>Hello</body></html>',
    'css/style.css': 'body { color: red; }',
    'js/app.js': 'console.log("app");',
  };

  for (const [relPath, content] of Object.entries(assets)) {
    const fullPath = path.join(publicDir, relPath);
    const parentDir = path.dirname(fullPath);
    fs.mkdirSync(parentDir, { recursive: true });
    if (Buffer.isBuffer(content)) {
      fs.writeFileSync(fullPath, content);
    } else {
      fs.writeFileSync(fullPath, content, 'utf8');
    }
  }

  const outputPath = path.join(publicDir, 'sw.js');

  return { dir, publicDir, templatePath, outputPath, templateText };
}

function cleanupFixture(dir) {
  fs.rmSync(dir, { recursive: true, force: true });
}

describe('scripts/build-sw.js', () => {
  let fixture;

  afterEach(() => {
    if (fixture) {
      cleanupFixture(fixture.dir);
      fixture = null;
    }
  });

  describe('extractStaticAssets', () => {
    it('extracts and sorts asset paths from template', () => {
      const template = `const STATIC_ASSETS = [
  '/js/app.js',
  '/',
  '/css/style.css',
  '/index.html',
];`;
      const result = extractStaticAssets(template);
      expect(result).toEqual(['/', '/css/style.css', '/index.html', '/js/app.js']);
    });

    it('throws if STATIC_ASSETS not found', () => {
      expect(() => extractStaticAssets('const x = 1;')).toThrow('Could not find STATIC_ASSETS');
    });
  });

  describe('generate', () => {
    it('substitutes placeholder with cache name and adds header', () => {
      const template = `const CACHE_NAME = '${PLACEHOLDER}';\n`;
      const result = generate(template, 'abcd1234');
      expect(result).toContain(HEADER);
      expect(result).toContain("CACHE_NAME = 'gwn-abcd1234'");
      expect(result).not.toContain(PLACEHOLDER);
    });
  });

  describe('computeDigest', () => {
    it('returns an 8-char hex string', () => {
      fixture = createFixture();
      const assets = extractStaticAssets(fixture.templateText);
      const digest = computeDigest(fixture.templateText, assets, fixture.publicDir);
      expect(digest).toMatch(/^[0-9a-f]{8}$/);
    });

    it('throws on missing asset files', () => {
      fixture = createFixture();
      expect(() => computeDigest(fixture.templateText, ['/missing.js'], fixture.publicDir))
        .toThrow('don\'t exist');
    });
  });

  describe('main (write mode)', () => {
    it('generates sw.js with content-hashed CACHE_NAME', () => {
      fixture = createFixture();
      const result = main({
        templatePath: fixture.templatePath,
        outputPath: fixture.outputPath,
        publicDir: fixture.publicDir,
      });

      expect(result.exitCode).toBe(0);
      expect(result.digest8).toMatch(/^[0-9a-f]{8}$/);

      const output = fs.readFileSync(fixture.outputPath, 'utf8');
      expect(output).toContain(HEADER);
      expect(output).toContain(`CACHE_NAME = 'gwn-${result.digest8}'`);
      expect(output).not.toContain(PLACEHOLDER);
    });

    it('is idempotent — running twice produces byte-identical output', () => {
      fixture = createFixture();

      main({
        templatePath: fixture.templatePath,
        outputPath: fixture.outputPath,
        publicDir: fixture.publicDir,
      });
      const first = fs.readFileSync(fixture.outputPath);

      main({
        templatePath: fixture.templatePath,
        outputPath: fixture.outputPath,
        publicDir: fixture.publicDir,
      });
      const second = fs.readFileSync(fixture.outputPath);

      expect(Buffer.compare(first, second)).toBe(0);
    });
  });

  describe('digest sensitivity', () => {
    it('changes when template text changes', () => {
      fixture = createFixture();
      const result1 = main({
        templatePath: fixture.templatePath,
        outputPath: fixture.outputPath,
        publicDir: fixture.publicDir,
      });

      // Modify template text (add a comment)
      const modified = fixture.templateText + '\n// changed\n';
      fs.writeFileSync(fixture.templatePath, modified);

      const result2 = main({
        templatePath: fixture.templatePath,
        outputPath: fixture.outputPath,
        publicDir: fixture.publicDir,
      });

      expect(result1.digest8).not.toBe(result2.digest8);
    });

    it('changes when a STATIC_ASSETS path is added', () => {
      fixture = createFixture();
      const result1 = main({
        templatePath: fixture.templatePath,
        outputPath: fixture.outputPath,
        publicDir: fixture.publicDir,
      });

      // Add a new asset path and file
      const newTemplate = fixture.templateText.replace(
        "'/js/app.js',",
        "'/js/app.js',\n  '/js/extra.js',"
      );
      fs.writeFileSync(fixture.templatePath, newTemplate);
      fs.writeFileSync(path.join(fixture.publicDir, 'js', 'extra.js'), 'extra();');

      const result2 = main({
        templatePath: fixture.templatePath,
        outputPath: fixture.outputPath,
        publicDir: fixture.publicDir,
      });

      expect(result1.digest8).not.toBe(result2.digest8);
    });

    it('changes when an asset file content changes', () => {
      fixture = createFixture();
      const result1 = main({
        templatePath: fixture.templatePath,
        outputPath: fixture.outputPath,
        publicDir: fixture.publicDir,
      });

      // Modify an asset file
      fs.writeFileSync(
        path.join(fixture.publicDir, 'js', 'app.js'),
        'console.log("modified");'
      );

      const result2 = main({
        templatePath: fixture.templatePath,
        outputPath: fixture.outputPath,
        publicDir: fixture.publicDir,
      });

      expect(result1.digest8).not.toBe(result2.digest8);
    });

    it('handles binary asset files correctly', () => {
      const binaryContent = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
      fixture = createFixture({
        assets: {
          'index.html': '<html></html>',
          'css/style.css': 'body {}',
          'js/app.js': binaryContent,
        },
      });

      const result = main({
        templatePath: fixture.templatePath,
        outputPath: fixture.outputPath,
        publicDir: fixture.publicDir,
      });

      expect(result.exitCode).toBe(0);
      expect(result.digest8).toMatch(/^[0-9a-f]{8}$/);
    });
  });

  describe('--check mode', () => {
    it('exits 0 when sw.js is up-to-date', () => {
      fixture = createFixture();

      // First generate
      main({
        templatePath: fixture.templatePath,
        outputPath: fixture.outputPath,
        publicDir: fixture.publicDir,
      });

      // Then check
      const result = main({
        checkMode: true,
        templatePath: fixture.templatePath,
        outputPath: fixture.outputPath,
        publicDir: fixture.publicDir,
      });

      expect(result.exitCode).toBe(0);
    });

    it('exits 1 when sw.js is out-of-date', () => {
      fixture = createFixture();

      // Write a stale sw.js
      fs.writeFileSync(fixture.outputPath, "const CACHE_NAME = 'gwn-stale123';");

      const result = main({
        checkMode: true,
        templatePath: fixture.templatePath,
        outputPath: fixture.outputPath,
        publicDir: fixture.publicDir,
      });

      expect(result.exitCode).toBe(1);
    });

    it('exits 1 when sw.js does not exist', () => {
      fixture = createFixture();
      // Don't create outputPath

      const result = main({
        checkMode: true,
        templatePath: fixture.templatePath,
        outputPath: fixture.outputPath,
        publicDir: fixture.publicDir,
      });

      expect(result.exitCode).toBe(1);
    });

    it('does not modify sw.js on failure', () => {
      fixture = createFixture();

      // Write a stale sw.js
      const staleContent = "const CACHE_NAME = 'gwn-stale123';";
      fs.writeFileSync(fixture.outputPath, staleContent);

      main({
        checkMode: true,
        templatePath: fixture.templatePath,
        outputPath: fixture.outputPath,
        publicDir: fixture.publicDir,
      });

      // sw.js must be unchanged
      const afterCheck = fs.readFileSync(fixture.outputPath, 'utf8');
      expect(afterCheck).toBe(staleContent);
    });
  });
});
