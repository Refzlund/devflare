// =============================================================================
// defineConfig / ref() factory typing — compiled, not executed
// =============================================================================
// `defineConfig(async () => …)` exports a Promise at runtime. These cases compile in-memory
// fixtures with the TypeScript compiler and read back the types and diagnostics, because a type
// that lies (a Promise typed as a config) is invisible to every runtime test: `config.bindings`
// type-checks and reads `undefined`.
//
// → the `// error:` lines must be the ONLY diagnostics in the probe. The `control` line proves the
//   probe was compiled at all; without it an empty diagnostic list cannot tell "every probe holds"
//   from "nothing was checked".
// =============================================================================

import { describe, expect, test } from 'bun:test'
import { resolve } from 'node:path'
import ts from 'typescript'

const devflareRoot = resolve(import.meta.dir, '../../..')
const fixtureDir = resolve(devflareRoot, 'tests/unit/config/__fixtures__/config-factory-types')
const probePath = resolve(fixtureDir, 'probe.ts')
const asyncWorkerPath = resolve(fixtureDir, 'async-worker.config.ts')

const asyncWorkerSource = `
import { defineConfig } from '../../../../../src/config/define'

export default defineConfig<'AdminEntrypoint'>(async () => ({
	name: 'async-worker',
	bindings: { durableObjects: { COUNTER: 'Counter' } }
}))
`

const probeSource = `
import { defineConfig } from '../../../../../src/config/define'
import { ref } from '../../../../../src/config/ref'

export const objectConfig = defineConfig({ name: 'object', vars: { MODE: 'a' } })
export const syncConfig = defineConfig(() => ({ name: 'sync', vars: { MODE: 'a' } }))
export const asyncConfig = defineConfig(async () => ({ name: 'async', vars: { MODE: 'a' } }))
export const explicitAsync = defineConfig<'AdminEntrypoint'>(async () => ({ name: 'explicit' }))
export const awaitedBindings = (await asyncConfig).bindings

export const asyncRef = ref(() => import('./async-worker.config'))
export const asyncRefConfig = asyncRef.config

asyncConfig.bindings // error: an async config is read without awaiting it
defineConfig(async () => ({ name: 'bad', bindings: { kv: 42 } })) // error: an async factory's body is checked
defineConfig(() => ({ name: 'bad', bindings: { kv: 42 } })) // error: a sync factory's body is checked
defineConfig<'X'>(async () => ({ name: 'bad', bindings: { kv: 42 } })) // error: explicit type arguments too
export const control: number = 'not a number' // error: control
`

/** What compiling the probe produced, read once and shared by every case. */
interface ProbeResult {
	/** The printed type of each `export const` in the probe, by name. */
	typesByName: Map<string, string>
	/** The text of each probe line that carries a diagnostic, by 1-based line number. */
	diagnosticsByLine: Map<number, string>
	/** The 1-based line numbers the probe marks `// error:`. */
	expectedErrorLines: number[]
}

let compiled: ProbeResult | undefined

/**
 * @description Compiles the probe against devflare's source with the in-memory fixtures layered
 *   over the real file system, once per test file.
 * @returns the probe's exported types, its diagnostics by line, and the lines it expects to fail.
 */
