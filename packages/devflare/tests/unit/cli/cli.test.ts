// =============================================================================
// CLI Tests — Command structure and execution
// =============================================================================

import { describe, expect, test, mock, beforeEach, afterEach } from 'bun:test'
import { parseArgs, runCli } from '../../../src/cli/index'
import { getPackageVersion } from '../../../src/cli/package-metadata'

describe('parseArgs', () => {
	test('parses empty args', () => {
		const result = parseArgs([])
		expect(result.command).toBe('help')
	})

	test('parses help flag', () => {
		expect(parseArgs(['--help']).command).toBe('help')
		expect(parseArgs(['-h']).command).toBe('help')
	})

	test('keeps command-specific help attached to the current command', () => {
		const result = parseArgs(['previews', '--help'])
		expect(result.command).toBe('previews')
		expect(result.options.help).toBe(true)
	})

	test('parses version flag', () => {
		expect(parseArgs(['--version']).command).toBe('version')
		expect(parseArgs(['-v']).command).toBe('version')
	})

	test('parses help and version commands directly', () => {
		expect(parseArgs(['help']).command).toBe('help')
		expect(parseArgs(['version']).command).toBe('version')
	})

	test('parses help topics after the help command', () => {
		const result = parseArgs(['help', 'previews'])
		expect(result.command).toBe('help')
		expect(result.args).toEqual(['previews'])
	})

	test('parses init command', () => {
		const result = parseArgs(['init'])
		expect(result.command).toBe('init')
		expect(result.args).toEqual([])
	})

	test('parses init with project name', () => {
		const result = parseArgs(['init', 'my-project'])
		expect(result.command).toBe('init')
		expect(result.args).toEqual(['my-project'])
	})

	test('parses dev command', () => {
		const result = parseArgs(['dev'])
		expect(result.command).toBe('dev')
	})

	test('parses dev with port flag', () => {
		const result = parseArgs(['dev', '--port', '3000'])
		expect(result.command).toBe('dev')
		expect(result.options.port).toBe('3000')
	})

	test('parses build command', () => {
		const result = parseArgs(['build'])
		expect(result.command).toBe('build')
	})

	test('parses deploy command', () => {
		const result = parseArgs(['deploy'])
		expect(result.command).toBe('deploy')
	})

	test('parses deploy production flags', () => {
		const result = parseArgs(['deploy', '--prod'])
		expect(result.command).toBe('deploy')
		expect(result.options.prod).toBe(true)
	})

	test('parses bare deploy preview flags', () => {
		const result = parseArgs(['deploy', '--preview'])
		expect(result.command).toBe('deploy')
		expect(result.options.preview).toBe(true)
	})

	test('parses deploy named preview target', () => {
		const result = parseArgs(['deploy', '--preview', 'pr-1'])
		expect(result.command).toBe('deploy')
		expect(result.options.preview).toBe('pr-1')
	})

	test('parses deploy preview branch metadata flags', () => {
		const result = parseArgs(['deploy', '--preview', '--branch-name', 'feature/branch'])
		expect(result.command).toBe('deploy')
		expect(result.options.preview).toBe(true)
		expect(result.options['branch-name']).toBe('feature/branch')
	})

	test('parses types command', () => {
		const result = parseArgs(['types'])
		expect(result.command).toBe('types')
	})

	test('parses doctor command', () => {
		const result = parseArgs(['doctor'])
		expect(result.command).toBe('doctor')
	})

	test('parses tokens command', () => {
		const result = parseArgs(['tokens', 'bootstrap-token', '--new', 'preview'])
		expect(result.command).toBe('tokens')
		expect(result.args).toEqual(['bootstrap-token'])
		expect(result.options.new).toBe('preview')
	})

	test('parses token roll command', () => {
		const result = parseArgs(['tokens', 'bootstrap-token', '--roll', 'preview'])
		expect(result.command).toBe('tokens')
		expect(result.args).toEqual(['bootstrap-token'])
		expect(result.options.roll).toBe('preview')
	})

	test('parses login command', () => {
		const result = parseArgs(['login', '--force'])
		expect(result.command).toBe('login')
		expect(result.options.force).toBe(true)
	})

	test('parses previews command', () => {
		const result = parseArgs(['previews', 'cleanup', '--apply'])
		expect(result.command).toBe('previews')
		expect(result.args).toEqual(['cleanup'])
		expect(result.options.apply).toBe(true)
	})

	test('parses productions command', () => {
		const result = parseArgs(['productions', 'versions', '--worker', 'demo-worker'])
		expect(result.command).toBe('productions')
		expect(result.args).toEqual(['versions'])
		expect(result.options.worker).toBe('demo-worker')
	})

	test('parses worker rename command', () => {
		const result = parseArgs(['worker', 'rename', 'documentation', '--to', 'devflare-documentation'])
		expect(result.command).toBe('worker')
		expect(result.args).toEqual(['rename', 'documentation'])
		expect(result.options.to).toBe('devflare-documentation')
	})

	test('parses config print command', () => {
		const result = parseArgs(['config', 'print', '--json', '--format', 'wrangler'])
		expect(result.command).toBe('config')
		expect(result.args).toEqual(['print'])
		expect(result.options.json).toBe(true)
		expect(result.options.format).toBe('wrangler')
	})

	test('parses global flags', () => {
		const result = parseArgs(['dev', '--config', 'custom.config.ts', '--debug'])
		expect(result.command).toBe('dev')
		expect(result.options.config).toBe('custom.config.ts')
		expect(result.options.debug).toBe(true)
	})

	test('unknown command defaults to help', () => {
		const result = parseArgs(['unknown-command'])
		expect(result.command).toBe('help')
		expect(result.unknownCommand).toBe('unknown-command')
	})
})

