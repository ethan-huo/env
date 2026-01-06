import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, describe, expect, it } from 'bun:test'

import { findProcessEnvUsageIssues } from '../src/utils/process-env-usage'

let tempDir: string | undefined

async function makeTempDir(): Promise<string> {
	return await mkdtemp(join(tmpdir(), 'env-test-'))
}

async function writeFileIn(dir: string, relPath: string, content: string) {
	const fullPath = join(dir, relPath)
	await mkdir(dirname(fullPath), { recursive: true })
	await writeFile(fullPath, content, 'utf8')
}

afterEach(async () => {
	if (tempDir) {
		await rm(tempDir, { recursive: true, force: true })
		tempDir = undefined
	}
})

describe('findProcessEnvUsageIssues', () => {
	it('finds process.env keys missing from envKeys', async () => {
		tempDir = await makeTempDir()
		await writeFileIn(
			tempDir,
			'src/app.ts',
			[
				'const foo = process.env.BAD',
				'const bar = process.env?.MISSING',
				'const ok = process.env["GOOD"]',
			].join('\n'),
		)
		await writeFileIn(
			tempDir,
			'node_modules/ignored.ts',
			'const skip = process.env.SKIP_ME',
		)

		const issues = await findProcessEnvUsageIssues({
			cwd: tempDir,
			envKeys: new Set(['GOOD']),
		})

		expect(issues.map((i) => i.key)).toEqual(['BAD', 'MISSING'])
		const bad = issues.find((i) => i.key === 'BAD')
		const missing = issues.find((i) => i.key === 'MISSING')
		expect(bad?.locations[0]).toMatch(/src\/app\.ts:1:\d+/)
		expect(missing?.locations[0]).toMatch(/src\/app\.ts:2:\d+/)
	})
})
