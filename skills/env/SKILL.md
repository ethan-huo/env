---
name: env
description: >-
  Use the `env` CLI to inspect, edit, import, and sync encrypted environment
  variables across development and production, with type generation and Convex /
  Wrangler sync support.
---

## Execution rules

- Run the CLI from the target project root so `env.config.ts`, `.env.*`, and `.env.keys` resolve correctly.
- Prefer the installed CLI: `env ...`. When developing this repository itself, use `bun run src/cli.ts ...`.
- Do not edit encrypted env files by hand when `env set`, `env rm`, or `env import` can express the change.
- Treat production writes as explicit actions. Query defaults are broad; mutation defaults are conservative.

## Environment selection

- Query commands default to `all`: `env get`, `env ls`, `env diff`
- Mutation commands default to `dev`: `env set`, `env rm`, `env import`, `env sync`
- Writing both environments requires an explicit `--env all`
- Narrow to production with `--env prod`

Examples:

```bash
env get DATABASE_URL
env ls --show-values
env set API_KEY "..." --env prod
env rm LEGACY_TOKEN --env all
env sync --env prod
```

## Core workflow

### 1. Inspect before changing

Use queries first when you need to understand divergence across environments:

```bash
env get DATABASE_URL
env ls --show-values
env diff
```

If you need command semantics or output expectations, read `references/project-guide.md`.

### 2. Mutate with the CLI

Use the smallest command that expresses the change:

- Add or update one key: `env set KEY value`
- Delete one key: `env rm KEY`
- Import a plain env file: `env import .env`

Do not default to `--env all` for writes unless the user explicitly wants both envs changed.

### 3. Sync derived artifacts and remote targets

Run `env sync` after env changes when the project uses typegen, `.env.local`, Convex, or Wrangler sync.

- For sync target behavior, read `references/sync.md`
- For project-facing workflow that `env init` installs, read `references/project-guide.md`

## Key resolution

The CLI resolves decryption/encryption keys in this order:

1. `DOTENV_PRIVATE_KEY_*` environment variables
2. Project `.env.keys`
3. `~/.env.keys`
4. dotenvx defaults for first encrypted write

Custom env filenames such as `.env.prod` are supported; the tool does not infer the environment from the filename string.

## When to read references

- `references/project-guide.md`: user-facing workflow, command examples, generated files
- `references/sync.md`: typegen, `.env.local`, Convex, Wrangler, and sync edge cases
