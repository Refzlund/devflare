import type { HelpPage } from '../types'
import {
	createRemoteSubcommandPage,
	entry
} from '../shared'

export const MISC_HELP_PAGES: HelpPage[] = [
	{
		path: ['worker'],
		summary: 'Rename and manage Worker control-plane operations',
		usage: [
			'devflare worker rename <old-name> --to <new-name> [--config <path>] [--account <id>]'
		],
		description: [
			'Currently, `rename` is the supported worker control-plane operation.',
			'Devflare renames the remote Worker when needed and updates the matching local config name when it can resolve it safely.'
		],
		subcommands: [
			entry('rename', 'Rename a Worker and sync the matching devflare config name')
		],
		options: [
			entry('--to <new-name>', 'New Worker name for the `rename` subcommand'),
			entry('--config <path>', 'Choose the config file to update when multiple configs might match'),
			entry('--account <id>', 'Use a specific Cloudflare account when renaming the remote Worker')
		],
		examples: [
			entry('devflare worker rename documentation --to devflare-documentation', 'Rename a Worker and sync the matching config')
		],
		notes: [
			'Devflare warns about local service binding and Durable Object references that still point at the old Worker name so you can update them manually if needed.'
		]
	},
	{
		path: ['worker', 'rename'],
		summary: 'Rename a Worker and sync the matching config',
		usage: [
			'devflare worker rename <old-name> --to <new-name> [--config <path>] [--account <id>]'
		],
		description: [
			'Renames the remote Worker when necessary, updates the top-level `name` field in the selected config, and then warns about any remaining local references to the old Worker name.'
		],
		arguments: [
			entry('<old-name>', 'Current Worker name'),
			entry('--to <new-name>', 'Required new Worker name')
		],
		options: [
			entry('--config <path>', 'Choose the config file to update when multiple configs may match'),
			entry('--account <id>', 'Use a specific Cloudflare account for the remote rename')
		],
		examples: [
			entry('devflare worker rename docs --to devflare-docs', 'Rename the Worker and sync the selected config')
		]
	},
	{
		path: ['tokens'],
		summary: 'Manage Devflare-managed Cloudflare API tokens',
		usage: [
			'devflare tokens <bootstrap-token> --list [--account <id>]',
			'devflare tokens <bootstrap-token> --new [name] [--account <id>] [--all-flags]',
			'devflare tokens <bootstrap-token> --roll [name] [--account <id>]',
			'devflare tokens <bootstrap-token> --delete [name] [--account <id>]',
			'devflare tokens <bootstrap-token> --delete-all [--account <id>]'
		],
		description: [
			'Creates, lists, rolls, and deletes Devflare-managed account-owned API tokens using a bootstrap token that already has token-management permissions.',
			'Token names are normalized to the `devflare-` prefix automatically.'
		],
		arguments: [
			entry('<bootstrap-token>', 'Account-owned bootstrap token with Cloudflare API token-management permissions')
		],
		options: [
			entry('--list', 'List Devflare-managed account-owned tokens'),
			entry('--new [name]', 'Create a Devflare-managed account-owned token'),
			entry('--roll [name]', 'Roll a Devflare-managed token secret'),
			entry('--delete [name]', 'Delete a Devflare-managed token by name'),
			entry('--delete-all', 'Delete every Devflare-managed token in the selected account'),
			entry('--account <id>', 'Use a specific Cloudflare account'),
			entry('--all-flags', 'With `--new`, include every reusable account/zone-scoped permission group')
		],
		examples: [
			entry('devflare tokens $BOOTSTRAP --list', 'List managed tokens'),
			entry('devflare tokens $BOOTSTRAP --new preview', 'Create a managed token named `devflare-preview`'),
			entry('devflare tokens $BOOTSTRAP --roll preview', 'Roll the secret for `devflare-preview`'),
			entry('devflare tokens $BOOTSTRAP --delete-all', 'Delete every Devflare-managed token for the selected account')
		],
		notes: [
			'Created tokens include the selected account resource and all zones in that account so deploys can manage Worker routes and custom-domain route state.',
			'Cloudflare only returns token secrets once for create and roll operations, so store them immediately.'
		]
	},
	{
		path: ['ai'],
		summary: 'Show Workers AI pricing information',
		usage: [
			'devflare ai'
		],
		description: [
			'Prints the built-in Workers AI pricing reference bundled with Devflare.'
		],
		examples: [
			entry('devflare ai', 'Print the bundled Workers AI pricing reference')
		],
		notes: [
			'This command does not currently query live account state; it prints the pricing table bundled with the current Devflare build.'
		]
	},
	{
		path: ['remote'],
		summary: 'Manage remote test mode for paid Cloudflare features',
		usage: [
			'devflare remote [status]',
			'devflare remote enable [minutes]',
			'devflare remote disable'
		],
		description: [
			'Remote mode enables tests that hit real Cloudflare infrastructure for services such as AI and Vectorize.',
			'The default action is `status`.'
		],
		subcommands: [
			entry('status', 'Show the current effective remote-mode status'),
			entry('enable [minutes]', 'Enable remote mode for a bounded duration (defaults to 30 minutes)'),
			entry('disable', 'Disable remote mode immediately')
		],
		examples: [
			entry('devflare remote', 'Show the current remote-mode status'),
			entry('devflare remote enable 30', 'Enable remote mode for 30 minutes'),
			entry('devflare remote disable', 'Disable remote mode')
		],
		notes: [
			'Remote tests use real Cloudflare services and may incur costs.',
			'`DEVFLARE_REMOTE` can keep remote mode active even after you run `disable`.'
		]
	},
	createRemoteSubcommandPage(
		'status',
		'Show the current effective remote-mode status',
		[
			'devflare remote status'
		],
		[
			'Shows whether remote mode is active, where that state came from, and when it expires if it is time-limited.'
		],
		[
			entry('devflare remote status', 'Inspect the current remote-mode status')
		],
		[
			'`devflare remote` without a subcommand behaves the same way.'
		]
	),
	createRemoteSubcommandPage(
		'enable',
		'Enable remote test mode',
		[
			'devflare remote enable [minutes]'
		],
		[
			'Enables remote test mode for the given duration, defaulting to 30 minutes when the duration is omitted or invalid.'
		],
		[
			entry('devflare remote enable', 'Enable remote mode for the default 30 minutes'),
			entry('devflare remote enable 90', 'Enable remote mode for 90 minutes')
		],
		[
			'Remote tests can incur real Cloudflare costs, so prefer the shortest useful duration.'
		]
	),
	createRemoteSubcommandPage(
		'disable',
		'Disable remote test mode',
		[
			'devflare remote disable'
		],
		[
			'Disables the stored remote-mode window immediately.'
		],
		[
			entry('devflare remote disable', 'Disable remote mode immediately')
		],
		[
			'If `DEVFLARE_REMOTE` is still set in the environment, effective remote mode may remain active until you unset it.'
		]
	)
]
