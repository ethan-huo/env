# GitHub Actions CI/CD

How to land GitHub Actions for a project whose env is managed by `env` — either a
fresh project or one already using the tool. Distilled from a production monorepo
(`web` + `api` on Cloudflare Workers, a Convex backend, and `docs`).

## Mental model: one bootstrap secret

The only secrets GitHub stores are the dotenvx **private keys**:

```
DOTENV_PRIVATE_KEY_DEVELOPMENT
DOTENV_PRIVATE_KEY_PRODUCTION
```

Everything else — Cloudflare/Convex deploy tokens, third-party keys, app config —
stays **encrypted in `.env.production`** and is decrypted on the runner. dotenvx
encrypts only values, so variable names stay readable in the file; the private
key turns ciphertext back into values at run time. Leak surface in CI is two keys,
not the whole environment.

Two distinct paths move prod values into production, and a real setup needs both:

| Path | Command | Reaches |
| --- | --- | --- |
| Inject at build/deploy | `dotenvx run -f .env.production -- <cmd>` | The single command's process — build-time vars (`VITE_`/`PUBLIC_`) get baked into bundles; deploy CLIs (wrangler, convex) read their tokens from the injected env |
| Sync to platform store | `bun env sync --env prod` | The deployed **runtime** — pushes vars into Convex env and Cloudflare Workers secret stores |

Build-time injection does not populate a server's runtime secret store, and
syncing does not cover values a build needs. Keep both.

## Prerequisites

- The project is initialized (`bun env init`) and `.env.production` is populated.
  For a brand-new project do that first — see `project-guide.md`, including the
  symlink-first key setup.
- Deploy tokens live **in** `.env.production`, not in GitHub:

  ```bash
  bun env set CLOUDFLARE_API_TOKEN "..." --env prod
  bun env set CONVEX_DEPLOY_KEY "..." --env prod
  ```

- `gh` CLI authenticated for the repo (used once, in Step 1).

## Step 1 — Push the private keys as repo secrets (one-time, local)

```bash
bun env install-github-action                  # current repo
bun env install-github-action --repo owner/name
```

Reads `.env.keys`, then `gh secret set`s every `DOTENV_PRIVATE_*` it finds. After
this the two private keys are the only secrets the workflows reference.

## Step 2 — Setup composite action

`.github/actions/setup/action.yml` centralizes runtime bootstrap so every job
stays three lines:

```yaml
name: Setup
description: Setup bun, install deps, materialize .env.keys
runs:
  using: composite
  steps:
    - uses: oven-sh/setup-bun@v2.2.0
    - run: bun install --frozen-lockfile
      shell: bash
    - run: bun env install-github-action
      shell: bash
```

A fresh checkout has no `.env.keys` — it is gitignored, and a local symlink to
`~/.env.keys` does not exist on the runner. Here `bun env install-github-action`
takes its other branch: it reads the `DOTENV_PRIVATE_*` values from the
environment (injected from secrets, see Step 3) and **writes `.env.keys` on the
runner**, so every later step can decrypt whether it reads the key file or the
env var.

## Step 3 — Expose the secrets to each job

Any job that decrypts must surface the secrets as env vars:

```yaml
jobs:
  build:
    runs-on: ubuntu-latest
    env:
      DOTENV_PRIVATE_KEY_DEVELOPMENT: ${{ secrets.DOTENV_PRIVATE_KEY_DEVELOPMENT }}
      DOTENV_PRIVATE_KEY_PRODUCTION: ${{ secrets.DOTENV_PRIVATE_KEY_PRODUCTION }}
    steps:
      - uses: actions/checkout@v6.0.2
      - uses: ./.github/actions/setup
      # ...
```

A reusable workflow (`uses: ./.github/workflows/_x.yml`) still maps the keys to
`env:` inside its own job exactly as above; the **caller** makes the repo secrets
reachable by passing `secrets: inherit` (Step 6).

## Step 4 — Deploy steps inject prod env with `dotenvx run`

The `env` CLI has no generic `run` passthrough — for build/deploy injection, call
dotenvx directly:

```yaml
- run: bun dotenvx run -f ./.env.production -- bun web:build       # bakes VITE_/PUBLIC_ vars
- run: bun dotenvx run -f ./.env.production -- wrangler deploy      # token from injected env
- run: bun dotenvx run -f ./.env.production -- bun convex deploy    # CONVEX_DEPLOY_KEY from env
```

