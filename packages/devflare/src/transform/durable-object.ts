// =============================================================================
// Durable Object Transform — Wraps DO classes with context injection
// =============================================================================
// Transforms Durable Object classes to automatically inject request context
// so that env, ctx, event, and locals proxies work inside DO methods
// =============================================================================

import MagicString from 'magic-string'

// =============================================================================
// Class Detection
// =============================================================================

/**
 * Regex to find classes extending DurableObject
 * Matches: export class ClassName extends DurableObject
 * Also handles: DurableObject<Env> generics and implements SomeInterface
 */
const DO_CLASS_REGEX = /export\s+class\s+(\w+)\s+extends\s+DurableObject(?:<[^>]+>)?(?:\s+implements\s+[\w,\s]+)?\s*\{/g

/**
 * Regex to find classes with @durableObject decorator
 * Matches: @durableObject() or @durableObject({ ... })
 * Followed by: export class ClassName
 */
const DECORATOR_CLASS_REGEX = /@durableObject\s*\([^)]*\)\s*\n?\s*export\s+class\s+(\w+)/g

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
 * Finds all class names that extend DurableObject or have @durableObject decorator
 */
export function findDurableObjectClasses(code: string): string[] {
	const classes = new Set<string>()

	// Reset regex state
	DO_CLASS_REGEX.lastIndex = 0
	DECORATOR_CLASS_REGEX.lastIndex = 0

	// Find classes extending DurableObject
	let match: RegExpExecArray | null
	while ((match = DO_CLASS_REGEX.exec(code)) !== null) {
		classes.add(match[1])
	}

	// Find classes with @durableObject decorator
	while ((match = DECORATOR_CLASS_REGEX.exec(code)) !== null) {
		classes.add(match[1])
	}

	return Array.from(classes)
}

/**
 * Finds detailed info about all Durable Object classes
 */
export function findDurableObjectClassesDetailed(code: string): DOClassInfo[] {
	const classMap = new Map<string, DOClassInfo>()

	// Reset regex state
	DO_CLASS_REGEX.lastIndex = 0
	DECORATOR_CLASS_REGEX.lastIndex = 0

	// Find classes extending DurableObject
	let match: RegExpExecArray | null
	while ((match = DO_CLASS_REGEX.exec(code)) !== null) {
		const name = match[1]
		classMap.set(name, {
			name,
			extendsBase: true,
			hasDecorator: false
		})
	}

	// Find classes with @durableObject decorator
	const decoratorWithOptionsRegex = /@durableObject\s*\((\{[^}]*\})?\)\s*\n?\s*export\s+class\s+(\w+)/g
	while ((match = decoratorWithOptionsRegex.exec(code)) !== null) {
		const optionsStr = match[1]
		const name = match[2]

		const existing = classMap.get(name)
		if (existing) {
			existing.hasDecorator = true
			if (optionsStr) {
				try {
					// Try to parse simple object literals
					existing.decoratorOptions = parseSimpleObject(optionsStr)
				} catch {
					// Ignore parse errors
				}
			}
		} else {
			const info: DOClassInfo = {
				name,
				extendsBase: false,
				hasDecorator: true
			}
			if (optionsStr) {
				try {
					info.decoratorOptions = parseSimpleObject(optionsStr)
				} catch {
					// Ignore parse errors
				}
			}
			classMap.set(name, info)
		}
	}

	return Array.from(classMap.values())
}

/**
 * Parse a simple object literal string
 * Handles: { key: value, key2: true, key3: ['a', 'b'] }
 */
function parseSimpleObject(str: string): Record<string, unknown> {
	// Very simple parser - just extracts key: value pairs
	// This is intentionally limited; complex parsing would need a real parser
	const result: Record<string, unknown> = {}

	// Remove braces
	const inner = str.trim().slice(1, -1)

	// Split by commas (but not inside arrays)
	let depth = 0
	let current = ''
	const pairs: string[] = []

	for (const char of inner) {
		if (char === '[') depth++
		else if (char === ']') depth--
		else if (char === ',' && depth === 0) {
			pairs.push(current.trim())
			current = ''
			continue
		}
		current += char
	}
	if (current.trim()) pairs.push(current.trim())

	for (const pair of pairs) {
		const colonIndex = pair.indexOf(':')
		if (colonIndex === -1) continue

		const key = pair.slice(0, colonIndex).trim()
		const valueStr = pair.slice(colonIndex + 1).trim()

		// Parse value
		if (valueStr === 'true') {
			result[key] = true
		} else if (valueStr === 'false') {
			result[key] = false
		} else if (valueStr.startsWith('[')) {
			// Parse simple array of strings
			const arrayContent = valueStr.slice(1, -1)
			result[key] = arrayContent
				.split(',')
				.map((s) => s.trim().replace(/^['"]|['"]$/g, ''))
		} else if (valueStr.startsWith("'") || valueStr.startsWith('"')) {
			result[key] = valueStr.slice(1, -1)
		} else if (!isNaN(Number(valueStr))) {
			result[key] = Number(valueStr)
		} else {
			result[key] = valueStr
		}
	}

	return result
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
					s.overwrite(
						classNameStart,
						classDefEnd,
						`__Original${className} extends DurableObject`
					)
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
