import type { AppHandlers } from '../cli'

import {
	resolveEnvFiles,
	loadEnvFile,
	parseEnvVars,
	filterEnvVars,
} from '../utils/dotenv'

export const runLs: AppHandlers['ls'] = async ({ input, context }) => {
	const { config, env: globalEnv } = context
	const { filter, showValues, format } = input

	const selection = globalEnv ?? 'all'
	const targets = resolveEnvFiles(config, selection)
	let hasErrors = false

	for (const target of targets) {
		try {
			const envRecord = await loadEnvFile(target.path, { env: target.env })
			const publicPrefixes = config.typegen?.publicPrefix ?? [
				'VITE_',
				'PUBLIC_',
			]
			let vars = parseEnvVars(envRecord, publicPrefixes)
			vars = filterEnvVars(vars, filter)

			if (vars.length === 0) {
				console.log(`\nEnv: ${target.env}\n`)
				console.log('No environment variables found')
				continue
			}

			switch (format) {
				case 'json':
					printJson(vars, showValues, target.env)
					break
				case 'export':
					printExport(vars, showValues, target.env)
					break
				case 'table':
				default:
					printTable(vars, showValues, target.env)
			}
		} catch (error) {
			hasErrors = true
			console.error(`Error (${target.env}): ${(error as Error).message}`)
		}
	}

	if (hasErrors) {
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

function printJson(
	vars: ReturnType<typeof parseEnvVars>,
	showValues: boolean,
	env: string,
) {
	const output = vars.map((v) => ({
		key: v.key,
		scope: v.scope,
		...(showValues ? { value: v.value } : {}),
	}))
	console.log(`\n# ${env}\n`)
	console.log(JSON.stringify(output, null, 2))
}

function printExport(
	vars: ReturnType<typeof parseEnvVars>,
	showValues: boolean,
	env: string,
) {
	console.log(`\n# ${env}\n`)
	for (const v of vars) {
		if (showValues) {
			const escapedValue = v.value.replace(/"/g, '\\"')
			console.log(`export ${v.key}="${escapedValue}"`)
		} else {
			console.log(`export ${v.key}=`)
		}
	}
}
