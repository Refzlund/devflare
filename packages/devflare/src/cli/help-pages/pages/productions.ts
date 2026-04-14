import type { HelpPage } from '../types'
import {
	createProductionsSubcommandPage,
	entry
} from '../shared'

export const PRODUCTION_HELP_PAGES: HelpPage[] = [
	{
		path: ['productions'],
		summary: 'Inspect and manage live production Workers and deployments',
		usage: [
			'devflare productions [--config <path>] [--env <name>] [--account <id>] [--worker <name>]',
			'devflare productions versions [--config <path>] [--env <name>] [--account <id>] [--worker <name>]',
			'devflare productions rollback [--config <path>] [--account <id>] [--worker <name>] [--version-id <id>] [--message <text>] [--apply]',
			'devflare productions delete [--config <path>] [--account <id>] [--worker <name>] [--apply]'
		],
		description: [
			'The default view inspects live Cloudflare production deployment state for locally configured Workers, or for one explicitly selected Worker.',
			'Other subcommands list recent production versions or mutate a single Worker by rolling back or deleting its live production script.'
		],
		subcommands: [
			entry('list', 'List live production Workers and their active deployments (default)'),
			entry('versions', 'Show recent stored production versions and which one is currently active'),
			entry('rollback', 'Roll a Worker back to the previous or specified production version'),
			entry('delete', 'Delete a live production Worker script')
		],
		options: [
			entry('--config <path>', 'Use a specific devflare config file or scan the current tree when omitted'),
			entry('--env <name>', 'Resolve `config.env[name]` while discovering related production Workers (defaults to `production`)'),
			entry('--account <id>', 'Use a specific Cloudflare account'),
			entry('--worker <name>', 'Target a specific Worker instead of the locally configured set'),
			entry('--version <id>', 'Version selector shortcut for `rollback` (same as --version-id)'),
			entry('--version-id <id>', 'Target a specific production version when rolling back'),
			entry('--message <text>', 'Attach a rollback message when using `rollback`'),
			entry('--apply', 'Execute rollback or delete instead of doing a dry run')
		],
		examples: [
			entry('devflare productions', 'Inspect active production deployments for the current package or monorepo tree'),
			entry('devflare productions versions', 'Show recent production versions for the resolved Workers'),
			entry('devflare productions rollback --worker my-worker --apply', 'Roll `my-worker` back to the previous production version'),
			entry('devflare productions rollback --worker my-worker --version-id 1234abcd-... --apply', 'Roll `my-worker` back to a specific production version'),
			entry('devflare productions delete --worker my-worker --apply', 'Delete the live production Worker script for `my-worker`')
		],
		notes: [
			'`productions` reads live Cloudflare control-plane state. It does not depend on the Devflare preview registry database.',
			'`rollback` uses Wrangler under the hood because Cloudflare exposes production rollback through the Wrangler deployment flow.',
			'`delete` removes the Worker script only. Review KV, D1, R2, queues, and other account resources separately before cleaning them up.'
		]
	},
	createProductionsSubcommandPage(
		'list',
		'List live production Workers and their active deployments',
		[
			'devflare productions [--config <path>] [--env <name>] [--account <id>] [--worker <name>]'
		],
		[
			'Inspects live Cloudflare production deployment state for locally configured Workers, or for one explicitly selected Worker when `--worker` is provided.'
		],
		[
			entry('--config <path>', 'Use a specific devflare config file'),
			entry('--env <name>', 'Resolve `config.env[name]` while discovering related production Workers (defaults to `production`)'),
			entry('--account <id>', 'Use a specific Cloudflare account'),
			entry('--worker <name>', 'Target a specific Worker instead of the locally configured set')
		],
		[
			entry('devflare productions', 'Inspect the current package or monorepo production Workers'),
			entry('devflare productions --worker my-worker', 'Inspect one live production Worker directly')
		],
		[
			'This view is read-only and is backed by live Cloudflare production deployment data.'
		]
	),
	createProductionsSubcommandPage(
		'versions',
		'Show recent stored production versions and the current active version',
		[
			'devflare productions versions [--config <path>] [--env <name>] [--account <id>] [--worker <name>]'
		],
		[
			'Lists recent stored production versions for the selected Worker set and marks the version currently active in the latest production deployment.'
		],
		[
			entry('--config <path>', 'Use a specific devflare config file'),
			entry('--env <name>', 'Resolve `config.env[name]` while discovering related production Workers (defaults to `production`)'),
			entry('--account <id>', 'Use a specific Cloudflare account'),
			entry('--worker <name>', 'Target a specific Worker instead of the locally configured set')
		],
		[
			entry('devflare productions versions', 'Show recent stored production versions for the resolved Workers'),
			entry('devflare productions versions --worker my-worker', 'Show recent stored production versions for `my-worker`')
		]
	),
	createProductionsSubcommandPage(
		'rollback',
		'Roll a Worker back to the previous or specified production version',
		[
			'devflare productions rollback [--config <path>] [--account <id>] [--worker <name>] [--version-id <id>] [--message <text>] [--apply]'
		],
		[
			'Uses Wrangler rollback to create a fresh production deployment that points at the previous or explicitly selected version.'
		],
		[
			entry('--config <path>', 'Use a specific devflare config file'),
			entry('--account <id>', 'Use a specific Cloudflare account'),
			entry('--worker <name>', 'Worker to roll back (required unless the current package resolves to exactly one primary Worker)'),
			entry('--version <id>', 'Version selector shortcut for `rollback` (same as --version-id)'),
			entry('--version-id <id>', 'Roll back to a specific production version instead of the previous one'),
			entry('--message <text>', 'Attach an explicit rollback message'),
			entry('--apply', 'Apply the rollback instead of doing a dry run')
		],
		[
			entry('devflare productions rollback --worker my-worker', 'Preview a rollback for `my-worker`'),
			entry('devflare productions rollback --worker my-worker --apply', 'Roll `my-worker` back to the previous production version'),
			entry('devflare productions rollback --worker my-worker --version-id 1234abcd-... --apply', 'Roll `my-worker` back to a specific production version')
		],
		[
			'Without `--apply`, this command is a dry run.'
		]
	),
	createProductionsSubcommandPage(
		'delete',
		'Delete a live production Worker script',
		[
			'devflare productions delete [--config <path>] [--account <id>] [--worker <name>] [--apply]'
		],
		[
			'Deletes the selected live production Worker script from Cloudflare. This does not automatically remove independent account resources such as KV namespaces or D1 databases.'
		],
		[
			entry('--config <path>', 'Use a specific devflare config file'),
			entry('--account <id>', 'Use a specific Cloudflare account'),
			entry('--worker <name>', 'Worker to delete (required unless the current package resolves to exactly one primary Worker)'),
			entry('--apply', 'Apply the deletion instead of doing a dry run')
		],
		[
			entry('devflare productions delete --worker my-worker', 'Preview deletion of `my-worker`'),
			entry('devflare productions delete --worker my-worker --apply', 'Delete the live production Worker script for `my-worker`')
		],
		[
			'Without `--apply`, this command is a dry run.',
			'Deleting the Worker script does not clean up shared Cloudflare account resources automatically.'
		]
	)
]
