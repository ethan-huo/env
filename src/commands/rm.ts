import { fmt } from 'argc/terminal'

import type { AppHandlers } from '../cli'

import { getEnvFilePath } from '../utils/dotenv'

export const runRm: AppHandlers['rm'] = async ({ input, context }) => {
	const { config, env } = context
	const { key } = input

	const envs = env === 'all' ? (['dev', 'prod'] as const) : ([env] as const)

	for (const e of envs) {
		const envPath = getEnvFilePath(config, e)

		try {
			const file = Bun.file(envPath)
			if (!(await file.exists())) {
				console.log(fmt.error(`${e}: file not found ${envPath}`))
				continue
			}

			const content = await file.text()
			const lines = content.split('\n')

			const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
			const keyPattern = new RegExp(`^${escapedKey}=`)
			const filtered = lines.filter((line) => !keyPattern.test(line))

			if (filtered.length === lines.length) {
				console.log(fmt.error(`${e}: variable ${key} not found`))
				continue
			}

			await Bun.write(envPath, filtered.join('\n'))
			console.log(fmt.success(`${e}: deleted ${key}`))
		} catch (error) {
			console.log(fmt.error(`${e}: ${(error as Error).message}`))
			process.exit(1)
		}
	}
}
