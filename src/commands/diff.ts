import { Command } from 'commander'
import { loadConfig, BUILTIN_EXCLUDE_PREFIXES } from '../config'
import { getEnvFilePath, loadEnvFile, shouldExclude } from '../utils/dotenv'

type DiffEntry = {
  key: string
  left: string | null
  right: string | null
  status: 'added' | 'removed' | 'changed' | 'same'
}

export const diffCommand = new Command('diff')
  .description('Compare environment variables')
  .argument('[target]', 'target: envs | convex | wrangler', 'envs')
  .option('-e, --env <env>', 'environment: dev | prod', 'dev')
  .option('--envs <pair>', 'compare two envs (e.g. dev:prod)')
  .option('--tool <tool>', 'external diff tool: difft | delta')
  .action(async (target: string, options) => {
    const config = await loadConfig()

    // 对比两个环境
    if (target === 'envs' || options.envs) {
      const [leftEnv, rightEnv] = (options.envs || 'dev:prod').split(':') as ['dev' | 'prod', 'dev' | 'prod']
      await diffEnvs(config, leftEnv, rightEnv, options.tool)
      return
    }

    // 对比 dotenvx 和 convex/wrangler
    if (target === 'convex') {
      await diffConvex(config, options.env as 'dev' | 'prod', options.tool)
      return
    }

    if (target === 'wrangler') {
      console.log('TODO: implement wrangler diff')
      return
    }

    console.error(`Unknown target: ${target}`)
    process.exit(1)
  })

async function diffEnvs(
  config: Awaited<ReturnType<typeof loadConfig>>,
  leftEnv: 'dev' | 'prod',
  rightEnv: 'dev' | 'prod',
  tool?: string
) {
  const leftPath = getEnvFilePath(config, leftEnv)
  const rightPath = getEnvFilePath(config, rightEnv)

  let leftRecord: Record<string, string> = {}
  let rightRecord: Record<string, string> = {}

  try {
    leftRecord = await loadEnvFile(leftPath)
  } catch {
    console.error(`Failed to load ${leftPath}`)
  }

  try {
    rightRecord = await loadEnvFile(rightPath)
  } catch {
    console.error(`Failed to load ${rightPath}`)
  }

  const entries = computeDiff(leftRecord, rightRecord, [])
  printDiff(entries, leftEnv, rightEnv, tool)
}

async function diffConvex(
  config: Awaited<ReturnType<typeof loadConfig>>,
  env: 'dev' | 'prod',
  tool?: string
) {
  const envPath = getEnvFilePath(config, env)
  let envRecord: Record<string, string> = {}

  try {
    envRecord = await loadEnvFile(envPath)
  } catch {
    console.error(`Failed to load ${envPath}`)
    process.exit(1)
  }

  // 获取 convex 环境变量
  const convexRecord = await getConvexEnv(env)

  const excludePatterns = config.sync?.convex?.exclude ?? []
  const entries = computeDiff(envRecord, convexRecord, excludePatterns)
  printDiff(entries, 'dotenvx', 'convex', tool)
}

async function getConvexEnv(env: 'dev' | 'prod'): Promise<Record<string, string>> {
  const args = env === 'prod'
    ? ['convex', 'env', 'list', '--prod']
    : ['convex', 'env', 'list']

  const result = Bun.spawnSync(args, { stdout: 'pipe', stderr: 'pipe' })

  if (result.exitCode !== 0) {
    console.error('Failed to get Convex environment variables')
    return {}
  }

  const output = result.stdout.toString()
  const record: Record<string, string> = {}

  // 解析 convex env list 输出 (格式: KEY=value)
  for (const line of output.split('\n')) {
    const match = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/)
    if (match) {
      record[match[1]] = match[2]
    }
  }

  return record
}

function computeDiff(
  left: Record<string, string>,
  right: Record<string, string>,
  excludePatterns: string[]
): DiffEntry[] {
  const allKeys = new Set([...Object.keys(left), ...Object.keys(right)])
  const entries: DiffEntry[] = []

  for (const key of allKeys) {
    // 跳过内置忽略和自定义排除
    if (shouldExclude(key, excludePatterns)) continue

    const leftVal = left[key] ?? null
    const rightVal = right[key] ?? null

    let status: DiffEntry['status']
    if (leftVal === null) {
      status = 'added'
    } else if (rightVal === null) {
      status = 'removed'
    } else if (leftVal === rightVal) {
      status = 'same'
    } else {
      status = 'changed'
    }

    // 只显示有差异的
    if (status !== 'same') {
      entries.push({ key, left: leftVal, right: rightVal, status })
    }
  }

  return entries.sort((a, b) => a.key.localeCompare(b.key))
}

function printDiff(entries: DiffEntry[], leftLabel: string, rightLabel: string, tool?: string) {
  if (entries.length === 0) {
    console.log('\n✓ No differences\n')
    return
  }

  if (tool) {
    // 使用外部工具
    printWithExternalTool(entries, leftLabel, rightLabel, tool)
    return
  }

  console.log(`\nDiff: ${leftLabel} ↔ ${rightLabel} (${entries.length} differences)\n`)

  const data = entries.map(e => ({
    key: e.key,
    status: e.status === 'added' ? '+ added' : e.status === 'removed' ? '- removed' : '~ changed',
    [leftLabel]: truncate(e.left ?? '(not set)', 30),
    [rightLabel]: truncate(e.right ?? '(not set)', 30),
  }))

  console.table(data)
}

function printWithExternalTool(entries: DiffEntry[], leftLabel: string, rightLabel: string, tool: string) {
  // 创建临时文件
  const leftContent = entries.map(e => `${e.key}=${e.left ?? ''}`).join('\n')
  const rightContent = entries.map(e => `${e.key}=${e.right ?? ''}`).join('\n')

  const leftFile = `/tmp/env-diff-${leftLabel}.env`
  const rightFile = `/tmp/env-diff-${rightLabel}.env`

  Bun.spawnSync(['bash', '-c', `echo '${leftContent}' > ${leftFile}`])
  Bun.spawnSync(['bash', '-c', `echo '${rightContent}' > ${rightFile}`])

  Bun.spawnSync([tool, leftFile, rightFile], { stdio: ['inherit', 'inherit', 'inherit'] })
}

function truncate(str: string, maxLen: number): string {
  if (str.length <= maxLen) return str
  return str.slice(0, maxLen - 3) + '...'
}
