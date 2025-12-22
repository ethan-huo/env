import { Command } from 'commander'
import { watch } from 'fs'
import { loadConfig } from '../config'
import { dirname, join, resolve } from 'node:path'
import { mkdir, lstat, readlink, symlink } from 'node:fs/promises'
import { getEnvFilePath, loadEnvFile, parseEnvVars, serializeEnvRecord } from '../utils/dotenv'
import { generateTypes, LAZY_TS_CONTENT } from '../utils/typegen'
import { syncToConvex } from '../utils/sync-convex'
import { syncToWrangler } from '../utils/sync-wrangler'
import { c } from '../utils/color'

export const syncCommand = new Command('sync')
  .description('Run typegen + sync targets')
  .option('-e, --env <env>', 'environment: dev | prod | all', 'dev')
  .option('-w, --watch', 'watch for file changes', false)
  .option('--dry-run', 'preview mode', false)
  .action(async (options) => {
    const config = await loadConfig()

    if (!config.sync && !config.typegen) {
      console.error('Error: please configure sync or typegen in env.config.ts')
      process.exit(1)
    }

    const env = options.env as 'dev' | 'prod' | 'all'
    const envs: Array<'dev' | 'prod'> = env === 'all' ? ['dev', 'prod'] : [env]
    const wranglerConfig = config.sync?.wrangler
    const envMapping = wranglerConfig?.envMapping

    if (wranglerConfig) {
      // Safety: prevent syncing dev values to Wrangler default (prod) when envMapping is missing.
      if (!envMapping && env !== 'prod') {
        console.error('Error: wrangler envMapping is missing. Use `-e prod` or configure envMapping.')
        process.exit(1)
      }

      if (env === 'dev' && !envMapping?.dev) {
        console.error('Error: wrangler envMapping.dev is required for `-e dev`.')
        process.exit(1)
      }

      if (env === 'prod' && envMapping && !envMapping.prod) {
        console.error('Error: wrangler envMapping.prod is required for `-e prod`.')
        process.exit(1)
      }

      if (env === 'all' && (!envMapping?.dev || !envMapping?.prod)) {
        console.error('Error: wrangler envMapping.dev and envMapping.prod are required for `-e all`.')
        process.exit(1)
      }
    }

    if (!options.watch) {
      // 单次执行（默认）
      for (const e of envs) {
        await runSync(config, e, options.dryRun)
      }
      return
    }

    // Watch mode
    console.log(c.info('Starting watch mode...'))

    for (const e of envs) {
      const envPath = getEnvFilePath(config, e)
      console.log(`  watching: ${c.cyan(envPath)}`)

      // 首次执行
      await runSync(config, e, options.dryRun)

      // 监听文件变化
      watch(envPath, { persistent: true }, async (eventType) => {
        if (eventType === 'change') {
          console.log(`\n${c.success(`Change detected: ${envPath}`)}`)
          await runSync(config, e, options.dryRun)
          console.log(c.info('Waiting for changes...'))
        }
      })
    }

    console.log(c.info('Waiting for changes...\n'))

    // 保持进程运行
    await new Promise(() => {})
  })

