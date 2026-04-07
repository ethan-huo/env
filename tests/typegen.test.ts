import { describe, expect, it } from 'bun:test'

import { generateTypes } from '../src/utils/typegen'

const vars = [
	{ key: 'PUBLIC_URL', value: 'https://example.com', scope: 'public' as const },
	{ key: 'SECRET_KEY', value: 'secret', scope: 'private' as const },
]

describe('generateTypes', () => {
	it('rebuilds process.env explicitly for valibot output', () => {
		const output = generateTypes(vars, {
			output: './src/env.ts',
			schema: 'valibot',
			publicPrefix: ['PUBLIC_'],
		})

		expect(output).toContain('function readProcessEnv() {')
		expect(output).toContain('PUBLIC_URL: process.env.PUBLIC_URL,')
		expect(output).toContain('SECRET_KEY: process.env.SECRET_KEY,')
		expect(output).toContain(
			'export const env$ = lazy(() => v.parse(envSchema, readProcessEnv()))',
		)
		expect(output).not.toContain('v.parse(envSchema, process.env)')
	})

	it('rebuilds process.env explicitly for zod output', () => {
		const output = generateTypes(vars, {
			output: './src/env.ts',
			schema: 'zod',
			publicPrefix: ['PUBLIC_'],
		})

		expect(output).toContain('function readProcessEnv() {')
		expect(output).toContain('PUBLIC_URL: process.env.PUBLIC_URL,')
		expect(output).toContain('SECRET_KEY: process.env.SECRET_KEY,')
		expect(output).toContain(
			'export const env$ = lazy(() => envSchema.parse(readProcessEnv()))',
		)
		expect(output).not.toContain('envSchema.parse(process.env)')
	})
})
