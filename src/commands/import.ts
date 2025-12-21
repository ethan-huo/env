import { Command } from 'commander'
import { mkdir } from 'node:fs/promises'
import { dirname } from 'node:path'
import { loadEnvFile, shouldExclude } from '../utils/dotenv'
import { c } from '../utils/color'

export const importCommand = new Command('import')
  .description('Import plain .env into encrypted env file')
  .argument('<source>', 'plain .env file path')
  .option('-f, --file <path>', 'target encrypted env file path')
  .action(async (source: string, options) => {
    const targetPath = options.file as string | undefined
    if (!targetPath) {
      console.error('Error: target file is required via -f, --file')
      process.exit(1)
    }

    try {
      const envRecord = await loadEnvFile(source)
      const keysExists = await Bun.file('.env.keys').exists()
      const usePlain = !keysExists

      if (usePlain) {
        console.log(c.warn('.env.keys not found - importing as plain text'))
      }

      const targetDir = dirname(targetPath)
      if (targetDir && targetDir !== '.') {
        await mkdir(targetDir, { recursive: true })
      }

      const targetFile = Bun.file(targetPath)
      if (!(await targetFile.exists())) {
        await Bun.write(targetPath, '# Imported by env-tool\n')
      }

      let imported = 0
      for (const [key, value] of Object.entries(envRecord)) {
        if (shouldExclude(key, [])) continue

        const args = ['dotenvx', 'set', key, value, '-f', targetPath]
        if (usePlain) {
          args.push('--plain')
        }

        const result = Bun.spawnSync(args, { stdout: 'pipe', stderr: 'pipe' })
        if (result.exitCode !== 0) {
          const stderr = result.stderr.toString()
          throw new Error(stderr || `dotenvx set failed for ${key}`)
        }
        imported += 1
      }

      console.log(c.success(`imported: ${imported} variables -> ${targetPath}`))
    } catch (error) {
      console.log(c.error((error as Error).message))
      process.exit(1)
    }
  })
