// =============================================================================
// defineConfig / ref() factory typing — compiled, not executed
// =============================================================================
// `defineConfig(async () => …)` exports a Promise at runtime. These cases compile in-memory
// fixtures with the TypeScript compiler and read back the types and diagnostics, because a type
// that lies (a Promise typed as a config) is invisible to every runtime test: `config.bindings`
// type-checks and reads `undefined`.
//
// → the `// error:` lines must be the ONLY diagnostics in the probe, and each must fail for the
//   reason after its `->`. The `control` line proves the probe was compiled at all; without it an
//   empty diagnostic list cannot tell "every probe holds" from "nothing was checked".
// =============================================================================

import { describe, expect, test } from 'bun:test'
import { resolve } from 'node:path'
import ts from 'typescript'

const devflareRoot = resolve(import.meta.dir, '../../..')
const fixtureDir = resolve(devflareRoot, 'tests/unit/config/__fixtures__/config-factory-types')
const probePath = resolve(fixtureDir, 'probe.ts')

/** The config modules the probe imports through `ref()`, by file name. */
const workerConfigSources = {
	'async-worker.config.ts': `
import { defineConfig } from '../../../../../src/config/define'

export default defineConfig<'AdminEntrypoint'>(async () => ({
	name: 'async-worker',
	bindings: { durableObjects: { COUNTER: 'Counter' } }
}))
`,
	'object-worker.config.ts': `
import { defineConfig } from '../../../../../src/config/define'

export default defineConfig<'ObjectEntrypoint'>({ name: 'object-worker' })
`,
	'plain-worker.config.ts': `
import { defineConfig } from '../../../../../src/config/define'

export default defineConfig({ name: 'plain-worker' })
`,
	// A factory exported without `defineConfig`, which `ref()` calls the way c12 does.
	'factory-worker.config.ts': `
export default function makeConfig() {
	return { name: 'factory-worker', compatibilityDate: '2025-01-07' }
}
`
}

const BAD_KV = "Type 'number' is not assignable to type 'Record<string, KVBindingInput>'"

const probeSource = `
import { defineConfig, type DefineConfigInput } from '../../../../../src/config/define'
import { ref } from '../../../../../src/config/ref'

export const objectConfig = defineConfig({ name: 'object', vars: { MODE: 'a' } })
export const syncConfig = defineConfig(() => ({ name: 'sync', vars: { MODE: 'a' } }))
export const asyncConfig = defineConfig(async () => ({ name: 'async', vars: { MODE: 'a' } }))
export const explicitAsync = defineConfig<'AdminEntrypoint'>(async () => ({ name: 'explicit' }))
export const awaitedBindings = (await asyncConfig).bindings
declare const eitherForm: DefineConfigInput
export const fromDefineConfigInput = defineConfig(eitherForm)

export const asyncRef = ref(() => import('./async-worker.config'))
export const asyncRefConfig = asyncRef.config
export const factoryRefConfig = ref(() => import('./factory-worker.config')).config
export const asyncRefWorker = asyncRef.worker
export const objectRefWorker = ref(() => import('./object-worker.config')).worker
export const plainRefWorker = ref(() => import('./plain-worker.config')).worker

asyncRefWorker('AdminEntrypoint')
objectRefWorker('ObjectEntrypoint')
plainRefWorker('AnyEntrypoint')

asyncConfig.bindings // error: an async config is read without awaiting it -> Property 'bindings' does not exist on type 'Promise<
defineConfig(async () => ({ name: 'bad', bindings: { kv: 42 } })) // error: an async factory's body is checked -> ${BAD_KV}
defineConfig(() => ({ name: 'bad', bindings: { kv: 42 } })) // error: a sync factory's body is checked -> ${BAD_KV}
defineConfig<'X'>(async () => ({ name: 'bad', bindings: { kv: 42 } })) // error: explicit type arguments too -> ${BAD_KV}
defineConfig({ name: 'bad', bindings: { kv: 42 } }) // error: an object config is checked as before -> ${BAD_KV}
asyncRefWorker('NotAnEntrypoint') // error: a ref keeps an async config's entrypoints -> parameter of type '"AdminEntrypoint"'
objectRefWorker('NotAnEntrypoint') // error: a ref keeps an object config's entrypoints -> parameter of type '"ObjectEntrypoint"'
export const control: number = 'not a number' // error: control -> Type 'string' is not assignable to type 'number'
`

