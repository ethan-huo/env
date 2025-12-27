import { fmt } from 'argc/terminal'
import { symlink, readlink, mkdir, copyFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'

import type { AppHandlers } from '../schema'

import { loadEnvFile, serializeEnvRecord } from '../utils/dotenv'

export const runInit: AppHandlers['init'] = async ({ input }) => {
	const { force } = input
	const cwd = process.cwd()
	const home = homedir()

	console.log('')
	fmt.info('Initializing env...')
	console.log('')

	// 1. Handle .env.keys
	const keysPath = `${cwd}/.env.keys`
	const globalKeysPath = `${home}/.env.keys`
	const keysFile = Bun.file(keysPath)
	const keysExists = await keysFile.exists()

	const privateKeyEnvs = Object.entries(process.env)
		.filter(([key]) => key.startsWith('DOTENV_PRIVATE_KEY'))
		.map(([key, value]) => `${key}=${value}`)

	const globalKeysFile = Bun.file(globalKeysPath)
	const globalKeysExists = await globalKeysFile.exists()

	if (keysExists) {
		try {
			const target = await readlink(keysPath)
			if (target === globalKeysPath) {
				console.log(fmt.dim('- skip .env.keys (already linked)'))
			} else {
				console.log(fmt.dim('- skip .env.keys (exists)'))
			}
		} catch {
			console.log(fmt.dim('- skip .env.keys (exists)'))
		}
	} else if (globalKeysExists) {
		await symlink(globalKeysPath, keysPath)
		console.log(fmt.success('link .env.keys → ~/.env.keys'))
	} else if (privateKeyEnvs.length > 0) {
		const content = `#/------------------!DOTENV_PRIVATE_KEYS!-------------------/
#/ private decryption keys. DO NOT commit to source control /
#/     [how it works](https://dotenvx.com/encryption)       /
#/----------------------------------------------------------/

${privateKeyEnvs.join('\n')}
`
		await Bun.write(keysPath, content)
		console.log(fmt.success('create .env.keys (from env vars)'))
	} else {
		console.log(
			fmt.warn(
				'~/.env.keys not found, please create it or set DOTENV_PRIVATE_KEY_* env vars',
			),
		)
	}

	// 2. Create .env.development
	const devEnvPath = `${cwd}/.env.development`
	const devEnvExists = await Bun.file(devEnvPath).exists()
	if (!devEnvExists || force) {
		await Bun.write(devEnvPath, `# Development environment\n`)
		console.log(fmt.success('create .env.development'))
	} else {
		console.log(fmt.dim('- skip .env.development (exists)'))
	}

	// 2.1 Create .env.local
	const localEnvPath = `${cwd}/.env.local`
	const localEnvExists = await Bun.file(localEnvPath).exists()
	if (!localEnvExists || force) {
		try {
			const envRecord = await loadEnvFile(devEnvPath)
			await Bun.write(localEnvPath, serializeEnvRecord(envRecord) + '\n')
			console.log(
				fmt.success('create .env.local (decrypted from .env.development)'),
			)
		} catch {
			await Bun.write(
				localEnvPath,
				'# Local environment (decrypted from .env.development)\n# Run `env sync` to update\n',
			)
			console.log(fmt.success('create .env.local (placeholder)'))
		}
	} else {
		console.log(fmt.dim('- skip .env.local (exists)'))
	}

	// 3. Create .env.production
	const prodEnvPath = `${cwd}/.env.production`
	const prodEnvExists = await Bun.file(prodEnvPath).exists()
	if (!prodEnvExists || force) {
		await Bun.write(prodEnvPath, `# Production environment\n`)
		console.log(fmt.success('create .env.production'))
	} else {
		console.log(fmt.dim('- skip .env.production (exists)'))
	}

	// 4. Create env.config.ts
	const configPath = `${cwd}/env.config.ts`
	const configExists = await Bun.file(configPath).exists()
	if (!configExists || force) {
		const configContent = `import { defineConfig } from 'env/config'

export default defineConfig({
  envFiles: {
    dev: '.env.development',
    prod: '.env.production',
  },

  typegen: {
    output: './src/env.ts',
    schema: 'valibot',
    publicPrefix: ['VITE_', 'PUBLIC_'],
  },

  // sync: {
  //   convex: {
  //     exclude: ['CONVEX_*'],
  //   },
  //   wrangler: {
  //     config: './wrangler.jsonc',
  //     exclude: ['VITE_*'],
  //   },
  //   links: ['./web', './app2'],
  // },
})
`
		await Bun.write(configPath, configContent)
		console.log(fmt.success('create env.config.ts'))
	} else {
		console.log(fmt.dim('- skip env.config.ts (exists)'))
	}

	// 5. Create references/env.md
	const refsDir = `${cwd}/references`
	const envMdPath = `${refsDir}/env.md`
	const envMdExists = await Bun.file(envMdPath).exists()
	if (!envMdExists || force) {
		const templatePath = join(import.meta.dir, '../../references/env.md')
		const templateExists = await Bun.file(templatePath).exists()
		if (templateExists) {
			await mkdir(refsDir, { recursive: true })
			await copyFile(templatePath, envMdPath)
			console.log(fmt.success('create references/env.md'))
		}
	} else {
		console.log(fmt.dim('- skip references/env.md (exists)'))
	}

	// 6. Update .gitignore
	const gitignorePath = `${cwd}/.gitignore`
	const gitignoreFile = Bun.file(gitignorePath)
	const gitignoreExists = await gitignoreFile.exists()

	const envIgnoreRules = `
# env
.env.keys
.env.local
.env*.local
`

	if (gitignoreExists) {
		const content = await gitignoreFile.text()
		if (!content.includes('.env.keys')) {
			await Bun.write(gitignorePath, content + envIgnoreRules)
			console.log(fmt.success('update .gitignore'))
		} else {
			console.log(fmt.dim('- skip .gitignore (rules exist)'))
		}
	} else {
		await Bun.write(gitignorePath, envIgnoreRules.trim() + '\n')
		console.log(fmt.success('create .gitignore'))
	}

	console.log(`
${fmt.green('Done!')} Next steps:

  1. Edit .env.development and .env.production
  2. Run \`env ls\` to list variables
  3. Run \`env sync\` to generate types
  4. Run \`env sync -w\` for watch mode
`)
}
