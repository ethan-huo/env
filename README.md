# env

CLI for managing environment variables with dotenvx encryption, type generation, and multi-target sync.

## Features

- **Encrypted .env files** - Uses [dotenvx](https://dotenvx.com) for encryption
- **Type generation** - Auto-generate TypeScript types with valibot/zod schemas
- **Multi-target sync** - Sync to Convex, Cloudflare Workers (wrangler)
- **Watch mode** - Auto-sync on file changes

## Install

```bash
bun add github:ethan-huo/env
```

## Usage

```bash
# Initialize project
env init

# List variables
env ls
env ls --show-values
env ls -e prod

# Get/Set/Remove
env get API_KEY
env get API_KEY -e all          # compare across envs
env set API_KEY "value"         # encrypted by default
env set API_KEY "value" --plain # plain text
env rm API_KEY

# Compare
env diff                        # dev vs prod
env diff --envs dev:prod
env diff convex                 # dotenvx vs convex

# Import (plain -> encrypted)
env import .env -f .env.production

# Install GitHub Actions secrets for CI
env install-github-action

# Sync (typegen + targets)
env sync                        # single run
env sync -w                     # watch mode
env sync --dry-run
```

## Configuration

Create `env.config.ts`:

```typescript
import { defineConfig } from 'env/config'

export default defineConfig({
  envFiles: {
    dev: '.env.development',
    prod: '.env.production',
  },

  typegen: {
    output: './src/env.ts',
    schema: 'valibot',  // 'valibot' | 'zod' | 'none'
    publicPrefix: ['VITE_', 'PUBLIC_'],
  },

  sync: {
    convex: {
      exclude: ['CONVEX_*'],
    },
    wrangler: {
      config: './wrangler.jsonc',
      exclude: ['VITE_*', 'PUBLIC_*'],
    },
    links: ['./web', './app2'],
  },
})
```

## Generated Types

The `sync` command generates typed environment schemas:

```typescript
// src/env.ts
import * as v from 'valibot'

export const publicEnvSchema = v.object({
  VITE_API_URL: v.pipe(v.string(), v.url()),
  VITE_APP_NAME: v.string(),
})

export const privateEnvSchema = v.object({
  API_SECRET: v.string(),
  DATABASE_URL: v.pipe(v.string(), v.url()),
})

export type PublicEnv = v.InferOutput<typeof publicEnvSchema>
export type PrivateEnv = v.InferOutput<typeof privateEnvSchema>
```

## Encryption Workflow

1. `env init` creates symlink `.env.keys → ~/.env.keys`
2. Edit `.env.development` and `.env.production`
3. Run `dotenvx encrypt -f .env.development` to encrypt
4. Private keys are stored in `~/.env.keys` (never commit)

In CI, set `DOTENV_PRIVATE_KEY_DEVELOPMENT` and `DOTENV_PRIVATE_KEY_PRODUCTION` environment variables.

## Commands

| Command                           | Description                                                             |
| --------------------------------- | ----------------------------------------------------------------------- |
| `env init`                        | Initialize project with config and env files                            |
| `env ls`                          | List environment variables                                              |
| `env get <key>`                   | Get variable value                                                      |
| `env set <key> <value>`           | Set variable (encrypted by default)                                     |
| `env rm <key>`                    | Remove variable                                                         |
| `env diff [target]`               | Compare envs or dotenvx vs sync targets                                 |
| `env import <source> -f <target>` | Import plain .env into encrypted env file                               |
| `env install-github-action`       | Set DOTENV_PRIVATE_KEY_DEVELOPMENT/PRODUCTION in GitHub Actions secrets |
| `env sync`                        | Run typegen and sync to configured targets                              |

## License

MIT
