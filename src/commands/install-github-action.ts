import dotenvx from '@dotenvx/dotenvx'
import { fmt } from 'argc/terminal'

import type { AppHandlers } from '../cli'

export const runInstallGithubAction: AppHandlers['install-github-action'] =
	async ({ input }) => {
		const { file: keysPath, repo } = input
		const keysFile = Bun.file(keysPath)

		// Case 1: .env.keys exists (local) → gh secret set
		if (await keysFile.exists()) {
			const content = await keysFile.text()
			const parsed = dotenvx.parse(content, { processEnv: {} })
			const targets = Object.entries(parsed).filter(([key]) =>
				key.startsWith('DOTENV_PRIVATE_'),
			)

			if (targets.length === 0) {
				console.log(fmt.error('No DOTENV_PRIVATE_* keys found in .env.keys'))
				process.exit(1)
			}

			for (const [keyName, privateKey] of targets) {
				if (!privateKey) {
					console.log(fmt.error(`${keyName} is empty in ${keysPath}`))
					process.exit(1)
				}
				const args = ['gh', 'secret', 'set', keyName, '-b', privateKey]
				if (repo) {
					args.push('--repo', repo)
				}

				const result = Bun.spawnSync(args, { stdout: 'pipe', stderr: 'pipe' })
				if (result.exitCode !== 0) {
					const stderr = result.stderr.toString().trim()
					console.log(
						fmt.error(stderr || `gh secret set failed for ${keyName}`),
					)
					process.exit(1)
				}
			}

			console.log(
				fmt.success('GitHub Actions secrets set from DOTENV_PRIVATE_* keys'),
			)
			return
		}

		// Case 2: process.env has keys (CI) → write .env.keys only
		const privateKeyEnvs = Object.entries(process.env)
			.filter(([key, value]) => key.startsWith('DOTENV_PRIVATE_') && !!value)
			.map(([key, value]) => `${key}=${value}`)

		if (privateKeyEnvs.length === 0) {
			console.log(fmt.error('No DOTENV_PRIVATE_* keys found'))
			console.log('')
			console.log('To set up GitHub Actions secrets:')
			console.log('')
			console.log('  Local (first time):')
			console.log('    1. Run: bun env init')
			console.log('    2. Run: bun env install-github-action')
			console.log('')
			console.log('  CI (GitHub Actions):')
			console.log('    Set these secrets in your workflow:')
			console.log('      env:')
			console.log(
				'        DOTENV_PRIVATE_KEY_DEVELOPMENT: ${{ secrets.DOTENV_PRIVATE_KEY_DEVELOPMENT }}',
			)
			console.log(
				'        DOTENV_PRIVATE_KEY_PRODUCTION: ${{ secrets.DOTENV_PRIVATE_KEY_PRODUCTION }}',
			)
			process.exit(1)
		}

		const content = `#/------------------!DOTENV_PRIVATE_KEYS!-------------------/
#/ private decryption keys. DO NOT commit to source control /
#/     [how it works](https://dotenvx.com/encryption)       /
#/----------------------------------------------------------/

${privateKeyEnvs.join('\n')}
`
		await Bun.write(keysPath, content)
		console.log(fmt.success(`create ${keysPath} (from env vars)`))
	}
