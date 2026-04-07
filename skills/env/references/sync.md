# Sync Reference

Use this reference when working on `env sync`, `env diff`, type generation, or sync target behavior.

## What `env sync` does

For the selected source env file, `env sync` may perform up to four actions:

1. Decrypt dev into `.env.local`
2. Generate TypeScript env types
3. Sync to Convex
4. Sync to Wrangler

Mutation defaults to `dev`, so plain `env sync` operates on development unless `--env` is provided.

## Type generation

`typegen` is configured in `env.config.ts`:

```ts
typegen: {
  output: './src/env.ts',
  schema: 'valibot', // 'valibot' | 'zod' | 'none'
  publicPrefix: ['VITE_', 'PUBLIC_'],
}
```

Generated output is derived from the decrypted env record:

- keys with public prefixes become `public`
- all other keys become `private`
- `DOTENV_*` keys are excluded

When schema mode is not `none`, `env sync` also injects a sibling `lazy.ts` helper if missing.

## `.env.local`

Only dev sync writes `.env.local`.

- source: decrypted `.env.development` (or configured dev file)
- destination: project root `.env.local`
- optional links: `sync.links` creates symlinks like `./apps/web/.env.local`

Prod sync never writes `.env.local`.

## Convex sync

Convex sync compares the local decrypted env record with `convex env list`:

- new keys: `convex env set`
- changed keys: `convex env set`
- removed keys: `convex env remove`

`CONVEX_*` keys are skipped even without explicit excludes.

## Wrangler sync

Wrangler sync uploads secrets using `wrangler secret bulk` and removes stale keys with `wrangler secret delete`.

### Single-environment Worker

If `wrangler.jsonc` has no `env` block:

- `env sync` / `env sync --env dev` skips Wrangler with a warning
- `env sync --env prod` syncs the single Worker environment

This is deliberate: a single Worker target behaves closer to a deploy target than a local dev target.

### Multi-environment Worker

If `wrangler.jsonc` defines multiple environments, configure `envMapping`:

```ts
sync: {
  wrangler: {
    config: './wrangler.jsonc',
    envMapping: {
      dev: 'staging',
      prod: 'production',
    },
  },
}
```

Without `envMapping`, multi-env Wrangler sync should fail fast.

## Diff behavior

`env diff` compares the selected local source env file against configured sync targets.

- default query scope is `all`
- `env diff` will print one table per env when no `--env` is specified
- excludes from sync config also affect diff visibility

## Failure semantics

Single-run `env sync` must exit non-zero on real failures:

- missing source env file
- decrypt failure
- missing required Wrangler env mapping
- downstream Convex/Wrangler command failure

Watch mode keeps the process alive, but per-change failures should still be printed clearly.
