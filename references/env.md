# Environment Variables Management

This project uses `env-tool` for encrypted environment variable management.

## Quick Reference

```bash
# List all variables
env ls

# Get/Set variables
env get <KEY>
env set <KEY>=<VALUE>
env rm <KEY>

# Sync to targets (Convex, Cloudflare Workers, etc.)
env sync

# Watch mode - auto sync on file changes
env sync -w

# Compare environments
env diff              # dev vs prod
env diff --target     # local vs sync targets
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

### Switching environments

The tool manages two environments:
- `development` (default) - use `-e dev` or omit flag
- `production` - use `-e prod`

```bash
env ls -e prod           # List prod vars
env set -e prod KEY=val  # Set in prod
env sync -e prod         # Sync prod
```

## Type Generation

Running `env sync` generates TypeScript types at the path configured in `env.config.ts`:

```typescript
// Auto-generated src/env.ts
import * as v from 'valibot'

export const envSchema = v.object({
  DATABASE_URL: v.string(),
  VITE_API_URL: v.string(),
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
  },
})
```

## Private Keys

Decryption keys are stored in `~/.env.keys` (symlinked to project) or via environment variables:

```bash
DOTENV_PRIVATE_KEY_DEVELOPMENT=...
DOTENV_PRIVATE_KEY_PRODUCTION=...
```

## Common Tasks

| Task | Command |
|------|---------|
| Initialize project | `env init` |
| Add secret | `env set SECRET=value` |
| View all vars | `env ls` |
| Check diff before deploy | `env diff --target` |
| Deploy to prod | `env sync -e prod` |
