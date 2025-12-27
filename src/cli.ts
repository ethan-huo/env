#!/usr/bin/env -S bun --no-env-file
import { cli } from 'argc'

import { runDiff } from './commands/diff'
import { runGet } from './commands/get'
import { runImport } from './commands/import'
import { runInit } from './commands/init'
import { runInstallGithubAction } from './commands/install-github-action'
import { runLs } from './commands/ls'
import { runRm } from './commands/rm'
import { runSet } from './commands/set'
import { runSync } from './commands/sync'
import { loadConfig } from './config'
import { globalsSchema, schema } from './schema'

cli(schema, {
	name: 'env',
	version: '0.1.2',
	description: 'Environment variable management tool',
	globals: globalsSchema,
}).run({
	context: async (globals) => ({
		config: await loadConfig(),
		env: globals.env,
	}),
	handlers: {
		get: runGet,
		set: runSet,
		rm: runRm,
		ls: runLs,
		diff: runDiff,
		sync: runSync,
		init: runInit,
		import: runImport,
		'install-github-action': runInstallGithubAction,
	},
})
