// =============================================================================
// Durable Object Transform — Wraps DO classes with context injection
// =============================================================================
// Transforms Durable Object classes to automatically inject request context
// so that env, ctx, event, and locals proxies work inside DO methods
// =============================================================================

import MagicString from 'magic-string'
import ts from 'typescript'

// =============================================================================
// Class Detection (TypeScript AST-based)
// =============================================================================

/**
 * Information about a detected Durable Object class
 */
export interface DOClassInfo {
	/** Class name */
	name: string
	/** Whether the class extends DurableObject */
	extendsBase: boolean
	/** Whether the class has @durableObject decorator */
	hasDecorator: boolean
	/** Parsed decorator options (if any) */
	decoratorOptions?: Record<string, unknown>
}

/**
 * Returns the trailing identifier name of an expression used as a class base.
 * Handles `DurableObject`, `Cloudflare.DurableObject`, `DurableObject<Env>`.
 */
function getBaseIdentifierName(expr: ts.Expression): string | undefined {
	// Strip generic type arguments — they live on ExpressionWithTypeArguments,
	// so here we only see the call/identifier/property-access expression.
	if (ts.isIdentifier(expr)) {
		return expr.text
	}
	if (ts.isPropertyAccessExpression(expr)) {
		return expr.name.text
	}
	return undefined
}

/**
 * Returns true when the given heritage clause expression refers to DurableObject.
 */
function extendsDurableObject(node: ts.ClassDeclaration): boolean {
	const clauses = node.heritageClauses
	if (!clauses) return false
	for (const clause of clauses) {
		if (clause.token !== ts.SyntaxKind.ExtendsKeyword) continue
		for (const type of clause.types) {
			const name = getBaseIdentifierName(type.expression)
			if (name === 'DurableObject') return true
		}
	}
	return false
}

/**
 * Returns the `@durableObject` decorator (if any) on a class declaration,
 * preferring `ts.getDecorators` which understands both legacy and modifier-style decorators.
 */
function getDurableObjectDecorator(node: ts.ClassDeclaration): ts.Decorator | undefined {
	const decorators = ts.canHaveDecorators(node) ? ts.getDecorators(node) : undefined
	if (!decorators) return undefined
	for (const decorator of decorators) {
		const expr = decorator.expression
		if (
			ts.isCallExpression(expr) &&
			ts.isIdentifier(expr.expression) &&
			expr.expression.text === 'durableObject'
		) {
			return decorator
		}
		if (ts.isIdentifier(expr) && expr.text === 'durableObject') {
			return decorator
		}
	}
	return undefined
}

/**
 * Parse the first argument of the `@durableObject(...)` decorator into a plain options object.
 * Only supports the shapes the runtime uses: boolean literals and arrays of string literals.
 */
function parseDecoratorOptions(decorator: ts.Decorator): Record<string, unknown> | undefined {
	const expr = decorator.expression
	if (!ts.isCallExpression(expr)) return undefined
	const arg = expr.arguments[0]
	if (!arg || !ts.isObjectLiteralExpression(arg)) return undefined

	const result: Record<string, unknown> = {}
	for (const prop of arg.properties) {
		if (!ts.isPropertyAssignment(prop)) continue
		let key: string | undefined
		if (ts.isIdentifier(prop.name)) key = prop.name.text
		else if (ts.isStringLiteral(prop.name)) key = prop.name.text
		if (!key) continue

		const value = prop.initializer
		if (value.kind === ts.SyntaxKind.TrueKeyword) {
			result[key] = true
		} else if (value.kind === ts.SyntaxKind.FalseKeyword) {
			result[key] = false
		} else if (ts.isStringLiteralLike(value)) {
			result[key] = value.text
		} else if (ts.isNumericLiteral(value)) {
			result[key] = Number(value.text)
		} else if (ts.isArrayLiteralExpression(value)) {
			const items: string[] = []
			for (const el of value.elements) {
				if (ts.isStringLiteralLike(el)) items.push(el.text)
			}
			result[key] = items
		}
	}
	return result
}

/**
 * Walk top-level statements and collect DO class information.
 */
function collectDurableObjectClasses(code: string): DOClassInfo[] {
	const sourceFile = ts.createSourceFile(
		'durable-object.tsx',
		code,
		ts.ScriptTarget.Latest,
		true,
		ts.ScriptKind.TSX
	)

	const classMap = new Map<string, DOClassInfo>()

	const inspect = (node: ts.ClassDeclaration) => {
		if (!node.name) return
		// Only consider exported classes to preserve existing behavior
		// of the regex-based detector and the downstream transform.
		const modifiers = ts.canHaveModifiers(node) ? ts.getModifiers(node) : undefined
		const isExported = modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword) ?? false
		if (!isExported) return

		const name = node.name.text
		const extendsBase = extendsDurableObject(node)
		const decorator = getDurableObjectDecorator(node)
		const hasDecorator = decorator !== undefined

		if (!extendsBase && !hasDecorator) return

		const existing = classMap.get(name)
		const info: DOClassInfo = existing ?? { name, extendsBase: false, hasDecorator: false }
		if (extendsBase) info.extendsBase = true
		if (hasDecorator) {
			info.hasDecorator = true
			const options = parseDecoratorOptions(decorator)
			if (options) info.decoratorOptions = options
		}
		classMap.set(name, info)
	}

	for (const statement of sourceFile.statements) {
		if (ts.isClassDeclaration(statement)) {
			inspect(statement)
		}
	}

	return Array.from(classMap.values())
}

