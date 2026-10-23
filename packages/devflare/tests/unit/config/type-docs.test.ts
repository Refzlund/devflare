import { describe, expect, test } from 'bun:test'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'

const devflareRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')
const fixturePath = resolve(devflareRoot, 'tests/unit/config/__fixtures__/define-config-docs.ts')
const schemaTypesPaths = [
	'src/config/schema-types.ts',
	'src/config/schema-types-bindings.ts',
	'src/config/schema-types-bindings-platform.ts',
	'src/config/schema-types-bindings-resources.ts',
	'src/config/schema-types-build.ts',
	'src/config/schema-types-runtime.ts',
	'src/config/schema-types-runtime-server.ts',
	// → GOTCHA: this list is hand-maintained, so a new mirror file is UNENFORCED until it is added
	//   here — and `schema-types-email.ts` shipped that way, undocumented members and all. A mirror
	//   exists to give an author hover documentation; one nothing checks is the case where they get
	//   none and nobody notices. Add every new `schema-types-*.ts` to this list in the same change.
	'src/config/schema-types-email.ts',
	'src/config/schema-types-zones.ts',
	'src/config/schema-types-subscriptions.ts'
].map((path) => resolve(devflareRoot, path))

const fixtureSource = `
import { defineConfig } from '../../../../src/config/define'

export default defineConfig({
	name: 'docs-worker',
	compatibilityDate: '2026-05-01',
	files: {
		fetch: 'src/fetch.ts'
	},
	vars: {
		APP_ENV: 'development'
	},
	secrets: {
		API_TOKEN: { required: true }
	},
	routes: [
		{ pattern: 'docs.example.com', custom_domain: true }
	]
})
`

function createLanguageService() {
	const files = new Map<string, string>([[fixturePath, fixtureSource]])

	const compilerOptions: ts.CompilerOptions = {
		allowJs: false,
		module: ts.ModuleKind.ESNext,
		moduleResolution: ts.ModuleResolutionKind.Bundler,
		noEmit: true,
		strict: true,
		target: ts.ScriptTarget.ES2022,
		types: []
	}

	const host: ts.LanguageServiceHost = {
		getCompilationSettings: () => compilerOptions,
		getCurrentDirectory: () => devflareRoot,
		getDefaultLibFileName: (options) => ts.getDefaultLibFilePath(options),
		getScriptFileNames: () => [fixturePath],
		getScriptSnapshot(fileName) {
			const normalized = resolve(fileName)
			const text =
				files.get(normalized) ??
				(existsSync(normalized) ? readFileSync(normalized, 'utf8') : undefined)
			return text === undefined ? undefined : ts.ScriptSnapshot.fromString(text)
		},
		getScriptVersion: () => '1',
		readFile: (fileName) => {
			const normalized = resolve(fileName)
			return (
				files.get(normalized) ??
				(existsSync(normalized) ? readFileSync(normalized, 'utf8') : undefined)
			)
		},
		fileExists: (fileName) => {
			const normalized = resolve(fileName)
			return files.has(normalized) || existsSync(normalized)
		}
	}

	return ts.createLanguageService(host)
}

function quickInfoDocs(identifier: string): string {
	const service = createLanguageService()
	const position = fixtureSource.indexOf(identifier)
	expect(position).toBeGreaterThanOrEqual(0)

	const quickInfo = service.getQuickInfoAtPosition(fixturePath, position + 1)
	return ts.displayPartsToString(quickInfo?.documentation ?? [])
}

function getLeadingDocText(node: ts.Node, sourceFile: ts.SourceFile): string {
	const match = node.getFullText(sourceFile).match(/\/\*\*[\s\S]*?\*\//)
	return match?.[0] ?? ''
}

function isExported(node: ts.Node): boolean {
	return (ts.getCombinedModifierFlags(node as ts.Declaration) & ts.ModifierFlags.Export) !== 0
}

function getSchemaTypesSourceFiles(): ts.SourceFile[] {
	return schemaTypesPaths.map((schemaTypesPath) =>
		ts.createSourceFile(
			schemaTypesPath,
			readFileSync(schemaTypesPath, 'utf8'),
			ts.ScriptTarget.Latest,
			true,
			ts.ScriptKind.TS
		)
	)
}

function findInterfaceMemberDoc(interfaceName: string, memberName: string): string {
	for (const sourceFile of getSchemaTypesSourceFiles()) {
		for (const statement of sourceFile.statements) {
			if (!ts.isInterfaceDeclaration(statement) || statement.name.text !== interfaceName) {
				continue
			}

			for (const member of statement.members) {
				const name = member.name && ts.isIdentifier(member.name) ? member.name.text : undefined
				if (name === memberName) {
					return getLeadingDocText(member, sourceFile)
				}
			}
		}
	}

	throw new Error(`Could not find ${interfaceName}.${memberName}`)
}

describe('defineConfig IntelliSense documentation', () => {
	test.each([
		['routes', 'Cloudflare deployment routes'],
		['custom_domain', 'custom domain'],
		['fetch', 'HTTP fetch entrypoint'],
		['vars', 'Runtime variables exposed on `env` and on the typed `vars` helper'],
		['secrets', 'secret bindings']
	])('%s exposes useful hover documentation', (identifier, expected) => {
		expect(quickInfoDocs(identifier).toLowerCase()).toContain(expected.toLowerCase())
	})

	test('public config input types and members are documented', () => {
		const missingDocs: string[] = []

		for (const sourceFile of getSchemaTypesSourceFiles()) {
			for (const statement of sourceFile.statements) {
				if (!isExported(statement)) {
					continue
				}

				if (ts.isInterfaceDeclaration(statement) || ts.isTypeAliasDeclaration(statement)) {
					if (!getLeadingDocText(statement, sourceFile)) {
						missingDocs.push(statement.name.text)
					}
				}

				if (!ts.isInterfaceDeclaration(statement)) {
					continue
				}

				for (const member of statement.members) {
					if (!ts.isPropertySignature(member) && !ts.isIndexSignatureDeclaration(member)) {
						continue
					}

					if (ts.isPropertySignature(member) && member.name && ts.isIdentifier(member.name)) {
						if (!getLeadingDocText(member, sourceFile)) {
							missingDocs.push(`${statement.name.text}.${member.name.text}`)
						}
						continue
					}

					if (ts.isIndexSignatureDeclaration(member) && !getLeadingDocText(member, sourceFile)) {
						missingDocs.push(`${statement.name.text}.[index]`)
					}
				}
			}
		}

		expect(missingDocs).toEqual([])
	})

	test.each([
		['DevflareConfigInput', 'compatibilityDate'],
		['PreviewConfigInput', 'includeCrons'],
		['FilesConfigInput', 'fetch'],
		['QueueConsumerInput', 'maxBatchSize'],
		['SecretConfigInput', 'required'],
		['RouteConfigInput', 'custom_domain'],
		['ServiceBindingInput', 'entrypoint']
	])('%s.%s documents defaults and examples', (interfaceName, memberName) => {
		const docs = findInterfaceMemberDoc(interfaceName, memberName)
		expect(docs).toContain('@default')
		expect(docs).toContain('@example')
	})
})
