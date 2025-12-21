import { Command } from 'commander'
import { c } from '../utils/color'

function extractProductionKey(content: string): string | undefined {
  const match = content.match(/^\s*DOTENV_PRIVATE_KEY_PRODUCTION\s*=\s*(.+)\s*$/m)
  if (!match) return undefined

  let value = match[1].trim()
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    value = value.slice(1, -1)
  }
  return value
}

export const installGithubActionCommand = new Command('install-github-action')
  .description('Install DOTENV_PRIVATE_KEY_PRODUCTION into GitHub Actions secrets')
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
    const privateKey = extractProductionKey(content)

    if (!privateKey) {
      console.log(c.error('DOTENV_PRIVATE_KEY_PRODUCTION not found in .env.keys'))
      process.exit(1)
    }

    const args = ['gh', 'secret', 'set', 'DOTENV_PRIVATE_KEY_PRODUCTION', '-b', privateKey]
    if (options.repo) {
      args.push('--repo', options.repo)
    }

    const result = Bun.spawnSync(args, { stdout: 'pipe', stderr: 'pipe' })
    if (result.exitCode !== 0) {
      const stderr = result.stderr.toString().trim()
      console.log(c.error(stderr || 'gh secret set failed'))
      process.exit(1)
    }

    console.log(c.success('GitHub Actions secret DOTENV_PRIVATE_KEY_PRODUCTION set'))
  })