describe('runCli', () => {
	test('returns exit code 0 for help', async () => {
		const result = await runCli(['--help'], { silent: true })
		expect(result.exitCode).toBe(0)
		expect(result.output).toContain('devflare Config compiler + CLI orchestrator for Cloudflare Workers')
		expect(result.output).toContain('devflare <command> [options]')
		expect(result.output).toContain('previews — Inspect and clean dedicated preview Workers and scopes')
		expect(result.output).toContain('productions — Inspect and manage live production Workers and deployments')
		expect(result.output).toContain('Use `devflare <command> --help` or `devflare help <command>`')
		expect(result.output).toContain('devflare help deploy')
	})

	test('requires an explicit deploy target from the CLI', async () => {
		const result = await runCli(['deploy'], { silent: true })
		expect(result.exitCode).toBe(1)
	})

	test('shows deploy help with explicit preview targeting syntax', async () => {
		const result = await runCli(['deploy', '--help'], { silent: true })

		expect(result.exitCode).toBe(0)
		expect(result.output).toContain('devflare deploy --preview <name> [--config <path>] [--message <text>] [--tag <text>]')
		expect(result.output).toContain('devflare deploy --preview [--config <path>] [--branch-name <branch>] [--message <text>] [--tag <text>]')
		expect(result.output).toContain('--preview <name> — Deploy a named preview scope such as `next` or `pr-1`')
	})

	test('shows preview cleanup help', async () => {
		const result = await runCli(['previews', 'cleanup', '--help'], { silent: true })

		expect(result.exitCode).toBe(0)
		expect(result.output).toContain('devflare previews cleanup [--config <path>] [--env <name>] [--scope <name> | --all] [--account <id>] [--apply]')
		expect(result.output).toContain('--scope <name> — Clean one preview scope instead of the default `preview` scope')
		expect(result.output).not.toContain('preview registry')
	})

	test('shows the same detailed help for `help <command>` and `<command> --help`', async () => {
		const viaHelpCommand = await runCli(['help', 'previews'], { silent: true })
		const viaFlag = await runCli(['previews', '--help'], { silent: true })

		expect(viaHelpCommand.exitCode).toBe(0)
		expect(viaFlag.exitCode).toBe(0)
		expect(viaHelpCommand.output).toBe(viaFlag.output)
		expect(viaFlag.output).toContain('devflare previews Inspect and clean dedicated preview Worker scopes')
		expect(viaFlag.output).toContain('devflare previews cleanup [--config <path>] [--env <name>] [--scope <name> | --all] [--account <id>] [--apply]')
		expect(viaFlag.output).toContain('--scope <name>')
		expect(viaFlag.output).toContain('`cleanup` removes preview-only Cloudflare resources for the targeted scope and also deletes dedicated preview-scope Worker scripts')
	})

	test('shows nested help for preview cleanup', async () => {
		const result = await runCli(['previews', 'cleanup', '--help'], { silent: true })

		expect(result.exitCode).toBe(0)
		expect(result.output).toContain('devflare previews cleanup Delete preview-only Worker scripts and preview-scoped Cloudflare resources')
		expect(result.output).toContain('--scope <name> — Clean one preview scope instead of the default `preview` scope')
		expect(result.output).toContain('--all — Clean every live preview scope Devflare can discover for the current worker family')
		expect(result.output).toContain('--apply — Apply the cleanup instead of doing a dry run')
		expect(result.output).toContain('Dedicated preview Worker scripts are candidates only when their names resolve to the targeted preview scope')
	})

	test('shows nested help for worker rename', async () => {
		const result = await runCli(['worker', 'rename', '--help'], { silent: true })

		expect(result.exitCode).toBe(0)
		expect(result.output).toContain('devflare worker rename Rename a Worker and sync the matching config')
		expect(result.output).toContain('devflare worker rename <old-name> --to <new-name> [--config <path>] [--account <id>]')
	})

	test('resolves the correct help page even when positional arguments are already present', async () => {
		const checks = [
			{
				argv: ['worker', 'rename', 'documentation', '--help'],
				snippet: 'devflare worker rename Rename a Worker and sync the matching config'
			},
			{
				argv: ['remote', 'enable', '45', '--help'],
				snippet: 'devflare remote enable Enable remote test mode'
			},
			{
				argv: ['account', 'limits', 'set', 'ai-requests', '50', '--help'],
				snippet: 'devflare account limits set Set one Devflare usage limit'
			},
			{
				argv: ['tokens', 'bootstrap-token', '--help'],
				snippet: 'devflare tokens Manage Devflare-managed Cloudflare API tokens'
			}
		]

		for (const check of checks) {
			const result = await runCli(check.argv, { silent: true })
			expect(result.exitCode).toBe(0)
			expect(result.output).toContain(check.snippet)
		}
	})

	test('provides detailed help pages for every top-level command', async () => {
		const commandChecks = [
			{ argv: ['init', '--help'], snippet: 'devflare init Create a new devflare project' },
			{ argv: ['dev', '--help'], snippet: 'devflare dev Start the development server' },
			{ argv: ['build', '--help'], snippet: 'devflare build Build production deployment artifacts' },
			{ argv: ['deploy', '--help'], snippet: 'devflare deploy Deploy explicitly to Cloudflare production or preview targets' },
			{ argv: ['types', '--help'], snippet: 'devflare types Generate TypeScript bindings from your config' },
			{ argv: ['doctor', '--help'], snippet: 'devflare doctor Check project configuration' },
			{ argv: ['config', '--help'], snippet: 'devflare config Print resolved Devflare or Wrangler config' },
			{ argv: ['account', '--help'], snippet: 'devflare account Inspect Cloudflare accounts, resources, and usage data' },
			{ argv: ['login', '--help'], snippet: 'devflare login Authenticate with Cloudflare via Wrangler' },
			{ argv: ['previews', '--help'], snippet: 'devflare previews Inspect and clean dedicated preview Worker scopes' },
			{ argv: ['productions', '--help'], snippet: 'devflare productions Inspect and manage live production Workers and deployments' },
			{ argv: ['worker', '--help'], snippet: 'devflare worker Rename and manage Worker control-plane operations' },
			{ argv: ['tokens', '--help'], snippet: 'devflare tokens Manage Devflare-managed Cloudflare API tokens' },
			{ argv: ['ai', '--help'], snippet: 'devflare ai Show Workers AI pricing information' },
			{ argv: ['remote', '--help'], snippet: 'devflare remote Manage remote test mode for paid Cloudflare features' },
			{ argv: ['help', 'help'], snippet: 'devflare help Show command overview or command-specific help' },
			{ argv: ['version', '--help'], snippet: 'devflare version Show the installed devflare version' }
		]

		for (const check of commandChecks) {
			const result = await runCli(check.argv, { silent: true })
			expect(result.exitCode).toBe(0)
			expect(result.output).toContain(check.snippet)
			expect(result.output).toContain('usage')
		}
	})

	test('provides detailed help pages for nested command paths', async () => {
		const nestedChecks = [
			{ argv: ['config', 'print', '--help'], snippet: 'devflare config print Print the resolved config' },
			{ argv: ['account', 'info', '--help'], snippet: 'devflare account info Show the selected account overview' },
			{ argv: ['account', 'workers', '--help'], snippet: 'devflare account workers List Workers in the selected account' },
			{ argv: ['account', 'kv', '--help'], snippet: 'devflare account kv List KV namespaces in the selected account' },
			{ argv: ['account', 'd1', '--help'], snippet: 'devflare account d1 List D1 databases in the selected account' },
			{ argv: ['account', 'r2', '--help'], snippet: 'devflare account r2 List R2 buckets in the selected account' },
			{ argv: ['account', 'vectorize', '--help'], snippet: 'devflare account vectorize List Vectorize indexes in the selected account' },
			{ argv: ['account', 'usage', '--help'], snippet: 'devflare account usage Show Devflare usage summaries' },
			{ argv: ['account', 'limits', '--help'], snippet: 'devflare account limits Show or update Devflare usage limits' },
			{ argv: ['account', 'limits', 'set', '--help'], snippet: 'devflare account limits set Set one Devflare usage limit' },
			{ argv: ['account', 'limits', 'enable', '--help'], snippet: 'devflare account limits enable Enable Devflare usage-limit enforcement' },
			{ argv: ['account', 'limits', 'disable', '--help'], snippet: 'devflare account limits disable Disable Devflare usage-limit enforcement' },
			{ argv: ['account', 'global', '--help'], snippet: 'devflare account global Choose the global default Cloudflare account' },
			{ argv: ['account', 'workspace', '--help'], snippet: 'devflare account workspace Choose the workspace Cloudflare account' },
			{ argv: ['previews', 'list', '--help'], snippet: 'devflare previews list List stable workers and dedicated preview scopes' },
			{ argv: ['previews', 'bindings', '--help'], snippet: 'devflare previews bindings Inspect resolved bindings/resources and live worker associations' },
			{ argv: ['previews', 'cleanup', '--help'], snippet: 'devflare previews cleanup Delete preview-only Worker scripts and preview-scoped Cloudflare resources' },
			{ argv: ['productions', 'list', '--help'], snippet: 'devflare productions list List live production Workers and their active deployments' },
			{ argv: ['productions', 'versions', '--help'], snippet: 'devflare productions versions Show recent stored production versions and the current active version' },
			{ argv: ['productions', 'rollback', '--help'], snippet: 'devflare productions rollback Roll a Worker back to the previous or specified production version' },
			{ argv: ['productions', 'delete', '--help'], snippet: 'devflare productions delete Delete a live production Worker script' },
			{ argv: ['worker', 'rename', '--help'], snippet: 'devflare worker rename Rename a Worker and sync the matching config' },
			{ argv: ['remote', 'status', '--help'], snippet: 'devflare remote status Show the current effective remote-mode status' },
			{ argv: ['remote', 'enable', '--help'], snippet: 'devflare remote enable Enable remote test mode' },
			{ argv: ['remote', 'disable', '--help'], snippet: 'devflare remote disable Disable remote test mode' }
		]

		for (const check of nestedChecks) {
			const result = await runCli(check.argv, { silent: true })
			expect(result.exitCode).toBe(0)
			expect(result.output).toContain(check.snippet)
			expect(result.output).toContain('usage')
		}
	})

	test('returns exit code 0 for version', async () => {
		const result = await runCli(['--version'], { silent: true })
		expect(result.exitCode).toBe(0)
		expect(result.output).toBe(await getPackageVersion())
	})

	test('returns exit code 0 for direct version command', async () => {
		const result = await runCli(['version'], { silent: true })
		expect(result.exitCode).toBe(0)
		expect(result.output).toBe(await getPackageVersion())
	})

	test('returns exit code 1 for unknown command', async () => {
		const result = await runCli(['unknown'], { silent: true })
		expect(result.exitCode).toBe(1)
	})

	test('returns exit code 1 for unknown help topic', async () => {
		const result = await runCli(['help', 'wat'], { silent: true })
		expect(result.exitCode).toBe(1)
	})
})
