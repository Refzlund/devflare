import { describe, expect, test } from 'bun:test'
import { existsSync, readdirSync, statSync } from 'node:fs'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import ts from 'typescript'
import { docs } from '../../../../../apps/documentation/src/lib/docs/content'
import { bindingDocCategories } from '../../../../../apps/documentation/src/lib/docs/content/bindings'
import { buildLLMDocument } from '../../../../../apps/documentation/src/lib/docs/llm'
import type { DocCodeSnippet } from '../../../../../apps/documentation/src/lib/docs/types'
import { COMMANDS } from '../../../src/cli/help'
import { rootConfigShape } from '../../../src/config/schema'
import { bindingsSchema } from '../../../src/config/schema-bindings'

interface CodeFence {
	index: number
	language: string
	code: string
	startLine: number
}

function workspacePath(...segments: string[]): string {
	return join(import.meta.dir, '..', '..', '..', '..', '..', ...segments)
}

async function readPackageReadme(): Promise<string> {
	const readme = await readFile(join(import.meta.dir, '..', '..', '..', 'README.md'), 'utf8')
	return readme.replace(/\r\n/g, '\n')
}

async function readCasesReadme(): Promise<string> {
	const readme = await readFile(workspacePath('cases', 'README.md'), 'utf8')
	return readme.replace(/\r\n/g, '\n')
}

async function readDocsAppReadme(): Promise<string> {
	const readme = await readFile(workspacePath('apps', 'documentation', 'README.md'), 'utf8')
	return readme.replace(/\r\n/g, '\n')
}

async function readPackageLlm(): Promise<string> {
	const readme = await readFile(workspacePath('packages', 'devflare', 'LLM.md'), 'utf8')
	return readme.replace(/\r\n/g, '\n')
}

function extractCodeFences(markdown: string): CodeFence[] {
	const fences: CodeFence[] = []
	const pattern = /```([a-zA-Z0-9_-]+)?\r?\n([\s\S]*?)```/g
	let match: RegExpExecArray | null
	let index = 0

	while (true) {
		match = pattern.exec(markdown)
		if (match === null) {
			break
		}

		fences.push({
			index,
			language: match[1] ?? '',
			code: match[2],
			startLine: markdown.slice(0, match.index).split(/\r?\n/).length
		})
		index++
	}

	return fences
}

function parseDiagnosticsFor(fence: CodeFence): string[] {
	if (!['ts', 'tsx', 'js'].includes(fence.language)) {
		return []
	}

	const sourceFile = ts.createSourceFile(
		`readme-${fence.index}.${fence.language}`,
		fence.code,
		ts.ScriptTarget.Latest,
		true,
		fence.language === 'tsx'
			? ts.ScriptKind.TSX
			: fence.language === 'js'
				? ts.ScriptKind.JS
				: ts.ScriptKind.TS
	)

	return sourceFile.parseDiagnostics.map((diagnostic) => {
		return `line ${fence.startLine}: ${ts.flattenDiagnosticMessageText(diagnostic.messageText, ' ')}`
	})
}

function parseSnippetDiagnostics(slug: string, snippet: DocCodeSnippet): string[] {
	const files =
		snippet.files ??
		(snippet.code
			? [
					{
						path: snippet.filename,
						language: snippet.language,
						code: snippet.code
					}
				]
			: [])

	return files.flatMap((file) => {
		const language = file.language ?? file.path?.split('.').at(-1) ?? ''
		if (!['ts', 'tsx', 'js', 'jsx'].includes(language)) {
			return []
		}

		return parseDiagnosticsFor({
			index: 0,
			language: language === 'jsx' ? 'tsx' : language,
			code: file.code,
			startLine: 1
		}).map((diagnostic) => `${slug}/${snippet.title}/${file.path ?? 'inline'}: ${diagnostic}`)
	})
}

function getFenceContaining(fences: CodeFence[], text: string): CodeFence {
	const fence = fences.find((candidate) => candidate.code.includes(text))
	expect(fence, `Expected README to include a code fence containing ${text}`).toBeDefined()
	return fence as CodeFence
}

