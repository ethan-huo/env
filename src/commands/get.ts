import type { AppHandlers } from '../cli'

import { getEnvFilePath, loadEnvFile } from '../utils/dotenv'

export const runGet: AppHandlers['get'] = async ({ input, context }) => {
	const { config, env } = context
	const { key } = input

	const results: Array<{ env: string; value: string | null }> = []
	const envs = env === 'all' ? (['dev', 'prod'] as const) : ([env] as const)

	for (const e of envs) {
		const envPath = getEnvFilePath(config, e)
		try {
			const envRecord = await loadEnvFile(envPath)
			const value = envRecord[key] ?? null
			results.push({ env: e, value })
		} catch {
			results.push({ env: e, value: null })
		}
	}

	if (env === 'all') {
		console.log('')
		const data = results.map((r) => ({
			env: r.env,
			value: r.value ?? '(not set)',
		}))
		console.table(data)
	} else {
		const value = results[0]?.value
		if (value === null || value === undefined) {
			console.error(`Variable ${key} is not set`)
			process.exit(1)
		}
		console.log(value)
	}
}
