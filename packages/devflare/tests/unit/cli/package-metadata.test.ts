import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { parse as parseJsonc } from 'jsonc-parser'
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

		// The package builds against the newest major; the root resolves the oldest, which is the
		// copy `devflare:typecheck:wt4` checks the sources against.
		const packageWorkersTypes = packageJson.devDependencies?.['@cloudflare/workers-types'] ?? ''
		const rootWorkersTypes = rootPackageJson.devDependencies?.['@cloudflare/workers-types'] ?? ''
		const peerWorkersTypes = packageJson.peerDependencies?.['@cloudflare/workers-types'] ?? ''
		const peerMajors = peerWorkersTypes.split('||').map((range) => getMajorVersion(range))
		const admits = (range: string) =>
			Bun.semver.satisfies(range.replace(/^[\^~]/, ''), peerWorkersTypes)

		// The root pins EXACTLY the oldest range's floor: a caret range resolves to the newest
		// 4.x, so a type added after the floor would pass a check consumers on the floor fail.
		const oldestRange = peerWorkersTypes
			.split('||')
			.map((range) => range.trim())
			.find((range) => getMajorVersion(range) === Math.min(...peerMajors))

		expect({
			packageMajor: getMajorVersion(packageWorkersTypes),
			rootMajor: getMajorVersion(rootWorkersTypes),
			peerAdmitsPackage: admits(packageWorkersTypes),
			peerAdmitsRoot: admits(rootWorkersTypes),
			rootIsTheFloor: rootWorkersTypes === oldestRange?.replace(/^[\^~]/, '')
		}).toEqual({
			packageMajor: Math.max(...peerMajors),
			rootMajor: Math.min(...peerMajors),
			peerAdmitsPackage: true,
			peerAdmitsRoot: true,
			rootIsTheFloor: true
		})
	})

	test('the CI typecheck also checks the sources against the root workers-types', () => {
		const repoRoot = join(import.meta.dir, '..', '..', '..', '..', '..')
		const rootPackageJson = readJsonFile<{ scripts?: Record<string, string> }>(
			join(repoRoot, 'package.json')
		)
		const olderMajorConfig = parseJsonc(
			readFileSync(join(repoRoot, 'tsconfig.devflare-wt4.json'), 'utf8')
		) as {
			compilerOptions?: { paths?: Record<string, string[]> }
			include?: string[]
		}

		// `devflare:typecheck` is what workspace-ci (via devflare:ci) and the publish gate run. The
		// module mapping matters as much as `types`: three test helpers import from
		// '@cloudflare/workers-types', and unmapped they resolve the package's 5.x copy.
		expect({
			typecheckRunsOlderMajor: rootPackageJson.scripts?.['devflare:typecheck']?.includes(
				'bun run devflare:typecheck:wt4'
			),
			olderMajorCommand: rootPackageJson.scripts?.['devflare:typecheck:wt4'],
			include: olderMajorConfig.include,
			workersTypesModule: olderMajorConfig.compilerOptions?.paths?.['@cloudflare/workers-types']
		}).toEqual({
			typecheckRunsOlderMajor: true,
			olderMajorCommand: 'tsgo --noEmit -p tsconfig.devflare-wt4.json',
			include: ['packages/devflare/src/**/*.ts'],
			workersTypesModule: ['./node_modules/@cloudflare/workers-types/index.ts']
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