function compileProbe(): ProbeResult {
	if (compiled) return compiled

	const inMemory = new Map([
		[probePath, probeSource],
		[asyncWorkerPath, asyncWorkerSource]
	])
	const options: ts.CompilerOptions = {
		module: ts.ModuleKind.ESNext,
		moduleResolution: ts.ModuleResolutionKind.Bundler,
		noEmit: true,
		strict: true,
		target: ts.ScriptTarget.ES2022,
		types: []
	}

	// The fixture directory exists only in memory, so module resolution must be told it is there.
	const host = ts.createCompilerHost(options)
	const readDisk = host.readFile.bind(host)
	const existsOnDisk = host.fileExists.bind(host)
	const directoryOnDisk = host.directoryExists?.bind(host)
	const getDiskSourceFile = host.getSourceFile.bind(host)
	host.readFile = (fileName) => inMemory.get(resolve(fileName)) ?? readDisk(fileName)
	host.fileExists = (fileName) => inMemory.has(resolve(fileName)) || existsOnDisk(fileName)
	host.directoryExists = (dir) =>
		resolve(dir) === fixtureDir ||
		fixtureDir.startsWith(resolve(dir)) ||
		(directoryOnDisk?.(dir) ?? false)
	host.getSourceFile = (fileName, languageVersion, ...rest) => {
		const text = inMemory.get(resolve(fileName))
		return text === undefined
			? getDiskSourceFile(fileName, languageVersion, ...rest)
			: ts.createSourceFile(fileName, text, languageVersion, true)
	}

	const program = ts.createProgram([probePath], options, host)
	const checker = program.getTypeChecker()
	const probe = program.getSourceFile(probePath)
	if (!probe) throw new Error(`the probe was not compiled: ${probePath}`)

	const typesByName = new Map<string, string>()
	for (const statement of probe.statements) {
		if (!ts.isVariableStatement(statement)) continue
		for (const declaration of statement.declarationList.declarations) {
			const type = checker.getTypeAtLocation(declaration.name)
			typesByName.set(
				declaration.name.getText(probe),
				checker.typeToString(type, undefined, ts.TypeFormatFlags.NoTruncation)
			)
		}
	}

	const diagnosticsByLine = new Map<number, string>()
	for (const diagnostic of [
		...program.getSyntacticDiagnostics(probe),
		...program.getSemanticDiagnostics(probe)
	]) {
		const line = probe.getLineAndCharacterOfPosition(diagnostic.start ?? 0).line + 1
		diagnosticsByLine.set(line, ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'))
	}

	const expectedErrorLines = probeSource
		.split('\n')
		.flatMap((text, index) => (text.includes('// error:') ? [index + 1] : []))

	compiled = { typesByName, diagnosticsByLine, expectedErrorLines }
	return compiled
}

/** @description The probe's own text for a 1-based line, so a failure names the line it means. */
function probeLine(line: number): string {
	return probeSource.split('\n')[line - 1]?.trim() ?? ''
}

describe('defineConfig with a factory', () => {
	test('the probe fails on exactly its marked lines', () => {
		const { diagnosticsByLine, expectedErrorLines } = compileProbe()

		const failing = [...diagnosticsByLine.keys()].sort((a, b) => a - b).map(probeLine)
		expect(failing).toEqual(expectedErrorLines.map(probeLine))
	}, 30_000)

	test('an async factory types as a Promise of the config', () => {
		const { typesByName } = compileProbe()

		expect(typesByName.get('asyncConfig')).toBe(
			'Promise<TypedConfig<string, { MODE: string; } & {}>>'
		)
		expect(typesByName.get('explicitAsync')).toBe(
			'Promise<TypedConfig<"AdminEntrypoint", unknown>>'
		)
		expect(typesByName.get('awaitedBindings')).toBe('BindingsConfigInput | undefined')
	}, 30_000)

	test('a sync factory and a plain object type as the config itself, with their vars', () => {
		const { typesByName } = compileProbe()

		expect(typesByName.get('objectConfig')).toBe('TypedConfig<string, { MODE: string; } & {}>')
		// The sync factory used to be typed by the OBJECT overload (a function's own `name` satisfies
		// the config's), which dropped its vars to `unknown`. Same input, same type.
		expect(typesByName.get('syncConfig')).toBe(typesByName.get('objectConfig'))
	}, 30_000)
})

describe('ref() to a config with an async factory', () => {
	test('types the evaluated config', () => {
		const { typesByName } = compileProbe()

		expect(typesByName.get('asyncRefConfig')).toBe('TypedConfig<"AdminEntrypoint", unknown>')
	}, 30_000)
})
