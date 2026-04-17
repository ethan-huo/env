import { fmt } from 'argc/terminal'
import { mkdir } from 'node:fs/promises'
import { dirname } from 'node:path'

import type { AppHandlers } from '../cli'

import {
	loadEnvFile,
	resolveEnvFiles,
	resolveKeysFilePath,
	shouldExclude,
} from '../utils/dotenv'

export const runImport: AppHandlers['import'] = async ({ input, context }) => {
	const { config, env } = context
	const { source, file: targetPath } = input

	try {
		const envRecord = await loadEnvFile(source)
		if (targetPath && env === 'all') {
			throw new Error('`env import --file ...` does not support `--env all`')
		}
		const explicitTargetEnv: 'dev' | 'prod' = env === 'prod' ? 'prod' : 'dev'
		const targets = targetPath
			? [{ env: explicitTargetEnv, path: targetPath }]
			: resolveEnvFiles(config, env ?? 'dev')

		for (const target of targets) {
			const targetDir = dirname(target.path)
			if (targetDir && targetDir !== '.') {
				await mkdir(targetDir, { recursive: true })
			}

			const targetFile = Bun.file(target.path)
			if (!(await targetFile.exists())) {
				await Bun.write(target.path, '# Imported by env\n')
			}

			let imported = 0
			for (const [key, value] of Object.entries(envRecord)) {
				if (shouldExclude(key, [])) continue

				const args = ['dotenvx', 'set', key, value, '-f', target.path]
				const keysFilePath = await resolveKeysFilePath(target.env)
				if (keysFilePath) {
					args.push('-fk', keysFilePath)
				}

				const result = Bun.spawnSync(args, { stdout: 'pipe', stderr: 'pipe' })
				if (result.exitCode !== 0) {
					const stderr = result.stderr.toString()
					throw new Error(stderr || `dotenvx set failed for ${key}`)
				}
				imported += 1
			}

			console.log(
				fmt.success(
					`imported (${target.env}): ${imported} variables -> ${target.path}`,
				),
			)
		}
	} catch (error) {
		console.log(fmt.error((error as Error).message))
		process.exit(1)
	}
}
