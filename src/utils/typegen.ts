import type { TypegenConfig } from '../config'
import type { EnvVar } from './dotenv'

/**
 * 生成 TypeScript 类型定义
 */
export function generateTypes(
  vars: EnvVar[],
  config: TypegenConfig
): string {
  const publicVars = vars.filter(v => v.scope === 'public')
  const privateVars = vars.filter(v => v.scope === 'private')

  const schema = config.schema ?? 'valibot'

  if (schema === 'none') {
    return generatePlainTypes(publicVars, privateVars)
  }

  if (schema === 'zod') {
    return generateZodTypes(publicVars, privateVars)
  }

  return generateValibotTypes(publicVars, privateVars)
}

function generateValibotTypes(publicVars: EnvVar[], privateVars: EnvVar[]): string {
  const lines: string[] = [
    "import * as v from 'valibot'",
    '',
  ]

  // Public schema
  lines.push('export const publicEnvSchema = v.object({')
  for (const v of publicVars) {
    const validator = inferValidator(v.key, v.value, 'valibot')
    lines.push(`  ${v.key}: ${validator},`)
  }
  lines.push('})')
  lines.push('')

  // Private schema
  lines.push('export const privateEnvSchema = v.object({')
  for (const v of privateVars) {
    const validator = inferValidator(v.key, v.value, 'valibot')
    lines.push(`  ${v.key}: ${validator},`)
  }
  lines.push('})')
  lines.push('')

  // Types
  lines.push('export type PublicEnv = v.InferOutput<typeof publicEnvSchema>')
  lines.push('export type PrivateEnv = v.InferOutput<typeof privateEnvSchema>')
  lines.push('')

  return lines.join('\n')
}

function generateZodTypes(publicVars: EnvVar[], privateVars: EnvVar[]): string {
  const lines: string[] = [
    "import { z } from 'zod'",
    '',
  ]

  // Public schema
  lines.push('export const publicEnvSchema = z.object({')
  for (const v of publicVars) {
    const validator = inferValidator(v.key, v.value, 'zod')
    lines.push(`  ${v.key}: ${validator},`)
  }
  lines.push('})')
  lines.push('')

  // Private schema
  lines.push('export const privateEnvSchema = z.object({')
  for (const v of privateVars) {
    const validator = inferValidator(v.key, v.value, 'zod')
    lines.push(`  ${v.key}: ${validator},`)
  }
  lines.push('})')
  lines.push('')

  // Types
  lines.push('export type PublicEnv = z.infer<typeof publicEnvSchema>')
  lines.push('export type PrivateEnv = z.infer<typeof privateEnvSchema>')
  lines.push('')

  return lines.join('\n')
}

function generatePlainTypes(publicVars: EnvVar[], privateVars: EnvVar[]): string {
  const lines: string[] = []

  lines.push('export type PublicEnv = {')
  for (const v of publicVars) {
    lines.push(`  ${v.key}: string`)
  }
  lines.push('}')
  lines.push('')

  lines.push('export type PrivateEnv = {')
  for (const v of privateVars) {
    lines.push(`  ${v.key}: string`)
  }
  lines.push('}')
  lines.push('')

  return lines.join('\n')
}

function inferValidator(key: string, value: string, lib: 'valibot' | 'zod'): string {
  const lowerKey = key.toLowerCase()

  // URL pattern
  if (lowerKey.includes('url') || lowerKey.includes('endpoint')) {
    return lib === 'valibot'
      ? "v.pipe(v.string(), v.url())"
      : "z.string().url()"
  }

  // Default to string
  return lib === 'valibot' ? 'v.string()' : 'z.string()'
}
