# Environment Variables Management

This project uses `env` for encrypted environment variable management.

## Quick Reference

```bash
# List all variables (dev + prod by default)
bun env ls

# Get variables (dev + prod by default)
bun env get <KEY>

# Mutations default to dev
bun env set <KEY> <VALUE>
bun env rm <KEY>

# Sync to targets (Convex, Cloudflare Workers, etc.)
bun env sync

# Watch mode - auto sync on file changes
bun env sync --watch

# Import plain .env into encrypted env file
bun env import .env --file .env.production

# Install GitHub Actions secrets (dev + prod)
bun env install-github-action

# Compare environments
bun env diff
bun env diff --env prod
```

## File Structure

| File               | Purpose                          | Git       |
| ------------------ | -------------------------------- | --------- |
| `.env.development` | Dev secrets (encrypted)          | ✅ Commit |
| `.env.production`  | Prod secrets (encrypted)         | ✅ Commit |
| `.env.local`       | Decrypted dev vars for local use | ❌ Ignore |
| `.env.keys`        | Private decryption keys          | ❌ Ignore |
| `env.config.ts`    | Tool configuration               | ✅ Commit |

## Workflow

### Adding a new variable

```bash
# 1. Set the variable in dev (auto-encrypts)
bun env set DATABASE_URL="postgres://..."

# 2. Sync to generate types and update targets
bun env sync
```

### Updating existing variable

```bash
bun env set DATABASE_URL="new-value" --env prod
bun env sync
```

### Import plain .env

```bash
bun env import .env          # imports into .env.development
bun env import .env --env prod
bun env import .env --file .env.production
```

### Switching environments

The tool manages two environments:

- Queries (`get`, `ls`, `diff`) default to `all`
- Mutations (`set`, `rm`, `sync`, `import`) default to `dev`
- `production` requires `--env prod`
- Writing both envs requires `--env all`

```bash
bun env ls --env prod            # List prod vars
bun env get DATABASE_URL         # Compare dev/prod by default
bun env set --env prod KEY val   # Set in prod
bun env set --env all KEY val    # Explicitly set both envs
bun env rm --env prod KEY        # Remove from prod
bun env sync --env prod          # Sync prod
```

## .env.local

`bun env sync` (dev) writes a decrypted `.env.local` in the repo root. If `sync.links`
is configured, it also creates symlinks like `./web/.env.local` pointing to the
root `.env.local` (existing files are skipped).

## Private Keys

Decryption keys are resolved from:

1. `DOTENV_PRIVATE_*` environment variables
2. project `.env.keys`
3. `~/.env.keys`
4. dotenvx defaults for first encrypted write

Supported environment variables:

```bash
DOTENV_PRIVATE_KEY_DEVELOPMENT=...
DOTENV_PRIVATE_KEY_PRODUCTION=...
```

Custom filenames like `.env.prod` are supported; key selection is no longer
based on the filename containing the word `production`.

## CI Notes

- In CI, set `DOTENV_PRIVATE_*` secrets as environment variables.
- Run `bun env install-github-action` locally once to sync keys to GitHub Actions.
- In GitHub Actions, running `bun env install-github-action` will write `.env.keys` from env vars.
