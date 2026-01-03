import { fmt } from 'argc/terminal'

import type { AppHandlers } from '../cli'

function parseEnvKeys(content: string): Array<[string, string]> {
	const entries: Array<[string, string]> = []
	for (const rawLine of content.split('\n')) {
		const line = rawLine.trim()
		if (!line || line.startsWith('#')) continue

		const match = line.match(/^([^=]+)=(.*)$/)
		if (!match) continue

		const key = match[1]!.trim()
		let value = match[2]!.trim()
		if (
			(value.startsWith('"') && value.endsWith('"')) ||
			(value.startsWith("'") && value.endsWith("'"))
		) {
			value = value.slice(1, -1)
		}

		if (key.startsWith('DOTENV_PRIVATE_')) {
			entries.push([key, value])
		}
	}
	return entries
}

export const runInstallGithubAction: AppHandlers['install-github-action'] =
	async ({ input }) => {
		const { file: keysPath, repo } = input
		const keysFile = Bun.file(keysPath)

		if (!(await keysFile.exists())) {
			const privateKeyEnvs = Object.entries(process.env)
				.filter(([key, value]) => key.startsWith('DOTENV_PRIVATE_') && !!value)
				.map(([key, value]) => `${key}=${value}`)

			if (privateKeyEnvs.length === 0) {
				console.log(fmt.error(`File not found: ${keysPath}`))
				console.log(
					fmt.error(
						'No DOTENV_PRIVATE_* env vars found. Please create .env.keys or set env vars first.',
					),
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

		const content = await keysFile.text()
		const targets = parseEnvKeys(content)
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
				console.log(fmt.error(stderr || `gh secret set failed for ${keyName}`))
				process.exit(1)
			}
		}

		console.log(
			fmt.success('GitHub Actions secrets set from DOTENV_PRIVATE_* keys'),
		)
	}
