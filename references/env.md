# Environment Variables Management

This project uses `env-tool` for encrypted environment variable management.

## Quick Reference

```bash
# List all variables
env ls

# Get/Set variables
env get <KEY>
env set <KEY> <VALUE>
env rm <KEY>

# Sync to targets (Convex, Cloudflare Workers, etc.)
env sync

# Watch mode - auto sync on file changes
env sync -w

# Import plain .env into encrypted env file
env import .env -f .env.production

# Install GitHub Actions secrets (dev + prod)
env install-github-action

# Compare environments
env diff              # dev vs prod
env diff convex       # local vs convex
env diff wrangler     # local vs wrangler
```

## File Structure

| File | Purpose | Git |
|------|---------|-----|
| `.env.development` | Dev secrets (encrypted) | ✅ Commit |
| `.env.production` | Prod secrets (encrypted) | ✅ Commit |
| `.env.local` | Decrypted dev vars for local use | ❌ Ignore |
| `.env.keys` | Private decryption keys | ❌ Ignore |
| `env.config.ts` | Tool configuration | ✅ Commit |

## Workflow

### Adding a new variable

```bash
# 1. Set the variable (auto-encrypts)
env set DATABASE_URL="postgres://..."

# 2. Sync to generate types and update targets
env sync
```

### Updating existing variable

```bash
env set DATABASE_URL="new-value"
env sync
```

### Import plain .env

```bash
env import .env -f .env.production
```

### Switching environments

The tool manages two environments:
- `development` (default) - use `-e dev` or omit flag
- `production` - use `-e prod`

```bash
env ls -e prod           # List prod vars
env set -e prod KEY val  # Set in prod
env rm -e prod KEY       # Remove from prod
env sync -e prod         # Sync prod
```

## Type Generation

Running `env sync` generates TypeScript types at the path configured in `env.config.ts`:

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
- With a single-environment Worker, only sync `prod` (`env sync -e prod`).
- Use `envMapping` only when Wrangler has multiple environments.

## .env.local

`env sync` (dev) writes a decrypted `.env.local` in the repo root. If `sync.links`
is configured, it also creates symlinks like `./web/.env.local` pointing to the
root `.env.local` (existing files are skipped).

## Private Keys

Decryption keys are stored in `~/.env.keys` (symlinked to project) or via environment variables:

```bash
DOTENV_PRIVATE_KEY_DEVELOPMENT=...
DOTENV_PRIVATE_KEY_PRODUCTION=...
```

## CI Notes

- CI runs `env init`, so GitHub Secrets must include:
  - `DOTENV_PRIVATE_KEY_DEVELOPMENT`
  - `DOTENV_PRIVATE_KEY_PRODUCTION`
- Run `env install-github-action` locally once to sync dev + prod keys to GitHub Actions.

## Common Tasks

| Task | Command |
|------|---------|
| Initialize project | `env init` |
| Add secret | `env set SECRET value` |
| View all vars | `env ls` |
| Check diff before deploy | `env diff convex` |
| Deploy to prod | `env sync -e prod` |
