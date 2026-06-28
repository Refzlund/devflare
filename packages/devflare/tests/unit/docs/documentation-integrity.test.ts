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
import { snippetsWithInvalidCustomDomainRoutes } from './custom-domain-route-snippets'

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

function docText(slug: string): string {
	const doc = docs.find((candidate) => candidate.slug === slug)
	expect(doc, `Expected docs to include ${slug}`).toBeDefined()
	return JSON.stringify(doc)
}

function bindingSlugsAt(index: number): string[] {
	return bindingDocCategories.map((category) => category.slugs[index])
}

function bindingOverviewLinks(): string[] {
	return bindingSlugsAt(0).map((slug) => `/docs/${slug}`)
}

const bindingSupportLevels = new Set(['Full', 'Remote', 'Limited'])

function isInlineCodeFactValue(value: string): boolean {
	return /^`[^`]+`$/.test(value)
}

function bindingOverviewSupportFailures(slug: string): string[] {
	const doc = docs.find((candidate) => candidate.slug === slug)
	const supportSection = doc?.sections.find((section) => section.id === 'local-and-remote-support')
	const configKey = doc?.facts.find((fact) => fact.label === 'Config key')?.value ?? ''
	const authoringShape = doc?.facts.find((fact) => fact.label === 'Authoring shape')?.value ?? ''
	const failures: string[] = []

	if (!supportSection) {
		failures.push(`${slug}: missing Local and Remote Support section`)
	}

	if (supportSection?.title !== 'Local and Remote Support') {
		failures.push(`${slug}: support section title is not stable`)
	}

	const supportLabel = supportSection?.label
	if (!supportLabel || !bindingSupportLevels.has(supportLabel)) {
		failures.push(`${slug}: missing supported Full/Remote/Limited section label`)
	}

	if (!supportSection?.labelTooltip) {
		failures.push(`${slug}: support section label lacks hover explanation`)
	}
	if (supportSection?.paragraphs?.some((paragraph) => paragraph.includes('Support level:'))) {
		failures.push(`${slug}: support section still writes the support level as body text`)
	}

	const redundantTitles = [
		`${supportLabel} support`,
		'What works without Cloudflare',
		'When to connect to Cloudflare'
	]
	const redundantCardTitle = supportSection?.cards
		?.map((card) => card.title)
		.find((title) => redundantTitles.includes(title))
	if (redundantCardTitle) {
		failures.push(`${slug}: support section still includes redundant "${redundantCardTitle}" card`)
	}

	if (JSON.stringify(supportSection ?? {}).includes('Partial')) {
		failures.push(`${slug}: support section still says Partial`)
	}

	if (!isInlineCodeFactValue(configKey)) {
		failures.push(`${slug}: Config key is not inline code`)
	}

	if (!isInlineCodeFactValue(authoringShape)) {
		failures.push(`${slug}: Authoring shape is not inline code`)
	}

	return failures
}

function bindingDocsMissingSection(index: number, sectionId: string): string[] {
	return bindingSlugsAt(index).filter((slug) => {
		const doc = docs.find((candidate) => candidate.slug === slug)
		return !doc?.sections.some((section) => section.id === sectionId)
	})
}

function bindingDocsMatching(index: number, pattern: RegExp): string[] {
	return bindingSlugsAt(index).filter((slug) => pattern.test(docText(slug)))
}

function bindingSectionTexts(
	index: number,
	sectionId: string
): Array<{ slug: string; text: string }> {
	return bindingSlugsAt(index).map((slug) => {
		const doc = docs.find((candidate) => candidate.slug === slug)
		const section = doc?.sections.find((candidate) => candidate.id === sectionId)
		return { slug, text: JSON.stringify(section) }
	})
}

function bindingReaderText(index: number): Array<{ slug: string; text: string }> {
	return bindingSlugsAt(index).map((slug) => {
		const doc = docs.find((candidate) => candidate.slug === slug)
		expect(doc, `Expected docs to include ${slug}`).toBeDefined()

		return {
			slug,
			text: JSON.stringify({
				title: doc?.title,
				summary: doc?.summary,
				description: doc?.description,
				highlights: doc?.highlights,
				facts: doc?.facts,
				sections: doc?.sections.map((section) => ({
					id: section.id,
					title: section.title,
					description: section.description,
					paragraphs: section.paragraphs,
					bullets: section.bullets,
					steps: section.steps,
					cards: section.cards?.map((card) => ({
						label: card.label,
						meta: card.meta,
						title: card.title,
						body: card.body
					})),
					callouts: section.callouts?.map((callout) => ({
						title: callout.title,
						body: callout.body
					}))
				}))
			})
		}
	})
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

function isCommandLanguage(language: string | undefined): boolean {
	return ['bash', 'console', 'powershell', 'ps1', 'shell', 'sh', 'zsh'].includes(
		(language ?? '').toLowerCase()
	)
}

function isCommandSnippet(snippet: DocCodeSnippet): boolean {
	const files = snippetFiles(snippet)

	if (files.length > 0) {
		return files.every((file) => isCommandLanguage(file.language ?? snippet.language))
	}

	return isCommandLanguage(snippet.language)
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

function snippetFiles(snippet: DocCodeSnippet): Array<{
	path?: string
	language?: string
	code: string
}> {
	return (
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
	)
}

function isCopyPastableExample(snippet: DocCodeSnippet): boolean {
	const files = snippetFiles(snippet)
	if (files.length === 0 || files.some((file) => file.code.trim().length === 0)) {
		return false
	}

	if (isCommandSnippet(snippet)) {
		return files.some((file) =>
			/\b(?:bun|npm|pnpm|devflare|wrangler|curl|docker|podman)\b/.test(file.code)
		)
	}

	const hasConcreteLocation =
		Boolean(snippet.filename) ||
		files.some((file) => Boolean(file.path)) ||
		hasInferredSnippetPath(snippet)
	const exampleCode = files.map((file) => file.code).join('\n')

	return (
		hasConcreteLocation &&
		/(?:\bdefineConfig\b|from ['"]devflare\/|import\s+.+\s+from\s+['"]|export\s+(?:async\s+)?function|export\s+class|const\s+\w+\s*=|async\s*\(|await\s+|fetch\s*\(|env\.|uses:|run:|steps:|jobs:)/.test(
			exampleCode
		)
	)
}

function nonEmptyLineCount(files: Array<{ code: string }>): number {
	return files.reduce((sum, file) => {
		return sum + file.code.trim().split(/\r?\n/).filter(Boolean).length
	}, 0)
}

function isProjectShapedExample(snippet: DocCodeSnippet): boolean {
	const files = snippetFiles(snippet)

	if (
		files.length === 0 ||
		isCommandSnippet(snippet) ||
		nonEmptyLineCount(files) < 6 ||
		!(
			Boolean(snippet.filename) ||
			Boolean(snippet.activeFile) ||
			files.some((file) => Boolean(file.path)) ||
			hasInferredSnippetPath(snippet)
		)
	) {
		return false
	}

	const exampleCode = files.map((file) => file.code).join('\n')

	return /(?:\bdefineConfig\b|from ['"]devflare\/|import\s+.+\s+from\s+['"]|export\s+(?:async\s+)?function|export\s+class|env\.|uses:|run:|jobs:|on:|scripts)/.test(
		exampleCode
	)
}

function pagesWithoutCopyPastableExamples(): string[] {
	return docs
		.filter((doc) => {
			return !doc.sections.some((section) => {
				return (section.snippets ?? []).some((snippet) => isCopyPastableExample(snippet))
			})
		})
		.map((doc) => doc.slug)
}

function pagesWithoutProjectShapedExamples(): string[] {
	return docs
		.filter((doc) => {
			return !doc.sections.some((section) => {
				return (section.snippets ?? []).some((snippet) => isProjectShapedExample(snippet))
			})
		})
		.map((doc) => doc.slug)
}

function docsWithDuplicateSourcePages(): string[] {
	return docs.flatMap((doc) => {
		const seen = new Set<string>()

		return doc.sourcePages.flatMap((source) => {
			if (seen.has(source)) {
				return [`${doc.slug}: ${source}`]
			}

			seen.add(source)
			return []
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

	test('docs app snippets do not show wildcard or path patterns for custom domains', () => {
		expect(snippetsWithInvalidCustomDomainRoutes()).toEqual([])
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

	test('docs app pages include copy-pastable real-world examples', () => {
		expect(pagesWithoutCopyPastableExamples()).toEqual([])
	})

	test('docs app pages include at least one project-shaped non-command example', () => {
		expect(pagesWithoutProjectShapedExamples()).toEqual([])
	})

	test('README quickstart install and first test are internally consistent', async () => {
		const readme = await readPackageReadme()
		const fences = extractCodeFences(readme)
		const fetchSnippet = getFenceContaining(fences, '// src/fetch.ts')
		const testSnippet = getFenceContaining(fences, '// tests/worker.test.ts')

		expect(readme).toContain('bun add -d devflare\n')
		expect(readme).toContain('For a worker-only project, install only Devflare')
		expect(readme).toContain('For Vite-backed apps, add Vite')
		expect(readme).toContain('Add the Cloudflare Vite plugin only when')
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

	test('docs app source metadata points at existing local files or external URLs', () => {
		const missingSources = docs.flatMap((doc) => {
			return doc.sourcePages
				.filter((source) => !localSourceExists(source))
				.map((source) => `${doc.slug}: ${source}`)
		})

		expect(missingSources).toEqual([])
	})

	test('docs app source metadata does not list duplicate sources per page', () => {
		expect(docsWithDuplicateSourcePages()).toEqual([])
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

	test('what-devflare-is links every binding page with a support level', () => {
		const expectedSupportByLink: Record<string, string> = {
			'/docs/bindings/kv': 'Full',
			'/docs/bindings/d1': 'Full',
			'/docs/bindings/r2': 'Full',
			'/docs/bindings/durable-objects': 'Full',
			'/docs/bindings/queues': 'Full',
			'/docs/bindings/services': 'Full',
			'/docs/bindings/ai': 'Remote',
			'/docs/bindings/vectorize': 'Remote',
			'/docs/bindings/hyperdrive': 'Full',
			'/docs/bindings/browser-rendering': 'Full',
			'/docs/bindings/analytics-engine': 'Remote',
			'/docs/bindings/send-email': 'Full',
			'/docs/bindings/rate-limiting': 'Full',
			'/docs/bindings/version-metadata': 'Full',
			'/docs/bindings/worker-loaders': 'Full',
			'/docs/bindings/secrets-store': 'Full',
			'/docs/bindings/ai-search': 'Remote',
			'/docs/bindings/mtls-certificates': 'Remote',
			'/docs/bindings/dispatch-namespaces': 'Remote',
			'/docs/bindings/workflows': 'Full',
			'/docs/bindings/pipelines': 'Remote',
			'/docs/bindings/images': 'Full',
			'/docs/bindings/media-transformations': 'Full',
			'/docs/bindings/artifacts': 'Remote',
			'/docs/bindings/containers': 'Full'
		}
		const page = docs.find((doc) => doc.slug === 'what-devflare-is')
		const cards = page?.sections.find((section) => section.id === 'support-coverage')?.cards ?? []
		const cardsByHref = new Map(cards.map((card) => [card.href, card]))

		expect(Object.keys(expectedSupportByLink).sort()).toEqual(bindingOverviewLinks().sort())
		expect(
			bindingOverviewLinks().filter((href) => {
				const card = cardsByHref.get(href)
				return (
					!card ||
					!card.labelTooltip ||
					card.label !== expectedSupportByLink[href] ||
					card.body.trim().length === 0
				)
			})
		).toEqual([])
	})

	test('binding overview pages spell out support levels and code-formatted config facts', () => {
		expect(bindingSlugsAt(0).flatMap(bindingOverviewSupportFailures)).toEqual([])
	})

	test('containers overview documents full local image workflow', () => {
		const page = docs.find((doc) => doc.slug === 'bindings/containers')
		const supportSection = page?.sections.find(
			(section) => section.id === 'local-and-remote-support'
		)
		const imageSection = page?.sections.find((section) => section.id === 'container-image-workflow')
		const overviewText = docText('bindings/containers')

		expect(supportSection?.label).toBe('Full')
		expect(supportSection?.labelTooltip).toContain('Full')
		expect(
			imageSection,
			'Expected Containers overview to include image workflow guidance'
		).toBeDefined()
		expect(overviewText).toContain('Dockerfile')
		expect(overviewText).toContain('docker build')
		expect(overviewText).toContain('podman build')
		expect(overviewText).toContain('localhost/devflare-api:latest')
		expect(overviewText).toContain('imageBuildContext')
		expect(overviewText).toContain('registry.cloudflare.com')
		expect(overviewText).toContain('Docker Hub')
		expect(overviewText).toContain('Amazon ECR')
		expect(overviewText).toContain('wrangler containers push')
		expect(overviewText).toContain('@cloudflare/containers')
		expect(overviewText).toContain('getContainer')
		expect(overviewText).toContain('DEVFLARE_CONTAINER_TESTS=1')
		expect(overviewText).toContain('shouldSkip.containers')
		expect(overviewText).toContain('offline: true')
	})

	test('container docs use current offline-first helper options', async () => {
		const text = `${docsText()}\n${await readPackageReadme()}`

		expect(text).toContain('shouldSkip.containers')
		expect(text).toContain('offline: true')
		expect(text).not.toContain('shouldSkip.containers()')
		expect(text).not.toContain('pull: false')
	})

	test('binding overview pages include application runtime usage', () => {
		expect(bindingDocsMissingSection(0, 'runtime-usage')).toEqual([])
		const runtimeSections = bindingSectionTexts(0, 'runtime-usage')
		expect(
			runtimeSections
				.filter(({ text }) =>
					/\b(?:bun:test|devflare\/test|createTestContext|createOfflineEnv|createMock[A-Z]|cf\.worker|env\.dispose|expect\s*\(|describe\s*\(|test\s*\()\b/.test(
						text
					)
				)
				.map(({ slug }) => slug)
		).toEqual([])
		expect(
			runtimeSections
				.filter(({ text }) => /devflare\/runtime/.test(text))
				.map(({ slug }) => slug)
				.sort()
		).toEqual(bindingSlugsAt(0).sort())
	})

	test('binding overview pages stay usage-first instead of internals-first', () => {
		const forbiddenOverviewPhrases = [
			/translation layer/i,
			/normaliz/i,
			/Wrangler-facing/i,
			/generated output/i,
			/stops pretending/i,
			/under the hood/i,
			/quick contract/i,
			/does anything louder/i
		]
		const failures = bindingReaderText(0).flatMap(({ slug, text }) => {
			return forbiddenOverviewPhrases
				.filter((pattern) => pattern.test(text))
				.map((pattern) => `${slug}: ${pattern}`)
		})

		expect(failures).toEqual([])
	})

	test('binding Cloudflare reference comparison lives on internals pages', () => {
		expect(bindingDocsMissingSection(0, 'cloudflare-reference')).toEqual(bindingSlugsAt(0))
		expect(bindingDocsMissingSection(1, 'cloudflare-reference')).toEqual([])
		expect(
			bindingSectionTexts(1, 'cloudflare-reference')
				.filter(({ text }) => !text.includes('Cloudflare docs vs the Devflare layer'))
				.map(({ slug }) => slug)
		).toEqual([])
	})

	test('binding example pages are real application examples without testing content', () => {
		expect(bindingDocsMissingSection(3, 'application-flow')).toEqual([])
		expect(
			bindingDocsMatching(
				3,
				/\b(?:bun:test|devflare\/test|createTestContext|createOfflineEnv|createMock[A-Z]|cf\.worker|env\.dispose|expect\s*\(|describe\s*\(|test\s*\(|tests?|testing|assert)\b/i
			)
		).toEqual([])
	})

	test('binding testing pages own the testing guidance', () => {
		expect(bindingDocsMissingSection(2, 'default-loop')).toEqual([])
		expect(
			bindingDocsMatching(
				2,
				/\b(?:bun:test|devflare\/test|createTestContext|createOfflineEnv|createMock[A-Z]|cf\.worker|env\.dispose|expect\s*\(|describe\s*\(|test\s*\()\b/
			).sort()
		).toEqual(bindingSlugsAt(2).sort())
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

	test('devflare/test value exports are documented by exact name', async () => {
		const testModule = await import('../../../src/test')
		const text = docsText()
		const missingNames = Object.keys(testModule)
			.filter((name) => name !== 'default')
			.filter((name) => !text.includes(`\`${name}\``))

		expect(missingNames).toEqual([])
	})
})
