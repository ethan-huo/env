import { fmt } from 'argc/terminal'
import { mkdir } from 'node:fs/promises'
import { dirname } from 'node:path'

import type { AppHandlers } from '../schema'

import { loadEnvFile, shouldExclude } from '../utils/dotenv'

export const runImport: AppHandlers['import'] = async ({ input }) => {
	const { source, file: targetPath } = input

	if (!targetPath) {
		console.error('Error: target file is required via --file')
		process.exit(1)
	}

	try {
		const envRecord = await loadEnvFile(source)
		const keysExists = await Bun.file('.env.keys').exists()
		const usePlain = !keysExists

		if (usePlain) {
			console.log(fmt.warn('.env.keys not found - importing as plain text'))
		}

		const targetDir = dirname(targetPath)
		if (targetDir && targetDir !== '.') {
			await mkdir(targetDir, { recursive: true })
		}

		const targetFile = Bun.file(targetPath)
		if (!(await targetFile.exists())) {
			await Bun.write(targetPath, '# Imported by env\n')
		}

		let imported = 0
		for (const [key, value] of Object.entries(envRecord)) {
			if (shouldExclude(key, [])) continue

			const args = ['dotenvx', 'set', key, value, '-f', targetPath]
			if (usePlain) {
				args.push('--plain')
			}

			const result = Bun.spawnSync(args, { stdout: 'pipe', stderr: 'pipe' })
			if (result.exitCode !== 0) {
				const stderr = result.stderr.toString()
				throw new Error(stderr || `dotenvx set failed for ${key}`)
			}
			imported += 1
		}

		console.log(fmt.success(`imported: ${imported} variables -> ${targetPath}`))
	} catch (error) {
		console.log(fmt.error((error as Error).message))
		process.exit(1)
	}
}