/** A probe line marked `// error:`, and the text its diagnostic must contain. */
interface ExpectedError {
	/** 1-based line number in the probe. */
	line: number
	/** What follows the marker's `->`: the reason the line must fail for. */
	reason: string
}

/** What compiling the probe produced, read once and shared by every case. */
interface ProbeResult {
	/** The printed type of each `export const` in the probe, by name. */
	typesByName: Map<string, string>
	/** The text of each probe line that carries a diagnostic, by 1-based line number. */
	diagnosticsByLine: Map<number, string>
	/** The lines the probe marks `// error:`, in order. */
	expectedErrors: ExpectedError[]
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
		...Object.entries(workerConfigSources).map(
			([fileName, source]) => [resolve(fixtureDir, fileName), source] as const
		)
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
		const message = ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n')
		diagnosticsByLine.set(line, [diagnosticsByLine.get(line), message].filter(Boolean).join('\n'))
	}

	const expectedErrors = probeSource.split('\n').flatMap((text, index) => {
		const marker = /\/\/ error: .+ -> (.+)$/.exec(text)
		return marker ? [{ line: index + 1, reason: marker[1] as string }] : []
	})

	compiled = { typesByName, diagnosticsByLine, expectedErrors }
	return compiled
}

/** @description The probe's own text for a 1-based line, so a failure names the line it means. */
function probeLine(line: number): string {
	return probeSource.split('\n')[line - 1]?.trim() ?? ''
}

describe('defineConfig with a factory', () => {
	test('the probe fails on exactly its marked lines', () => {
		const { diagnosticsByLine, expectedErrors } = compileProbe()

		const failing = [...diagnosticsByLine.keys()].sort((a, b) => a - b).map(probeLine)
		expect(failing).toEqual(expectedErrors.map(({ line }) => probeLine(line)))
	}, 30_000)

	// A line can fail for the wrong reason (a missing fixture, a broken import) and still be
	// "marked". With four overloads TypeScript reports only the last, so a factory's error naming
	// the field that is wrong is a property of the overloads, not of the compiler.
	test('each marked line fails for the reason it names', () => {
		const { diagnosticsByLine, expectedErrors } = compileProbe()

		// Search the diagnostic alone: the probe line carries its own reason after `->`.
		const failingForAnotherReason = expectedErrors
			.filter(({ line, reason }) => !(diagnosticsByLine.get(line) ?? '').includes(reason))
			.map(({ line, reason }) => ({
				line: probeLine(line),
				reason,
				diagnostic: diagnosticsByLine.get(line) ?? '(none)'
			}))
		expect(failingForAnotherReason).toEqual([])
	}, 30_000)

	test('a value typed as either form compiles, and may be a Promise', () => {
		const { typesByName } = compileProbe()

		expect(typesByName.get('fromDefineConfigInput')).toBe(
			'TypedConfig<string, unknown> | Promise<TypedConfig<string, unknown>>'
		)
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

describe('ref() to a config module that is not a plain object', () => {
	test('types the config an async factory resolves to', () => {
		const { typesByName } = compileProbe()

		expect(typesByName.get('asyncRefConfig')).toBe('TypedConfig<"AdminEntrypoint", unknown>')
	}, 30_000)

	test('types the config a raw factory returns, not the factory', () => {
		const { typesByName } = compileProbe()

		expect(typesByName.get('factoryRefConfig')).toBe('{ name: string; compatibilityDate: string; }')
	}, 30_000)
})

describe('ref().worker', () => {
	// Explicit entrypoints leave the config's vars `unknown`, and matching the config against
	// `TypedConfig<infer E>` (default vars `Record<string, unknown>`) failed on exactly those, so
	// the entrypoints `defineConfig<Entrypoints>` declares widened to `string`.
	test('accepts only the entrypoints the referenced config declares', () => {
		const { typesByName } = compileProbe()

		expect(typesByName.get('asyncRefWorker')).toBe('WorkerBindingAccessor<"AdminEntrypoint">')
		expect(typesByName.get('objectRefWorker')).toBe('WorkerBindingAccessor<"ObjectEntrypoint">')
		expect(typesByName.get('plainRefWorker')).toBe('WorkerBindingAccessor<string>')
	}, 30_000)
})
