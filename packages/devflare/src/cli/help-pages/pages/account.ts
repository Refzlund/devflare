import type { HelpPage } from '../types'
import {
	ACCOUNT_OPTION,
	createAccountInventoryPage,
	entry
} from '../shared'

export const ACCOUNT_HELP_PAGES: HelpPage[] = [
	{
		path: ['account'],
		summary: 'Inspect Cloudflare accounts, resources, and usage data',
		usage: [
			'devflare account [info] [--account <id>]',
			'devflare account <workers|kv|d1|r2|vectorize|usage> [--account <id>]',
			'devflare account limits [set <limit-name> <value> | enable | disable] [--account <id>]',
			'devflare account <global|workspace>'
		],
		description: [
			'The default view shows the selected account and the commands you can run against it.',
			'Inventory subcommands list Cloudflare resources in the resolved account, while `limits` and `usage` focus on Devflare-managed usage controls.'
		],
		subcommands: [
			entry('info', 'Show account overview and available account commands (default)'),
			entry('workers', 'List Workers for the selected account'),
			entry('kv', 'List KV namespaces'),
			entry('d1', 'List D1 databases'),
			entry('r2', 'List R2 buckets'),
			entry('vectorize', 'List Vectorize indexes'),
			entry('usage', 'Show Devflare usage summaries'),
			entry('limits', 'Show or change Devflare usage limits'),
			entry('global', 'Choose the global default account interactively'),
			entry('workspace', 'Choose the workspace account interactively')
		],
		options: [ACCOUNT_OPTION],
		examples: [
			entry('devflare account', 'Show the account overview'),
			entry('devflare account workers', 'List Workers for the resolved account'),
			entry('devflare account limits set ai-requests 50', 'Set a daily AI request limit'),
			entry('devflare account workspace', 'Choose the account stored in the current workspace')
		],
		notes: [
			'Account resolution prefers `--account`, then workspace settings, then `CLOUDFLARE_ACCOUNT_ID`, then the loaded config, then the primary authenticated account.',
			'The `global` and `workspace` subcommands are interactive selectors; they do not take `--account`.'
		]
	},
	createAccountInventoryPage('info', 'Show the selected account overview', 'Displays the selected account plus shortcuts for other `account` subcommands.', 'Show the account overview and suggested follow-up commands'),
	createAccountInventoryPage('workers', 'List Workers in the selected account', 'Prints Worker names and last-modified timestamps for the resolved account.', 'List Worker scripts in the selected account'),
	createAccountInventoryPage('kv', 'List KV namespaces in the selected account', 'Prints namespace names and ids for the resolved account.', 'List KV namespaces for the selected account'),
	createAccountInventoryPage('d1', 'List D1 databases in the selected account', 'Prints database names, ids, and table counts for the resolved account.', 'List D1 databases for the selected account'),
	createAccountInventoryPage('r2', 'List R2 buckets in the selected account', 'Prints bucket names, creation dates, and locations for the resolved account.', 'List R2 buckets for the selected account'),
	createAccountInventoryPage('vectorize', 'List Vectorize indexes in the selected account', 'Prints Vectorize index names, dimensions, and metrics for the resolved account.', 'List Vectorize indexes for the selected account'),
	createAccountInventoryPage('usage', 'Show Devflare usage summaries', 'Prints Devflare-tracked usage totals and the currently configured usage limits.', 'Show usage summaries for the selected account'),
	{
		path: ['account', 'limits'],
		summary: 'Show or update Devflare usage limits',
		usage: [
			'devflare account limits [--account <id>]',
			'devflare account limits set <ai-requests|ai-tokens|vectorize-ops> <value> [--account <id>]',
			'devflare account limits <enable|disable> [--account <id>]'
		],
		description: [
			'Views the current Devflare usage limits for the selected account and optionally updates them.',
			'Use `enable` or `disable` to toggle enforcement without changing the configured numeric thresholds.'
		],
		subcommands: [
			entry('set <limit-name> <value>', 'Set one numeric usage limit'),
			entry('enable', 'Enable limit enforcement without changing stored values'),
			entry('disable', 'Disable limit enforcement without changing stored values')
		],
		options: [ACCOUNT_OPTION],
		examples: [
			entry('devflare account limits', 'Show the current usage limits'),
			entry('devflare account limits set ai-requests 50', 'Set the daily AI request limit'),
			entry('devflare account limits enable', 'Enable limit enforcement'),
			entry('devflare account limits disable', 'Disable limit enforcement')
		],
		notes: [
			'Valid limit names are `ai-requests`, `ai-tokens`, and `vectorize-ops`.',
			'Numeric values must be non-negative integers.'
		]
	},
	{
		path: ['account', 'limits', 'set'],
		summary: 'Set one Devflare usage limit',
		usage: [
			'devflare account limits set <ai-requests|ai-tokens|vectorize-ops> <value> [--account <id>]'
		],
		description: [
			'Updates one stored Devflare usage limit for the selected account.',
			'Use `enable` separately when you want enforcement turned on after changing the threshold.'
		],
		arguments: [
			entry('<ai-requests|ai-tokens|vectorize-ops>', 'Which usage limit to update'),
			entry('<value>', 'Non-negative integer threshold for the selected limit')
		],
		options: [ACCOUNT_OPTION],
		examples: [
			entry('devflare account limits set ai-requests 50', 'Set the daily AI request limit to 50'),
			entry('devflare account limits set ai-tokens 5000 --account <id>', 'Set the daily AI token limit for a specific account')
		],
		notes: [
			'Changing a value does not automatically enable enforcement if limits are currently disabled.'
		]
	},
	{
		path: ['account', 'limits', 'enable'],
		summary: 'Enable Devflare usage-limit enforcement',
		usage: [
			'devflare account limits enable [--account <id>]'
		],
		description: [
			'Turns on Devflare usage-limit enforcement for the selected account without changing the stored numeric thresholds.'
		],
		options: [ACCOUNT_OPTION],
		examples: [
			entry('devflare account limits enable', 'Enable usage-limit enforcement for the resolved account')
		],
		notes: [
			'Use `devflare account limits set ...` first when you need to change the stored thresholds.'
		]
	},
	{
		path: ['account', 'limits', 'disable'],
		summary: 'Disable Devflare usage-limit enforcement',
		usage: [
			'devflare account limits disable [--account <id>]'
		],
		description: [
			'Disables Devflare usage-limit enforcement for the selected account without deleting the stored thresholds.'
		],
		options: [ACCOUNT_OPTION],
		examples: [
			entry('devflare account limits disable', 'Disable usage-limit enforcement for the resolved account')
		],
		notes: [
			'Re-enable later with `devflare account limits enable` to reuse the same stored values.'
		]
	},
	{
		path: ['account', 'global'],
		summary: 'Choose the global default Cloudflare account',
		usage: [
			'devflare account global'
		],
		description: [
			'Opens an interactive selector and stores the chosen default account in Devflare preferences.'
		],
		examples: [
			entry('devflare account global', 'Choose the global default account interactively')
		],
		notes: [
			'The selected account is written to Devflare preferences and mirrored to cloud KV when available.'
		]
	},
	{
		path: ['account', 'workspace'],
		summary: 'Choose the workspace Cloudflare account',
		usage: [
			'devflare account workspace'
		],
		description: [
			'Opens an interactive selector and stores the chosen account in the current workspace package metadata.'
		],
		examples: [
			entry('devflare account workspace', 'Choose the account pinned to the current workspace')
		],
		notes: [
			'The workspace account overrides the global default when Devflare resolves account context inside that workspace.'
		]
	}
]