async function runCommand(
	command: string[],
	cwd: string
): Promise<{
	exitCode: number
	output: string
}> {
	const process = Bun.spawn({
		cmd: command,
		cwd,
		env: {
			...Bun.env,
			NO_COLOR: '1'
		},
		stderr: 'pipe',
		stdout: 'pipe'
	})
	const [stdout, stderr, exitCode] = await Promise.all([
		new Response(process.stdout).text(),
		new Response(process.stderr).text(),
		process.exited
	])

	return {
		exitCode,
		output: `${stdout}${stderr}`
	}
}

function escapeRegExp(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

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

function localSourceExists(source: string): boolean {
	if (/^https?:\/\//.test(source)) {
		return true
	}

	if (source.includes('*')) {
		const prefix = source.slice(0, source.indexOf('*')).replace(/\/$/, '')
		return getWorkspaceFiles().some(
			(path) =>
				path.startsWith(prefix) || path.includes(`/${prefix}/`) || path.endsWith(`/${prefix}`)
		)
	}

	if (existsSync(workspacePath(source))) {
		return true
	}

	return getWorkspaceFiles().some((path) => path === source || path.endsWith(`/${source}`))
}

let workspaceFiles: string[] | undefined

function getWorkspaceFiles(): string[] {
	workspaceFiles ??= listFiles(workspacePath()).map((path) => path.replace(/\\/g, '/'))
	return workspaceFiles
}

function listFiles(root: string, relative = ''): string[] {
	const ignoredDirectories = new Set([
		'.git',
		'.svelte-kit',
		'.turbo',
		'.wrangler',
		'dist',
		'node_modules'
	])

	return readdirSync(join(root, relative)).flatMap((entry) => {
		if (ignoredDirectories.has(entry)) {
			return []
		}

		const entryRelativePath = relative ? join(relative, entry) : entry
		const entryAbsolutePath = join(root, entryRelativePath)
		const stats = statSync(entryAbsolutePath)

		if (stats.isDirectory()) {
			return listFiles(root, entryRelativePath)
		}

		return [entryRelativePath]
	})
}

function bindingSchemaKeys(): string[] {
	const schema = bindingsSchema as unknown as {
		_def?: { innerType?: { shape: Record<string, unknown> } }
		shape?: Record<string, unknown>
	}

	return Object.keys(schema._def?.innerType?.shape ?? schema.shape ?? {})
}

function documentedTopLevelConfigKeys(readme: string): string[] {
	const section = readme.match(
		/The most important top-level keys are:\n\n(?<list>(?:- `[^`]+`\n)+)/
	)
	expect(section?.groups?.list).toBeDefined()

	return [...(section?.groups?.list.matchAll(/- `([^`]+)`/g) ?? [])]
		.map((match) => (match[1] === 'wrangler.passthrough' ? 'wrangler' : match[1]))
		.sort()
}

function documentedCliCommands(readme: string): string[] {
	const commandRows = [...readme.matchAll(/^\| `devflare ([a-z-]+)` \| .+ \|$/gm)]
	return commandRows.map((match) => match[1]).sort()
}

function standaloneCaseDirectories(): string[] {
	return readdirSync(workspacePath('cases'), { withFileTypes: true })
		.filter((entry) => entry.isDirectory() && /^case\d+$/.test(entry.name))
		.map((entry) => entry.name)
		.sort()
}

function documentedCasesFromQuickReference(readme: string): string[] {
	return [...readme.matchAll(/^\| (?<number>\d+) \| /gm)]
		.map((match) => `case${match.groups?.number}`)
		.sort()
}

function documentedCasesFromDetailHeadings(readme: string): string[] {
	return [...readme.matchAll(/^### Case (?<number>\d+): /gm)]
		.map((match) => `case${match.groups?.number}`)
		.sort()
}

function docsText(): string {
	return JSON.stringify(docs)
}

function snippetsWithBareDevflareEnvImports(): string[] {
	return docs.flatMap((doc) => {
		return doc.sections.flatMap((section) => {
			return (section.snippets ?? []).flatMap((snippet) => {
				const files =
					snippet.files ??
					(snippet.code
						? [
								{
									path: snippet.filename,
									code: snippet.code
								}
							]
						: [])

				return files
					.filter((file) => file.code.includes("import { env } from 'devflare'"))
					.map((file) => `${doc.slug}/${section.id}/${snippet.title}/${file.path ?? 'inline'}`)
			})
		})
	})
}

function isCommandSnippet(snippet: DocCodeSnippet): boolean {
	return ['bash', 'console', 'powershell', 'ps1', 'shell', 'sh', 'zsh'].includes(
		(snippet.language ?? '').toLowerCase()
	)
}

function hasInferredSnippetPath(snippet: DocCodeSnippet): boolean {
	const code = snippet.code?.trim()
	if (!code || isCommandSnippet(snippet)) {
		return true
	}

	return [
		/\bdefineConfig\s*\(/,
		/from ['"]devflare\/config['"]/,
		/from ['"]bun:test['"]/,
		/\bexport\s+class\s+([A-Z][A-Za-z0-9_]*)\s+extends\s+DurableObject(?:<[^>]+>)?\b/,
		/\bextends\s+WorkerEntrypoint\b/,
		/\bexport\s+(?:async\s+)?function\s+fetch\b/,
		/\bexport\s+const\s+handle\b/,
		/\bexport\s+(?:async\s+)?function\s+queue\b/,
		/\bexport\s+(?:async\s+)?function\s+scheduled\b/,
		/\bexport\s+(?:async\s+)?function\s+email\b/,
		/\bForwardableEmailMessage\b/,
		/\bexport\s+(?:async\s+)?function\s+tail\b/,
		/\bexport\s+(?:async\s+)?function\s+(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\b/
	].some((pattern) => pattern.test(code))
}

function snippetsWithoutProvenance(): string[] {
	return docs.flatMap((doc) => {
		return doc.sections.flatMap((section) => {
			return (section.snippets ?? []).flatMap((snippet) => {
				if (snippet.files?.length || snippet.filename || !snippet.code) {
					return []
				}

				if (/inline|fragment/i.test(`${snippet.title} ${snippet.description ?? ''}`)) {
					return []
				}

				return hasInferredSnippetPath(snippet) ? [] : [`${doc.slug}/${section.id}/${snippet.title}`]
			})
		})
	})
}

describe('documentation integrity', () => {
	test('README TypeScript and JavaScript code fences parse cleanly', async () => {
		const readme = await readPackageReadme()
		const diagnostics = extractCodeFences(readme).flatMap((fence) => parseDiagnosticsFor(fence))

		expect(diagnostics).toEqual([])
	})

	test('docs app TypeScript and JavaScript snippets parse cleanly', () => {
		const diagnostics = docs.flatMap((doc) => {
			return doc.sections.flatMap((section) => {
				return (section.snippets ?? []).flatMap((snippet) =>
					parseSnippetDiagnostics(doc.slug, snippet)
				)
			})
		})

		expect(diagnostics).toEqual([])
	})

	test('docs app snippets use explicit env imports for worker and test code', () => {
		expect(snippetsWithBareDevflareEnvImports()).toEqual([])
	})

	test('docs app snippets have a file path, command language, inferred path, or inline-fragment label', () => {
		expect(snippetsWithoutProvenance()).toEqual([])
	})

	test('docs app multi-file snippets name every file', () => {
		const missingPaths = docs.flatMap((doc) => {
			return doc.sections.flatMap((section) => {
				return (section.snippets ?? []).flatMap((snippet) => {
					return (snippet.files ?? [])
						.filter((file) => !file.path)
						.map((file) => `${doc.slug}/${section.id}/${snippet.title}: ${file.code.slice(0, 40)}`)
				})
			})
		})

		expect(missingPaths).toEqual([])
	})

	test('README quickstart install and first test are internally consistent', async () => {
		const readme = await readPackageReadme()
		const fences = extractCodeFences(readme)
		const fetchSnippet = getFenceContaining(fences, '// src/fetch.ts')
		const testSnippet = getFenceContaining(fences, '// tests/worker.test.ts')

		expect(readme).toContain('bun add -d devflare\n')
		expect(readme).toContain('For a worker-only project, install only Devflare')
		expect(readme).toContain('For Vite-backed apps, add Vite and the Cloudflare Vite plugin')
		expect(fetchSnippet.code).toContain("return new Response('Hello from Devflare')")
		expect(testSnippet.code).toContain("expect(await response.text()).toBe('Hello from Devflare')")
	})

	test('README quickstart snippets run as a temporary worker project', async () => {
		const readme = await readPackageReadme()
		const fences = extractCodeFences(readme)
		const configSnippet = getFenceContaining(fences, '// devflare.config.ts')
		const fetchSnippet = getFenceContaining(fences, '// src/fetch.ts')
		const testSnippet = getFenceContaining(fences, '// tests/worker.test.ts')
		const projectDir = workspacePath('.local', 'tmp', `docs-quickstart-${Date.now()}`)

		await mkdir(join(projectDir, 'src'), { recursive: true })
		await mkdir(join(projectDir, 'tests'), { recursive: true })

		try {
			await writeFile(
				join(projectDir, 'package.json'),
				JSON.stringify({ type: 'module', devDependencies: { devflare: 'workspace:*' } }, null, 2)
			)
			await writeFile(join(projectDir, 'devflare.config.ts'), configSnippet.code)
			await writeFile(join(projectDir, 'src', 'fetch.ts'), fetchSnippet.code)
			await writeFile(join(projectDir, 'tests', 'worker.test.ts'), testSnippet.code)

			const result = await runCommand(['bun', 'test', 'tests/worker.test.ts'], projectDir)

			expect(result.output).toContain('1 pass')
			expect(result.exitCode).toBe(0)
		} finally {
			await rm(projectDir, { force: true, recursive: true })
		}
	})

	test('README package entrypoint rows only name actual exports', async () => {
		const readme = await readPackageReadme()
		const entrypoints = [
			{ importPath: 'devflare', mod: await import('../../../src/index') },
			{ importPath: 'devflare/config', mod: await import('../../../src/config') },
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

	test('docs app source metadata points at existing local files or external URLs', () => {
		const missingSources = docs.flatMap((doc) => {
			return doc.sourcePages
				.filter((source) => !localSourceExists(source))
				.map((source) => `${doc.slug}: ${source}`)
		})

		expect(missingSources).toEqual([])
	})

	test('docs app has binding categories for every native binding family', () => {
		const documentedSlugs = new Set(bindingDocCategories.map((category) => category.slugs[0]))
		const expectedSlugs = [
			'bindings/kv',
			'bindings/d1',
			'bindings/r2',
			'bindings/durable-objects',
			'bindings/queues',
			'bindings/services',
			'bindings/rate-limiting',
			'bindings/version-metadata',
			'bindings/worker-loaders',
			'bindings/secrets-store',
			'bindings/ai',
			'bindings/ai-search',
			'bindings/vectorize',
			'bindings/hyperdrive',
			'bindings/browser-rendering',
			'bindings/analytics-engine',
			'bindings/send-email',
			'bindings/mtls-certificates',
			'bindings/dispatch-namespaces',
			'bindings/workflows',
			'bindings/pipelines',
			'bindings/images',
			'bindings/media-transformations',
			'bindings/artifacts'
		]

		const schemaKeyToSlug: Record<string, string> = {
			kv: 'bindings/kv',
			d1: 'bindings/d1',
			r2: 'bindings/r2',
			durableObjects: 'bindings/durable-objects',
			queues: 'bindings/queues',
			rateLimits: 'bindings/rate-limiting',
			versionMetadata: 'bindings/version-metadata',
			workerLoaders: 'bindings/worker-loaders',
			secretsStore: 'bindings/secrets-store',
			services: 'bindings/services',
			ai: 'bindings/ai',
			aiSearchNamespaces: 'bindings/ai-search',
			aiSearch: 'bindings/ai-search',
			vectorize: 'bindings/vectorize',
			hyperdrive: 'bindings/hyperdrive',
			browser: 'bindings/browser-rendering',
			analyticsEngine: 'bindings/analytics-engine',
			sendEmail: 'bindings/send-email',
			mtlsCertificates: 'bindings/mtls-certificates',
			dispatchNamespaces: 'bindings/dispatch-namespaces',
			workflows: 'bindings/workflows',
			pipelines: 'bindings/pipelines',
			images: 'bindings/images',
			media: 'bindings/media-transformations',
			artifacts: 'bindings/artifacts'
		}

		expect(Object.keys(schemaKeyToSlug).sort()).toEqual(bindingSchemaKeys().sort())

		expect(expectedSlugs.filter((slug) => !documentedSlugs.has(slug))).toEqual([])
	})

	test('README top-level config key list matches the root schema', async () => {
		const readme = await readPackageReadme()
		const actualKeys = [...Object.keys(rootConfigShape), 'env'].sort()

		expect(documentedTopLevelConfigKeys(readme)).toEqual(actualKeys)
	})

	test('README CLI command table matches the CLI command registry', async () => {
		const readme = await readPackageReadme()

		expect(documentedCliCommands(readme)).toEqual([...COMMANDS].sort())
	})

	test('cases README lists every standalone case directory', async () => {
		const readme = await readCasesReadme()
		const caseDirectories = standaloneCaseDirectories()

		expect(documentedCasesFromQuickReference(readme)).toEqual(caseDirectories)
		expect(documentedCasesFromDetailHeadings(readme)).toEqual(caseDirectories)
	})

	test('documentation source-of-truth contract is explicit', async () => {
		const packageReadme = await readPackageReadme()
		const docsReadme = await readDocsAppReadme()
		const packageLlm = await readPackageLlm()

		expect(packageReadme).toContain('The docs app is the authored long-form source.')
		expect(docsReadme).toContain('## Documentation contribution contract')
		expect(docsReadme).toContain('run `bun run devflare:docs-integrity` from the repo root')
		expect(packageLlm).toContain('Do not edit this file by hand')
	})

	test('package LLM handbook matches the generated docs model', async () => {
		const packageLlm = await readPackageLlm()

		expect(packageLlm).toBe(`${buildLLMDocument().trimEnd()}\n`)
	})

	test('recipe-first docs architecture pages exist', () => {
		const requiredSlugs = [
			'docs-landing-paths',
			'first-route-tree',
			'first-unit-test',
			'first-bindings',
			'deploy-and-preview',
			'binding-chooser',
			'feature-index',
			'recipe-packs',
			'case-catalog',
			'learn-from-real-tests',
			'runtime-handler-styles',
			'test-helper-reference',
			'deploy-command-recipes',
			'docs-release-gates',
			'bridge-architecture-internals'
		]

		expect(requiredSlugs.filter((slug) => !docs.some((doc) => doc.slug === slug))).toEqual([])
	})

	test('feature support matrix snapshot covers the main local and remote support lanes', () => {
		const featureIndex = docs.find((doc) => doc.slug === 'feature-index')
		const matrixRows =
			featureIndex?.sections.find((section) => section.id === 'matrix')?.table?.rows ?? []
		const rowLabels = matrixRows.map((row) => row[0]).sort()

		expect(rowLabels).toEqual(
			[
				'Browser Rendering',
				'Containers',
				'D1',
				'Durable Objects',
				'Email',
				'KV',
				'Queues',
				'R2',
				'Route tree',
				'Scheduled',
				'Tail Workers',
				'Vectorize',
				'Workers AI'
			].sort()
		)
		expect(matrixRows.every((row) => row.length === 6)).toBe(true)
	})

	test('devflare/test value exports are documented by exact name', async () => {
		const testModule = await import('../../../src/test')
		const text = docsText()
		const missingNames = Object.keys(testModule)
			.filter((name) => name !== 'default')
			.filter((name) => !text.includes(`\`${name}\``))

		expect(missingNames).toEqual([])
	})
})
