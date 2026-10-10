// =============================================================================
// Layout — line breaking for the generated env.d.ts
// =============================================================================
/*
	`devflare types` writes TypeScript in devflare's own house style (tabs,
	single quotes, no semicolons, 100 columns — the repository's biome.json).
	Before this module it wrote every statement on one line, so the repository's
	formatter rewrote a freshly generated file: a long import list, a Durable
	Object member with an `import()` type, a long Entrypoints union. This is the
	small Wadler-style printer (the algorithm Prettier and Biome both use) for
	the few shapes the generator emits, so its output is already what Biome
	would print.

	→ Stable under THAT configuration only. A project formatting with a
	  different line width or indent style will still re-wrap the file; the
	  generator cannot know a consumer's settings.
	→ Width is measured as Biome measures it: a tab counts as `indentWidth`
	  (2) columns.
*/

/** The line width the generated file is laid out for. */
const LINE_WIDTH = 100

/** How many columns Biome counts a tab as (`formatter.indentWidth`). */
const TAB_WIDTH = 2

/**
 * @description A layout document: text, a possible line break, or a group or
 * indentation wrapping more documents.
 */
export type Doc =
	| string
	| Doc[]
	| { kind: 'group'; contents: Doc }
	| { kind: 'indent'; contents: Doc }
	| { kind: 'line'; flat: string }
	| { kind: 'ifBreak'; broken: string }

/** A break that prints as a space when its group fits on the line. */
export const line: Doc = { kind: 'line', flat: ' ' }

/** A break that prints as nothing when its group fits on the line. */
export const softline: Doc = { kind: 'line', flat: '' }

/**
 * @description Marks a unit that is printed flat when it fits in the remaining
 * width, and with every one of its own breaks taken when it does not.
 */
export function group(...contents: Doc[]): Doc {
	return { kind: 'group', contents }
}

/** @description Indents the lines its breaks start by one more tab. */
export function indent(...contents: Doc[]): Doc {
	return { kind: 'indent', contents }
}

/** @description Text printed only when the enclosing group breaks. */
export function ifBreak(broken: string): Doc {
	return { kind: 'ifBreak', broken }
}

/** @description Places `separator` between each pair of `docs`. */
export function join(separator: Doc, docs: Doc[]): Doc {
	return docs.flatMap((doc, index) => (index === 0 ? [doc] : [separator, doc]))
}

type Mode = 'flat' | 'break'

/** A document still to print, at an indentation level, in a mode. */
interface Command {
	/** Tabs a line break inside this document starts with. */
	level: number
	/** Whether this document's breaks print flat or as newlines. */
	mode: Mode
	/** The document. */
	doc: Doc
}

/** @description Whether `command` is a line break taken as a newline. */
function isNewline({ doc, mode }: Command): boolean {
	return typeof doc === 'object' && !Array.isArray(doc) && doc.kind === 'line' && mode === 'break'
}

/**
 * @description The text a leaf document prints in its mode, or `undefined` for a
 * container. A line break taken as a newline is not a leaf here; see `isNewline`.
 */
function leafText({ doc, mode }: Command): string | undefined {
	if (typeof doc === 'string') {
		return doc
	}
	if (Array.isArray(doc) || doc.kind === 'group' || doc.kind === 'indent') {
		return undefined
	}
	if (doc.kind === 'ifBreak') {
		return mode === 'break' ? doc.broken : ''
	}
	return doc.flat
}

/**
 * @description The commands a container expands to, last part first so a stack
 * pops them in order. A group keeps the mode it is given; the printer decides
 * that mode before expanding it.
 */
function expand({ level, mode, doc }: Command): Command[] {
	if (Array.isArray(doc)) {
		return doc.map((part) => ({ level, mode, doc: part })).reverse()
	}
	if (typeof doc === 'object' && (doc.kind === 'group' || doc.kind === 'indent')) {
		return [{ level: doc.kind === 'indent' ? level + 1 : level, mode, doc: doc.contents }]
	}
	return []
}

/**
 * @description Whether `next`, printed flat, fits in `width` columns before
 * the first line break that the commands after it would take anyway.
 */
function fits(next: Command, rest: Command[], width: number): boolean {
	let remaining = width
	const stack: Command[] = [next]
	let restIndex = rest.length - 1

	while (remaining >= 0) {
		// Everything after `next` keeps the mode it was queued in; `next` is measured flat.
		const command = stack.pop() ?? (restIndex >= 0 ? rest[restIndex--] : undefined)
		if (!command || isNewline(command)) {
			return true
		}

		const text = leafText(command)
		if (text === undefined) {
			stack.push(...expand(command))
		} else {
			remaining -= text.length
		}
	}
	return false
}

/**
 * @description Prints `doc`, starting on a line indented by `level` tabs.
 * @param doc - the document to print
 * @param level - the indentation of the first line and the base for every break
 * @returns the text, with the leading indentation included
 */
export function printDoc(doc: Doc, level = 0): string {
	const output: string[] = ['\t'.repeat(level)]
	let column = level * TAB_WIDTH
	const commands: Command[] = [{ level, mode: 'break', doc }]

	while (commands.length > 0) {
		const command = commands.pop() as Command

		if (isNewline(command)) {
			output.push(`\n${'\t'.repeat(command.level)}`)
			column = command.level * TAB_WIDTH
			continue
		}

		const text = leafText(command)
		if (text !== undefined) {
			output.push(text)
			column += text.length
			continue
		}

		const current = command.doc
		if (typeof current === 'object' && !Array.isArray(current) && current.kind === 'group') {
			const flat: Command = { ...command, mode: 'flat' }
			const fitsFlat = command.mode === 'flat' || fits(flat, commands, LINE_WIDTH - column)
			commands.push(...expand(fitsFlat ? flat : { ...command, mode: 'break' }))
			continue
		}
		commands.push(...expand(command))
	}

	return output.join('')
}

/** @description `Name<arg>`, breaking inside the angle brackets when it is too long. */
export function typeArguments(name: string, argument: Doc): Doc {
	return group(name, '<', indent(softline, argument), softline, '>')
}

/** @description `left & right`, continuing `right` on the next, deeper line when too long. */
export function intersection(left: Doc, right: Doc): Doc {
	return group(left, ' &', indent(line, right))
}

/**
 * @description `import type { a, b } from 'source'`. One specifier never breaks,
 * as in Biome; several go one per line when the statement is too long.
 */
export function typeImport(specifiers: string[], source: string): Doc {
	if (specifiers.length === 1) {
		return `import type { ${specifiers[0]} } from '${source}'`
	}
	return group(
		'import type {',
		indent(line, join([',', line], specifiers)),
		line,
		`} from '${source}'`
	)
}

/**
 * @description `export type Name = 'a' | 'b'` over string-literal members: when it
 * is too long the members move below `=`, each led by `| ` when there are several.
 */
export function literalUnionAlias(declaration: string, members: string[]): Doc {
	const leader = members.length > 1 ? ifBreak('| ') : ''
	return group(`${declaration} =`, indent(line, leader, join([line, '| '], members)))
}
