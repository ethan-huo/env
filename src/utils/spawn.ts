export type SpawnResult = {
	exitCode: number
	stdout: string
	stderr: string
}

export async function runCommand(
	args: string[],
	options: { cwd?: string } = {},
): Promise<SpawnResult> {
	const proc = Bun.spawn(args, {
		stdout: 'pipe',
		stderr: 'pipe',
		cwd: options.cwd,
	})
	const [stdout, stderr] = await Promise.all([
		new Response(proc.stdout).text(),
		new Response(proc.stderr).text(),
	])
	const exitCode = await proc.exited
	return { exitCode, stdout, stderr }
}
