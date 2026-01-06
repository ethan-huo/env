import { fmt } from 'argc/terminal'
import { parseJSONC } from 'confbox'
import { watch } from 'fs'
import { mkdir, lstat, readFile, readlink, symlink } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'

import type { Config } from '../config'
import type { AppHandlers } from '../cli'

import {
	getEnvFilePath,
	loadEnvFile,
	parseEnvVars,
	serializeEnvRecord,
} from '../utils/dotenv'
import { syncToConvex } from '../utils/sync-convex'
import { syncToWrangler } from '../utils/sync-wrangler'
import { generateTypes, LAZY_TS_CONTENT } from '../utils/typegen'
import { findProcessEnvUsageIssues } from '../utils/process-env-usage'

export const runSync: AppHandlers['sync'] = async ({ input, context }) => {
	const { config, env } = context
	const { watch: watchMode, dryRun } = input

	if (!config.sync && !config.typegen) {
		console.error('Error: please configure sync or typegen in env.config.ts')
		process.exit(1)
	}

	const envs = env === 'all' ? (['dev', 'prod'] as const) : ([env] as const)
	const wranglerConfig = config.sync?.wrangler
	const envMapping = wranglerConfig?.envMapping

	if (wranglerConfig) {
		const wranglerConfigPath = wranglerConfig.config ?? './wrangler.jsonc'
		const hasMultiEnv = await hasWranglerMultiEnv(wranglerConfigPath)

		if (hasMultiEnv && !envMapping) {
			console.error(
				'Error: wrangler.jsonc defines multiple environments. Configure sync.wrangler.envMapping.',
			)
			process.exit(1)
		}

		if (envMapping) {
			if (env === 'dev' && !envMapping.dev) {
				console.error(
					'Error: wrangler envMapping.dev is required for `-e dev`.',
				)
				process.exit(1)
			}

			if (env === 'prod' && !envMapping.prod) {
				console.error(
					'Error: wrangler envMapping.prod is required for `-e prod`.',
				)
				process.exit(1)
			}

			if (env === 'all' && (!envMapping.dev || !envMapping.prod)) {
				console.error(
					'Error: wrangler envMapping.dev and envMapping.prod are required for `-e all`.',
				)
				process.exit(1)
			}
		}
	}

	if (!watchMode) {
		for (const e of envs) {
			await runSyncOnce(config, e, dryRun, env === 'all')
		}
		return
	}

	// Watch mode
	console.log(fmt.info('Starting watch mode...'))

	const watchers: ReturnType<typeof watch>[] = []
	let didScanUsage = false

	for (const e of envs) {
		const envPath = getEnvFilePath(config, e)
		console.log(`  watching: ${fmt.cyan(envPath)}`)

			await runSyncOnce(config, e, dryRun, env === 'all', !didScanUsage)
			didScanUsage = true

		const watcher = watch(envPath, { persistent: true }, async (eventType) => {
			if (eventType === 'change') {
				console.log('')
				fmt.success(`Change detected: ${envPath}`)
				await runSyncOnce(config, e, dryRun, env === 'all', true)
				fmt.info('Waiting for changes...')
			}
		})
		watchers.push(watcher)
	}

	console.log(fmt.info('Waiting for changes...\n'))

	// Keep process alive - watchers array prevents GC
	await new Promise(() => {
		// Reference watchers to prevent GC
		void watchers
	})
}

