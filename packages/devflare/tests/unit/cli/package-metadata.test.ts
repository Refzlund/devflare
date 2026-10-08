import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { getInitDependencyVersions } from '../../../src/cli/package-metadata'

function readJsonFile<T>(path: string): T {
	return JSON.parse(readFileSync(path, 'utf8')) as T
}

function getMajorVersion(range: string): number {
	const match = range.match(/\d+/)
	if (!match) {
		throw new Error(`Could not parse dependency range: ${range}`)
	}

	return Number(match[0])
}

describe('package metadata', () => {
	test('uses the package Wrangler dependency for new project scaffolds', async () => {
		const packageJson = readJsonFile<{ dependencies?: Record<string, string> }>(
			join(import.meta.dir, '..', '..', '..', 'package.json')
		)

		const wrangler = packageJson.dependencies?.wrangler
		if (!wrangler) {
			throw new Error('Expected package.json to declare a Wrangler dependency')
		}
		expect(getMajorVersion(wrangler)).toBeGreaterThanOrEqual(4)

		const dependencyVersions = await getInitDependencyVersions()
		expect(dependencyVersions.wrangler).toBe(wrangler)
	})

	test('uses the current Miniflare major for the local runtime dependency', () => {
		const packageJson = readJsonFile<{ dependencies?: Record<string, string> }>(
			join(import.meta.dir, '..', '..', '..', 'package.json')
		)

		const miniflare = packageJson.dependencies?.miniflare
		if (!miniflare) {
			throw new Error('Expected package.json to declare a Miniflare dependency')
		}
		expect(getMajorVersion(miniflare)).toBeGreaterThanOrEqual(4)
	})

	test('compiles against the newest and the oldest workers-types major the peer range admits', () => {
		const rootPackageJson = readJsonFile<{ devDependencies?: Record<string, string> }>(
			join(import.meta.dir, '..', '..', '..', '..', '..', 'package.json')
		)
		const packageJson = readJsonFile<{
			devDependencies?: Record<string, string>
			peerDependencies?: Record<string, string>
		}>(join(import.meta.dir, '..', '..', '..', 'package.json'))

		// The package builds against the newest major; the root type-checks the sources, the
		// tests and the example projects against the oldest, so a consumer on either is covered.
		const packageWorkersTypes = packageJson.devDependencies?.['@cloudflare/workers-types'] ?? ''
		const rootWorkersTypes = rootPackageJson.devDependencies?.['@cloudflare/workers-types'] ?? ''
		const peerWorkersTypes = packageJson.peerDependencies?.['@cloudflare/workers-types'] ?? ''
		const peerMajors = peerWorkersTypes.split('||').map((range) => getMajorVersion(range))
		const admits = (range: string) =>
			Bun.semver.satisfies(range.replace(/^[\^~]/, ''), peerWorkersTypes)

		expect({
			packageMajor: getMajorVersion(packageWorkersTypes),
			rootMajor: getMajorVersion(rootWorkersTypes),
			peerAdmitsPackage: admits(packageWorkersTypes),
			peerAdmitsRoot: admits(rootWorkersTypes)
		}).toEqual({
			packageMajor: Math.max(...peerMajors),
			rootMajor: Math.min(...peerMajors),
			peerAdmitsPackage: true,
			peerAdmitsRoot: true
		})
	})

	test('documents the supported Cloudflare toolchain policy', () => {
		const readme = readFileSync(join(import.meta.dir, '..', '..', '..', 'README.md'), 'utf8')

		expect(readme).toContain('## Cloudflare toolchain support')
		expect(readme).toContain('Wrangler 4')
		expect(readme).toContain('Miniflare 5')
		expect(readme).toContain('@cloudflare/workers-types 4 and 5')
		expect(readme).toContain('Devflare does not support Wrangler 3')
	})
})
