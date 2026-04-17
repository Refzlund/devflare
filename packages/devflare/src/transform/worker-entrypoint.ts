// =============================================================================
// Worker Entrypoint Transform — Transforms worker.ts exports to WorkerEntrypoint
// =============================================================================
// Transforms a worker.ts file that exports multiple handlers (fetch, RPC methods)
// into a WorkerEntrypoint class that Cloudflare Workers can use.
//
// Uses TypeScript Compiler API for robust AST-based parsing.
//
// Input (worker.ts):
//   export function fetch(request: Request, env: Env, ctx: ExecutionContext) { ... }
//   export function add(a: number, b: number) { return a + b }
//   export function multiply(a: number, b: number) { return a * b }
//
// Output:
//   import { WorkerEntrypoint } from 'cloudflare:workers'
//   class Worker extends WorkerEntrypoint {
//     fetch(request: Request) { ... }
//     add(a: number, b: number) { return a + b }
//     multiply(a: number, b: number) { return a * b }
//   }
//   export { Worker as default }
// =============================================================================

import ts from 'typescript'
import MagicString from 'magic-string'

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

/**
 * Information about an exported function
 */
export interface ExportedFunction {
	/** Function name */
	name: string
	/** Whether it's an async function */
	isAsync: boolean
	/** Function parameters (as string) */
	params: string
	/** Return type annotation (if any) */
	returnType?: string
	/** Start position in source */
	start: number
	/** End position in source */
	end: number
	/** The full function text for preservation */
	body?: string
	/** Whether this is the default export */
	isDefault?: boolean
}

/**
 * Options for worker entrypoint transformation
 */
export interface WorkerTransformOptions {
	/** Class name to generate (default: 'Worker') */
	className?: string
	/** Whether to inject context wrapper for fetch (default: true) */
	injectContext?: boolean
}

/**
 * Result of transformation
 */
export interface WorkerTransformResult {
	code: string
	map: ReturnType<MagicString['generateMap']>
	/** List of RPC methods (exported functions except fetch) */
	rpcMethods: string[]
	/** Generated class name */
	className: string
}

// -----------------------------------------------------------------------------
// AST-Based Detection using TypeScript Compiler API
// -----------------------------------------------------------------------------

/**
 * Find all exported functions in a worker.ts file using TypeScript AST
 */
