// =============================================================================
// CLI type-generation — the generated env.d.ts is already formatted
// =============================================================================
//
// `devflare types` writes in devflare's house style, the repository's own
// biome.json. This runs the repository's real Biome — `biome check` with the
// linter off, so the formatter AND the organize-imports assist the repo's
// `lint:fix` applies — over the generator's output for every shape that can
// outgrow a line or reorder an import, and asserts it would change nothing.
// The oracle is Biome itself, not a copy of its rules.
// =============================================================================

import { afterAll, describe, expect, test } from 'bun:test'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { generateBindingTypes } from '../../../../src/cli/commands/type-generation/generator'

const repositoryRoot = resolve(import.meta.dir, '../../../../../..')
const biomeBin = createRequire(join(repositoryRoot, 'package.json')).resolve(
	'@biomejs/biome/bin/biome'
)
const project = '/tmp/fake-project'

/** One generator call: a name for the failure message, and the file it produces. */
interface Fixture {
	/** What the fixture exercises. */
	name: string
	/** The generated env.d.ts source. */
	source: string
}

/** @description A config with one Durable Object binding whose class is discovered locally. */
function durableObjectFixture(name: string, binding: string, file: string, className: string) {
	return {
		name,
		source: generateBindingTypes(
			{ bindings: { durableObjects: { [binding]: { className } } } },
			[{ className, filePath: `${project}/${file}`, bindingName: binding }],
			[],
			[],
			project
		)
	}
}

/** @description A config with only discovered entrypoints, which fill the `Entrypoints` union. */
function entrypointsFixture(name: string, classNames: string[]): Fixture {
	return {
		name,
		source: generateBindingTypes(
			{},
			[],
			classNames.map((className) => ({ className, filePath: `${project}/src/ep.${className}.ts` })),
			[],
			project
		)
	}
}

const longDirectory = 'x/'.repeat(40)

const fixtures: Fixture[] = [
	{ name: 'an empty config', source: generateBindingTypes({}, [], [], [], project) },
	{
		name: 'vars only, so DevflareEnv has no members of its own',
		source: generateBindingTypes({ vars: { A: 'a' } }, [], [], [], project)
	},
	{
		name: 'many workers-types in one import',
		source: generateBindingTypes(
			{
				bindings: {
					kv: { KV: { id: 'kv' } },
					d1: { DB: { id: 'db' } },
					r2: { BUCKET: 'bucket' },
					hyperdrive: { PG: { id: 'pg' } },
					sendEmail: { EMAIL: {} },
					secretsStore: { TOKEN: { storeId: 's', secretName: 'n' } },
					images: { IMAGES: {} },
					media: { MEDIA: {} }
				},
				vars: { MY_VAR: 'hello' }
			},
			[],
			[],
			[],
			project
		)
	},
	{
		// Pipelines, workers-types with `Rpc` sorting between other names, the config
		// vars import and service interfaces from shared and differing modules: every
		// source the import block can hold, and the order organize-imports wants.
		name: 'every import source at once, Rpc sorting mid-list',
		source: generateBindingTypes(
			{
				bindings: {
					kv: { KV: { id: 'kv' } },
					durableObjects: { ROOM: { className: 'Room' } },
					sendEmail: { EMAIL: {} },
					workflows: { FLOW: { name: 'flow', className: 'Flow' } },
					pipelines: { EVENTS: { pipeline: 'events' } },
					services: { ZED: { service: 'z' }, ALPHA: { service: 'a' }, OTHER: { service: 'o' } }
				},
				vars: { MY_VAR: 'hello' }
			} as never,
			[{ className: 'Room', filePath: `${project}/src/do.room.ts`, bindingName: 'ROOM' }],
			[],
			[
				{
					varName: 'svc',
					importPath: '../svc/devflare.config',
					refDir: '/tmp/svc',
					entrypoints: [],
					durableObjects: [],
					serviceBindings: [
						{ bindingName: 'ZED', interfaceImport: '../svc/env', interfaceType: 'Zeta' },
						{ bindingName: 'ALPHA', interfaceImport: '../svc/env', interfaceType: 'Alpha' },
						{ bindingName: 'OTHER', interfaceImport: '../../a/env', interfaceType: 'Zeta' }
					]
				}
			],
			project
		)
	},
	{
		name: 'a config import path too long for one line',
		source: generateBindingTypes({ vars: { A: 'a' } }, [], [], [], project, {
			configImportPath: `../../${longDirectory}devflare.config`
		})
	},
	durableObjectFixture('a short Durable Object member', 'S', 'src/do.s.ts', 'S'),
	durableObjectFixture(
		'a Durable Object member that breaks once',
		'SESSION_STORE',
		'src/do.session.ts',
		'SessionStore'
	),
	durableObjectFixture(
		'a Durable Object member whose class type still does not fit',
		'SESSION_STORE',
		`${longDirectory}do.session.ts`,
		'SessionStore'
	),
	entrypointsFixture('two entrypoints', ['WorkerA', 'WorkerB']),
	entrypointsFixture(
		'enough entrypoints to break the union',
		Array.from({ length: 8 }, (_, index) => `EntrypointNumber${index}`)
	),
	entrypointsFixture('one entrypoint too long for the line', ['E'.repeat(110)])
]

// Every binding-name length across the 100-column edge, so the width a tab counts
// for and the inclusive limit are both graded, not only shapes far from the edge.
for (let length = 1; length <= 30; length++) {
	fixtures.push(
		durableObjectFixture(
			`a Durable Object member with a ${length}-character binding name`,
			'B'.repeat(length),
			'src/do.sess.ts',
			'SessionStoreX'
		)
	)
}

const workDirectory = mkdtempSync(join(tmpdir(), 'devflare-types-format-'))

afterAll(() => {
	rmSync(workDirectory, { recursive: true, force: true })
})

/**
 * @description Runs `biome check` with the linter off (formatter and assists; writes nothing) with the repository's
 * configuration over one file.
 * @returns Biome's exit code and output; a non-zero code means it would change the file
 */
function biomeCheck(path: string): { exitCode: number; output: string } {
	const result = Bun.spawnSync(
		[
			process.execPath,
			biomeBin,
			'check',
			'--linter-enabled=false',
			`--config-path=${join(repositoryRoot, 'biome.json')}`,
			'--vcs-enabled=false',
			path
		],
		{ stdout: 'pipe', stderr: 'pipe' }
	)
	return {
		exitCode: result.exitCode,
		output: `${result.stdout.toString()}${result.stderr.toString()}`
	}
}

describe('generateBindingTypes output is stable under the repository Biome config', () => {
	test.each(fixtures.map((fixture, index) => [fixture.name, index] as const))(
		'%s',
		(_name, index) => {
			const path = join(workDirectory, `env-${index}.d.ts`)
			writeFileSync(path, fixtures[index].source)

			const result = biomeCheck(path)

			expect(result.output).toContain('Checked 1 file')
			expect(result.exitCode).toBe(0)
		}
	)

	test('the edge sweep really crosses the line width', () => {
		const sweep = fixtures.filter((fixture) => fixture.name.includes('-character binding name'))
		const brokenCount = sweep.filter((fixture) =>
			fixture.source.includes('DurableObjectNamespace<\n')
		).length
		// Some fit on one line and some do not; otherwise the sweep grades only one side.
		expect(brokenCount).toBeGreaterThan(0)
		expect(brokenCount).toBeLessThan(sweep.length)
	})
})
