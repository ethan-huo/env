import { Command } from 'commander'
import { loadConfig } from '../config'
import { getEnvFilePath, loadEnvFile } from '../utils/dotenv'

export const getCommand = new Command('get')
  .description('Get environment variable value')
  .argument('<key>', 'variable name')
  .option('-e, --env <env>', 'environment: dev | prod | all', 'dev')
  .action(async (key: string, options) => {
    const config = await loadConfig()
    const env = options.env as 'dev' | 'prod' | 'all'

    const envs: Array<'dev' | 'prod'> = env === 'all' ? ['dev', 'prod'] : [env]

    const results: Array<{ env: string; value: string | null }> = []

    for (const e of envs) {
      const envPath = getEnvFilePath(config, e)
      try {
        const envRecord = await loadEnvFile(envPath)
        const value = envRecord[key] ?? null
        results.push({ env: e, value })
      } catch {
        results.push({ env: e, value: null })
      }
    }

    if (env === 'all') {
      console.log('')
      const data = results.map(r => ({
        env: r.env,
        value: r.value ?? '(not set)',
      }))
      console.table(data)
    } else {
      const result = results[0]
      if (result.value === null) {
        console.error(`Variable ${key} is not set`)
        process.exit(1)
      }
      console.log(result.value)
    }
  })