export function findExportedFunctions(code: string): ExportedFunction[] {
	const functions: ExportedFunction[] = []

	// Create a source file from the code
	const sourceFile = ts.createSourceFile(
		'worker.ts',
		code,
		ts.ScriptTarget.Latest,
		true,
		ts.ScriptKind.TS
	)

	// Visit each node in the AST
	function visit(node: ts.Node) {
		// Handle: export function name(...) { }
		if (ts.isFunctionDeclaration(node) && node.name) {
			const modifiers = ts.getModifiers(node)
			const isExported = modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)
			const isDefault = modifiers?.some((m) => m.kind === ts.SyntaxKind.DefaultKeyword)

			if (isExported) {
				const isAsync = modifiers?.some((m) => m.kind === ts.SyntaxKind.AsyncKeyword) ?? false
				const funcName = isDefault ? 'fetch' : node.name.text
				const params = node.parameters
					.map((p) => code.substring(p.getStart(sourceFile), p.getEnd()))
					.join(', ')
				const returnType = node.type
					? code.substring(node.type.getStart(sourceFile), node.type.getEnd())
					: undefined

				functions.push({
					name: funcName,
					isAsync,
					params,
					returnType,
					start: node.getStart(sourceFile),
					end: node.getEnd(),
					isDefault
				})
			}
		}

		// Handle: export default function(...) { } (anonymous default export)
		if (ts.isFunctionDeclaration(node) && !node.name) {
			const modifiers = ts.getModifiers(node)
			const isExported = modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)
			const isDefault = modifiers?.some((m) => m.kind === ts.SyntaxKind.DefaultKeyword)

			if (isExported && isDefault) {
				const isAsync = modifiers?.some((m) => m.kind === ts.SyntaxKind.AsyncKeyword) ?? false
				const params = node.parameters
					.map((p) => code.substring(p.getStart(sourceFile), p.getEnd()))
					.join(', ')
				const returnType = node.type
					? code.substring(node.type.getStart(sourceFile), node.type.getEnd())
					: undefined

				functions.push({
					name: 'fetch',
					isAsync,
					params,
					returnType,
					start: node.getStart(sourceFile),
					end: node.getEnd(),
					isDefault: true
				})
			}
		}

		// Handle: export const name = function(...) { } or export const name = (...) => { }
		if (ts.isVariableStatement(node)) {
			const modifiers = ts.getModifiers(node)
			const isExported = modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)

			if (isExported) {
				for (const decl of node.declarationList.declarations) {
					if (ts.isIdentifier(decl.name) && decl.initializer) {
						let funcExpr: ts.FunctionExpression | ts.ArrowFunction | undefined

						if (ts.isFunctionExpression(decl.initializer)) {
							funcExpr = decl.initializer
						} else if (ts.isArrowFunction(decl.initializer)) {
							funcExpr = decl.initializer
						}

						if (funcExpr) {
							const modifiersArr = ts.getModifiers(funcExpr)
							const isAsync = modifiersArr?.some((m) => m.kind === ts.SyntaxKind.AsyncKeyword)
								?? (ts.isArrowFunction(funcExpr) && funcExpr.modifiers?.some((m) => m.kind === ts.SyntaxKind.AsyncKeyword))
								?? false
							const params = funcExpr.parameters
								.map((p) => code.substring(p.getStart(sourceFile), p.getEnd()))
								.join(', ')
							const returnType = funcExpr.type
								? code.substring(funcExpr.type.getStart(sourceFile), funcExpr.type.getEnd())
								: undefined

							functions.push({
								name: decl.name.text,
								isAsync,
								params,
								returnType,
								start: node.getStart(sourceFile),
								end: node.getEnd()
							})
						}
					}
				}
			}
		}

		ts.forEachChild(node, visit)
	}

	visit(sourceFile)

	return functions
}

/**
 * Extensions considered valid worker entrypoint sources.
 */
const WORKER_EXTENSIONS = ['.ts', '.tsx', '.mts', '.cts', '.js', '.mjs', '.cjs'] as const

/**
 * Extensions that may host TypeScript-only syntax (type annotations, interfaces).
 */
const TS_EXTENSIONS = ['.ts', '.tsx', '.mts', '.cts'] as const

/**
 * Returns true when the filename has an extension that permits TS-only syntax.
 * Gates injection of interfaces and type annotations into emitted worker code.
 */
export function shouldEmitTsSyntax(filename: string): boolean {
	const lower = filename.toLowerCase()
	return TS_EXTENSIONS.some((ext) => lower.endsWith(ext))
}

/**
 * Check if a file should be transformed as a worker entrypoint
 * Returns true if the file has exported functions that could be RPC methods
 */
export function shouldTransformWorker(code: string, filePath: string): boolean {
	const lower = filePath.toLowerCase()
	const isWorkerFile = WORKER_EXTENSIONS.some((ext) => lower.endsWith(`worker${ext}`))
	if (!isWorkerFile) {
		return false
	}

	const functions = findExportedFunctions(code)

	// Need at least one function to transform
	return functions.length > 0
}

// -----------------------------------------------------------------------------
// Transformation
// -----------------------------------------------------------------------------

/**
 * Transform a worker.ts file into a WorkerEntrypoint class
 *
 * @param code - Source code to transform
 * @param id - File path/id for source mapping
 * @param options - Transform options
 * @returns Transformed code with source map
 */
