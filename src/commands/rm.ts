import { Command } from 'commander'
import { loadConfig } from '../config'
import { getEnvFilePath } from '../utils/dotenv'
import { c } from '../utils/color'

export const rmCommand = new Command('rm')
  .description('Remove environment variable')
  .argument('<key>', 'variable name')
  .option('-e, --env <env>', 'environment: dev | prod | all', 'dev')
  .action(async (key: string, options) => {
    const config = await loadConfig()
    const env = options.env as 'dev' | 'prod' | 'all'

    const envs: Array<'dev' | 'prod'> = env === 'all' ? ['dev', 'prod'] : [env]

    for (const e of envs) {
      const envPath = getEnvFilePath(config, e)

      try {
        const file = Bun.file(envPath)
        if (!(await file.exists())) {
          console.log(c.error(`${e}: file not found ${envPath}`))
          continue
        }

        const content = await file.text()
        const lines = content.split('\n')

        // 过滤掉目标 key 的行
        const keyPattern = new RegExp(`^${key}=`)
        const filtered = lines.filter(line => !keyPattern.test(line))

        if (filtered.length === lines.length) {
          console.log(c.error(`${e}: variable ${key} not found`))
          continue
        }

        await Bun.write(envPath, filtered.join('\n'))
        console.log(c.success(`${e}: deleted ${key}`))
      } catch (error) {
        console.log(c.error(`${e}: ${(error as Error).message}`))
        process.exit(1)
      }
    }
  })