async function runSync(
  config: Awaited<ReturnType<typeof loadConfig>>,
  env: 'dev' | 'prod',
  dryRun: boolean
) {
  const envPath = getEnvFilePath(config, env)

  try {
    const envRecord = await loadEnvFile(envPath)
    const publicPrefixes = config.typegen?.publicPrefix ?? ['VITE_', 'PUBLIC_']
    const vars = parseEnvVars(envRecord, publicPrefixes)

    // Generate .env.local (decrypted version for local dev)
    if (env === 'dev') {
      const cwd = process.cwd()
      const localEnvPath = `${cwd}/.env.local`
      if (dryRun) {
        console.log(c.dim(`[dry-run] would decrypt to: ${localEnvPath}`))
      } else {
        await Bun.write(localEnvPath, serializeEnvRecord(envRecord) + '\n')
        console.log(c.success(`decrypted: .env.local`))
      }

      if (!dryRun) {
        await linkLocalEnvFiles(config.sync?.links ?? [], localEnvPath)
      } else if ((config.sync?.links?.length ?? 0) > 0) {
        const targets = resolveLinkTargets(config.sync?.links ?? [])
        for (const target of targets) {
          console.log(c.dim(`[dry-run] would link: ${target} -> ${localEnvPath}`))
        }
      }
    }

    // Typegen
    if (config.typegen) {
      const types = generateTypes(vars, config.typegen)
      const output = config.typegen.output
      const schema = config.typegen.schema ?? 'valibot'

      if (dryRun) {
        console.log(c.dim(`[dry-run] would generate types to: ${output}`))
        console.log(c.dim(`[dry-run] ${vars.filter(v => v.scope === 'public').length} public, ${vars.filter(v => v.scope === 'private').length} private`))
      } else {
        await Bun.write(output, types)
        console.log(c.success(`typegen: ${output} (${vars.filter(v => v.scope === 'public').length} public, ${vars.filter(v => v.scope === 'private').length} private)`))

        // Inject lazy.ts if using schema validation
        if (schema !== 'none') {
          const lazyPath = join(dirname(output), 'lazy.ts')
          const lazyExists = await Bun.file(lazyPath).exists()
          if (!lazyExists) {
            await Bun.write(lazyPath, LAZY_TS_CONTENT)
            console.log(c.success(`injected: ${lazyPath}`))
          }
        }
      }
    }

    // Sync to Convex
    if (config.sync?.convex) {
      const result = await syncToConvex(envRecord, env, config.sync.convex, dryRun)

      if (dryRun) {
        console.log(c.dim(`[dry-run] Convex (${env}):`))
        if (result.added.length) console.log(c.green(`  + ${result.added.join(', ')}`))
        if (result.updated.length) console.log(c.yellow(`  ~ ${result.updated.join(', ')}`))
        if (result.removed.length) console.log(c.red(`  - ${result.removed.join(', ')}`))
        if (!result.added.length && !result.updated.length && !result.removed.length) {
          console.log(c.dim('  no changes'))
        }
      } else {
        const total = result.added.length + result.updated.length + result.removed.length
        if (total > 0) {
          console.log(c.success(`Convex (${env}): ${c.green(`+${result.added.length}`)} ${c.yellow(`~${result.updated.length}`)} ${c.red(`-${result.removed.length}`)}`))
        } else {
          console.log(c.success(`Convex (${env}): no changes`))
        }
      }
    }

    // Sync to Wrangler
    if (config.sync?.wrangler) {
      const result = await syncToWrangler(envRecord, env, config.sync.wrangler, dryRun)

      if (dryRun) {
        console.log(c.dim(`[dry-run] Wrangler:`))
        if (result.added.length) console.log(c.green(`  + ${result.added.join(', ')}`))
        if (result.updated.length) console.log(c.yellow(`  ~ ${result.updated.join(', ')}`))
        if (result.removed.length) console.log(c.red(`  - ${result.removed.join(', ')}`))
        if (!result.added.length && !result.updated.length && !result.removed.length) {
          console.log(c.dim('  no changes'))
        }
      } else {
        const total = result.added.length + result.updated.length + result.removed.length
        if (total > 0) {
          console.log(c.success(`Wrangler: ${c.green(`+${result.added.length}`)} ${c.yellow(`~${result.updated.length}`)} ${c.red(`-${result.removed.length}`)}`))
        } else {
          console.log(c.success(`Wrangler: no changes`))
        }
      }
    }
  } catch (error) {
    console.log(c.error(`${env}: ${(error as Error).message}`))
  }
}

async function linkLocalEnvFiles(links: string[], localEnvPath: string): Promise<void> {
  if (links.length === 0) return

  const targets = resolveLinkTargets(links)

  for (const target of targets) {
    await ensureSymlink(localEnvPath, target)
  }
}

function resolveLinkTargets(links: string[]): string[] {
  const cwd = process.cwd()
  return links.map(link => resolve(cwd, link, '.env.local'))
}

async function ensureSymlink(source: string, target: string): Promise<void> {
  const dir = dirname(target)
  await mkdir(dir, { recursive: true })

  try {
    const stat = await lstat(target)
    if (stat.isSymbolicLink()) {
      const existing = await readlink(target)
      if (existing === source) {
        console.log(c.dim(`- skip link (exists): ${target}`))
        return
      }
      console.log(c.warn(`- skip link (points elsewhere): ${target} -> ${existing}`))
      return
    }

    console.log(c.warn(`- skip link (exists as file/dir): ${target}`))
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw error
    }

    await symlink(source, target)
    console.log(c.success(`linked: ${target} -> ${source}`))
  }
}
