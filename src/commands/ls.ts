import { Command } from 'commander'
import { loadConfig } from '../config'
import {
  getEnvFilePath,
  loadEnvFile,
  parseEnvVars,
  filterEnvVars,
} from '../utils/dotenv'

type OutputFormat = 'table' | 'json' | 'export'

export const lsCommand = new Command('ls')
  .description('List all environment variables')
  .option('-e, --env <env>', 'environment: dev | prod', 'dev')
  .option('--filter <pattern>', 'filter by prefix (e.g. VITE_*)')
  .option('--show-values', 'show values', false)
  .option('--format <format>', 'output format: table | json | export', 'table')
  .action(async (options) => {
    const config = await loadConfig()
    const env = options.env as 'dev' | 'prod'
    const format = options.format as OutputFormat

    const envPath = getEnvFilePath(config, env)

    try {
      const envRecord = await loadEnvFile(envPath)
      const publicPrefixes = config.typegen?.publicPrefix ?? ['VITE_', 'PUBLIC_']
      let vars = parseEnvVars(envRecord, publicPrefixes)
      vars = filterEnvVars(vars, options.filter)

      if (vars.length === 0) {
        console.log('No environment variables found')
        return
      }

      switch (format) {
        case 'json':
          printJson(vars, options.showValues)
          break
        case 'export':
          printExport(vars, options.showValues)
          break
        case 'table':
        default:
          printTable(vars, options.showValues, env)
      }
    } catch (error) {
      console.error(`Error: ${(error as Error).message}`)
      process.exit(1)
    }
  })

function printTable(vars: ReturnType<typeof parseEnvVars>, showValues: boolean, env: string) {
  console.log(`\nEnv: ${env} (${vars.length} variables)\n`)

  const data = vars.map(v => {
    const row: Record<string, string> = {
      key: v.key,
      scope: v.scope,
    }
    if (showValues) {
      row.value = v.value.length > 40 ? v.value.slice(0, 37) + '...' : v.value
    }
    return row
  })

  console.table(data)
}

function printJson(vars: ReturnType<typeof parseEnvVars>, showValues: boolean) {
  const output = vars.map(v => ({
    key: v.key,
    scope: v.scope,
    ...(showValues ? { value: v.value } : {}),
  }))
  console.log(JSON.stringify(output, null, 2))
}

function printExport(vars: ReturnType<typeof parseEnvVars>, showValues: boolean) {
  for (const v of vars) {
    if (showValues) {
      // 转义特殊字符
      const escapedValue = v.value.replace(/"/g, '\\"')
      console.log(`export ${v.key}="${escapedValue}"`)
    } else {
      console.log(`export ${v.key}=`)
    }
  }
}
