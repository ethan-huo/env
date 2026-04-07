import dotenvx from '@dotenvx/dotenvx'
import { homedir } from 'node:os'
import { dirname, resolve } from 'node:path'

import type { Config, EnvType } from '../config'

import { BUILTIN_EXCLUDE_PREFIXES } from '../config'

export type EnvRecord = Record<string, string>
export type EnvSelection = EnvType | 'all'

export type EnvVar = {
	key: string
	value: string
	scope: 'public' | 'private'
	encrypted: boolean
}

export type ResolvedEnvFile = {
	env: EnvType
	path: string
}

/**
 * 获取 env 文件路径
 */
export function getEnvFilePath(config: Config, env: EnvType): string {
	const files = config.envFiles ?? {
		dev: '.env.development',
		prod: '.env.production',
	}
	return env === 'dev' ? files.dev : files.prod
}

export function resolveEnvFiles(
	config: Config,
	selection: EnvSelection,
): ResolvedEnvFile[] {
	if (selection === 'all') {
		return [
			{ env: 'dev', path: getEnvFilePath(config, 'dev') },
			{ env: 'prod', path: getEnvFilePath(config, 'prod') },
		]
	}

	return [{ env: selection, path: getEnvFilePath(config, selection) }]
}

/**
 * 加载并解析 env 文件
 */
export async function loadEnvFile(
	envPath: string,
	options: {
		env?: EnvType
		keysPath?: string
	} = {},
): Promise<EnvRecord> {
	const absoluteEnvPath = resolve(envPath)
	const file = Bun.file(absoluteEnvPath)
	if (!(await file.exists())) {
		throw new Error(`File not found: ${envPath}`)
	}

	// We delegate decrypt resolution to the dotenvx CLI because it already
	// understands env vars, ~/.env.keys, and custom filenames correctly.
	const args = ['dotenvx', 'decrypt', '-f', absoluteEnvPath, '--stdout']
	const keysFilePath = await resolveKeysFilePath(
		options.env,
		options.keysPath,
		process.cwd(),
	)
	if (keysFilePath) {
		args.push('-fk', keysFilePath)
	}

	const result = Bun.spawnSync(args, {
		cwd: dirname(absoluteEnvPath),
		stdout: 'pipe',
		stderr: 'pipe',
	})

	if (result.exitCode !== 0) {
		const stderr = result.stderr.toString().trim()
		throw new Error(stderr || `Failed to decrypt ${envPath}`)
	}

	const content = result.stdout.toString()
	const parsed = dotenvx.parse(content, { processEnv: {} })

	return parsed
}

export async function resolveKeysFilePath(
	env?: EnvType,
	explicitPath?: string,
	cwd = process.cwd(),
): Promise<string | undefined> {
	if (explicitPath) {
		return resolveKeysFilePathFromDisk(explicitPath, cwd)
	}

	if (hasProcessPrivateKey(env)) {
		return undefined
	}

	return resolveKeysFilePathFromDisk(undefined, cwd)
}

export async function loadKeysFile(
	keysPath?: string,
	cwd = process.cwd(),
): Promise<Record<string, string>> {
	const resolvedPath = await resolveKeysFilePathFromDisk(keysPath, cwd)
	if (!resolvedPath) {
		throw new Error('No .env.keys file found in project or home directory')
	}

	const content = await Bun.file(resolvedPath).text()
	return dotenvx.parse(content, { processEnv: {} })
}

async function resolveKeysFilePathFromDisk(
	explicitPath?: string,
	cwd = process.cwd(),
): Promise<string | undefined> {
	if (explicitPath) {
		const absolutePath = resolve(explicitPath)
		return (await Bun.file(absolutePath).exists()) ? absolutePath : undefined
	}

	const projectKeysPath = resolve(cwd, '.env.keys')
	if (await Bun.file(projectKeysPath).exists()) {
		return projectKeysPath
	}

	const homeKeysPath = resolve(homedir(), '.env.keys')
	if (await Bun.file(homeKeysPath).exists()) {
		return homeKeysPath
	}

	return undefined
}

function hasProcessPrivateKey(env?: EnvType): boolean {
	if (env === 'dev' && process.env.DOTENV_PRIVATE_KEY_DEVELOPMENT) return true
	if (env === 'prod' && process.env.DOTENV_PRIVATE_KEY_PRODUCTION) return true
	return !!process.env.DOTENV_PRIVATE_KEY
}

/**
 * 解析 env 变量为结构化列表
 */
export function parseEnvVars(
	envRecord: EnvRecord,
	publicPrefixes: string[] = ['VITE_', 'PUBLIC_'],
): EnvVar[] {
	const vars: EnvVar[] = []

	for (const [key, value] of Object.entries(envRecord)) {
		// 跳过内置忽略前缀
		if (BUILTIN_EXCLUDE_PREFIXES.some((prefix) => key.startsWith(prefix))) {
			continue
		}

		const isPublic = publicPrefixes.some((prefix) => key.startsWith(prefix))
		const isEncrypted = value.startsWith('encrypted:')

		vars.push({
			key,
			value: isEncrypted ? '(encrypted)' : value,
			scope: isPublic ? 'public' : 'private',
			encrypted: isEncrypted,
		})
	}

	// 按 key 排序
	return vars.sort((a, b) => a.key.localeCompare(b.key))
}

/**
 * 过滤变量
 */
export function filterEnvVars(vars: EnvVar[], pattern?: string): EnvVar[] {
	if (!pattern) return vars

	// 转换 glob pattern 为正则
	const regex = new RegExp(
		'^' + pattern.replace(/\*/g, '.*').replace(/\?/g, '.') + '$',
	)

	return vars.filter((v) => regex.test(v.key))
}

/**
 * 检查变量是否应该被排除
 */
export function shouldExclude(key: string, excludePatterns: string[]): boolean {
	const allPatterns = [
		...BUILTIN_EXCLUDE_PREFIXES.map((p) => p + '*'),
		...excludePatterns,
	]

	return allPatterns.some((pattern) => {
		const regex = new RegExp(
			'^' + pattern.replace(/\*/g, '.*').replace(/\?/g, '.') + '$',
		)
		return regex.test(key)
	})
}

/**
 * 将 EnvRecord 序列化为 .env 文件格式
 */
export function serializeEnvRecord(record: EnvRecord): string {
	return Object.entries(record)
		.filter(([key]) => !BUILTIN_EXCLUDE_PREFIXES.some((p) => key.startsWith(p)))
		.map(([key, value]) => {
			// 如果值包含特殊字符，用双引号包裹
			const needsQuotes = /[\s#"'`$\\]/.test(value) || value.includes('\n')
			const escaped = needsQuotes
				? `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n')}"`
				: value
			return `${key}=${escaped}`
		})
		.join('\n')
}
