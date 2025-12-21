import { Command } from 'commander'
import { c } from '../utils/color'

function extractKey(content: string, keyName: string): string | undefined {
  const match = content.match(new RegExp(`^\\s*${keyName}\\s*=\\s*(.+)\\s*$`, 'm'))
  if (!match) return undefined

  let value = match[1].trim()
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    value = value.slice(1, -1)
  }
  return value
}

export const installGithubActionCommand = new Command('install-github-action')
  .description('Install DOTENV private keys into GitHub Actions secrets')
  .option('-f, --file <path>', 'path to .env.keys file', '.env.keys')
  .option('--repo <owner/repo>', 'target repository (defaults to current)')
  .action(async (options) => {
    const keysPath = options.file as string
    const keysFile = Bun.file(keysPath)

    if (!(await keysFile.exists())) {
      console.log(c.error(`File not found: ${keysPath}`))
      process.exit(1)
    }

    const content = await keysFile.text()
    const targets = ['DOTENV_PRIVATE_KEY_DEVELOPMENT', 'DOTENV_PRIVATE_KEY_PRODUCTION']

    for (const keyName of targets) {
      const privateKey = extractKey(content, keyName)
      if (!privateKey) {
        console.log(c.error(`${keyName} not found in .env.keys`))
        process.exit(1)
      }

      const args = ['gh', 'secret', 'set', keyName, '-b', privateKey]
      if (options.repo) {
        args.push('--repo', options.repo)
      }

      const result = Bun.spawnSync(args, { stdout: 'pipe', stderr: 'pipe' })
      if (result.exitCode !== 0) {
        const stderr = result.stderr.toString().trim()
        console.log(c.error(stderr || `gh secret set failed for ${keyName}`))
        process.exit(1)
      }
    }

    console.log(c.success('GitHub Actions secrets DOTENV_PRIVATE_KEY_DEVELOPMENT and DOTENV_PRIVATE_KEY_PRODUCTION set'))
  })