/**
 * Finds all class names that extend DurableObject or have @durableObject decorator
 */
export function findDurableObjectClasses(code: string): string[] {
	return collectDurableObjectClasses(code).map((info) => info.name)
}

/**
 * Finds detailed info about all Durable Object classes
 */
export function findDurableObjectClassesDetailed(code: string): DOClassInfo[] {
	return collectDurableObjectClasses(code)
}

// =============================================================================
// Wrapper Generation
// =============================================================================

/**
 * Options for wrapper generation
 */
export interface WrapperOptions {
	alarms?: boolean
	websockets?: boolean
}

/**
 * Generates a wrapper class that injects context into DO methods
 */
export function generateWrapper(className: string, options: WrapperOptions = {}): string {
	const includeAlarms = options.alarms ?? false
	const includeWebsockets = options.websockets ?? false

	let wrapper = `
// ============ Devflare DO Wrapper for ${className} ============
import { createDurableObjectAlarmEvent, createDurableObjectFetchEvent, createDurableObjectWebSocketCloseEvent, createDurableObjectWebSocketErrorEvent, createDurableObjectWebSocketMessageEvent, runWithEventContext } from 'devflare/runtime'

const __Original${className} = ${className}

class ${className}Wrapper extends __Original${className} {
	async fetch(request: Request): Promise<Response> {
		const __devflareEvent = createDurableObjectFetchEvent(request, this.env, this.ctx)
		return runWithEventContext(
			__devflareEvent,
			() => super.fetch(__devflareEvent)
		)
	}
`

	if (includeAlarms) {
		wrapper += `
	async alarm(): Promise<void> {
		const __devflareEvent = createDurableObjectAlarmEvent(this.env, this.ctx)
		return runWithEventContext(
			__devflareEvent,
			() => super.alarm?.(__devflareEvent) ?? Promise.resolve()
		)
	}
`
	}

	if (includeWebsockets) {
		wrapper += `
	async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
		const __devflareEvent = createDurableObjectWebSocketMessageEvent(ws, message, this.env, this.ctx)
		return runWithEventContext(
			__devflareEvent,
			() => super.webSocketMessage?.(__devflareEvent, message) ?? Promise.resolve()
		)
	}

	async webSocketClose(ws: WebSocket, code: number, reason: string, wasClean: boolean): Promise<void> {
		const __devflareEvent = createDurableObjectWebSocketCloseEvent(ws, code, reason, wasClean, this.env, this.ctx)
		return runWithEventContext(
			__devflareEvent,
			() => super.webSocketClose?.(__devflareEvent, code, reason, wasClean) ?? Promise.resolve()
		)
	}

	async webSocketError(ws: WebSocket, error: unknown): Promise<void> {
		const __devflareEvent = createDurableObjectWebSocketErrorEvent(ws, error, this.env, this.ctx)
		return runWithEventContext(
			__devflareEvent,
			() => super.webSocketError?.(__devflareEvent, error) ?? Promise.resolve()
		)
	}
`
	}

	wrapper += `}

export { ${className}Wrapper as ${className} }
// ============ End Devflare DO Wrapper ============
`

	return wrapper
}

// =============================================================================
// Full Transform
// =============================================================================

export interface TransformResult {
	code: string
	map: ReturnType<MagicString['generateMap']>
}

/**
 * Transforms a source file to wrap Durable Object classes
 *
 * @param code - Source code to transform
 * @param id - File path/id for source mapping
 * @returns Transformed code with source map, or null if no transforms needed
 */