export function transformWorkerEntrypoint(
	code: string,
	id: string,
	options: WorkerTransformOptions = {}
): WorkerTransformResult | null {
	const className = options.className ?? 'Worker'
	const injectContext = options.injectContext ?? true
	const emitTs = shouldEmitTsSyntax(id)

	const functions = findExportedFunctions(code)

	if (functions.length === 0) {
		return null
	}

	// Separate fetch from RPC methods
	const fetchFn = functions.find((f) => f.name === 'fetch')
	const rpcMethods = functions.filter((f) => f.name !== 'fetch')
	const needsFetchHelpers = Boolean(fetchFn)

	const s = new MagicString(code)

	// Add WorkerEntrypoint import at the top
	const importStatement = `import { WorkerEntrypoint } from 'cloudflare:workers'\n`
	if (needsFetchHelpers) {
		const runtimeImports = ['createFetchEvent', 'invokeFetchHandler']
		if (injectContext) {
			runtimeImports.push('runWithEventContext')
		}
		s.prepend(`import { ${runtimeImports.join(', ')} } from 'devflare/runtime'\n`)
	}
	s.prepend(importStatement)

	// -------------------------------------------------------------------------
	// AST-based edits to rewrite exports → internal declarations.
	// No regex/string replace is performed on already-parsed source; every
	// mutation is keyed on AST node positions so comments and strings that
	// happen to contain the matched pattern are never touched.
	// -------------------------------------------------------------------------
	const sourceFile = ts.createSourceFile(
		'worker.ts',
		code,
		ts.ScriptTarget.Latest,
		true,
		ts.ScriptKind.TS
	)

	const internalNameFor = (name: string): string =>
		name === 'fetch' ? '__originalFetch' : `__original_${name}`

	function visit(node: ts.Node): void {
		if (ts.isFunctionDeclaration(node)) {
			const modifiers = ts.getModifiers(node)
			const exportMod = modifiers?.find((m) => m.kind === ts.SyntaxKind.ExportKeyword)
			const defaultMod = modifiers?.find((m) => m.kind === ts.SyntaxKind.DefaultKeyword)
			const asyncMod = modifiers?.find((m) => m.kind === ts.SyntaxKind.AsyncKeyword)

			if (exportMod) {
				const isDefault = Boolean(defaultMod)
				const logicalName = isDefault ? 'fetch' : node.name?.text
				if (logicalName) {
					const internal = internalNameFor(logicalName)

					if (isDefault && !node.name) {
						// Anonymous default: `export default (async )?function ...`
						// Overwrite [node start, function-keyword start) with `const X = (async )?`
						const funcKeyword = node
							.getChildren(sourceFile)
							.find((c) => c.kind === ts.SyntaxKind.FunctionKeyword)
						if (funcKeyword) {
							const asyncKw = asyncMod ? 'async ' : ''
							s.overwrite(
								node.getStart(sourceFile),
								funcKeyword.getStart(sourceFile),
								`const ${internal} = ${asyncKw}`
							)
						}
					} else if (node.name) {
						// Named export: remove export (and default) modifiers, rename identifier
						s.remove(exportMod.getStart(sourceFile), exportMod.getEnd())
						if (defaultMod) {
							s.remove(defaultMod.getStart(sourceFile), defaultMod.getEnd())
						}
						s.overwrite(
							node.name.getStart(sourceFile),
							node.name.getEnd(),
							internal
						)
					}
				}
			}
		} else if (ts.isVariableStatement(node)) {
			const modifiers = ts.getModifiers(node)
			const exportMod = modifiers?.find((m) => m.kind === ts.SyntaxKind.ExportKeyword)
			if (exportMod) {
				let rewroteAny = false
				for (const decl of node.declarationList.declarations) {
					if (
						ts.isIdentifier(decl.name)
						&& decl.initializer
						&& (ts.isFunctionExpression(decl.initializer)
							|| ts.isArrowFunction(decl.initializer))
					) {
						const internal = internalNameFor(decl.name.text)
						s.overwrite(
							decl.name.getStart(sourceFile),
							decl.name.getEnd(),
							internal
						)
						rewroteAny = true
					}
				}
				// Only drop the `export` keyword when at least one declarator
				// was rewritten into an internal name. Non-function exports
				// (e.g. `export const VERSION = '1.0.0'`) are preserved as-is.
				if (rewroteAny) {
					s.remove(exportMod.getStart(sourceFile), exportMod.getEnd())
				}
			}
		}

		ts.forEachChild(node, visit)
	}

	visit(sourceFile)

	// Build the class body
	let classBody = `\n\n// ============ Devflare WorkerEntrypoint ============\nclass ${className} extends WorkerEntrypoint {\n`

	// Add fetch method if present
	if (fetchFn) {
		const fetchSig = emitTs
			? 'async fetch(request: Request): Promise<Response>'
			: 'async fetch(request)'
		classBody += `\t${fetchSig} {\n`
		classBody += `\t\tconst __devflareEvent = createFetchEvent(request, this.env, this.ctx)\n`

		if (injectContext) {
			classBody += `\t\treturn runWithEventContext(\n`
			classBody += `\t\t\t__devflareEvent,\n`
			classBody += `\t\t\t() => invokeFetchHandler(__originalFetch, __devflareEvent)\n`
			classBody += `\t\t)\n`
			classBody += `\t}\n`
		} else {
			classBody += `\t\treturn invokeFetchHandler(__originalFetch, __devflareEvent)\n`
			classBody += `\t}\n`
		}
	}

	// Add RPC methods. For JS outputs, strip TS-only type annotations from
	// the method signature (the backing __original_* function still receives
	// whatever the user wrote, which for valid JS is always untyped).
	for (const fn of rpcMethods) {
		const asyncPrefix = fn.isAsync ? 'async ' : ''
		const paramNames = extractParamNames(fn.params)
		const signatureParams = emitTs ? fn.params : paramNames
		const returnType = emitTs && fn.returnType ? `: ${fn.returnType}` : ''

		classBody += `\n\t${asyncPrefix}${fn.name}(${signatureParams})${returnType} {\n`
		classBody += `\t\treturn __original_${fn.name}(${paramNames})\n`
		classBody += `\t}\n`
	}

	classBody += `}\n\n`
	// Export the class both as named (for entrypoint) and as default (for worker)
	classBody += `export { ${className} }\n`
	classBody += `export { ${className} as default }\n`
	classBody += `// ============ End Devflare WorkerEntrypoint ============\n`

	// Append the class at the end
	s.append(classBody)

	return {
		code: s.toString(),
		map: s.generateMap({
			source: id,
			file: id + '.map',
			includeContent: true
		}),
		rpcMethods: rpcMethods.map((fn) => fn.name),
		className
	}
}