Gate the deploy itself to push-on-main so PRs validate without shipping:

```yaml
- name: Deploy
  if: github.ref == 'refs/heads/main' && github.event_name == 'push'
  run: bun dotenvx run -f ./.env.production -- <deploy-cmd>
```

## Step 5 — Sync remote secret stores when prod env changes

Build-time injection does not populate the platform's runtime secret store. Add a
job that runs `bun env sync --env prod` when `.env.production` changes:

```yaml
env-sync:
  if: github.ref == 'refs/heads/main' && github.event_name == 'push'
  runs-on: ubuntu-latest
  env:
    DOTENV_PRIVATE_KEY_DEVELOPMENT: ${{ secrets.DOTENV_PRIVATE_KEY_DEVELOPMENT }}
    DOTENV_PRIVATE_KEY_PRODUCTION: ${{ secrets.DOTENV_PRIVATE_KEY_PRODUCTION }}
  steps:
    - uses: actions/checkout@v6.0.2
    - uses: ./.github/actions/setup
    - run: bun env sync --env prod
```

Narrow with `--only convex` / `--only wrangler` when a change touches one target;
see `sync.md` for sync semantics.

## Minimal single-app workflow

For a non-monorepo project, one file is enough. Steps 1–2 still apply.

```yaml
name: CI/CD
on:
  push: { branches: [main] }
  pull_request: { branches: [main] }
concurrency:
  group: ${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true
jobs:
  build-deploy:
    runs-on: ubuntu-latest
    env:
      DOTENV_PRIVATE_KEY_DEVELOPMENT: ${{ secrets.DOTENV_PRIVATE_KEY_DEVELOPMENT }}
      DOTENV_PRIVATE_KEY_PRODUCTION: ${{ secrets.DOTENV_PRIVATE_KEY_PRODUCTION }}
    steps:
      - uses: actions/checkout@v6.0.2
      - uses: ./.github/actions/setup
      - run: bun typecheck
      - run: bun dotenvx run -f ./.env.production -- bun run build
      - name: Deploy
        if: github.ref == 'refs/heads/main' && github.event_name == 'push'
        run: bun dotenvx run -f ./.env.production -- wrangler deploy
      - name: Sync runtime secrets
        if: github.ref == 'refs/heads/main' && github.event_name == 'push'
        run: bun env sync --env prod
```

## Scaling to a monorepo

When several deployables share one repo:

- **Change detection** — a `changes` job with `dorny/paths-filter@v4.0.1` outputs
  which areas changed; downstream jobs guard on those outputs (`if:
  needs.changes.outputs.web == 'true'`) so untouched areas are skipped.
- **Reusable workflows per deployable** — `_web.yml`, `_api.yml`, `_convex.yml`,
  each `on: workflow_call` with a `deploy` boolean input. The root `ci-cd.yml`
  calls them and passes both the secrets and the deploy gate:

  ```yaml
  web:
    needs: changes
    if: needs.changes.outputs.common == 'true' || needs.changes.outputs.web == 'true'
    uses: ./.github/workflows/_web.yml
    with:
      deploy: ${{ github.ref == 'refs/heads/main' && github.event_name == 'push' }}
    secrets: inherit
  ```

- **Checks on PR, deploy on main** — the same reusable workflow typechecks/builds
  unconditionally and only runs its deploy step when `inputs.deploy` is true.
- **`concurrency` cancel-in-progress** — keyed on
  `${{ github.workflow }}-${{ github.ref }}`.
- **Convex deploy race** — concurrent pushes can collide; retry on
  `Schema was overwritten by another push` with a short backoff loop rather than
  failing the run.

## Checklist

1. `.env.production` holds all prod values, including deploy tokens
   (`bun env set … --env prod`).
2. `bun env install-github-action` run locally → two `DOTENV_PRIVATE_*` repo
   secrets exist.
3. `.github/actions/setup/action.yml` present (bun + install +
   `install-github-action`).
4. Every decrypting job exposes the two key env vars; reusable workflows also get
   `secrets: inherit` from the caller.
5. Build/deploy commands wrapped in `dotenvx run -f ./.env.production -- …`.
6. Deploy steps gated on push-to-main; PRs only typecheck/build.
7. `bun env sync --env prod` runs when `.env.production` changes (or on every
   main deploy).
