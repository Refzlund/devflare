import { docPath, getCanonicalDocSlug } from '$lib/docs/content'
import type { IntellisenseDefinition, IntellisenseLink } from '../types'

function docsReference(label: string, slug: string): IntellisenseLink {
	return {
		label,
		href: docPath(getCanonicalDocSlug(slug) ?? slug)
	}
}

function cloudflareReference(label: string, href: string): IntellisenseLink {
	return {
		label,
		href,
		external: true,
		citation: 'Cloudflare Docs'
	}
}

export const definitionsPart4: IntellisenseDefinition[] = [
	{
		id: 'cli-previews-command',
		label: 'devflare previews',
		kind: 'cli',
		aliases: ['previews'],
		contexts: ['shell', 'yaml'],
		codeIncludes: ['devflare previews'],
		summary: 'Inspect preview scopes, preview resources, and current preview registry state.',
		detail:
			'Use this when preview infrastructure already exists and you need to inspect or clean it up instead of only deploying a new preview.',
		requirement: 'contextual',
		availableIn: 'Terminal commands and automation scripts',
		references: [
			docsReference('Preview operations', 'preview-operations'),
			docsReference('Preview strategies', 'preview-strategies')
		]
	},
	{
		id: 'cli-productions-command',
		label: 'devflare productions',
		kind: 'cli',
		aliases: ['productions'],
		contexts: ['shell', 'yaml'],
		codeIncludes: ['devflare productions'],
		summary: 'Inspect and manage live production workers and deployments.',
		detail:
			'This is the production-side inspection lane when you need to see what is live instead of only reasoning from local build output.',
		requirement: 'contextual',
		availableIn: 'Terminal commands and automation scripts',
		references: [docsReference('Production deploys', 'production-deploys')]
	},
	{
		id: 'cli-flag-env',
		label: '--env',
		kind: 'flag',
		aliases: ['--env'],
		contexts: ['shell', 'yaml'],
		summary: 'Resolve config.env[name] before building, printing, or deploying.',
		detail:
			'Use this when a named environment should be applied on top of the base config. It is especially useful for build and config inspection flows.',
		requirement: 'contextual',
		availableIn: 'build, deploy, and config commands',
		references: [
			docsReference('Devflare CLI', 'devflare-cli'),
			docsReference('Config basics', 'config-basics')
		]
	},
	{
		id: 'cli-flag-preview',
		label: '--preview',
		kind: 'flag',
		aliases: ['--preview'],
		contexts: ['shell', 'yaml'],
		summary: 'Select preview deployment mode, optionally with a named preview scope.',
		detail:
			'Pass a value such as next or pr-1 for named preview scopes, or omit the value for a same-worker preview upload.',
		requirement: 'contextual',
		availableIn: 'deploy command',
		references: [
			docsReference('Preview strategies', 'preview-strategies'),
			docsReference('Preview operations', 'preview-operations')
		]
	},
	{
		id: 'cli-flag-prod',
		label: '--prod',
		kind: 'flag',
		aliases: ['--prod'],
		contexts: ['shell', 'yaml'],
		summary: 'Explicitly target a production deployment.',
		detail:
			'Devflare requires an explicit production or preview target at deploy time so production intent is never accidental.',
		requirement: 'contextual',
		availableIn: 'deploy command',
		references: [docsReference('Production deploys', 'production-deploys')]
	},
	{
		id: 'cli-flag-production',
		label: '--production',
		kind: 'flag',
		aliases: ['--production'],
		contexts: ['shell', 'yaml'],
		summary: 'Long-form alias for --prod.',
		detail:
			'Use this when you want the longer spelling in CI or scripts, but the deploy behavior is the same as --prod.',
		requirement: 'contextual',
		availableIn: 'deploy command',
		references: [docsReference('Production deploys', 'production-deploys')]
	},
	{
		id: 'cli-flag-dry-run',
		label: '--dry-run',
		kind: 'flag',
		aliases: ['--dry-run'],
		contexts: ['shell', 'yaml'],
		summary: 'Print the synthesized deployment config and skip the actual remote operation.',
		detail:
			'Use this when you want to review the exact deploy contract before making a real production or preview change.',
		requirement: 'contextual',
		availableIn: 'deploy command',
		references: [
			docsReference('Production deploys', 'production-deploys'),
			docsReference('Preview strategies', 'preview-strategies')
		]
	},
	{
		id: 'cli-flag-config',
		label: '--config',
		kind: 'flag',
		aliases: ['--config'],
		contexts: ['shell', 'yaml'],
		summary: 'Use a specific devflare config path instead of default config resolution.',
		detail:
			'This is useful in monorepos or automation when the working directory is not already the package that owns the intended config file.',
		requirement: 'contextual',
		availableIn: 'Most CLI commands',
		references: [docsReference('Devflare CLI', 'devflare-cli')]
	},
	{
		id: 'cli-flag-output',
		label: '--output',
		kind: 'flag',
		aliases: ['--output'],
		contexts: ['shell', 'yaml'],
		summary: 'Write generated output to a custom location.',
		detail:
			'In the types command, this changes where the generated env.d.ts-style bindings file is written instead of using the default path.',
		requirement: 'contextual',
		availableIn: 'types command',
		references: [docsReference('Devflare CLI', 'devflare-cli')]
	},
	{
		id: 'cli-flag-debug',
		label: '--debug',
		kind: 'flag',
		aliases: ['--debug'],
		contexts: ['shell', 'yaml'],
		summary: 'Enable extra stack traces and debug logging when a command fails.',
		detail:
			'Reach for this when the normal command output is too polite to explain what actually went wrong.',
		requirement: 'contextual',
		availableIn: 'Many CLI commands',
		references: [docsReference('Devflare CLI', 'devflare-cli')]
	},
	{
		id: 'browser-puppeteer',
		label: '@cloudflare/puppeteer',
		kind: 'binding',
		aliases: ['@cloudflare/puppeteer'],
		contexts: ['runtime', 'test'],
		summary: 'Cloudflare-maintained Puppeteer integration for Browser Rendering sessions.',
		detail:
			'Use this with a browser binding when worker code should launch or control a Cloudflare Browser Rendering session through a familiar Puppeteer API.',
		requirement: 'contextual',
		availableIn: 'Browser Rendering examples',
		references: [
			docsReference('Browser binding guide', 'bindings/browser-rendering'),
			cloudflareReference(
				'Browser Rendering docs',
				'https://developers.cloudflare.com/browser-rendering/'
			)
		]
	}
]
