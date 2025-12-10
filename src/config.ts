import * as v from 'valibot'

// Schema 类型选项
export type SchemaType = 'valibot' | 'zod' | 'none'

// 环境类型
export type EnvType = 'dev' | 'prod'

// 配置 schema
const typegenSchema = v.object({
  output: v.string(),
  schema: v.optional(v.picklist(['valibot', 'zod', 'none']), 'valibot'),
  publicPrefix: v.optional(v.array(v.string()), ['VITE_', 'PUBLIC_']),
})

const convexSyncSchema = v.object({
  exclude: v.optional(v.array(v.string()), []),
})

const wranglerSyncSchema = v.object({
  config: v.optional(v.string(), './wrangler.jsonc'),
  exclude: v.optional(v.array(v.string()), []),
})

const syncSchema = v.object({
  convex: v.optional(convexSyncSchema),
  wrangler: v.optional(wranglerSyncSchema),
})

const configSchema = v.object({
  envFiles: v.optional(
    v.object({
      dev: v.optional(v.string(), '.env.development'),
      prod: v.optional(v.string(), '.env.production'),
    }),
    { dev: '.env.development', prod: '.env.production' }
  ),
  typegen: v.optional(typegenSchema),
  sync: v.optional(syncSchema),
})

export type Config = v.InferOutput<typeof configSchema>
export type TypegenConfig = v.InferOutput<typeof typegenSchema>
export type SyncConfig = v.InferOutput<typeof syncSchema>

// 内置忽略前缀
export const BUILTIN_EXCLUDE_PREFIXES = ['DOTENV_']

export function defineConfig(config: Config): Config {
  return v.parse(configSchema, config)
}

export async function loadConfig(configPath?: string): Promise<Config> {
  const path = configPath ?? 'env.config.ts'
  const absolutePath = Bun.pathToFileURL(
    path.startsWith('/') ? path : `${process.cwd()}/${path}`
  ).href

  try {
    const mod = await import(absolutePath)
    const config = mod.default ?? mod
    return v.parse(configSchema, config)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ERR_MODULE_NOT_FOUND') {
      // 配置文件不存在，返回默认配置
      return v.parse(configSchema, {})
    }
    throw error
  }
}
