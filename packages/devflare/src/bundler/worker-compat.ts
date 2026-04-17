import type { Plugin as RolldownPlugin } from 'rolldown'
import MagicString from 'magic-string'
import ts from 'typescript'

interface ImportWrapper {
	name: string
	parameterName: string
	bodyStart: number
	bodyEnd: number
	specifiers: Set<string>
	hasUnsupportedCalls: boolean
}

interface ImportReplacement {
	start: number
	end: number
	text: string
}

const WORKER_DYNAMIC_IMPORT_ERROR = 'Devflare worker bundles cannot contain unresolved dynamic import() expressions because Miniflare/workerd reject dynamic module specifiers'

function getScriptKind(id: string): ts.ScriptKind {
	if (id.endsWith('.tsx')) {
		return ts.ScriptKind.TSX
	}

	if (id.endsWith('.ts') || id.endsWith('.mts') || id.endsWith('.cts')) {
		return ts.ScriptKind.TS
	}

	if (id.endsWith('.jsx')) {
		return ts.ScriptKind.JSX
	}

	return ts.ScriptKind.JS
}

function createSourceFile(code: string, id: string): ts.SourceFile {
	return ts.createSourceFile(id, code, ts.ScriptTarget.Latest, true, getScriptKind(id))
}

function hasExportModifier(node: ts.Node): boolean {
	if (!ts.canHaveModifiers(node)) {
		return false
	}

	return ts.getModifiers(node)?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword) ?? false
}

function isConstVariableStatement(statement: ts.Statement): statement is ts.VariableStatement {
	return ts.isVariableStatement(statement)
		&& (statement.declarationList.flags & ts.NodeFlags.Const) !== 0
}

