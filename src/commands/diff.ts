import { fmt, printTable, type TableColumn, type TableRow } from 'argc/terminal'
import { dirname, resolve } from 'node:path'

import type { Config, EnvType } from '../config'
import type { AppHandlers } from '../cli'

import { getEnvFilePath, loadEnvFile, shouldExclude } from '../utils/dotenv'
import { getWranglerSecrets } from '../utils/sync-wrangler'

export const runDiff: AppHandlers['diff'] = async ({ context }) => {
	const { config, env: globalEnv } = context

	if (!config.sync?.convex && !config.sync?.wrangler) {
		console.error('Error: no sync targets configured in env.config.ts')
		process.exit(1)
	}

	// diff doesn't support 'all', default to 'dev'
	const env = globalEnv === 'all' ? 'dev' : globalEnv
	await diffAll(config, env)
}

async function diffAll(config: Config, env: EnvType) {
	const envPath = getEnvFilePath(config, env)
	let envRecord: Record<string, string> = {}

	try {
		envRecord = await loadEnvFile(envPath)
	} catch {
		console.error(`Failed to load ${envPath}`)
		process.exit(1)
	}

	const hasConvex = !!config.sync?.convex
	const hasWrangler = !!config.sync?.wrangler

	const convexRecord = hasConvex ? await getConvexEnv(env) : {}
	const wranglerKeys = hasWrangler
		? await getWranglerSecretsForDiff(config, env)
		: new Set<string>()

	const allKeys = new Set([
		...Object.keys(envRecord),
		...Object.keys(convexRecord),
		...wranglerKeys,
	])

	const excludePatterns = [
		...(config.sync?.convex?.exclude ?? []),
		...(config.sync?.wrangler?.exclude ?? []),
	]

	const envFileName = envPath.split('/').pop() ?? `.env.${env}`
	const columns: TableColumn[] = [
		{ key: 'key', label: 'KEY' },
		{ key: 'env', label: envFileName, width: 20 },
	]

	if (hasConvex) {
		columns.push({ key: 'convex', label: 'convex', width: 20 })
	}
	if (hasWrangler) {
		columns.push({ key: 'wrangler', label: 'wrangler', width: 10 })
	}
	columns.push({ key: 'synced', label: 'synced' })

	const rows: TableRow[] = []

	for (const key of [...allKeys].sort()) {
		if (shouldExclude(key, excludePatterns)) continue

		const envVal = envRecord[key]
		const convexVal = hasConvex ? convexRecord[key] : undefined
		const wranglerExists = hasWrangler ? wranglerKeys.has(key) : undefined

		const { synced, issues } = checkSyncStatus({
			envVal,
			convexVal,
			wranglerExists,
			hasConvex,
			hasWrangler,
		})

		if (synced) continue

		const row: TableRow = {
			key,
			env: formatValue(envVal),
		}

		if (hasConvex) {
			const convexMatches = envVal === convexVal
			row.convex = convexMatches
				? formatValue(convexVal)
				: fmt.yellow(formatValue(convexVal))
		}

		if (hasWrangler) {
			const wranglerMatches = envVal !== undefined && wranglerExists
			row.wrangler = wranglerExists
				? wranglerMatches
					? fmt.green('✓')
					: fmt.yellow('✓')
				: fmt.dim('─')
		}

		row.synced = fmt.red(`✗ ${issues.join(', ')}`)
		rows.push(row)
	}

	if (rows.length === 0) {
		console.log(fmt.success(`All ${allKeys.size} keys are in sync`))
		return
	}

	console.log('')
	fmt.warn(`${rows.length} keys out of sync`)
	console.log('')
	printTable(columns, rows)
	console.log()
}

function checkSyncStatus(opts: {
	envVal: string | undefined
	convexVal: string | undefined
	wranglerExists: boolean | undefined
	hasConvex: boolean
	hasWrangler: boolean
}): { synced: boolean; issues: string[] } {
	const { envVal, convexVal, wranglerExists, hasConvex, hasWrangler } = opts
	const issues: string[] = []

	if (envVal === undefined) {
		if (hasConvex && convexVal !== undefined) {
			issues.push('removed locally')
		}
		if (hasWrangler && wranglerExists) {
			issues.push('removed locally')
		}
		return { synced: issues.length === 0, issues: [...new Set(issues)] }
	}

	if (hasConvex && convexVal !== envVal) {
		if (convexVal === undefined) {
			issues.push('missing in convex')
		} else {
			issues.push('convex differs')
		}
	}

	if (hasWrangler && !wranglerExists) {
		issues.push('missing in wrangler')
	}

	return { synced: issues.length === 0, issues }
}

function formatValue(val: string | undefined): string {
	if (val === undefined) return fmt.dim('─')
	if (val.length <= 16) return val
	return `${val.slice(0, 6)}...${val.slice(-6)}`
}

async function getConvexEnv(env: EnvType): Promise<Record<string, string>> {
	const args =
		env === 'prod'
			? ['convex', 'env', 'list', '--prod']
			: ['convex', 'env', 'list']

	const result = Bun.spawnSync(args, { stdout: 'pipe', stderr: 'pipe' })

	if (result.exitCode !== 0) {
		return {}
	}

	const output = result.stdout.toString()
	const record: Record<string, string> = {}

	for (const line of output.split('\n')) {
		const match = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/)
		if (match?.[1]) {
			record[match[1]] = match[2] ?? ''
		}
	}

	return record
}

async function getWranglerSecretsForDiff(
	config: Config,
	env: EnvType,
): Promise<Set<string>> {
	const wranglerConfig = config.sync?.wrangler
	if (!wranglerConfig) return new Set()

	const configPath = wranglerConfig.config ?? './wrangler.jsonc'
	const wranglerDir = dirname(resolve(configPath))

	return getWranglerSecrets(wranglerDir, wranglerConfig, env)
}
