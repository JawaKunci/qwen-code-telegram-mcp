# Contributing to qwen-code-telegram-mcp

First off, thank you for considering contributing to qwen-code-telegram-mcp! It's people like you that make qwen-code-telegram-mcp such a great project.

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [How Can I Contribute?](#how-can-i-contribute)
- [Getting Started](#getting-started)
- [Development Guidelines](#development-guidelines)
- [Pull Request Process](#pull-request-process)
- [Bug Reports](#bug-reports)
- [Feature Requests](#feature-requests)
- [Community](#community)

---

## Code of Conduct

This project and everyone participating in it is governed by the [Code of Conduct](CODE_OF_CONDUCT.md). By participating, you are expected to uphold this code.

---

## How Can I Contribute?

### Reporting Bugs

Before creating bug reports, please check the existing issues as you might find out that you don't need to create one. When you are creating a bug report, please include as many details as possible:

- **Use a clear and descriptive title**
- **Describe the exact steps to reproduce the problem**
- **Provide specific examples to demonstrate the steps**
- **Describe the behavior you observed and what behavior you expected**
- **Include screenshots if possible**
- **Include environment details (OS, version, etc.)**

### Suggesting Enhancements

Enhancement suggestions are tracked as GitHub issues. When creating an enhancement suggestion, please include:

- **Use a clear and descriptive title**
- **Provide a detailed description of the suggested enhancement**
- **Explain why this enhancement would be useful**
- **List some examples of how this enhancement would be used**

### Pull Requests

- Fill in the required template
- Follow the development guidelines
- Include tests if applicable
- Update documentation as needed

---

## Getting Started

### Setting Up Your Development Environment

1. Fork the repository
2. Clone your fork:
```bash
git clone https://github.com/YOUR_USERNAME/qwen-code-telegram-mcp.git
cd qwen-code-telegram-mcp
```

3. Install dependencies:
```bash
npm install
```

4. Set up environment variables:
```bash
cp .env.example .env
# Edit .env with your configuration
```

5. Run the development server:
```bash
npm run dev
```

6. Create a branch for your work:
```bash
git checkout -b feature/your-feature-name
```

---

## Development Guidelines

### Coding Style

- Follow the existing code style in the project
- Use meaningful variable and function names
- Keep functions small and focused
- Add comments for complex logic (but prefer self-documenting code)

### Code Quality

- Write tests for new features
- Ensure all tests pass before submitting PR
- Run linter before committing:
```bash
npm run lint
```

### Commit Messages

Follow the [Conventional Commits](https://www.conventionalcommits.org/) specification:

```
feat: Add new feature
fix: Fix bug
docs: Update documentation
style: Format code
refactor: Refactor code
test: Add tests
chore: Update dependencies
```

Examples:
```
feat(auth): Add OAuth2 authentication support
fix(api): Resolve null pointer in user endpoint
docs(readme): Update installation instructions
```

### Branch Naming

```
feature/add-login-page
fix/resolve-memory-leak
docs/update-api-docs
refactor/improve-error-handling
```

---

## Pull Request Process

1. Ensure your code follows the development guidelines
2. Update the README.md or other documentation if needed
3. Add or update tests as applicable
4. Ensure all tests pass and linting is clean
5. Update the CHANGELOG.md if applicable
6. Request review from maintainers
7. Once approved, your PR will be merged

### PR Checklist

- [ ] Code follows style guidelines
- [ ] Tests have been added/updated
- [ ] All tests pass
- [ ] Documentation has been updated
- [ ] No linting errors
- [ ] Commit messages follow convention

---

## Bug Reports

### How Do I Submit a Bug Report?

Bugs are tracked as GitHub issues. Create an issue and provide the following information:

- **Expected behavior** - What you expected to happen
- **Actual behavior** - What actually happened
- **Steps to reproduce** - Detailed steps to reproduce the bug
- **Environment** - OS, version, browser (if applicable), etc.
- **Screenshots/Logs** - Any relevant screenshots or error logs

### Before Submitting a Bug Report

- Check if the issue already exists
- Try to reproduce the issue with the latest version
- Collect relevant information (logs, screenshots, etc.)

---

## Feature Requests

### How Do I Submit a Feature Request?

Feature requests are tracked as GitHub issues. Create an issue and provide:

- **Use case** - Why do you need this feature?
- **Proposed solution** - How should it work?
- **Alternatives considered** - Any alternative solutions you've thought of
- **Additional context** - Any other relevant information

---

## Community

### Questions and Discussions

- Use GitHub Discussions for general questions
- Check existing discussions before creating a new one

### Contact

- **Email:** your.email@example.com
- **Discord:** Your Discord link
- **Twitter:** @yourhandle

---

## Recognition

We appreciate all contributions! Contributors will be recognized in:

- The README.md file
- Release notes (for significant contributions)
- Our contributors page

---

Thank you for contributing to qwen-code-telegram-mcp! 🎉

---

*This CONTRIBUTING.md template was adapted from various open-source projects. Feel free to customize it for your project's needs.*
