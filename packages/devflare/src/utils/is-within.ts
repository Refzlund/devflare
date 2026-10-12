import { isAbsolute, relative } from 'pathe'

/**
 * @description Whether `path` is `directory` itself or somewhere below it.
 * Segment-aware, so a child named `..foo` is within; and a path on another
 * drive is not, which `relative()` answers with an absolute path rather than
 * `../` — a bare `startsWith('..')` test reads both the wrong way.
 * @param directory - absolute directory
 * @param path - absolute file or directory path
 * @returns `true` when `path` does not leave `directory`
 */
export function isWithin(directory: string, path: string): boolean {
	const fromDirectory = relative(directory, path)
	return fromDirectory !== '..' && !fromDirectory.startsWith('../') && !isAbsolute(fromDirectory)
}
