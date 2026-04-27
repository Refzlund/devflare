import type { HelpPage } from '../types'
import { COMMANDS, COMMON_OPTIONS, entry } from '../shared'

export const CORE_HELP_PAGES: HelpPage[] = [
	{
		path: [],
		summary: 'Config compiler + CLI orchestrator for Cloudflare Workers',
		usage: [
			'devflare <command> [options]'
		],
		description: [
			'Use `devflare <command> --help` or `devflare help <command>` to see a detailed command guide.',
			'Devflare commands resolve local config first, then bridge that config to Wrangler-compatible Cloudflare workflows.'
		],
		subcommands: [
			entry('init [name]', 'Create a new devflare project'),
			entry('dev', 'Start the development server'),
			entry('build', 'Build for production'),
			entry('deploy', 'Deploy explicitly to production or preview'),
			entry('types', 'Generate TypeScript types'),
			entry('doctor', 'Check project configuration'),
			entry('config', 'Print resolved Devflare/Wrangler config'),
			entry('account', 'View Cloudflare account info and resource inventories'),
			entry('login', 'Authenticate with Cloudflare via Wrangler'),
			entry('previews', 'Inspect and clean dedicated preview Workers and scopes'),
			entry('productions', 'Inspect and manage live production Workers and deployments'),
			entry('worker', 'Rename and manage Worker control-plane operations'),
			entry('tokens', 'Manage Devflare-managed Cloudflare API tokens'),
			entry('secrets', 'Manage local Secrets Store values'),
			entry('ai', 'View Workers AI pricing information'),
			entry('remote', 'Manage remote test mode for paid Cloudflare features'),
			entry('help', 'Show command overview or a command-specific help page'),
			entry('version', 'Show the installed devflare version')
		],
		options: COMMON_OPTIONS,
		optionSectionTitle: 'common options',
		examples: [
			entry('devflare dev', 'Start worker-only or unified local development'),
			entry('devflare deploy --prod', 'Deploy explicitly to production'),
			entry('devflare deploy --preview next', 'Deploy a named preview scope directly'),
			entry('devflare previews cleanup --scope next --apply', 'Delete one dedicated preview scope and its preview-owned resources'),
			entry('devflare productions', 'Inspect live production Workers and active deployments'),
			entry('devflare secrets --local --store store-123 --name api-token --value local-token', 'Set a local Secrets Store value'),
			entry('devflare help deploy', 'Show the detailed deploy help page')
		],
		notes: [
			'Commands that support `--config` and `--env` document that explicitly in their own help pages.'
		]
	},
	{
		path: ['init'],
		summary: 'Create a new devflare project',
		usage: [
			'devflare init [name] [--template <minimal|api>]'
		],
		description: [
			'Scaffolds a new project directory with a starter `devflare.config.ts`, TypeScript config, and package.json scripts.',
			'Use the `api` template when you want middleware and API routing structure out of the box.'
		],
		arguments: [
			entry('[name]', 'Project directory name (defaults to `my-devflare-app`)')
		],
		options: [
			entry('--template <minimal|api>', 'Pick the starter template to scaffold')
		],
		examples: [
			entry('devflare init my-app', 'Create a minimal starter called `my-app`'),
			entry('devflare init edge-api --template api', 'Create the API starter with middleware structure')
		],
		notes: [
			'The command writes files only; install dependencies afterward with `bun install`.',
			'Generated starter scripts expect `devflare dev`, `devflare build`, `devflare deploy`, and `devflare types`.'
		]
	},
	{
		path: ['dev'],
		summary: 'Start the development server',
		usage: [
			'devflare dev [--config <path>] [--port <port>] [--persist] [--verbose] [--debug] [--log | --log-temp]'
		],
		description: [
			'Starts a worker-only Miniflare server by default, and automatically enables Vite when the current package has an effective local Vite setup.',
			'Also watches Worker and Durable Object source files, rebuilding and hot-reloading them as they change.'
		],
		options: [
			entry('--config <path>', 'Use a specific devflare config file'),
			entry('--port <port>', 'Preferred Vite dev server port (defaults to 5173 when Vite is enabled)'),
			entry('--persist', 'Persist Miniflare storage between restarts'),
			entry('--verbose', 'Increase logging verbosity'),
			entry('--debug', 'Enable extra debug logging and stack traces'),
			entry('--log', 'Mirror dev output into a timestamped `.log-*` file'),
			entry('--log-temp', 'Mirror dev output into `.log`, overwriting the file each run')
		],
		examples: [
			entry('devflare dev', 'Start local development with automatic Vite detection'),
			entry('devflare dev --port 3000', 'Use a custom Vite port when Vite is enabled'),
			entry('devflare dev --persist --log-temp', 'Keep Miniflare state and overwrite `.log` on each run')
		],
		notes: [
			'Worker-only mode is the default when no effective local `vite.config.*` is present.',
			'`--log` and `--log-temp` still print to the terminal; they add a file mirror instead of redirecting output away.'
		]
	},
	{
		path: ['build'],
		summary: 'Build production deployment artifacts',
		usage: [
			'devflare build [--config <path>] [--env <name>] [--debug]'
		],
		description: [
			'Resolves your Devflare config locally, applies environment overrides, and generates the build artifacts used by deploy flows.',
			'Build preserves named bindings instead of provisioning Cloudflare resources, so it is the safest way to inspect what Devflare will hand to deploy before you actually ship.'
		],
		options: [
			entry('--config <path>', 'Use a specific devflare config file'),
			entry('--env <name>', 'Resolve `config.env[name]` before building artifacts'),
			entry('--debug', 'Print stack traces when build preparation fails')
		],
		examples: [
			entry('devflare build', 'Build the default environment'),
			entry('devflare build --env production', 'Build using `config.env.production`')
		],
		notes: [
			'Build currently writes `.devflare/wrangler.jsonc`, `.devflare/build/wrangler.jsonc`, and `.wrangler/deploy/config.json`.',
			'Build does not query or provision Cloudflare account resources on its own; name-based bindings stay as names in the generated artifacts until deploy time.',
			'`devflare deploy` runs the same artifact preparation step automatically before invoking Wrangler, unless you provide `--build <path>` to reuse an existing build artifact.'
		]
	},
	{
		path: ['deploy'],
		summary: 'Deploy explicitly to Cloudflare production or preview targets',
		usage: [
			'devflare deploy --prod [--config <path>] [--build <path>] [--message <text>] [--tag <text>] [--debug]',
			'devflare deploy --production [--config <path>] [--build <path>] [--message <text>] [--tag <text>] [--debug]',
			'devflare deploy --preview <name> [--config <path>] [--build <path>] [--message <text>] [--tag <text>]',
			'devflare deploy --preview [--config <path>] [--build <path>] [--branch-name <branch>] [--message <text>] [--tag <text>]',
			'devflare deploy --prod --dry-run [--config <path>]',
			'devflare deploy --preview <name> --dry-run [--config <path>]',
			'devflare deploy --preview --dry-run [--config <path>]'
		],
		description: [
			'Deploy requires an explicit target: production via `--prod` / `--production`, or preview via `--preview`.',
			'Named preview deploys such as `--preview next` or `--preview pr-1` target `config.env.preview`, provision preview-scoped resources automatically, and deploy dedicated preview-scope Workers when your config is wired for them. Bare `--preview` keeps the same-worker preview upload flow and can still use `--branch-name` or CI/git metadata for preview-aware naming.',
			'Production and named preview deploys also provision missing deploy-time resources such as KV namespaces, D1 databases, R2 buckets, and Queues when Devflare has enough information to create them.'
		],
		options: [
			entry('--prod', 'Deploy to the production environment explicitly'),
			entry('--production', 'Long-form alias for --prod'),
			entry('--preview', 'Deploy a same-worker preview upload'),
			entry('--preview <name>', 'Deploy a named preview scope such as `next` or `pr-1`'),
			entry('--config <path>', 'Use a specific devflare config file'),
			entry('--build <path>', 'Reuse an existing build artifact such as `.devflare/build` or `.wrangler/deploy/config.json` instead of rebuilding'),
			entry('--env <name>', 'Usually unnecessary because the explicit target already pins production vs preview. If you pass it, it must match that target'),
			entry('--dry-run', 'Print the synthesized Wrangler config and skip the actual deployment'),
			entry('--branch-name <branch>', 'Provide explicit branch metadata for preview-aware naming when your workflow needs it'),
			entry('--message <text>', 'Attach an explicit Wrangler deployment/version message'),
			entry('--tag <text>', 'Attach an explicit Wrangler version tag'),
			entry('--debug', 'Print stack traces when deployment orchestration fails')
		],
		examples: [
			entry('devflare deploy --prod', 'Deploy explicitly to production'),
			entry('devflare deploy --prod --build .devflare/build', 'Deploy a previously built artifact without rebuilding the package'),
			entry('devflare deploy --production --message "Release"', 'Deploy to production with an explicit deployment message'),
			entry('devflare deploy --preview next', 'Deploy the named `next` preview scope and provision preview-scoped resources automatically'),
			entry('devflare deploy --preview pr-1', 'Deploy the named `pr-1` preview scope directly'),
			entry('devflare deploy --preview --branch-name feature-branch', 'Upload a same-worker preview version with explicit branch metadata'),
			entry('devflare deploy --preview next --dry-run', 'Inspect the generated named-preview Wrangler config without deploying')
		],
		notes: [
			'`devflare deploy` without an explicit target is rejected from the CLI so production and preview destinations stay unmistakable.',
			'`--prod` / `--production` clear preview-scope environment overrides such as `DEVFLARE_PREVIEW_BRANCH` so production deploys stay pointed at stable Worker names.',
			'Named preview deploys automatically provision preview-scoped resources before building and deploying.',
			'When a build artifact still contains name-based bindings, deploy resolves or provisions the concrete Cloudflare resources and rewrites the generated Wrangler config with the IDs Wrangler requires.',
			'Plain `--preview` still uses Cloudflare preview uploads, so it cannot be the first-ever upload for a brand-new Worker, preview URLs remain limited for Workers that implement Durable Objects, and preview uploads do not apply Durable Object migrations.'
		]
	},
	{
		path: ['secrets'],
		summary: 'Manage local Secrets Store values',
		usage: [
			'devflare secrets --local --store <id> --name <name> --value <value>',
			'devflare secrets --local --store <id> --list',
			'devflare secrets --local --store <id> --name <name> --delete'
		],
		description: [
			'Writes, lists, and deletes local values for Secrets Store bindings used by dev, createTestContext(), and createOfflineEnv({ cwd }).',
			'The runtime side is read-only: Workers can read configured local values through the Secrets Store binding, but application code cannot mutate this file.'
		],
		options: [
			entry('--local', 'Use the project-local secret file instead of Cloudflare'),
			entry('--store <id>', 'Secrets Store ID, matching the Cloudflare account store ID when you have one'),
			entry('--name <name>', 'Secret name inside the store'),
			entry('--value <value>', 'Secret value to write locally'),
			entry('--list', 'List local secret names without printing values'),
			entry('--delete', 'Delete one local secret value')
		],
		examples: [
			entry('devflare secrets --local --store store-123 --name api-token --value local-token', 'Create or replace one local secret value'),
			entry('devflare secrets --local --store store-123 --list', 'List names in one local store'),
			entry('devflare secrets --local --store store-123 --name api-token --delete', 'Delete one local secret value')
		],
		notes: [
			'Local values are stored in `.devflare/secrets.local.json`, which is ignored by the repository template.',
			'Command output prints store/name references only; it does not echo secret values.'
		]
	},
	{
		path: ['types'],
		summary: 'Generate TypeScript bindings from your config',
		usage: [
			'devflare types [--config <path>] [--output <path>] [--debug]'
		],
		description: [
			'Generates `env.d.ts`-style bindings for KV, D1, R2, Durable Objects, Queues, service bindings, vars, and secrets.',
			'Devflare also discovers entrypoints and cross-worker Durable Objects so service RPC bindings can stay strongly typed.'
		],
		options: [
			entry('--config <path>', 'Use a specific devflare config file'),
			entry('--output <path>', 'Write generated types to a custom path (defaults to `env.d.ts`)'),
			entry('--debug', 'Print stack traces when type generation fails')
		],
		examples: [
			entry('devflare types', 'Generate `env.d.ts` next to the current project'),
			entry('devflare types --output src/generated/env.d.ts', 'Write generated bindings to a custom file')
		],
		notes: [
			'Type discovery respects configured file patterns and falls back to the default Durable Object and entrypoint glob patterns.',
			'Re-run this command after adding or renaming bindings, Durable Objects, or cross-worker service references.'
		]
	},
	{
		path: ['doctor'],
		summary: 'Check project configuration',
		usage: [
			'devflare doctor [--config <path>]'
		],
		description: [
			'Checks for a loadable devflare config, package.json, TypeScript config, Vite integration, and generated Wrangler artifacts.',
			'Useful when a project feels cursed but not cursed enough to throw a clear error yet.'
		],
		options: [
			entry('--config <path>', 'Check a specific config path instead of the default resolution path')
		],
		examples: [
			entry('devflare doctor', 'Run diagnostics for the current package'),
			entry('devflare doctor --config apps/docs/devflare.config.ts', 'Check a specific config file')
		],
		notes: [
			'Warnings still return exit code 0; hard failures return exit code 1.',
			'The command reports whether generated `.devflare` and `.wrangler/deploy` artifacts already exist.'
		]
	},
	{
		path: ['config'],
		summary: 'Print resolved Devflare or Wrangler config',
		usage: [
			'devflare config [print] [--config <path>] [--env <name>] [--format <devflare|wrangler>]'
		],
		description: [
			'Loads the effective config and prints it as JSON.',
			'Use `--format wrangler` when you want to inspect the exact Wrangler-compatible config Devflare will emit.'
		],
		subcommands: [
			entry('print', 'Print the resolved config (default subcommand)')
		],
		options: [
			entry('--config <path>', 'Use a specific devflare config file'),
			entry('--env <name>', 'Resolve `config.env[name]` before printing'),
			entry('--format <devflare|wrangler>', 'Choose whether to print raw Devflare config or compiled Wrangler JSON')
		],
		examples: [
			entry('devflare config', 'Print the resolved Devflare config as JSON'),
			entry('devflare config --env preview', 'Print the preview environment config'),
			entry('devflare config print --format wrangler', 'Print the compiled Wrangler config JSON')
		],
		notes: [
			'`print` is the default subcommand, so `devflare config` and `devflare config print` behave the same.'
		]
	},
	{
		path: ['config', 'print'],
		summary: 'Print the resolved config',
		usage: [
			'devflare config print [--config <path>] [--env <name>] [--format <devflare|wrangler>]'
		],
		description: [
			'Equivalent to `devflare config`, but spelled out explicitly when you want the subcommand in scripts or docs.'
		],
		options: [
			entry('--config <path>', 'Use a specific devflare config file'),
			entry('--env <name>', 'Resolve `config.env[name]` before printing'),
			entry('--format <devflare|wrangler>', 'Choose Devflare JSON or compiled Wrangler JSON output')
		],
		examples: [
			entry('devflare config print --format wrangler', 'Print the compiled Wrangler config')
		]
	},
	{
		path: ['login'],
		summary: 'Authenticate with Cloudflare via Wrangler',
		usage: [
			'devflare login [--force]'
		],
		description: [
			'Uses Wrangler login under the hood, then reports the resolved primary or configured account context.'
		],
		options: [
			entry('--force', 'Open Wrangler login even when Devflare already sees an authenticated session')
		],
		examples: [
			entry('devflare login', 'Authenticate only when needed'),
			entry('devflare login --force', 'Re-open Wrangler login even if already authenticated')
		],
		notes: [
			'If you are already authenticated and omit `--force`, Devflare will reuse the current credentials instead of reopening login.'
		]
	},
	{
		path: ['help'],
		summary: 'Show command overview or command-specific help',
		usage: [
			'devflare help',
			'devflare help <command> [subcommand]'
		],
		description: [
			'Prints the root command overview or the detailed help page for a specific command path.'
		],
		examples: [
			entry('devflare help', 'Show the root command overview'),
			entry('devflare help previews', 'Show the detailed previews help page'),
			entry('devflare help previews cleanup', 'Show nested help for a preview subcommand when available')
		],
		notes: [
			'`devflare <command> --help` resolves to the same detailed help page as `devflare help <command>`.'
		]
	},
	{
		path: ['version'],
		summary: 'Show the installed devflare version',
		usage: [
			'devflare version',
			'devflare --version'
		],
		description: [
			'Prints the installed package version and exits.'
		],
		examples: [
			entry('devflare version', 'Show the installed version'),
			entry('devflare --version', 'Show the installed version using the global flag')
		]
	}
]

export const CORE_COMMANDS = COMMANDS
