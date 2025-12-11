import { Command } from 'commander'
import { symlink, readlink } from 'node:fs/promises'
import { homedir } from 'node:os'
import { c } from '../utils/color'
import { loadEnvFile, serializeEnvRecord } from '../utils/dotenv'

export const initCommand = new Command('init')
  .description('Initialize project')
  .option('--force', 'overwrite existing files', false)
  .action(async (options) => {
    const cwd = process.cwd()
    const home = homedir()

    console.log(`\n${c.info('Initializing env-tool...')}\n`)

    // 1. 处理 .env.keys (必须先于 .env 文件)
    const keysPath = `${cwd}/.env.keys`
    const globalKeysPath = `${home}/.env.keys`
    const keysFile = Bun.file(keysPath)
    const keysExists = await keysFile.exists()

    // 检查环境变量中是否有私钥
    const privateKeyEnvs = Object.entries(process.env)
      .filter(([key]) => key.startsWith('DOTENV_PRIVATE_KEY'))
      .map(([key, value]) => `${key}=${value}`)

    const globalKeysFile = Bun.file(globalKeysPath)
    const globalKeysExists = await globalKeysFile.exists()

    if (keysExists) {
      try {
        const target = await readlink(keysPath)
        if (target === globalKeysPath) {
          console.log(c.dim('- skip .env.keys (already linked)'))
        } else {
          console.log(c.dim('- skip .env.keys (exists)'))
        }
      } catch {
        console.log(c.dim('- skip .env.keys (exists)'))
      }
    } else if (globalKeysExists) {
      await symlink(globalKeysPath, keysPath)
      console.log(c.success('link .env.keys → ~/.env.keys'))
    } else if (privateKeyEnvs.length > 0) {
      const content = `#/------------------!DOTENV_PRIVATE_KEYS!-------------------/
#/ private decryption keys. DO NOT commit to source control /
#/     [how it works](https://dotenvx.com/encryption)       /
#/----------------------------------------------------------/

${privateKeyEnvs.join('\n')}
`
      await Bun.write(keysPath, content)
      console.log(c.success('create .env.keys (from env vars)'))
    } else {
      console.log(c.warn('~/.env.keys not found, please create it or set DOTENV_PRIVATE_KEY_* env vars'))
    }

    // 2. Create .env.development
    const devEnvPath = `${cwd}/.env.development`
    const devEnvExists = await Bun.file(devEnvPath).exists()
    if (!devEnvExists || options.force) {
      await Bun.write(devEnvPath, `# Development environment\n`)
      console.log(c.success('create .env.development'))
    } else {
      console.log(c.dim('- skip .env.development (exists)'))
    }

    // 2.1 Create .env.local (decrypted version for local dev)
    const localEnvPath = `${cwd}/.env.local`
    const localEnvExists = await Bun.file(localEnvPath).exists()
    if (devEnvExists && (!localEnvExists || options.force)) {
      try {
        const envRecord = await loadEnvFile(devEnvPath)
        await Bun.write(localEnvPath, serializeEnvRecord(envRecord) + '\n')
        console.log(c.success('create .env.local (decrypted from .env.development)'))
      } catch {
        console.log(c.warn('.env.local skipped (decrypt failed, missing .env.keys?)'))
      }
    } else if (localEnvExists) {
      console.log(c.dim('- skip .env.local (exists)'))
    }

    // 3. Create .env.production
    const prodEnvPath = `${cwd}/.env.production`
    const prodEnvExists = await Bun.file(prodEnvPath).exists()
    if (!prodEnvExists || options.force) {
      await Bun.write(prodEnvPath, `# Production environment\n`)
      console.log(c.success('create .env.production'))
    } else {
      console.log(c.dim('- skip .env.production (exists)'))
    }

    // 4. 创建 env.config.ts
    const configPath = `${cwd}/env.config.ts`
    const configExists = await Bun.file(configPath).exists()
    if (!configExists || options.force) {
      const configContent = `import { defineConfig } from 'env-tool/config'

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
  // },
})
`
      await Bun.write(configPath, configContent)
      console.log(c.success('create env.config.ts'))
    } else {
      console.log(c.dim('- skip env.config.ts (exists)'))
    }

    // 4. Update .gitignore
    const gitignorePath = `${cwd}/.gitignore`
    const gitignoreFile = Bun.file(gitignorePath)
    const gitignoreExists = await gitignoreFile.exists()

    const envIgnoreRules = `
# env-tool
.env.keys
.env.local
.env*.local
`

    if (gitignoreExists) {
      const content = await gitignoreFile.text()
      if (!content.includes('.env.keys')) {
        await Bun.write(gitignorePath, content + envIgnoreRules)
        console.log(c.success('update .gitignore'))
      } else {
        console.log(c.dim('- skip .gitignore (rules exist)'))
      }
    } else {
      await Bun.write(gitignorePath, envIgnoreRules.trim() + '\n')
      console.log(c.success('create .gitignore'))
    }

    console.log(`
${c.green('Done!')} Next steps:

  1. Edit .env.development and .env.production
  2. Run \`env ls\` to list variables
  3. Run \`env sync\` to generate types
  4. Run \`env sync -w\` for watch mode
`)
  })
