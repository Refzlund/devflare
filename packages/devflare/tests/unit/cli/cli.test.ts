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

	test('parses version flag', () => {
		expect(parseArgs(['--version']).command).toBe('version')
		expect(parseArgs(['-v']).command).toBe('version')
	})

	test('parses help and version commands directly', () => {
		expect(parseArgs(['help']).command).toBe('help')
		expect(parseArgs(['version']).command).toBe('version')
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

	test('parses deploy preview flags', () => {
		const result = parseArgs(['deploy', '--preview', '--preview-alias', 'feature-branch'])
		expect(result.command).toBe('deploy')
		expect(result.options.preview).toBe(true)
		expect(result.options['preview-alias']).toBe('feature-branch')
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

	test('keeps the legacy token alias working', () => {
		const result = parseArgs(['token', 'bootstrap-token'])
		expect(result.command).toBe('token')
		expect(result.args).toEqual(['bootstrap-token'])
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
		expect(result.output).toContain('help')
		expect(result.output).toContain('version')
		expect(result.output).toContain('config              Print resolved Devflare/Wrangler config')
		expect(result.output).toContain('Used by dev, build, deploy, types, doctor, and config')
		expect(result.output).toContain('deploy --preview            Upload a preview version with wrangler versions upload')
		expect(result.output).toContain('deploy --preview --preview-alias <alias>')
		expect(result.output).toContain('deploy --preview --branch-name <branch>')
		expect(result.output).toContain('login               Authenticate with Cloudflare via Wrangler')
		expect(result.output).toContain('previews            Inspect and manage Devflare preview registry state')
		expect(result.output).toContain('previews retire --worker <name> --branch <branch> --apply')
		expect(result.output).toContain('worker              Rename and manage Worker control-plane operations')
		expect(result.output).toContain('previews reconcile          Reconcile the registry against live Cloudflare versions')
		expect(result.output).toContain('worker rename <old-name> --to <new-name>')
		expect(result.output).toContain('tokens              Manage Devflare-managed Cloudflare API tokens')
		expect(result.output).toContain('tokens <bootstrap-token> --new [name]')
		expect(result.output).toContain('tokens <bootstrap-token> --roll [name]')
		expect(result.output).toContain('tokens <bootstrap-token> --delete-all')
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
})
