import type { SyncConfig } from '../config'
import { shouldExclude } from './dotenv'

/**
 * 同步环境变量到 Convex
 */
export async function syncToConvex(
  envRecord: Record<string, string>,
  env: 'dev' | 'prod',
  config: SyncConfig['convex'],
  dryRun = false
): Promise<{ added: string[]; updated: string[]; removed: string[] }> {
  const excludePatterns = config?.exclude ?? []

  // 获取当前 Convex 环境变量
  const currentConvex = await getConvexEnv(env)

  // 计算需要同步的变量
  const toSync: Record<string, string> = {}
  for (const [key, value] of Object.entries(envRecord)) {
    if (shouldExclude(key, excludePatterns)) continue
    // 跳过 Convex 内置变量
    if (key.startsWith('CONVEX_')) continue
    toSync[key] = value
  }

  const added: string[] = []
  const updated: string[] = []
  const removed: string[] = []

  // 比较并同步
  for (const [key, value] of Object.entries(toSync)) {
    if (!(key in currentConvex)) {
      added.push(key)
      if (!dryRun) {
        await setConvexEnv(key, value, env)
      }
    } else if (currentConvex[key] !== value) {
      updated.push(key)
      if (!dryRun) {
        await setConvexEnv(key, value, env)
      }
    }
  }

  // 检查需要删除的变量
  for (const key of Object.keys(currentConvex)) {
    if (shouldExclude(key, excludePatterns)) continue
    if (key.startsWith('CONVEX_')) continue
    if (!(key in toSync)) {
      removed.push(key)
      if (!dryRun) {
        await removeConvexEnv(key, env)
      }
    }
  }

  return { added, updated, removed }
}

async function getConvexEnv(env: 'dev' | 'prod'): Promise<Record<string, string>> {
  const args = env === 'prod'
    ? ['convex', 'env', 'list', '--prod']
    : ['convex', 'env', 'list']

  const result = Bun.spawnSync(args, { stdout: 'pipe', stderr: 'pipe' })

  if (result.exitCode !== 0) {
    return {}
  }

  const output = result.stdout.toString()
  const record: Record<string, string> = {}

  for (const line of output.split('\n')) {
    const match = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/)
    if (match) {
      record[match[1]] = match[2]
    }
  }

  return record
}

async function setConvexEnv(key: string, value: string, env: 'dev' | 'prod'): Promise<void> {
  const args = env === 'prod'
    ? ['convex', 'env', 'set', key, value, '--prod']
    : ['convex', 'env', 'set', key, value]

  Bun.spawnSync(args, { stdout: 'pipe', stderr: 'pipe' })
}

async function removeConvexEnv(key: string, env: 'dev' | 'prod'): Promise<void> {
  const args = env === 'prod'
    ? ['convex', 'env', 'remove', key, '--prod']
    : ['convex', 'env', 'remove', key]

  Bun.spawnSync(args, { stdout: 'pipe', stderr: 'pipe' })
}
