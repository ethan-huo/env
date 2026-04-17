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

# Query variables (defaults to both envs)
env ls
env ls --show-values
env get API_KEY
env diff

# Narrow query to one env
env ls --env prod
env get API_KEY --env dev
env diff --env prod

# Mutations default to dev
env set API_KEY "value"         # encrypted by default, writes dev
env set API_KEY "value" --plain # plain text, writes dev
env rm API_KEY
env sync

# Mutate prod or both envs explicitly
env set API_KEY "value" --env prod
env set API_KEY "value" --env all
env rm API_KEY --env prod
env sync --env prod

# Import (plain -> encrypted)
env import .env
env import .env --env prod
env import .env --file .env.production

# Install GitHub Actions secrets for CI
env install-github-action

# Watch mode
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
		schema: 'valibot', // 'valibot' | 'zod' | 'none'
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

1. Edit `.env.development` and `.env.production`
2. Run `dotenvx encrypt -f .env.development` to encrypt
3. Store private keys in project `.env.keys`, `~/.env.keys`, or set `DOTENV_PRIVATE_*` env vars
4. Run `env install-github-action` to sync `DOTENV_PRIVATE_*` to GitHub Actions secrets

## Environment Selection

- Query commands (`get`, `ls`, `diff`) default to `all`
- Mutating commands (`set`, `rm`, `sync`, `import`) default to `dev`
- Writing to both environments requires `--env all`

This keeps reads comprehensive and writes conservative.

## Key Resolution

When decrypting or encrypting, the CLI resolves keys in this order:

1. Explicit `--file` / env target context
2. `DOTENV_PRIVATE_KEY_*` environment variables
3. Project `.env.keys`
4. `~/.env.keys`
5. dotenvx defaults for new encrypted writes

Custom env filenames such as `.env.prod` are supported. The tool no longer
guesses the key from the filename.

## Commands

| Command                     | Description                                           |
| --------------------------- | ----------------------------------------------------- |
| `env init`                  | Initialize project with config and env files          |
| `env ls`                    | List environment variables (defaults to both envs)    |
| `env get <key>`             | Get variable value (defaults to both envs)            |
| `env set <key> <value>`     | Set variable (encrypted by default, defaults to dev)  |
| `env rm <key>`              | Remove variable (defaults to dev)                     |
| `env diff`                  | Compare local env file with sync targets              |
| `env import <source>`       | Import plain `.env` into the selected env file        |
| `env install-github-action` | Set `DOTENV_PRIVATE_*` keys in GitHub Actions secrets |
| `env sync`                  | Run typegen and sync to configured targets            |

## License

MIT
