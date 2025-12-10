import { dirname, resolve } from 'node:path'
import type { SyncConfig } from '../config'
import { shouldExclude } from './dotenv'

/**
 * 同步环境变量到 Wrangler (Cloudflare Worker)
 */
export async function syncToWrangler(
  envRecord: Record<string, string>,
  config: SyncConfig['wrangler'],
  dryRun = false
): Promise<{ added: string[]; updated: string[]; removed: string[] }> {
  const excludePatterns = config?.exclude ?? []
  const wranglerConfig = config?.config ?? './wrangler.jsonc'
  const wranglerDir = dirname(resolve(wranglerConfig))

  // 获取当前 Wrangler secrets
  const currentSecrets = await getWranglerSecrets(wranglerDir)

  // 计算需要同步的变量（排除 VITE_* 等公开变量）
  const toSync: Record<string, string> = {}
  for (const [key, value] of Object.entries(envRecord)) {
    if (shouldExclude(key, excludePatterns)) continue
    toSync[key] = value
  }

  const added: string[] = []
  const updated: string[] = []
  const removed: string[] = []

  // 比较并同步
  for (const [key, value] of Object.entries(toSync)) {
    if (!currentSecrets.has(key)) {
      added.push(key)
    } else {
      // wrangler secret list 不返回值，无法判断是否变化
      // 总是更新
      updated.push(key)
    }
  }

  // 检查需要删除的变量
  for (const key of currentSecrets) {
    if (shouldExclude(key, excludePatterns)) continue
    if (!(key in toSync)) {
      removed.push(key)
    }
  }

  if (!dryRun && (added.length > 0 || updated.length > 0)) {
    // 使用 bulk 命令批量上传
    await bulkUploadSecrets(toSync, wranglerDir)
  }

  if (!dryRun) {
    for (const key of removed) {
      await deleteWranglerSecret(key, wranglerDir)
    }
  }

  return { added, updated, removed }
}

async function getWranglerSecrets(cwd: string): Promise<Set<string>> {
  const result = Bun.spawnSync(
    ['bunx', 'wrangler', 'secret', 'list', '--format', 'json'],
    { stdout: 'pipe', stderr: 'pipe', cwd }
  )

  if (result.exitCode !== 0) {
    return new Set()
  }

  try {
    const output = result.stdout.toString()
    const secrets = JSON.parse(output) as Array<{ name: string }>
    return new Set(secrets.map(s => s.name))
  } catch {
    return new Set()
  }
}

async function bulkUploadSecrets(
  secrets: Record<string, string>,
  cwd: string
): Promise<void> {
  // 写入临时 JSON 文件
  const tempFile = `/tmp/env-tool-secrets-${Date.now()}.json`
  await Bun.write(tempFile, JSON.stringify(secrets))

  try {
    const result = Bun.spawnSync(
      ['bunx', 'wrangler', 'secret', 'bulk', tempFile],
      { stdout: 'pipe', stderr: 'pipe', cwd }
    )

    if (result.exitCode !== 0) {
      const stderr = result.stderr.toString()
      console.error(`wrangler secret bulk 失败: ${stderr}`)
    }
  } finally {
    // 清理临时文件
    await Bun.file(tempFile).exists() && Bun.spawnSync(['rm', tempFile])
  }
}

async function deleteWranglerSecret(key: string, cwd: string): Promise<void> {
  Bun.spawnSync(
    ['bunx', 'wrangler', 'secret', 'delete', key, '--force'],
    { stdout: 'pipe', stderr: 'pipe', cwd }
  )
}