export async function transformDurableObject(
	code: string,
	id: string
): Promise<TransformResult | null> {
	const doClasses = findDurableObjectClassesDetailed(code)

	if (doClasses.length === 0) {
		return null
	}

	const s = new MagicString(code)

	// Process each DO class
	for (const classInfo of doClasses) {
		const className = classInfo.name

		if (classInfo.extendsBase) {
			// Class extends DurableObject — rename to __Original
			const exportPattern = new RegExp(
				`export\\s+class\\s+${className}\\s+extends\\s+DurableObject`,
				'g'
			)

			let match: RegExpExecArray | null
			while ((match = exportPattern.exec(code)) !== null) {
				// Change "export class X" to "class __OriginalX"
				const start = match.index
				const exportKeywordEnd = start + 'export '.length

				// Remove export keyword
				s.overwrite(start, exportKeywordEnd, '')

				// Rename class to __Original prefix
				const classNameStart = start + match[0].indexOf(className)
				const classNameEnd = classNameStart + className.length
				s.overwrite(classNameStart, classNameEnd, `__Original${className}`)
			}
		} else if (classInfo.hasDecorator) {
			// Class has @durableObject decorator but doesn't extend DurableObject
			// Need to:
			// 1. Remove the decorator
			// 2. Make it extend DurableObject
			// 3. Rename to __Original

			const decoratorPattern = new RegExp(
				`@durableObject\\s*\\([^)]*\\)\\s*\\n?\\s*export\\s+class\\s+${className}(?:\\s+extends\\s+(\\w+))?`,
				'g'
			)

			let match: RegExpExecArray | null
			while ((match = decoratorPattern.exec(code)) !== null) {
				const start = match.index
				const existingBaseClass = match[1]

				// Calculate positions
				const decoratorEnd = code.indexOf(')', start) + 1
				const exportStart = code.indexOf('export', decoratorEnd)
				const classDefEnd = start + match[0].length

				// Remove decorator
				s.overwrite(start, exportStart, '')

				// The class becomes: class __OriginalClassName extends DurableObject
				const classNameStart = code.indexOf(className, exportStart)
				const classNameEnd = classNameStart + className.length

				if (existingBaseClass) {
					// Already extends something, rename to __Original
					s.overwrite(classNameStart, classNameEnd, `__Original${className}`)
				} else {
					// Doesn't extend anything, add extends DurableObject
					s.overwrite(classNameStart, classDefEnd, `__Original${className} extends DurableObject`)
				}
			}
		}
	}

	// Add imports and wrappers at the end
	const imports = `\nimport { createDurableObjectAlarmEvent, createDurableObjectFetchEvent, createDurableObjectWebSocketCloseEvent, createDurableObjectWebSocketErrorEvent, createDurableObjectWebSocketMessageEvent, runWithEventContext } from 'devflare/runtime'\n`
	s.prepend(imports)

	// Add wrapper classes at the end
	for (const classInfo of doClasses) {
		const className = classInfo.name
		const options = classInfo.decoratorOptions || {}

		// Determine which handlers to include based on options
		const includeAlarms = options.alarms === true
		const includeWebsockets = options.websockets === true

		const wrapper = generateWrapperCodeInternal(className, {
			alarms: includeAlarms,
			websockets: includeWebsockets
		})
		s.append(wrapper)
	}

	return {
		code: s.toString(),
		map: s.generateMap({
			source: id,
			file: id + '.map',
			includeContent: true
		})
	}
}

/**
 * Generate wrapper code for a DO class (internal - omits import since transform adds it)
 */
function generateWrapperCodeInternal(
	className: string,
	options: { alarms: boolean; websockets: boolean }
): string {
	let wrapper = `

// ============ Devflare DO Wrapper for ${className} ============
class ${className}Wrapper extends __Original${className} {
	async fetch(request: Request): Promise<Response> {
		const __devflareEvent = createDurableObjectFetchEvent(request, this.env, this.ctx)
		return runWithEventContext(
			__devflareEvent,
			() => super.fetch(__devflareEvent)
		)
	}
`

	if (options.alarms) {
		wrapper += `
	async alarm(): Promise<void> {
		const __devflareEvent = createDurableObjectAlarmEvent(this.env, this.ctx)
		return runWithEventContext(
			__devflareEvent,
			() => super.alarm?.(__devflareEvent) ?? Promise.resolve()
		)
	}
`
	}

	if (options.websockets) {
		wrapper += `
	async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
		const __devflareEvent = createDurableObjectWebSocketMessageEvent(ws, message, this.env, this.ctx)
		return runWithEventContext(
			__devflareEvent,
			() => super.webSocketMessage?.(__devflareEvent, message) ?? Promise.resolve()
		)
	}

	async webSocketClose(ws: WebSocket, code: number, reason: string, wasClean: boolean): Promise<void> {
		const __devflareEvent = createDurableObjectWebSocketCloseEvent(ws, code, reason, wasClean, this.env, this.ctx)
		return runWithEventContext(
			__devflareEvent,
			() => super.webSocketClose?.(__devflareEvent, code, reason, wasClean) ?? Promise.resolve()
		)
	}

	async webSocketError(ws: WebSocket, error: unknown): Promise<void> {
		const __devflareEvent = createDurableObjectWebSocketErrorEvent(ws, error, this.env, this.ctx)
		return runWithEventContext(
			__devflareEvent,
			() => super.webSocketError?.(__devflareEvent, error) ?? Promise.resolve()
		)
	}
`
	}

	wrapper += `}

export { ${className}Wrapper as ${className} }
// ============ End Devflare DO Wrapper ============
`

	return wrapper
}
