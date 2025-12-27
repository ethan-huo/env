import { toStandardJsonSchema } from '@valibot/to-json-schema'
import { c } from 'argc'
import * as v from 'valibot'

const s = toStandardJsonSchema

export type Env = 'dev' | 'prod' | 'all'

export const globalsSchema = s(
	v.object({
		env: v.optional(v.picklist(['dev', 'prod', 'all']), 'dev'),
	}),
)

export const schema = {
	get: c
		.meta({ description: 'Get environment variable value' })
		.args('key')
		.input(
			s(
				v.object({
					key: v.string(),
				}),
			),
		),

	set: c
		.meta({ description: 'Set environment variable' })
		.args('key', 'value')
		.input(
			s(
				v.object({
					key: v.string(),
					value: v.string(),
					plain: v.optional(v.boolean(), false),
				}),
			),
		),

	rm: c
		.meta({ description: 'Remove environment variable' })
		.args('key')
		.input(
			s(
				v.object({
					key: v.string(),
				}),
			),
		),

	ls: c
		.meta({ description: 'List all environment variables', aliases: ['list'] })
		.input(
			s(
				v.object({
					filter: v.optional(v.string()),
					showValues: v.optional(v.boolean(), false),
					format: v.optional(v.picklist(['table', 'json', 'export']), 'table'),
				}),
			),
		),

	diff: c
		.meta({ description: 'Compare environment variables with sync targets' })
		.input(s(v.object({}))),

	sync: c.meta({ description: 'Run typegen + sync targets' }).input(
		s(
			v.object({
				watch: v.optional(v.boolean(), false),
				dryRun: v.optional(v.boolean(), false),
			}),
		),
	),

	init: c.meta({ description: 'Initialize project' }).input(
		s(
			v.object({
				force: v.optional(v.boolean(), false),
			}),
		),
	),

	import: c
		.meta({ description: 'Import plain .env into encrypted env file' })
		.args('source')
		.input(
			s(
				v.object({
					source: v.string(),
					file: v.optional(v.string()),
				}),
			),
		),

	'install-github-action': c
		.meta({
			description: 'Install DOTENV private keys into GitHub Actions secrets',
		})
		.input(
			s(
				v.object({
					file: v.optional(v.string(), '.env.keys'),
					repo: v.optional(v.string()),
				}),
			),
		),
}

