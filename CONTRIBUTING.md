# Contributing to Humanly

Thanks for your interest in contributing to Humanly. Please also read the [Code of Conduct](CODE_OF_CONDUCT.md). It applies in every project space.

## Licensing of contributions

Humanly is licensed under the [MIT License](LICENSE). There is **no CLA**. By
opening a pull request, you agree that your contribution is licensed under the
same MIT license as the rest of the project, and that you have the right to
license it.

## Getting Started

1. Fork the repository.
2. Clone your fork: `git clone https://github.com/<your-username>/humanly.git`.
3. Follow the [Development](README.md#development) section in the README to
   install dependencies and start the local services.

## Making Changes

1. Create a branch from `main`: `git checkout -b my-feature`.
2. Make your changes.
3. Run the relevant local app or package to verify the behavior.
4. Run checks for the area you changed:

```bash
pnpm type-check
pnpm test:runnable
pnpm build:all
```

5. If you changed the database schema, add a migration under
   `packages/backend/src/db/migrations` and verify it carefully.
6. Commit and push your branch.
7. Open a pull request against `main`.

If you add or change focused tests, run the narrowest relevant package command
as well and document the exact command in the pull request.

## Pull Request Guidelines

- Describe what your PR does and why.
- Keep PRs focused: one feature, fix, or documentation improvement per PR.
- Include migration files when changing the database schema.
- Include screenshots or short recordings for visible UI changes when useful.
- Call out any known limitations, skipped checks, or follow-up work.

## Code Style

- TypeScript is used across the workspace.
- Follow existing package boundaries and local patterns before adding new
  abstractions.
- Next.js and Tailwind CSS power the Publisher Portal and Writer Portal.
- Express, PostgreSQL, Redis, and SQL migrations power the backend.
- Keep shared contracts in `packages/shared` when both frontend and backend need
  the same types or validation logic.
- Treat auth, sessions, permissions, persistence, AI behavior, and writing-event
  tracking as high-risk areas that need focused verification.

## Reporting Issues

Open an issue on GitHub with:

- What you expected to happen.
- What actually happened.
- Steps to reproduce.
- Browser, OS, and environment details when relevant.
