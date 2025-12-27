import dotenvx from '@dotenvx/dotenvx'

import type { Config, EnvType } from '../config'

import { BUILTIN_EXCLUDE_PREFIXES } from '../config'

export type EnvRecord = Record<string, string>

export type EnvVar = {
	key: string
	value: string
	scope: 'public' | 'private'
	encrypted: boolean
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

/**
 * 加载并解析 env 文件
 */
export async function loadEnvFile(
	envPath: string,
	keysPath = '.env.keys',
): Promise<EnvRecord> {
	const file = Bun.file(envPath)
	if (!(await file.exists())) {
		throw new Error(`File not found: ${envPath}`)
	}

	const content = await file.text()

	// 尝试加载私钥
	let privateKey: string | undefined
	const keysFile = Bun.file(keysPath)
	if (await keysFile.exists()) {
		const keysContent = await keysFile.text()
		// 根据文件名提取对应的私钥
		const envName = envPath.includes('production')
			? 'PRODUCTION'
			: 'DEVELOPMENT'
		const keyMatch = keysContent.match(
			new RegExp(`DOTENV_PRIVATE_KEY_${envName}=["']?([^"'\n]+)["']?`),
		)
		if (keyMatch) {
			privateKey = keyMatch[1]
		} else {
			// 尝试通用私钥
			const defaultMatch = keysContent.match(
				/DOTENV_PRIVATE_KEY=["']?([^"'\n]+)["']?/,
			)
			if (defaultMatch) {
				privateKey = defaultMatch[1]
			}
		}
	}

	const parsed = dotenvx.parse(content, {
		privateKey,
		processEnv: {},
	})

	return parsed
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
