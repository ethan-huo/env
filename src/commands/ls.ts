import type { AppHandlers } from '../cli'

import {
	getEnvFilePath,
	loadEnvFile,
	parseEnvVars,
	filterEnvVars,
} from '../utils/dotenv'

export const runLs: AppHandlers['ls'] = async ({ input, context }) => {
	const { config, env: globalEnv } = context
	const { filter, showValues, format } = input

	// ls doesn't support 'all', default to 'dev'
	const env = globalEnv === 'all' ? 'dev' : globalEnv
	const envPath = getEnvFilePath(config, env)

	try {
		const envRecord = await loadEnvFile(envPath)
		const publicPrefixes = config.typegen?.publicPrefix ?? ['VITE_', 'PUBLIC_']
		let vars = parseEnvVars(envRecord, publicPrefixes)
		vars = filterEnvVars(vars, filter)

		if (vars.length === 0) {
			console.log('No environment variables found')
			return
		}

		switch (format) {
			case 'json':
				printJson(vars, showValues)
				break
			case 'export':
				printExport(vars, showValues)
				break
			case 'table':
			default:
				printTable(vars, showValues, env)
		}
	} catch (error) {
		console.error(`Error: ${(error as Error).message}`)
		process.exit(1)
	}
}

function printTable(
	vars: ReturnType<typeof parseEnvVars>,
	showValues: boolean,
	env: string,
) {
	console.log(`\nEnv: ${env} (${vars.length} variables)\n`)

	const data = vars.map((v) => {
		const row: Record<string, string> = {
			key: v.key,
			scope: v.scope,
		}
		if (showValues) {
			row.value = v.value.length > 40 ? v.value.slice(0, 37) + '...' : v.value
		}
		return row
	})

	console.table(data)
}

function printJson(vars: ReturnType<typeof parseEnvVars>, showValues: boolean) {
	const output = vars.map((v) => ({
		key: v.key,
		scope: v.scope,
		...(showValues ? { value: v.value } : {}),
	}))
	console.log(JSON.stringify(output, null, 2))
}

function printExport(
	vars: ReturnType<typeof parseEnvVars>,
	showValues: boolean,
) {
	for (const v of vars) {
		if (showValues) {
			const escapedValue = v.value.replace(/"/g, '\\"')
			console.log(`export ${v.key}="${escapedValue}"`)
		} else {
			console.log(`export ${v.key}=`)
		}
	}
}
