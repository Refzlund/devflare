import type { HelpPage } from '../types'
import {
	PREVIEWS_COMMON_OPTIONS,
	createPreviewSubcommandPage,
	entry
} from '../shared'

export const PREVIEW_HELP_PAGES: HelpPage[] = [
	{
		path: ['previews'],
		summary: 'Inspect and clean dedicated preview Worker scopes',
		usage: [
			'devflare previews [--config <path>] [--env <name>] [--account <id>]',
			'devflare previews list [--config <path>] [--env <name>] [--account <id>]',
			'devflare previews bindings [--config <path>] [--env <name>] [--scope <name>] [--account <id>] [--worker <name>]',
			'devflare previews cleanup [--config <path>] [--env <name>] [--scope <name> | --all] [--account <id>] [--apply]'
		],
		description: [
			'The default view resolves the current worker family from local config, or scans child `devflare.config.*` files when you run it from a monorepo root, then inspects live Cloudflare Workers and groups dedicated preview Worker names into preview scopes such as `next` or `pr-42`.',
			'Use `bindings` to inspect preview-scoped resource associations for one scope, or `cleanup` to delete dedicated preview Workers plus preview-only Cloudflare resources for one scope or every discovered scope.'
		],
		subcommands: [
			entry('list', 'List stable workers plus dedicated preview scopes for the current worker family (default)'),
			entry('bindings', 'Inspect resolved bindings/resources and how many deployed workers currently reference them'),
			entry('cleanup', 'Delete preview-only Worker scripts and preview-scoped Cloudflare resources')
		],
		options: [
			...PREVIEWS_COMMON_OPTIONS,
			entry('--config <path>', 'Use a specific devflare config file for config-aware preview commands'),
			entry('--env <name>', 'Resolve a non-default `config.env[name]` before config-aware preview commands when your preview bindings live outside `env.preview`'),
			entry('--scope <name>', 'Resolve preview-scoped names for a specific identifier on config-aware preview commands'),
			entry('--all', 'Clean every discovered preview scope for the current worker family when used with `cleanup`'),
			entry('--apply', 'Execute cleanup instead of doing a dry run'),
			entry('--worker <name>', 'Override the primary worker name shown in the `bindings` report header')
		],
		examples: [
			entry('devflare previews', 'List preview scopes for the current package'),
			entry('devflare previews --account <id>', 'List preview scopes for every configured package when run from a monorepo root'),
			entry('devflare previews bindings --scope next', 'Inspect the `next` preview scope and its live worker associations'),
			entry('devflare previews cleanup --scope next --apply', 'Delete preview-only resources and dedicated Workers for the `next` scope'),
			entry('devflare previews cleanup --all --apply', 'Delete preview-only resources and dedicated Workers for every discovered preview scope')
		],
		notes: [
			'The default `list` view can aggregate every configured package from a monorepo root. `bindings` and `cleanup` still need one configured package, so run them inside that package or pass `--config <path>`.',
			'`bindings` and `cleanup` default to preview-oriented config resolution already, so `--env preview` is usually redundant unless your project stores preview bindings under a different env key.',
			'`cleanup` removes preview-only Cloudflare resources for the targeted scope and also deletes dedicated preview Worker scripts when that scope is deployed as branch-scoped Workers. Service bindings, Durable Object bindings, and routes attached only to those dedicated preview Workers disappear with them.',
			'Stable shared Workers are never deleted by `cleanup`. The legacy `cleanup-resources` alias still works, but `cleanup` is the documented public command.'
		]
	},
	createPreviewSubcommandPage(
		'list',
		'List stable workers and dedicated preview scopes',
		[
			'devflare previews [--config <path>] [--env <name>] [--account <id>]',
			'devflare previews list [--config <path>] [--env <name>] [--account <id>]'
		],
		[
			'Resolves the current worker family from local config, or scans child `devflare.config.*` files when invoked from a monorepo root, then queries live Cloudflare Workers and groups dedicated preview Worker names into preview scopes.'
		],
		[
			entry('--config <path>', 'Use a specific devflare config file'),
			entry('--env <name>', 'Resolve `config.env[name]` before discovering the worker family'),
			entry('--account <id>', 'Use a specific Cloudflare account'),
		],
		[
			entry('devflare previews', 'List stable workers and active preview scopes for the current package'),
			entry('devflare previews --account <id>', 'Aggregate stable workers and preview scopes across every configured package in the current workspace root'),
			entry('devflare previews list --env preview', 'List preview scopes using a non-default config environment when needed')
		],
		[
			'`list` is the default subcommand, so `devflare previews` and `devflare previews list` show the same view.',
			'When more than one config is discovered, Devflare prints one worker-family block per configured package.'
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
			'This command is read-only; it does not delete Workers or resources.',
			'Omit `--env preview` unless your project stores preview bindings under a different env key.'
		]
	),
	createPreviewSubcommandPage(
		'cleanup',
		'Delete preview-only Worker scripts and preview-scoped Cloudflare resources',
		[
			'devflare previews cleanup [--config <path>] [--env <name>] [--scope <name> | --all] [--account <id>] [--apply]'
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
			entry('devflare previews cleanup --scope next', 'Show which dedicated Workers and preview-only resources belong to the `next` scope'),
			entry('devflare previews cleanup --all', 'Show the cleanup plan for every discovered preview scope'),
			entry('devflare previews cleanup --all --apply', 'Delete dedicated preview Workers and preview-only resources for every discovered preview scope')
		],
		[
			'Dedicated preview Worker scripts are candidates only when their names resolve to the targeted preview scope. Stable shared Workers are never deleted.',
			'Without `--scope`, the command defaults to the synthetic `preview` scope. Use `--all` when you want every discovered preview scope instead of just that default.',
			'Deleting dedicated preview Worker scripts removes preview-only service bindings, Durable Object bindings, and routes owned solely by those Workers.',
			'The legacy `cleanup-resources` alias still works for compatibility, but `cleanup` is the documented public command.',
			'Omit `--env preview` unless your config stores preview bindings under a different env key.',
			'Analytics Engine datasets and Browser Rendering bindings are intentionally reported as warnings instead of deleted resources.'
		]
	)
]
