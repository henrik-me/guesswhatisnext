# Contributing to Guess What's Next

Thank you for your interest in contributing! This project welcomes contributions via pull requests.

## How to Contribute

1. **Fork** the repository
2. **Create a feature branch** from `main`
3. **Make your changes** following the coding standards below
4. **Run the test suite** to verify your changes:
   ```bash
   npm run lint && npm test && npm run test:e2e
   ```
5. **Submit a pull request** targeting `main`

## Service Worker Cache Build Step

The service worker (`public/sw.js`) uses a **content-hashed `CACHE_NAME`** to ensure browser caches rotate automatically when static assets or SW logic change. The generated file is committed so fresh checkouts and `npm start` work without a build step.

**How it works:**

- [`public/sw.template.js`](public/sw.template.js) is the source template with a placeholder for the cache name
- [`scripts/build-sw.js`](scripts/build-sw.js) computes a SHA-256 digest over the template, asset paths, and asset file contents, then writes `public/sw.js` with the hashed cache name
- The build script and check command are defined in the [`scripts` block of `package.json`](package.json)
- The [Dockerfile](Dockerfile) runs the build so production images always have a fresh hash
- CI runs the freshness check on every PR (see [`.github/workflows/ci.yml`](.github/workflows/ci.yml))

**When to regenerate:** After editing [`public/sw.template.js`](public/sw.template.js) or changing the `STATIC_ASSETS` list or any referenced asset file, run the build command defined in [`package.json`](package.json). The CI freshness check is the safety net — it will fail the PR if `public/sw.js` is out-of-date.

## Coding Standards

- **Vanilla JavaScript** (ES6+) — no frameworks, no transpilers
- Use `const` by default, `let` when needed, never `var`
- Follow the naming conventions in [INSTRUCTIONS.md](INSTRUCTIONS.md)
- Add tests for new features
- Maintain existing test coverage

## Pull Request Process

- All PRs require review and approval from the maintainer before merging
- CI checks (lint, unit tests, E2E tests) must pass
- PRs are squash-merged into `main`
- Please write clear, descriptive commit messages using [conventional commits](https://www.conventionalcommits.org/)

## Reporting Issues

- Use GitHub Issues to report bugs or suggest features
- Include steps to reproduce for bug reports
- Check existing issues before creating a new one

## License

By contributing, you agree that your contributions will be licensed under the [MIT License](LICENSE).
