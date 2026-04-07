import { fmt } from 'argc/terminal'
import { mkdir } from 'node:fs/promises'
import { dirname } from 'node:path'

import type { AppHandlers } from '../cli'

import { resolveEnvFiles, resolveKeysFilePath } from '../utils/dotenv'

export const runSet: AppHandlers['set'] = async ({ input, context }) => {
	const { config, env } = context
	const { key, value, plain } = input

	const targets = resolveEnvFiles(config, env ?? 'dev')

	for (const target of targets) {
		await mkdir(dirname(target.path), { recursive: true })

		try {
			const args = ['dotenvx', 'set', key, value, '-f', target.path]
			const keysFilePath = await resolveKeysFilePath(target.env)
			if (keysFilePath) {
				args.push('-fk', keysFilePath)
			}
			if (plain) {
				args.push('--plain')
			}

			const result = Bun.spawnSync(args, { stdout: 'pipe', stderr: 'pipe' })

			if (result.exitCode !== 0) {
				const stderr = result.stderr.toString()
				throw new Error(stderr || 'dotenvx set failed')
			}

			const displayValue =
				value.length > 30 ? value.slice(0, 27) + '...' : value
			console.log(fmt.success(`${target.env}: ${key}=${displayValue}`))
		} catch (error) {
			console.log(fmt.error(`${target.env}: ${(error as Error).message}`))
			process.exit(1)
		}
	}
}
