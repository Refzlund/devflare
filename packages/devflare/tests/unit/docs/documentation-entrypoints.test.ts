import { describe, expect, test } from 'bun:test'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { docs } from '../../../../../apps/documentation/src/lib/docs/content'

async function readPackageReadme(): Promise<string> {
	const readme = await readFile(join(import.meta.dir, '..', '..', '..', 'README.md'), 'utf8')
	return readme.replace(/\r\n/g, '\n')
}

function escapeRegExp(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

// Extract the backtick-quoted identifier names documented for an entrypoint row
// in the README "Package Entrypoints" table.
function documentedEntrypointNames(readme: string, importPath: string): string[] {
	const row = readme.match(
		new RegExp(`^\\| \`${escapeRegExp(importPath)}\` \\| (?<description>.+?) \\|$`, 'm')
	)
	expect(row?.groups?.description).toBeDefined()

	return [...(row?.groups?.description.matchAll(/`([^`]+)`/g) ?? [])]
		.map((match) => match[1].replace(/\(\)$/g, ''))
		.flatMap((name) => name.split('/'))
		.map((name) => name.trim())
		.filter((name) => /^[A-Za-z_$][\w$]*$/.test(name))
}

describe('documentation entrypoints', () => {
	test('README package entrypoint rows only name actual exports', async () => {
		const readme = await readPackageReadme()
		const entrypoints = [
			{ importPath: 'devflare', mod: await import('../../../src/index') },
			{ importPath: 'devflare/config', mod: await import('../../../src/config-entry') },
			{ importPath: 'devflare/runtime', mod: await import('../../../src/runtime') },
			{ importPath: 'devflare/test', mod: await import('../../../src/test') },
			{ importPath: 'devflare/vite', mod: await import('../../../src/vite') },
			{ importPath: 'devflare/sveltekit', mod: await import('../../../src/sveltekit') },
			{ importPath: 'devflare/cloudflare', mod: await import('../../../src/cloudflare') },
			{ importPath: 'devflare/decorators', mod: await import('../../../src/decorators') }
		]
		const missingExports = entrypoints.flatMap(({ importPath, mod }) => {
			const actualExports = new Set(Object.keys(mod))
			return documentedEntrypointNames(readme, importPath)
				.filter((name) => !actualExports.has(name))
				.map((name) => `${importPath}: ${name}`)
		})

		expect(missingExports).toEqual([])
	})

	test('README entrypoint rows document every public export (exhaustively-listed entries)', async () => {
		const readme = await readPackageReadme()
		// These entrypoints enumerate their full public surface in the README, so
		// the row must name every runtime export. The larger entries (runtime,
		// test, cloudflare) are intentionally curated summaries and only get the
		// documented⊆exported check above. `default` is never named by symbol.
		const exhaustiveEntrypoints = [
			{ importPath: 'devflare', mod: await import('../../../src/index') },
			{ importPath: 'devflare/config', mod: await import('../../../src/config-entry') },
			{ importPath: 'devflare/vite', mod: await import('../../../src/vite') },
			{ importPath: 'devflare/sveltekit', mod: await import('../../../src/sveltekit') },
			{ importPath: 'devflare/decorators', mod: await import('../../../src/decorators') }
		]
		const ignoredExports = new Set(['default'])
		const undocumented = exhaustiveEntrypoints.flatMap(({ importPath, mod }) => {
			const documented = new Set(documentedEntrypointNames(readme, importPath))
			return Object.keys(mod)
				.filter((name) => !ignoredExports.has(name) && !documented.has(name))
				.map((name) => `${importPath}: ${name}`)
		})

		expect(undocumented).toEqual([])
	})

	test('README /docs links point at real doc slugs', async () => {
		const readme = await readPackageReadme()
		const slugs = new Set(docs.map((doc) => doc.slug))
		const referenced = [...readme.matchAll(/\/docs\/([a-z0-9][a-z0-9/-]*)/g)].map(
			(match) => match[1]
		)
		const broken = [...new Set(referenced)].filter((slug) => !slugs.has(slug))

		expect(broken).toEqual([])
	})
})