function quoteString(value: string): string {
	return `'${value.replace(/\\/g, '\\\\').replace(/'/g, `\\'`)}'`
}

function resolveLiteralImportSpecifier(
	expression: ts.Expression,
	constStrings: Map<string, string>
): string | null {
	if (ts.isStringLiteral(expression) || ts.isNoSubstitutionTemplateLiteral(expression)) {
		return expression.text
	}

	if (ts.isParenthesizedExpression(expression)) {
		return resolveLiteralImportSpecifier(expression.expression, constStrings)
	}

	if (ts.isIdentifier(expression)) {
		return constStrings.get(expression.text) ?? null
	}

	return null
}

function collectTopLevelConstStrings(sourceFile: ts.SourceFile): Map<string, string> {
	const constStrings = new Map<string, string>()

	for (const statement of sourceFile.statements) {
		if (!isConstVariableStatement(statement)) {
			continue
		}

		for (const declaration of statement.declarationList.declarations) {
			if (!ts.isIdentifier(declaration.name) || !declaration.initializer) {
				continue
			}

			const literal = resolveLiteralImportSpecifier(declaration.initializer, constStrings)
			if (literal !== null) {
				constStrings.set(declaration.name.text, literal)
			}
		}
	}

	return constStrings
}

function unwrapDynamicImportExpression(expression: ts.Expression): ts.CallExpression | null {
	if (ts.isParenthesizedExpression(expression)) {
		return unwrapDynamicImportExpression(expression.expression)
	}

	if (ts.isAwaitExpression(expression)) {
		return unwrapDynamicImportExpression(expression.expression)
	}

	if (!ts.isCallExpression(expression) || expression.expression.kind !== ts.SyntaxKind.ImportKeyword) {
		return null
	}

	return expression
}

function getWrapperBodyExpression(body: ts.ConciseBody | undefined): ts.Expression | null {
	if (!body) {
		return null
	}

	if (!ts.isBlock(body)) {
		return body
	}

	if (body.statements.length !== 1) {
		return null
	}

	const [statement] = body.statements
	if (!ts.isReturnStatement(statement) || !statement.expression) {
		return null
	}

	return statement.expression
}

function createImportWrapper(
	name: string,
	parameterName: string,
	body: ts.ConciseBody | undefined,
	sourceFile: ts.SourceFile
): ImportWrapper | null {
	const bodyExpression = getWrapperBodyExpression(body)
	if (!bodyExpression) {
		return null
	}

	const importExpression = unwrapDynamicImportExpression(bodyExpression)
	if (!importExpression || importExpression.arguments.length < 1) {
		return null
	}

	const [importArgument] = importExpression.arguments
	if (!ts.isIdentifier(importArgument) || importArgument.text !== parameterName || !body) {
		return null
	}

	return {
		name,
		parameterName,
		bodyStart: body.getStart(sourceFile),
		bodyEnd: body.getEnd(),
		specifiers: new Set<string>(),
		hasUnsupportedCalls: false
	}
}

function collectImportWrappers(sourceFile: ts.SourceFile): Map<string, ImportWrapper> {
	const wrappers = new Map<string, ImportWrapper>()

	for (const statement of sourceFile.statements) {
		if (
			ts.isFunctionDeclaration(statement)
			&& statement.name
			&& !hasExportModifier(statement)
			&& statement.parameters.length === 1
			&& ts.isIdentifier(statement.parameters[0]?.name)
		) {
			const wrapper = createImportWrapper(
				statement.name.text,
				statement.parameters[0].name.text,
				statement.body,
				sourceFile
			)

			if (wrapper) {
				wrappers.set(wrapper.name, wrapper)
			}
		}

		if (!isConstVariableStatement(statement) || hasExportModifier(statement)) {
			continue
		}

		for (const declaration of statement.declarationList.declarations) {
			if (!ts.isIdentifier(declaration.name) || !declaration.initializer) {
				continue
			}

			if (!ts.isArrowFunction(declaration.initializer) && !ts.isFunctionExpression(declaration.initializer)) {
				continue
			}

			if (
				declaration.initializer.parameters.length !== 1
				|| !ts.isIdentifier(declaration.initializer.parameters[0]?.name)
			) {
				continue
			}

			const wrapper = createImportWrapper(
				declaration.name.text,
				declaration.initializer.parameters[0].name.text,
				declaration.initializer.body,
				sourceFile
			)

			if (wrapper) {
				wrappers.set(wrapper.name, wrapper)
			}
		}
	}

	return wrappers
}

function collectWrapperCallSpecifiers(
	sourceFile: ts.SourceFile,
	wrappers: Map<string, ImportWrapper>,
	constStrings: Map<string, string>
): void {
	function visit(node: ts.Node) {
		if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)) {
			const wrapper = wrappers.get(node.expression.text)
			if (wrapper) {
				if (node.arguments.length !== 1) {
					wrapper.hasUnsupportedCalls = true
				} else {
					const specifier = resolveLiteralImportSpecifier(node.arguments[0], constStrings)
					if (specifier === null) {
						wrapper.hasUnsupportedCalls = true
					} else {
						wrapper.specifiers.add(specifier)
					}
				}
			}
		}

		ts.forEachChild(node, visit)
	}

	visit(sourceFile)
}

function createImportIdentifier(specifierToIdentifier: Map<string, string>, specifier: string): string {
	const existing = specifierToIdentifier.get(specifier)
	if (existing) {
		return existing
	}

	const identifier = `__devflareDynamicImport${specifierToIdentifier.size}`
	specifierToIdentifier.set(specifier, identifier)
	return identifier
}

function buildWrapperBody(
	wrapper: ImportWrapper,
	specifierToIdentifier: Map<string, string>
): string {
	const cases = Array.from(wrapper.specifiers)
		.sort((left, right) => left.localeCompare(right))
		.map((specifier) => {
			const identifier = createImportIdentifier(specifierToIdentifier, specifier)
			return `\t\tcase ${quoteString(specifier)}:\n\t\t\treturn Promise.resolve(${identifier})`
		})
		.join('\n')

	return `{
		switch (${wrapper.parameterName}) {
${cases}
			default:
				return Promise.reject(new Error(\`Unsupported dynamic import in Devflare worker bundle: \${${wrapper.parameterName}}\`))
		}
	}`
}

function findContainingWrapper(
	callExpression: ts.CallExpression,
	wrappers: ImportWrapper[],
	sourceFile: ts.SourceFile
): ImportWrapper | null {
	const start = callExpression.getStart(sourceFile)
	const end = callExpression.getEnd()

	for (const wrapper of wrappers) {
		if (start >= wrapper.bodyStart && end <= wrapper.bodyEnd) {
			return wrapper
		}
	}

	return null
}

function transformWorkerDynamicImports(
	code: string,
	id: string
): {
	code: string
	map: ReturnType<MagicString['generateMap']>
} | null {
	const sourceFile = createSourceFile(code, id)
	const constStrings = collectTopLevelConstStrings(sourceFile)
	const wrappers = collectImportWrappers(sourceFile)
	collectWrapperCallSpecifiers(sourceFile, wrappers, constStrings)

	const transformableWrappers = Array.from(wrappers.values()).filter((wrapper) => {
		return !wrapper.hasUnsupportedCalls && wrapper.specifiers.size > 0
	})

	const replacements: ImportReplacement[] = []
	const specifierToIdentifier = new Map<string, string>()

	function visit(node: ts.Node) {
		if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
			const containingWrapper = findContainingWrapper(node, transformableWrappers, sourceFile)
			if (
				containingWrapper
				&& node.arguments.length === 1
				&& ts.isIdentifier(node.arguments[0])
				&& node.arguments[0].text === containingWrapper.parameterName
			) {
				return
			}

			const [argument] = node.arguments
			if (!argument) {
				return
			}

			const specifier = resolveLiteralImportSpecifier(argument, constStrings)
			if (specifier !== null) {
				replacements.push({
					start: node.getStart(sourceFile),
					end: node.getEnd(),
					text: `Promise.resolve(${createImportIdentifier(specifierToIdentifier, specifier)})`
				})
			}
		}

		ts.forEachChild(node, visit)
	}

	visit(sourceFile)

	if (replacements.length === 0 && transformableWrappers.length === 0) {
		return null
	}

	const s = new MagicString(code)

	for (const replacement of replacements.sort((left, right) => right.start - left.start)) {
		s.overwrite(replacement.start, replacement.end, replacement.text)
	}

	for (const wrapper of transformableWrappers.sort((left, right) => right.bodyStart - left.bodyStart)) {
		s.overwrite(
			wrapper.bodyStart,
			wrapper.bodyEnd,
			buildWrapperBody(wrapper, specifierToIdentifier)
		)
	}

	if (specifierToIdentifier.size > 0) {
		const importBlock = Array.from(specifierToIdentifier.entries())
			.map(([specifier, identifier]) => `import * as ${identifier} from ${quoteString(specifier)}`)
			.join('\n')

		if (code.startsWith('#!')) {
			const newlineIndex = code.indexOf('\n')
			if (newlineIndex === -1) {
				// Shebang-only file with no terminating newline: append newline
				// after the shebang, then the import block. Avoids double-inserts
				// and never rewrites or removes the existing shebang.
				s.appendRight(code.length, `\n${importBlock}\n`)
			} else {
				s.appendLeft(newlineIndex + 1, `${importBlock}\n`)
			}
		} else {
			s.appendLeft(0, `${importBlock}\n`)
		}
	}

	return {
		code: s.toString(),
		map: s.generateMap({
			source: id,
			file: `${id}.map`,
			includeContent: true
		})
	}
}

function findDynamicImportCalls(sourceFile: ts.SourceFile): ts.CallExpression[] {
	const calls: ts.CallExpression[] = []

	function visit(node: ts.Node) {
		if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
			calls.push(node)
		}

		ts.forEachChild(node, visit)
	}

	visit(sourceFile)
	return calls
}

export async function assertWorkerBundleHasNoDynamicImports(bundlePath: string): Promise<void> {
	const fs = await import('node:fs/promises')
	const code = await fs.readFile(bundlePath, 'utf-8')
	const sourceFile = createSourceFile(code, bundlePath)
	const dynamicImports = findDynamicImportCalls(sourceFile)

	if (dynamicImports.length === 0) {
		return
	}

	const examples = dynamicImports
		.slice(0, 3)
		.map((callExpression) => {
			const start = callExpression.getStart(sourceFile)
			const { line, character } = sourceFile.getLineAndCharacterOfPosition(start)
			const snippet = code
				.slice(start, callExpression.getEnd())
				.replace(/\s+/g, ' ')
				.trim()

			return `- ${line + 1}:${character + 1} ${snippet}`
		})
		.join('\n')

	throw new Error([
		WORKER_DYNAMIC_IMPORT_ERROR,
		`Bundle: ${bundlePath}`,
		`Examples:\n${examples}`,
		'Devflare can normalize literal import() calls and simple helper wrappers whose call sites are literal strings, but truly runtime-computed specifiers must be converted to static imports for worker bundles.'
	].join('\n\n'))
}

export function createWorkerDynamicImportPlugin(): RolldownPlugin {
	return {
		name: 'devflare-worker-dynamic-imports',
		transform(code, id) {
			const result = transformWorkerDynamicImports(code, id)
			return result ?? null
		}
	}
}