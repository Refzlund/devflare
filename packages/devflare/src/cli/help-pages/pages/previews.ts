import type { HelpPage } from '../types'
import {
	PREVIEWS_COMMON_OPTIONS,
	PREVIEWS_SELECTOR_OPTIONS,
	createPreviewSubcommandPage,
	entry
} from '../shared'

export const PREVIEW_HELP_PAGES: HelpPage[] = [
	{
		path: ['previews'],
		summary: 'Inspect preview scopes and raw Devflare preview registry state',
		usage: [
			'devflare previews [--worker <name>] [--account <id>] [--database <name>] [--all]',
			'devflare previews bindings [--config <path>] [--env <name>] [--scope <name>] [--account <id>] [--worker <name>]',
			'devflare previews provision [--account <id>] [--database <name>]',
			'devflare previews reconcile --worker <name> [--account <id>] [--database <name>] [--all]',
			'devflare previews cleanup [--worker <name>] [--account <id>] [--database <name>] [--days <n>] [--apply]',
			'devflare previews retire --worker <name> [--branch <branch> | --alias <alias> | --version-id <id> | --commit-sha <sha>] [--account <id>] [--database <name>] [--apply]',
			'devflare previews cleanup-resources [--config <path>] [--env <name>] [--scope <name> | --all] [--account <id>] [--apply]'
		],
		description: [
			'The default view summarizes preview scopes for the configured worker family when Devflare can resolve local config, and falls back to raw worker records when you target a specific worker.',
			'Other subcommands manage the preview registry, inspect binding/resource associations, or clean up preview-only Worker scripts and preview-scoped Cloudflare resources.'
		],
		subcommands: [
			entry('list', 'List active preview scopes (default) or raw registry state when `--worker` is used'),
			entry('bindings', 'Inspect resolved bindings/resources and how many deployed workers currently reference them'),
			entry('provision', 'Provision the preview registry database if it does not already exist'),
			entry('reconcile', 'Sync preview registry records against live Cloudflare versions/deployments for one worker'),
			entry('cleanup', 'Soft-delete stale preview registry records, optionally applying the cleanup'),
			entry('retire', 'Retire a tracked preview immediately by branch, alias, version, or commit selector'),
			entry('cleanup-resources', 'Delete preview-only Worker scripts and preview-scoped Cloudflare resources')
		],
		options: [
			...PREVIEWS_COMMON_OPTIONS,
			entry('--config <path>', 'Use a specific devflare config file for config-aware preview commands'),
			entry('--env <name>', 'Resolve a non-default `config.env[name]` before config-aware preview commands when your preview bindings live outside `env.preview`'),
			entry('--scope <name>', 'Resolve preview-scoped names for a specific identifier on config-aware preview commands'),
			entry('--days <n>', 'Age threshold for `cleanup` (defaults to 7 days)'),
			...PREVIEWS_SELECTOR_OPTIONS
		],
		examples: [
			entry('devflare previews', 'List preview scopes for the current package'),
			entry('devflare previews --worker my-worker --all', 'Inspect raw historical registry records for one worker'),
			entry('devflare previews bindings --scope next', 'Inspect the `next` preview scope and its live worker associations'),
			entry('devflare previews reconcile --worker my-worker', 'Reconcile registry state for a worker'),
			entry('devflare previews cleanup --days 14 --apply', 'Apply stale-record cleanup older than 14 days'),
			entry('devflare previews cleanup-resources --scope next --apply', 'Delete preview-only resources and dedicated Workers for the `next` scope'),
			entry('devflare previews cleanup-resources --all --apply', 'Delete preview-only resources and dedicated Workers for every discovered preview scope')
		],
		notes: [
			'Package-scoped output talks about preview scopes across a worker family instead of pretending every preview lives on a single worker forever.',
			'Use `--worker <name>` when you need raw registry inspection for a specific worker script.',
			'`bindings` and `cleanup-resources` default to preview-oriented config resolution already, so `--env preview` is usually redundant unless your project stores preview bindings under a different env key.',
			'`cleanup-resources` removes preview-only Cloudflare resources for the targeted scope and also deletes dedicated preview Worker scripts when that scope is deployed as branch-scoped Workers. Service bindings, Durable Object bindings, and routes attached only to those dedicated preview Workers disappear with them.',
			'Stable shared Workers are never deleted by `cleanup-resources`; same-worker preview aliases only lose preview-scoped resources that belong exclusively to the targeted scope.'
		]
	},
	createPreviewSubcommandPage(
		'list',
		'List active preview scopes or raw registry state',
		[
			'devflare previews [--worker <name>] [--account <id>] [--database <name>] [--all]',
			'devflare previews list [--worker <name>] [--account <id>] [--database <name>] [--all]'
		],
		[
			'The default previews view groups active preview scopes for the current worker family when local config can be resolved, and falls back to raw registry inspection when you target one worker directly with `--worker`.'
		],
		[
			entry('--worker <name>', 'Inspect raw registry state for a specific worker instead of the locally resolved worker family'),
			entry('--account <id>', 'Use a specific Cloudflare account'),
			entry('--database <name>', 'Override the preview registry database name'),
			entry('--all', 'Include historical records instead of only currently active preview state')
		],
		[
			entry('devflare previews', 'List active preview scopes for the current package'),
			entry('devflare previews list --worker my-worker --all', 'Inspect raw historical registry records for one worker')
		],
		[
			'`list` is the default subcommand, so `devflare previews` and `devflare previews list` show the same view.'
		]
	),
	createPreviewSubcommandPage(
		'bindings',
		'Inspect resolved bindings/resources and live worker associations',
		[
			'devflare previews bindings [--config <path>] [--env <name>] [--scope <name>] [--account <id>] [--worker <name>]'
		],
		[
			'Resolves the current config for one preview scope, inspects live worker deployments, and reports how many deployed workers reference each resource or binding target.'
		],
		[
			entry('--config <path>', 'Use a specific devflare config file'),
			entry('--env <name>', 'Resolve `config.env[name]` before inspecting bindings'),
			entry('--scope <name>', 'Resolve preview-scoped names for a specific identifier instead of the default `preview` scope'),
			entry('--account <id>', 'Use a specific Cloudflare account'),
			entry('--worker <name>', 'Override the primary worker name shown in the report header')
		],
		[
			entry('devflare previews bindings --scope next', 'Inspect preview-scoped bindings for the `next` scope'),
			entry('devflare previews bindings', 'Inspect preview-scoped bindings for the default `preview` scope')
		],
		[
			'This command is read-only; it does not change registry state or delete resources.',
			'Omit `--env preview` unless your project stores preview bindings under a different env key.'
		]
	),
	createPreviewSubcommandPage(
		'provision',
		'Provision the preview registry database',
		[
			'devflare previews provision [--account <id>] [--database <name>]'
		],
		[
			'Creates the preview registry D1 database if it does not exist and ensures the schema is ready.'
		],
		[
			entry('--account <id>', 'Use a specific Cloudflare account'),
			entry('--database <name>', 'Override the preview registry database name')
		],
		[
			entry('devflare previews provision', 'Ensure the default preview registry exists')
		]
	),
	createPreviewSubcommandPage(
		'reconcile',
		'Reconcile preview registry records against live Cloudflare state',
		[
			'devflare previews reconcile --worker <name> [--account <id>] [--database <name>] [--all]'
		],
		[
			'Synchronizes preview, alias, and deployment records for one worker with the current live Cloudflare control-plane state.'
		],
		[
			entry('--worker <name>', 'Worker to reconcile (required)'),
			entry('--account <id>', 'Use a specific Cloudflare account'),
			entry('--database <name>', 'Override the preview registry database name'),
			entry('--all', 'Show historical records in the post-reconcile output')
		],
		[
			entry('devflare previews reconcile --worker my-worker', 'Sync registry records for `my-worker`')
		]
	),
	createPreviewSubcommandPage(
		'cleanup',
		'Soft-delete stale preview registry records',
		[
			'devflare previews cleanup [--worker <name>] [--account <id>] [--database <name>] [--days <n>] [--apply]'
		],
		[
			'Finds preview registry records older than the chosen threshold and either reports them or applies the cleanup.'
		],
		[
			entry('--worker <name>', 'Limit cleanup to one worker instead of the whole registry'),
			entry('--account <id>', 'Use a specific Cloudflare account'),
			entry('--database <name>', 'Override the preview registry database name'),
			entry('--days <n>', 'Age threshold in days (defaults to 7)'),
			entry('--apply', 'Apply the cleanup instead of doing a dry run')
		],
		[
			entry('devflare previews cleanup --days 14', 'Preview the cleanup candidates older than 14 days'),
			entry('devflare previews cleanup --worker my-worker --apply', 'Apply cleanup for a single worker')
		],
		[
			'Without `--apply`, this command is a dry run.'
		]
	),
	createPreviewSubcommandPage(
		'retire',
		'Retire tracked preview records immediately',
		[
			'devflare previews retire --worker <name> [--branch <branch> | --alias <alias> | --version-id <id> | --commit-sha <sha>] [--account <id>] [--database <name>] [--apply]'
		],
		[
			'Retires preview registry records for one worker using branch, alias, version, or commit selectors.'
		],
		[
			entry('--worker <name>', 'Worker to retire records from (required)'),
			entry('--account <id>', 'Use a specific Cloudflare account'),
			entry('--database <name>', 'Override the preview registry database name'),
			entry('--apply', 'Apply the retirement instead of doing a dry run'),
			...PREVIEWS_SELECTOR_OPTIONS
		],
		[
			entry('devflare previews retire --worker my-worker --branch pr-42 --apply', 'Retire a branch-scoped preview immediately'),
			entry('devflare previews retire --worker my-worker --alias next --apply', 'Retire records by preview alias')
		],
		[
			'At least one selector is required.'
		]
	),
	createPreviewSubcommandPage(
		'cleanup-resources',
		'Delete preview-only Worker scripts and preview-scoped Cloudflare resources',
		[
			'devflare previews cleanup-resources [--config <path>] [--env <name>] [--scope <name> | --all] [--account <id>] [--apply]'
		],
		[
			'Resolves preview-scoped resource names from the current config, deletes dedicated preview Worker scripts for the targeted scope when they exist, and removes matching preview-only Cloudflare resources from the selected account. Preview-only service bindings, Durable Object bindings, and routes attached exclusively to those dedicated Workers disappear with them.',
			'Use `--scope <name>` for one preview scope or `--all` to iterate every discovered preview scope for the current worker family.'
		],
		[
			entry('--config <path>', 'Use a specific devflare config file'),
			entry('--env <name>', 'Resolve a non-default `config.env[name]` before cleanup when your preview bindings live outside `env.preview`'),
			entry('--scope <name>', 'Clean one preview scope instead of the default synthetic `preview` scope'),
			entry('--all', 'Clean every discovered preview scope for the current worker family'),
			entry('--account <id>', 'Use a specific Cloudflare account'),
			entry('--apply', 'Apply the cleanup instead of doing a dry run')
		],
		[
			entry('devflare previews cleanup-resources --scope next', 'Show which dedicated Workers and preview-only resources belong to the `next` scope'),
			entry('devflare previews cleanup-resources --all', 'Show the cleanup plan for every discovered preview scope'),
			entry('devflare previews cleanup-resources --all --apply', 'Delete dedicated preview Workers and preview-only resources for every discovered preview scope')
		],
		[
			'Dedicated preview Worker scripts are candidates only when their names resolve to the targeted preview scope. Stable shared Workers are never deleted.',
			'Without `--scope`, the command defaults to the synthetic `preview` scope. Use `--all` when you want every discovered preview scope instead of just that default.',
			'Deleting dedicated preview Worker scripts removes preview-only service bindings, Durable Object bindings, and routes owned solely by those Workers; shared same-worker preview aliases only lose matching preview-scoped account resources.',
			'Omit `--env preview` unless your config stores preview bindings under a different env key.',
			'Analytics Engine datasets and Browser Rendering bindings are intentionally reported as warnings instead of deleted resources.'
		]
	)
]
