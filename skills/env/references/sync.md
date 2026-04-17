# Sync Reference

Use this reference when working on `bun env sync`, `bun env diff`, type generation, or sync target behavior.

## What `bun env sync` does

For the selected source env file, `bun env sync` may perform up to four actions:

1. Decrypt dev into `.env.local`
2. Generate TypeScript env types
3. Sync to Convex
4. Sync to Wrangler

Convex and Wrangler run in parallel; their output is buffered and printed in fixed order after both finish.

Mutation defaults to `dev`, so plain `bun env sync` operates on development unless `--env` is provided.

## Narrowing remote targets

Use `--only` to skip slow remote targets when only one is relevant:

```bash
bun env sync --only convex     # skip Wrangler entirely
bun env sync --only wrangler   # skip Convex entirely
```

`--only` only narrows remote sync. Local steps (`.env.local`, typegen, `lazy.ts` injection) always run because they are fast and feed downstream sync. Passing `--only convex` when `sync.convex` is not configured (or `--only wrangler` without `sync.wrangler`) fails fast.

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

When schema mode is not `none`, `bun env sync` also injects a sibling `lazy.ts` helper if missing.

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

- `bun env sync` / `bun env sync --env dev` skips Wrangler with a warning
- `bun env sync --env prod` syncs the single Worker environment

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

`bun env diff` compares the selected local source env file against configured sync targets.

- default query scope is `all`
- `bun env diff` will print one table per env when no `--env` is specified
- excludes from sync config also affect diff visibility

## Failure semantics

Single-run `bun env sync` must exit non-zero on real failures:

- missing source env file
- decrypt failure
- missing required Wrangler env mapping
- downstream Convex/Wrangler command failure

Watch mode keeps the process alive, but per-change failures should still be printed clearly.
