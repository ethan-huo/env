import { fmt } from 'argc/terminal'

import type { AppHandlers } from '../cli'

import { resolveEnvFiles } from '../utils/dotenv'

export const runRm: AppHandlers['rm'] = async ({ input, context }) => {
	const { config, env } = context
	const { key } = input

	const targets = resolveEnvFiles(config, env ?? 'dev')

	for (const target of targets) {
		try {
			const file = Bun.file(target.path)
			if (!(await file.exists())) {
				console.log(fmt.error(`${target.env}: file not found ${target.path}`))
				continue
			}

			const content = await file.text()
			const lines = content.split('\n')

			const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
			const keyPattern = new RegExp(`^${escapedKey}=`)
			const filtered = lines.filter((line) => !keyPattern.test(line))

			if (filtered.length === lines.length) {
				console.log(fmt.error(`${target.env}: variable ${key} not found`))
				continue
			}

			await Bun.write(target.path, filtered.join('\n'))
			console.log(fmt.success(`${target.env}: deleted ${key}`))
		} catch (error) {
			console.log(fmt.error(`${target.env}: ${(error as Error).message}`))
			process.exit(1)
		}
	}
}