/**
 * Extract parameter names from a parameter string
 * "a: number, b: string" -> "a, b"
 */
function extractParamNames(params: string): string {
	if (!params.trim()) return ''

	// Parse using TypeScript to handle complex cases
	const tempCode = `function f(${params}) {}`
	const sourceFile = ts.createSourceFile(
		'temp.ts',
		tempCode,
		ts.ScriptTarget.Latest,
		true,
		ts.ScriptKind.TS
	)

	const names: string[] = []

	function visit(node: ts.Node) {
		if (ts.isFunctionDeclaration(node)) {
			for (const param of node.parameters) {
				if (ts.isIdentifier(param.name)) {
					names.push(param.name.text)
				} else if (ts.isObjectBindingPattern(param.name) || ts.isArrayBindingPattern(param.name)) {
					// For destructured params, we need the full pattern
					names.push(tempCode.substring(param.name.getStart(sourceFile), param.name.getEnd()))
				}
			}
		}
		ts.forEachChild(node, visit)
	}

	visit(sourceFile)

	return names.join(', ')
}

// -----------------------------------------------------------------------------
// Type Generation
// -----------------------------------------------------------------------------

/**
 * Generate TypeScript interface for RPC methods
 * This is useful for creating type-safe service binding contracts
 */
export function generateRpcInterface(
	functions: ExportedFunction[],
	interfaceName: string
): string {
	const rpcMethods = functions.filter((f) => f.name !== 'fetch')

	if (rpcMethods.length === 0) {
		return ''
	}

	let output = `export interface ${interfaceName} {\n`

	for (const fn of rpcMethods) {
		const returnType = fn.returnType ?? 'unknown'
		// All RPC methods return Promises at the service binding level
		const promiseReturn = returnType.startsWith('Promise<')
			? returnType
			: `Promise<${returnType}>`

		output += `\t${fn.name}(${fn.params}): ${promiseReturn}\n`
	}

	output += `}\n`

	return output
}
