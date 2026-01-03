# Environment Variables Management

This project uses `env` for encrypted environment variable management.

## Quick Reference

```bash
# List all variables
bun env ls

# Get/Set variables
bun env get <KEY>
bun env set <KEY> <VALUE>
bun env rm <KEY>

# Sync to targets (Convex, Cloudflare Workers, etc.)
bun env sync

# Watch mode - auto sync on file changes
bun env sync -w

# Import plain .env into encrypted env file
bun env import .env -f .env.production

# Install GitHub Actions secrets (dev + prod)
bun env install-github-action

# Compare environments
bun env diff              # dev vs prod
bun env diff convex       # local vs convex
bun env diff wrangler     # local vs wrangler
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
# 1. Set the variable (auto-encrypts)
bun env set DATABASE_URL="postgres://..."

# 2. Sync to generate types and update targets
bun env sync
```

### Updating existing variable

```bash
bun env set DATABASE_URL="new-value"
bun env sync
```

### Import plain .env

```bash
bun env import .env -f .env.production
```

### Switching environments

The tool manages two environments:

- `development` (default) - use `-e dev` or omit flag
- `production` - use `-e prod`

```bash
bun env ls -e prod           # List prod vars
bun env set -e prod KEY val  # Set in prod
bun env rm -e prod KEY       # Remove from prod
bun env sync -e prod         # Sync prod
```

## Type Generation

Running `bun env sync` generates TypeScript types at the path configured in `env.config.ts`:

```typescript
// Auto-generated src/env.ts
import * as v from 'valibot'

export const publicEnvSchema = v.object({
  VITE_API_URL: v.string(),
})

export const privateEnvSchema = v.object({
  DATABASE_URL: v.string(),
})

export const envSchema = v.object({
  ...publicEnvSchema.entries,
  ...privateEnvSchema.entries,
})

export type Env = v.InferOutput<typeof envSchema>
```

## Sync Targets

Configure in `env.config.ts`:

```typescript
export default defineConfig({
  sync: {
    convex: {
      exclude: ['CONVEX_*'],  // Skip Convex's own vars
    },
    wrangler: {
      config: './wrangler.jsonc',
      exclude: ['VITE_*'],    // Skip client-only vars
    },
    links: ['./web', './app2'], // Create .env.local symlinks in subprojects
  },
})
```

## Config Schema (defineConfig)

```typescript
export type SchemaType = 'valibot' | 'zod' | 'none'
export type EnvType = 'dev' | 'prod'

export type Config = {
  envFiles?: {
    dev?: string
    prod?: string
  }
  typegen?: {
    output: string
    schema?: SchemaType
    publicPrefix?: string[]
  }
  sync?: {
    convex?: {
      exclude?: string[]
    }
    wrangler?: {
      config?: string
      exclude?: string[]
      envMapping?: {
        dev?: string
        prod?: string
      }
    }
    links?: string[]
  }
}
```

Notes:

- If `wrangler.jsonc` has a single environment, do not set `envMapping`.
- With a single-environment Worker, `bun env sync -e dev` will skip Wrangler sync with a warning.
- Use `bun env sync -e prod` to sync Wrangler in single-environment setups.
- If `wrangler.jsonc` defines multiple environments, `envMapping` is required.

## .env.local

`bun env sync` (dev) writes a decrypted `.env.local` in the repo root. If `sync.links`
is configured, it also creates symlinks like `./web/.env.local` pointing to the
root `.env.local` (existing files are skipped).

## Private Keys

Decryption keys are stored in `.env.keys` (project file, never commit) or via environment variables:

```bash
DOTENV_PRIVATE_KEY_DEVELOPMENT=...
DOTENV_PRIVATE_KEY_PRODUCTION=...
```

## CI Notes

- In CI, set `DOTENV_PRIVATE_*` secrets as environment variables.
- Run `bun env install-github-action` locally once to sync keys to GitHub Actions.
- In GitHub Actions, running `bun env install-github-action` will write `.env.keys` from env vars.

## Common Tasks

| Task                     | Command                    |
| ------------------------ | -------------------------- |
| Initialize project       | `bun env init`             |
| Add secret               | `bun env set SECRET value` |
| View all vars            | `bun env ls`               |
| Check diff before deploy | `bun env diff convex`      |
| Deploy to prod           | `bun env sync -e prod`     |
