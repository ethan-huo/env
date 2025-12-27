import { dirname, resolve } from 'node:path'

import type { EnvType, SyncConfig } from '../config'

import { shouldExclude } from './dotenv'

type WranglerConfig = NonNullable<SyncConfig['wrangler']>

/** 构建 wrangler 命令参数（处理 env mapping） */
function buildWranglerArgs(
	baseArgs: string[],
	config: WranglerConfig,
	env?: EnvType,
): string[] {
	const wranglerEnv = env ? config.envMapping?.[env] : undefined
	if (wranglerEnv) {
		return [...baseArgs, '--env', wranglerEnv]
	}
	return baseArgs
}

/**
 * 同步环境变量到 Wrangler (Cloudflare Worker)
 */
export async function syncToWrangler(
	envRecord: Record<string, string>,
	env: EnvType,
	config: WranglerConfig,
	dryRun = false,
): Promise<{ added: string[]; updated: string[]; removed: string[] }> {
	const excludePatterns = config.exclude ?? []
	const wranglerConfig = config.config ?? './wrangler.jsonc'
	const wranglerDir = dirname(resolve(wranglerConfig))

	// 获取当前 Wrangler secrets
	const currentSecrets = await getWranglerSecrets(wranglerDir, config, env)

	// 计算需要同步的变量（排除 VITE_* 等公开变量）
	const toSync: Record<string, string> = {}
	for (const [key, value] of Object.entries(envRecord)) {
		if (shouldExclude(key, excludePatterns)) continue
		toSync[key] = value
	}

	const added: string[] = []
	const updated: string[] = []
	const removed: string[] = []

	// 比较并同步
	for (const [key, value] of Object.entries(toSync)) {
		if (!currentSecrets.has(key)) {
			added.push(key)
		} else {
			// wrangler secret list 不返回值，无法判断是否变化
			// 总是更新
			updated.push(key)
		}
	}

	// 检查需要删除的变量
	for (const key of currentSecrets) {
		if (shouldExclude(key, excludePatterns)) continue
		if (!(key in toSync)) {
			removed.push(key)
		}
	}

	if (!dryRun && (added.length > 0 || updated.length > 0)) {
		// 使用 bulk 命令批量上传
		await bulkUploadSecrets(toSync, wranglerDir, config, env)
	}

	if (!dryRun) {
		for (const key of removed) {
			await deleteWranglerSecret(key, wranglerDir, config, env)
		}
	}

	return { added, updated, removed }
}

export async function getWranglerSecrets(
	cwd: string,
	config?: WranglerConfig,
	env?: EnvType,
): Promise<Set<string>> {
	const baseArgs = ['wrangler', 'secret', 'list', '--format', 'json']
	const args = config ? buildWranglerArgs(baseArgs, config, env) : baseArgs

	const result = Bun.spawnSync(['bunx', ...args], {
		stdout: 'pipe',
		stderr: 'pipe',
		cwd,
	})

	if (result.exitCode !== 0) {
		const stderr = result.stderr.toString()
		throw new Error(stderr || 'wrangler secret list failed')
	}

	try {
		const output = result.stdout.toString()
		const secrets = JSON.parse(output) as Array<{ name: string }>
		return new Set(secrets.map((s) => s.name))
	} catch {
		throw new Error('wrangler secret list returned invalid JSON')
	}
}

async function bulkUploadSecrets(
	secrets: Record<string, string>,
	cwd: string,
	config: WranglerConfig,
	env: EnvType,
): Promise<void> {
	// 写入临时 JSON 文件
	const tempFile = `/tmp/env-secrets-${Date.now()}.json`
	await Bun.write(tempFile, JSON.stringify(secrets))

	try {
		const baseArgs = ['wrangler', 'secret', 'bulk', tempFile]
		const args = buildWranglerArgs(baseArgs, config, env)

		const result = Bun.spawnSync(['bunx', ...args], {
			stdout: 'pipe',
			stderr: 'pipe',
			cwd,
		})

		if (result.exitCode !== 0) {
			const stderr = result.stderr.toString()
			throw new Error(`wrangler secret bulk failed: ${stderr}`)
		}
	} finally {
		// 清理临时文件
		const exists = await Bun.file(tempFile).exists()
		if (exists) Bun.spawnSync(['rm', tempFile])
	}
}

async function deleteWranglerSecret(
	key: string,
	cwd: string,
	config: WranglerConfig,
	env: EnvType,
): Promise<void> {
	const baseArgs = ['wrangler', 'secret', 'delete', key, '--force']
	const args = buildWranglerArgs(baseArgs, config, env)

	let result = Bun.spawnSync(['bunx', ...args], {
		stdout: 'pipe',
		stderr: 'pipe',
		cwd,
	})

	if (result.exitCode !== 0) {
		const stderr = result.stderr.toString()
		if (stderr.includes('Unknown argument: force')) {
			const retryArgs = buildWranglerArgs(
				['wrangler', 'secret', 'delete', key],
				config,
				env,
			)
			result = Bun.spawnSync(['bunx', ...retryArgs], {
				stdout: 'pipe',
				stderr: 'pipe',
				cwd,
			})
		}
	}

	if (result.exitCode !== 0) {
		const stderr = result.stderr.toString()
		throw new Error(stderr || `wrangler secret delete failed for ${key}`)
	}
}
