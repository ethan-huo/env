import { fmt } from 'argc/terminal'

import type { AppHandlers } from '../schema'

import { getEnvFilePath } from '../utils/dotenv'

export const runSet: AppHandlers['set'] = async ({ input, context }) => {
	const { config } = context
	const { key, value, env, plain } = input

	const envs: Array<'dev' | 'prod'> =
		env === 'all' ? ['dev', 'prod'] : [env === 'all' ? 'dev' : env]

	const keysExists = await Bun.file('.env.keys').exists()
	if (!keysExists && !plain) {
		console.log(fmt.warn('.env.keys not found - writing plain text value'))
	}

	for (const e of env === 'all'
		? (['dev', 'prod'] as const)
		: ([env === 'all' ? 'dev' : env] as const)) {
		const envPath = getEnvFilePath(config, e)

		try {
			const args = ['dotenvx', 'set', key, value, '-f', envPath]
			if (plain || !keysExists) {
				args.push('--plain')
			}

			const result = Bun.spawnSync(args, { stdout: 'pipe', stderr: 'pipe' })

			if (result.exitCode !== 0) {
				const stderr = result.stderr.toString()
				throw new Error(stderr || 'dotenvx set failed')
			}

			const displayValue =
				value.length > 30 ? value.slice(0, 27) + '...' : value
			console.log(fmt.success(`${e}: ${key}=${displayValue}`))
		} catch (error) {
			console.log(fmt.error(`${e}: ${(error as Error).message}`))
			process.exit(1)
		}
	}
}
