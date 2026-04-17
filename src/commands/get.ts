import type { AppHandlers } from '../cli'

import { resolveEnvFiles, loadEnvFile } from '../utils/dotenv'

export const runGet: AppHandlers['get'] = async ({ input, context }) => {
	const { config, env } = context
	const { key } = input

	const selection = env ?? 'all'
	const results: Array<{ env: string; value: string | null; error?: string }> =
		[]
	const targets = resolveEnvFiles(config, selection)

	for (const target of targets) {
		try {
			const envRecord = await loadEnvFile(target.path, { env: target.env })
			const value = envRecord[key] ?? null
			results.push({ env: target.env, value })
		} catch (error) {
			results.push({
				env: target.env,
				value: null,
				error: (error as Error).message,
			})
		}
	}

	if (selection === 'all') {
		console.log('')
		const data = results.map((r) => ({
			env: r.env,
			value: r.error ? '(error)' : (r.value ?? '(not set)'),
			status: r.error ?? 'ok',
		}))
		console.table(data)
		if (results.some((result) => result.error)) {
			process.exit(1)
		}
	} else {
		const result = results[0]
		if (result?.error) {
			console.error(result.error)
			process.exit(1)
		}
		const value = result?.value
		if (value === null || value === undefined) {
			console.error(`Variable ${key} is not set`)
			process.exit(1)
		}
		console.log(value)
	}
}
