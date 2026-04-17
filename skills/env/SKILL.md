---
name: env
description: >-
  Use the `env` CLI to inspect, edit, import, and sync encrypted environment
  variables across development and production, with type generation and Convex /
  Wrangler sync support.
---

## Execution rules

- Always invoke as `bun env ...`. Never call the bare `env ...` — `env` is a Unix system command (sets/prints process environment), and a plain `env get FOO` will be interpreted by the shell, not by this CLI. `bun env` resolves to the project-installed binary in `node_modules/.bin/`.
- When developing this repository itself, use `bun run src/cli.ts ...` instead.
- Run the CLI from the target project root so `env.config.ts`, `.env.*`, and `.env.keys` resolve correctly.
- Do not edit encrypted env files by hand when `bun env set`, `bun env rm`, or `bun env import` can express the change.
- Treat production writes as explicit actions. Query defaults are broad; mutation defaults are conservative.

## Environment selection

- Query commands default to `all`: `bun env get`, `bun env ls`, `bun env diff`
- Mutation commands default to `dev`: `bun env set`, `bun env rm`, `bun env import`, `bun env sync`
- Writing both environments requires an explicit `--env all`
- Narrow to production with `--env prod`

Examples:

```bash
bun env get DATABASE_URL
bun env ls --show-values
bun env set API_KEY "..." --env prod
bun env rm LEGACY_TOKEN --env all
bun env sync --env prod
```

## Core workflow

### 1. Inspect before changing

Use queries first when you need to understand divergence across environments:

```bash
bun env get DATABASE_URL
bun env ls --show-values
bun env diff
```

If you need command semantics or output expectations, read `references/project-guide.md`.

### 2. Mutate with the CLI

Use the smallest command that expresses the change:

- Add or update one key: `bun env set KEY value`
- Delete one key: `bun env rm KEY`
- Import a plain env file: `bun env import .env`

Do not default to `--env all` for writes unless the user explicitly wants both envs changed.

### 3. Sync derived artifacts and remote targets

Run `bun env sync` after env changes when the project uses typegen, `.env.local`, Convex, or Wrangler sync.

When only one remote target is relevant, narrow with `--only` to skip the other (Wrangler is typically the slow one):

```bash
bun env sync --only convex
bun env sync --only wrangler
```

Local steps (`.env.local`, typegen) always run regardless of `--only`.

- For sync target behavior, read `references/sync.md`
- For project-facing workflow that `bun env init` installs, read `references/project-guide.md`

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
