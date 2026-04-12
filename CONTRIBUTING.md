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
