import { afterEach, describe, expect, it } from 'bun:test'
import {
	mkdtemp,
	mkdir,
	readFile,
	rename,
	rm,
	writeFile,
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'

const CLI_PATH = resolve(import.meta.dir, '../src/cli.ts')
const CONFIG_MODULE_PATH = resolve(import.meta.dir, '../src/config.ts')

const PRIVATE_KEY_ENV_NAMES = [
	'DOTENV_PRIVATE_KEY',
	'DOTENV_PRIVATE_KEY_DEVELOPMENT',
	'DOTENV_PRIVATE_KEY_PRODUCTION',
]

const PUBLIC_KEY_ENV_NAMES = [
	'DOTENV_PUBLIC_KEY',
	'DOTENV_PUBLIC_KEY_DEVELOPMENT',
	'DOTENV_PUBLIC_KEY_PRODUCTION',
]

let tempDirs: string[] = []

async function makeTempDir(): Promise<string> {
	const dir = await mkdtemp(join(tmpdir(), 'env-cli-test-'))
	tempDirs.push(dir)
	return dir
}

function withIsolatedEnv(
	overrides: Record<string, string>,
): Record<string, string> {
	const env = { ...process.env } as Record<string, string>
	for (const key of [...PRIVATE_KEY_ENV_NAMES, ...PUBLIC_KEY_ENV_NAMES]) {
		delete env[key]
	}
	return { ...env, ...overrides }
}

function runCli(
	cwd: string,
	args: string[],
	envOverrides: Record<string, string> = {},
) {
	return Bun.spawnSync({
		cmd: ['bun', 'run', CLI_PATH, ...args],
		cwd,
		env: withIsolatedEnv(envOverrides),
		stdout: 'pipe',
		stderr: 'pipe',
	})
}

function runCommand(
	cwd: string,
	command: string[],
	envOverrides: Record<string, string> = {},
) {
	return Bun.spawnSync({
		cmd: command,
		cwd,
		env: withIsolatedEnv(envOverrides),
		stdout: 'pipe',
		stderr: 'pipe',
	})
}

async function writeFileIn(dir: string, relPath: string, content: string) {
	const fullPath = join(dir, relPath)
	await mkdir(dirname(fullPath), { recursive: true })
	await writeFile(fullPath, content, 'utf8')
}

afterEach(async () => {
	for (const dir of tempDirs) {
		await rm(dir, { recursive: true, force: true })
	}
	tempDirs = []
})

describe('cli behavior', () => {
	it('queries both environments by default', async () => {
		const projectDir = await makeTempDir()
		await writeFileIn(projectDir, '.env.development', 'FOO=dev\n')
		await writeFileIn(projectDir, '.env.production', 'FOO=prod\n')

		const getResult = runCli(projectDir, ['get', 'FOO'])
		const getOutput = getResult.stdout.toString() + getResult.stderr.toString()

		expect(getResult.exitCode).toBe(0)
		expect(getOutput).toContain('dev')
		expect(getOutput).toContain('prod')

		const lsResult = runCli(projectDir, ['ls', '--show-values'])
		const lsOutput = lsResult.stdout.toString() + lsResult.stderr.toString()

		expect(lsResult.exitCode).toBe(0)
		expect(lsOutput).toContain('Env: dev')
		expect(lsOutput).toContain('Env: prod')
		expect(lsOutput).toContain('FOO')
	})

	it('uses home .env.keys for encrypted set/get', async () => {
		const projectDir = await makeTempDir()
		const homeDir = await makeTempDir()

		const initialSet = runCommand(
			projectDir,
			['dotenvx', 'set', 'FOO', 'old-secret', '-f', '.env.production'],
			{ HOME: homeDir },
		)
		expect(initialSet.exitCode).toBe(0)

		await mkdir(homeDir, { recursive: true })
		await rename(join(projectDir, '.env.keys'), join(homeDir, '.env.keys'))

		const setResult = runCli(
			projectDir,
			['--env', 'prod', 'set', 'FOO', 'new-secret'],
			{
				HOME: homeDir,
			},
		)
		expect(setResult.exitCode).toBe(0)

		const encryptedContent = await readFile(
			join(projectDir, '.env.production'),
			'utf8',
		)
		expect(encryptedContent).toContain('encrypted:')
		expect(encryptedContent).not.toContain('FOO=new-secret')

		const getResult = runCli(projectDir, ['--env', 'prod', 'get', 'FOO'], {
			HOME: homeDir,
		})
		expect(getResult.exitCode).toBe(0)
		expect(getResult.stdout.toString().trim()).toBe('new-secret')
	})

	it('decrypts custom production filenames without guessing by pathname', async () => {
		const projectDir = await makeTempDir()
		const homeDir = await makeTempDir()

		const initialSet = runCommand(
			projectDir,
			['dotenvx', 'set', 'FOO', 'custom-prod', '-f', '.env.production'],
			{ HOME: homeDir },
		)
		expect(initialSet.exitCode).toBe(0)

		await writeFileIn(
			projectDir,
			'env.config.ts',
			`import { defineConfig } from '${CONFIG_MODULE_PATH}'

export default defineConfig({
	envFiles: {
		dev: '.env.development',
		prod: '.env.prod',
	},
})
`,
		)

		await rename(
			join(projectDir, '.env.production'),
			join(projectDir, '.env.prod'),
		)

		const getResult = runCli(projectDir, ['--env', 'prod', 'get', 'FOO'], {
			HOME: homeDir,
		})

		expect(getResult.exitCode).toBe(0)
		expect(getResult.stdout.toString().trim()).toBe('custom-prod')
	})

	it('fails sync with a non-zero exit code when the source env file is missing', async () => {
		const projectDir = await makeTempDir()
		await writeFileIn(
			projectDir,
			'env.config.ts',
			`import { defineConfig } from '${CONFIG_MODULE_PATH}'

export default defineConfig({
	typegen: {
		output: './src/env.ts',
		schema: 'none',
	},
})
`,
		)
		await mkdir(join(projectDir, 'src'), { recursive: true })

		const result = runCli(projectDir, ['sync'])
		const output = result.stdout.toString() + result.stderr.toString()

		expect(result.exitCode).toBe(1)
		expect(output).toContain('File not found')
	})

	it('init installs the env skill into .agents/skills/env', async () => {
		const projectDir = await makeTempDir()

		const result = runCli(projectDir, ['init'])
		const output = result.stdout.toString() + result.stderr.toString()

		expect(result.exitCode).toBe(0)
		expect(output).toContain('install .agents/skills/env')

		const installedSkill = await readFile(
			join(projectDir, '.agents/skills/env/SKILL.md'),
			'utf8',
		)
		const installedSyncRef = await readFile(
			join(projectDir, '.agents/skills/env/references/sync.md'),
			'utf8',
		)

		expect(installedSkill).toContain('name: env')
		expect(installedSyncRef).toContain('# Sync Reference')
	})
})
