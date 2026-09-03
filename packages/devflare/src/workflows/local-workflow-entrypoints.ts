import { mkdir, readFile, writeFile } from 'node:fs/promises'
import type { ConsolaInstance } from 'consola'
import { dirname, join, relative, resolve } from 'pathe'
import { bundleWorkerEntry } from '../bundler'
import { type DevflareConfig, normalizeWorkflowBinding } from '../config'
import { generatedDir } from '../utils/generated-dir'
import { DEFAULT_WORKFLOW_PATTERN, findFiles } from '../utils/glob'

interface LocalWorkflowEntrypoint {
	bindingName: string
	className: string
	scriptPath: string
}

export interface BundleWorkflowEntrypointScriptOptions {
	logger?: ConsolaInstance
}

function findExportedClasses(code: string): string[] {
	const classes: string[] = []
	const classPattern = /export\s+class\s+(\w+)/g

	let match: RegExpExecArray | null = classPattern.exec(code)
	while (match !== null) {
		classes.push(match[1])
		match = classPattern.exec(code)
	}

	return classes
}

function toImportSpecifier(fromDir: string, filePath: string): string {
	const relativePath = relative(fromDir, filePath).replace(/\\/g, '/')
	return relativePath.startsWith('.') ? relativePath : `./${relativePath}`
}

async function discoverWorkflowClasses(
	config: DevflareConfig,
	configDir: string
): Promise<Map<string, string>> {
	const classToFilePath = new Map<string, string>()
	const workflowPatternConfig = config.files?.workflows
	const workflowPattern =
		typeof workflowPatternConfig === 'string' ? workflowPatternConfig : DEFAULT_WORKFLOW_PATTERN

	if (workflowPatternConfig === false) {
		return classToFilePath
	}

	const files = await findFiles(workflowPattern, { cwd: configDir })
	for (const filePath of files) {
		try {
			const code = await readFile(filePath, 'utf-8')
			for (const className of findExportedClasses(code)) {
				classToFilePath.set(className, filePath)
			}
		} catch {
			// Discovery is best-effort; unresolved configured bindings fail below.
		}
	}

	return classToFilePath
}

async function resolveLocalWorkflowEntrypoints(
	config: DevflareConfig,
	configDir: string
): Promise<LocalWorkflowEntrypoint[]> {
	const workflows = config.bindings?.workflows
	if (!workflows || Object.keys(workflows).length === 0) {
		return []
	}

	const classToFilePath = await discoverWorkflowClasses(config, configDir)
	const entrypoints: LocalWorkflowEntrypoint[] = []

	for (const [bindingName, binding] of Object.entries(workflows)) {
		const normalized = normalizeWorkflowBinding(binding)
		if (normalized.scriptName) {
			continue
		}

		const scriptPath = classToFilePath.get(normalized.className)
		if (!scriptPath) {
			throw new Error(
				`Workflow binding ${bindingName} (className: '${normalized.className}') not found.\n` +
					`Either set files.workflows to match the workflow source file, or set scriptName when the workflow lives in another worker.`
			)
		}

		entrypoints.push({
			bindingName,
			className: normalized.className,
			scriptPath
		})
	}

	return entrypoints
}

function buildWorkflowVirtualEntry(
	entrypoints: LocalWorkflowEntrypoint[],
	entryDir: string
): string {
	const imports = entrypoints.map((entrypoint, index) => {
		const importName = `__DevflareWorkflow${index}`
		const importPath = toImportSpecifier(entryDir, entrypoint.scriptPath)
		return {
			importName,
			className: entrypoint.className,
			line: `import { ${entrypoint.className} as ${importName} } from '${importPath}'`
		}
	})

	const exports = imports.map((entrypoint) => {
		return `export { ${entrypoint.importName} as ${entrypoint.className} }`
	})

	return [...imports.map((entrypoint) => entrypoint.line), '', ...exports].join('\n')
}

export async function bundleWorkflowEntrypointScript(
	config: DevflareConfig,
	configDir: string,
	options: BundleWorkflowEntrypointScriptOptions = {}
): Promise<string> {
	const entrypoints = await resolveLocalWorkflowEntrypoints(config, configDir)
	if (entrypoints.length === 0) {
		return ''
	}

	const entryDir = generatedDir(configDir, 'workflow-entrypoints')
	const entryPath = join(entryDir, '__entry.ts')
	const outFile = join(entryDir, 'index.js')
	await mkdir(entryDir, { recursive: true })
	await writeFile(entryPath, buildWorkflowVirtualEntry(entrypoints, entryDir))

	await bundleWorkerEntry({
		cwd: configDir,
		inputFile: entryPath,
		outFile,
		rolldownOptions: config.rolldown?.options,
		sourcemap: config.rolldown?.sourcemap,
		minify: config.rolldown?.minify,
		logger: options.logger
	})

	return await readFile(outFile, 'utf-8')
}
