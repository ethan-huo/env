import { Command } from 'commander'
import { watch } from 'fs'
import { loadConfig } from '../config'
import { getEnvFilePath, loadEnvFile, parseEnvVars } from '../utils/dotenv'
import { generateTypes } from '../utils/typegen'
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

    // Typegen
    if (config.typegen) {
      const types = generateTypes(vars, config.typegen)
      const output = config.typegen.output

      if (dryRun) {
        console.log(c.dim(`[dry-run] 将生成类型到: ${output}`))
        console.log(c.dim(`[dry-run] ${vars.filter(v => v.scope === 'public').length} public, ${vars.filter(v => v.scope === 'private').length} private`))
      } else {
        await Bun.write(output, types)
        console.log(c.success(`生成类型: ${output} (${vars.filter(v => v.scope === 'public').length} public, ${vars.filter(v => v.scope === 'private').length} private)`))
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
      const result = await syncToWrangler(envRecord, config.sync.wrangler, dryRun)

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
