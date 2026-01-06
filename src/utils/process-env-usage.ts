import { join, sep } from 'node:path'

export type ProcessEnvUsageIssue = {
	key: string
	locations: string[]
}

export type ProcessEnvUsageOptions = {
	envKeys: Set<string>
	cwd?: string
	fileGlob?: string
	maxFileSize?: number
	excludeDirs?: string[]
}

const DEFAULT_GLOB = '**/*.{ts,tsx}'

const DEFAULT_EXCLUDE_DIRS = [
	'node_modules',
	'.git',
	'dist',
	'build',
	'out',
	'.next',
	'.turbo',
	'coverage',
	'storybook-static',
	'vendor',
	'tmp',
]

export async function findProcessEnvUsageIssues(
	options: ProcessEnvUsageOptions,
): Promise<ProcessEnvUsageIssue[]> {
	const cwd = options.cwd ?? process.cwd()
	const glob = new Bun.Glob(options.fileGlob ?? DEFAULT_GLOB)
	const maxFileSize = options.maxFileSize ?? 2_000_000
	const excludeDirs = new Set(options.excludeDirs ?? DEFAULT_EXCLUDE_DIRS)
	const missing = new Map<string, string[]>()

	for await (const relPath of glob.scan({ cwd, onlyFiles: true, dot: false })) {
		if (shouldSkipUsagePath(relPath, excludeDirs)) continue

		const absPath = join(cwd, relPath)
		const file = Bun.file(absPath)
		if (file.size > maxFileSize) continue

		const text = await file.text()
		const matches = extractProcessEnvRefs(text)
		if (matches.length === 0) continue

		const lineStarts = buildLineStarts(text)

		for (const match of matches) {
			if (options.envKeys.has(match.key)) continue
			const { line, column } = getLineColumn(lineStarts, match.index)
			const locations = missing.get(match.key) ?? []
			locations.push(`${relPath}:${line}:${column}`)
			missing.set(match.key, locations)
		}
	}

	return Array.from(missing.entries())
		.sort(([a], [b]) => a.localeCompare(b))
		.map(([key, locations]) => ({ key, locations }))
}

function shouldSkipUsagePath(
	relPath: string,
	excludeDirs: Set<string>,
): boolean {
	return relPath.split(sep).some((segment) => excludeDirs.has(segment))
}

function extractProcessEnvRefs(
	text: string,
): Array<{ key: string; index: number }> {
	const results: Array<{ key: string; index: number }> = []
	const dotRegex = /process\.env(?:\?\.|\.)([A-Za-z0-9_]+)/g
	const bracketRegex =
		/process\.env(?:\?\.)?\[\s*(['"])([A-Za-z0-9_]+)\1\s*\]/g

	for (const match of text.matchAll(dotRegex)) {
		if (!match[1]) continue
		results.push({ key: match[1], index: match.index ?? 0 })
	}

	for (const match of text.matchAll(bracketRegex)) {
		if (!match[2]) continue
		results.push({ key: match[2], index: match.index ?? 0 })
	}

	return results
}

function buildLineStarts(text: string): number[] {
	const starts = [0]
	for (let i = 0; i < text.length; i++) {
		if (text.charCodeAt(i) === 10) starts.push(i + 1)
	}
	return starts
}

function getLineColumn(
	lineStarts: number[],
	index: number,
): { line: number; column: number } {
	let low = 0
	let high = lineStarts.length - 1

	while (low <= high) {
		const mid = Math.floor((low + high) / 2)
		const start = lineStarts[mid]
		const next = lineStarts[mid + 1]
		if (start <= index && (next === undefined || index < next)) {
			return { line: mid + 1, column: index - start + 1 }
		}
		if (start > index) high = mid - 1
		else low = mid + 1
	}

	return { line: 1, column: index + 1 }
}