async function runSyncOnce(
	config: Config,
	env: 'dev' | 'prod',
	dryRun: boolean,
	allMode = false,
	scanUsage = false,
) {
	const envPath = getEnvFilePath(config, env)

	try {
		const envRecord = await loadEnvFile(envPath)
		const publicPrefixes = config.typegen?.publicPrefix ?? ['VITE_', 'PUBLIC_']
		const vars = parseEnvVars(envRecord, publicPrefixes)
		const envKeys = new Set(vars.map((v) => v.key))

		if (scanUsage) {
			const issues = await findProcessEnvUsageIssues({ envKeys })
			if (issues.length > 0) {
				console.log(
					fmt.warn(
						`process.env references not in ${envPath} (${issues.length}):`,
					),
				)
				for (const issue of issues) {
					const sample = issue.locations.slice(0, 3).join(', ')
					const suffix =
						issue.locations.length > 3
							? ` (+${issue.locations.length - 3} more)`
							: ''
					console.log(fmt.warn(`  - ${issue.key}: ${sample}${suffix}`))
				}
			}
		}

		// Generate .env.local
		if (env === 'dev') {
			const cwd = process.cwd()
			const localEnvPath = `${cwd}/.env.local`
			if (dryRun) {
				console.log(fmt.dim(`[dry-run] would decrypt to: ${localEnvPath}`))
			} else {
				await Bun.write(localEnvPath, serializeEnvRecord(envRecord) + '\n')
				console.log(fmt.success(`decrypted: .env.local`))
			}

			if (!dryRun) {
				await linkLocalEnvFiles(config.sync?.links ?? [], localEnvPath)
			} else if ((config.sync?.links?.length ?? 0) > 0) {
				const targets = resolveLinkTargets(config.sync?.links ?? [])
				for (const target of targets) {
					console.log(
						fmt.dim(`[dry-run] would link: ${target} -> ${localEnvPath}`),
					)
				}
			}
		}

		// Typegen
		if (config.typegen) {
			const types = generateTypes(vars, config.typegen)
			const output = config.typegen.output
			const schema = config.typegen.schema ?? 'valibot'

			if (dryRun) {
				console.log(fmt.dim(`[dry-run] would generate types to: ${output}`))
				console.log(
					fmt.dim(
						`[dry-run] ${vars.filter((v) => v.scope === 'public').length} public, ${vars.filter((v) => v.scope === 'private').length} private`,
					),
				)
			} else {
				await Bun.write(output, types)
				console.log(
					fmt.success(
						`typegen: ${output} (${vars.filter((v) => v.scope === 'public').length} public, ${vars.filter((v) => v.scope === 'private').length} private)`,
					),
				)

				if (schema !== 'none') {
					const lazyPath = join(dirname(output), 'lazy.ts')
					const lazyExists = await Bun.file(lazyPath).exists()
					if (!lazyExists) {
						await Bun.write(lazyPath, LAZY_TS_CONTENT)
						console.log(fmt.success(`injected: ${lazyPath}`))
					}
				}
			}
		}

		// Sync to Convex
		if (config.sync?.convex) {
			const result = await syncToConvex(
				envRecord,
				env,
				config.sync.convex,
				dryRun,
			)

			if (dryRun) {
				console.log(fmt.dim(`[dry-run] Convex (${env}):`))
				if (result.added.length)
					console.log(fmt.green(`  + ${result.added.join(', ')}`))
				if (result.updated.length)
					console.log(fmt.yellow(`  ~ ${result.updated.join(', ')}`))
				if (result.removed.length)
					console.log(fmt.red(`  - ${result.removed.join(', ')}`))
				if (
					!result.added.length &&
					!result.updated.length &&
					!result.removed.length
				) {
					console.log(fmt.dim('  no changes'))
				}
			} else {
				const total =
					result.added.length + result.updated.length + result.removed.length
				if (total > 0) {
					console.log(
						fmt.success(
							`Convex (${env}): ${fmt.green(`+${result.added.length}`)} ${fmt.yellow(`~${result.updated.length}`)} ${fmt.red(`-${result.removed.length}`)}`,
						),
					)
				} else {
					console.log(fmt.success(`Convex (${env}): no changes`))
				}
			}
		}

		// Sync to Wrangler
		if (config.sync?.wrangler) {
			const wranglerConfig = config.sync.wrangler
			const hasMultiEnv = await hasWranglerMultiEnv(
				wranglerConfig.config ?? './wrangler.jsonc',
			)

			if (!wranglerConfig.envMapping && !hasMultiEnv && env === 'dev') {
				console.log(
					fmt.warn(
						allMode
							? 'Wrangler is single-environment: dev sync skipped (all mode). Only prod is synced.'
							: 'Wrangler sync skipped for dev (single-environment worker). Use `-e prod` to sync.',
					),
				)
			} else {
				const result = await syncToWrangler(
					envRecord,
					env,
					wranglerConfig,
					dryRun,
				)

				if (dryRun) {
					console.log(fmt.dim(`[dry-run] Wrangler:`))
					if (result.added.length)
						console.log(fmt.green(`  + ${result.added.join(', ')}`))
					if (result.updated.length)
						console.log(fmt.yellow(`  ~ ${result.updated.join(', ')}`))
					if (result.removed.length)
						console.log(fmt.red(`  - ${result.removed.join(', ')}`))
					if (
						!result.added.length &&
						!result.updated.length &&
						!result.removed.length
					) {
						console.log(fmt.dim('  no changes'))
					}
				} else {
					const total =
						result.added.length + result.updated.length + result.removed.length
					if (total > 0) {
						console.log(
							fmt.success(
								`Wrangler: ${fmt.green(`+${result.added.length}`)} ${fmt.yellow(`~${result.updated.length}`)} ${fmt.red(`-${result.removed.length}`)}`,
							),
						)
					} else {
						console.log(fmt.success(`Wrangler: no changes`))
					}
				}
			}
		}
	} catch (error) {
		console.log(fmt.error(`${env}: ${(error as Error).message}`))
	}
}

async function linkLocalEnvFiles(
	links: string[],
	localEnvPath: string,
): Promise<void> {
	if (links.length === 0) return

	const targets = resolveLinkTargets(links)

	for (const target of targets) {
		await ensureSymlink(localEnvPath, target)
	}
}

function resolveLinkTargets(links: string[]): string[] {
	const cwd = process.cwd()
	return links.map((link) => resolve(cwd, link, '.env.local'))
}

async function ensureSymlink(source: string, target: string): Promise<void> {
	const dir = dirname(target)
	await mkdir(dir, { recursive: true })

	try {
		const stat = await lstat(target)
		if (stat.isSymbolicLink()) {
			const existing = await readlink(target)
			if (existing === source) {
				console.log(fmt.dim(`- skip link (exists): ${target}`))
				return
			}
			console.log(
				fmt.warn(`- skip link (points elsewhere): ${target} -> ${existing}`),
			)
			return
		}

		console.log(fmt.warn(`- skip link (exists as file/dir): ${target}`))
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
			throw error
		}

		await symlink(source, target)
		console.log(fmt.success(`linked: ${target} -> ${source}`))
	}
}

async function hasWranglerMultiEnv(configPath: string): Promise<boolean> {
	try {
		const absPath = resolve(configPath)
		const content = await readFile(absPath, 'utf8')
		const parsed = parseJSONC(content) as { env?: Record<string, unknown> }
		if (!parsed || typeof parsed !== 'object') return false
		const env = parsed.env
		if (!env || typeof env !== 'object' || Array.isArray(env)) return false
		return Object.keys(env).length > 0
	} catch {
		return false
	}
}
