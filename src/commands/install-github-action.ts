import { fmt } from 'argc/terminal'

import type { AppHandlers } from '../cli'

function extractKey(content: string, keyName: string): string | undefined {
	const match = content.match(
		new RegExp(`^\\s*${keyName}\\s*=\\s*(.+)\\s*$`, 'm'),
	)
	if (!match) return undefined

	let value = match[1]!.trim()
	if (
		(value.startsWith('"') && value.endsWith('"')) ||
		(value.startsWith("'") && value.endsWith("'"))
	) {
		value = value.slice(1, -1)
	}
	return value
}

export const runInstallGithubAction: AppHandlers['install-github-action'] =
	async ({ input }) => {
		const { file: keysPath, repo } = input
		const keysFile = Bun.file(keysPath)

		if (!(await keysFile.exists())) {
			console.log(fmt.error(`File not found: ${keysPath}`))
			process.exit(1)
		}

		const content = await keysFile.text()
		const targets = [
			'DOTENV_PRIVATE_KEY_DEVELOPMENT',
			'DOTENV_PRIVATE_KEY_PRODUCTION',
		]

		for (const keyName of targets) {
			const privateKey = extractKey(content, keyName)
			if (!privateKey) {
				console.log(fmt.error(`${keyName} not found in .env.keys`))
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
			fmt.success(
				'GitHub Actions secrets DOTENV_PRIVATE_KEY_DEVELOPMENT and DOTENV_PRIVATE_KEY_PRODUCTION set',
			),
		)
	}
