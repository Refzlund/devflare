import type { DocCodeSnippet, DocCodeTreeEntry } from '$lib/docs/types'
import {
	createStructureEntryFromPattern,
	inferConfigContextEntries,
	isDevflareConfigPath,
	isTypeAwarePath
} from './config'
import { resolveFileIconClass } from './language'
import { basename, normalizePath } from './path'
import type { NormalizedCodeFile, TreeNodeState } from './types'

export function resolveInitialActiveFile(
	requestedPath: string | undefined,
	files: NormalizedCodeFile[]
): string {
	if (requestedPath) {
		const normalizedRequestedPath = normalizePath(requestedPath)
		const match = files.find((file) => file.path === normalizedRequestedPath)
		if (match) {
			return match.path
		}
	}

	return files[0]?.path ?? '__snippet__0'
}

export function resolveStructureEntries(
	snippet: DocCodeSnippet,
	files: NormalizedCodeFile[]
): DocCodeTreeEntry[] | undefined {
	if (snippet.structure?.length) {
		return snippet.structure
	}

	return buildImplicitStructureEntries(files)
}

function buildImplicitStructureEntries(files: NormalizedCodeFile[]): DocCodeTreeEntry[] {
	const filesWithPaths = files.filter(
		(file): file is NormalizedCodeFile & { displayPath: string } => {
			return Boolean(file.displayPath)
		}
	)

	if (filesWithPaths.length === 0) {
		return []
	}

	const entries: DocCodeTreeEntry[] = []
	const seenPaths = new Set<string>()
	const actualPaths = new Set(filesWithPaths.map((file) => file.path))
	const configFile = filesWithPaths.find((file) => isDevflareConfigPath(file.path))
	const hasSourceFile = filesWithPaths.some((file) => file.path.startsWith('src/'))
	const hasTestFile = filesWithPaths.some((file) => file.path.startsWith('tests/'))
	const hasEnvFile = actualPaths.has('env.d.ts')
	const hasProjectContext = Boolean(configFile) || hasSourceFile || hasTestFile || hasEnvFile
	const shouldShowEnvFile =
		hasProjectContext && filesWithPaths.some((file) => isTypeAwarePath(file.path))

	function addEntry(entry: DocCodeTreeEntry | undefined): void {
		if (!entry) {
			return
		}

		const path = normalizePath(entry.path)
		if (!path || seenPaths.has(path)) {
			return
		}

		seenPaths.add(path)
		entries.push({
			...entry,
			path
		})
	}

	if (configFile) {
		addEntry({ path: configFile.path })
	} else if (hasProjectContext) {
		addEntry({ path: 'devflare.config.ts', muted: true })
	}

	if (configFile) {
		for (const entry of inferConfigContextEntries(configFile.code)) {
			if (!actualPaths.has(entry.path)) {
				addEntry({
					...entry,
					muted: true
				})
			}
		}
	}

	if (hasTestFile && !hasSourceFile) {
		addEntry({ path: 'src/fetch.ts', muted: true })
	}

	for (const file of filesWithPaths) {
		if (isDevflareConfigPath(file.path) || file.path === 'env.d.ts') {
			continue
		}

		addEntry({ path: file.path })
	}

	if (hasEnvFile) {
		addEntry({ path: 'env.d.ts' })
	} else if (shouldShowEnvFile) {
		addEntry({ path: 'env.d.ts', muted: true })
	}

	return entries
}

export function normalizeStructure(
	entries: DocCodeTreeEntry[] | undefined,
	files: NormalizedCodeFile[],
	activeFile: string
): TreeNodeState[] {
	if (!entries?.length) {
		return []
	}

	const nodes = new Map<string, TreeNodeState>()
	const order: string[] = []
	const filePaths = new Set(files.map((file) => file.path))
	const pathsWithChildren = new Set<string>()
	const referencedPaths = [
		...entries.map((entry) => normalizePath(entry.path)),
		...files.map((file) => file.displayPath).filter((path): path is string => Boolean(path))
	]

	for (const referencedPath of referencedPaths) {
		const segments = referencedPath.split('/').filter(Boolean)
		let currentPath = ''

		for (const segment of segments.slice(0, -1)) {
			currentPath = currentPath ? `${currentPath}/${segment}` : segment
			pathsWithChildren.add(currentPath)
		}
	}

	const ensureNode = (
		path: string,
		kind: 'file' | 'folder',
		muted: boolean,
		available: boolean
	) => {
		const normalizedPath = normalizePath(path)
		const existing = nodes.get(normalizedPath)
		const nextNode: TreeNodeState = {
			path: normalizedPath,
			kind,
			muted,
			available,
			active: kind === 'file' && normalizedPath === activeFile,
			depth: normalizedPath.split('/').filter(Boolean).length - 1,
			name: basename(normalizedPath),
			iconClass: kind === 'file' ? resolveFileIconClass(normalizedPath) : undefined
		}

		if (existing) {
			nodes.set(normalizedPath, {
				...existing,
				kind,
				muted: existing.muted && muted,
				available: existing.available || available,
				active: existing.active || nextNode.active,
				iconClass: kind === 'file' ? (nextNode.iconClass ?? existing.iconClass) : existing.iconClass
			})
			return
		}

		order.push(normalizedPath)
		nodes.set(normalizedPath, nextNode)
	}

	for (const entry of entries) {
		const normalizedPath = normalizePath(entry.path)
		const segments = normalizedPath.split('/').filter(Boolean)
		let currentPath = ''

		for (const [index, segment] of segments.entries()) {
			currentPath = currentPath ? `${currentPath}/${segment}` : segment
			const isLastSegment = index === segments.length - 1
			const kind = isLastSegment
				? (entry.kind ?? (pathsWithChildren.has(currentPath) ? 'folder' : 'file'))
				: 'folder'
			ensureNode(
				currentPath,
				kind,
				isLastSegment ? Boolean(entry.muted) : false,
				filePaths.has(currentPath)
			)
		}
	}

	for (const file of files) {
		if (!file.displayPath) {
			continue
		}

		const segments = file.path.split('/').filter(Boolean)
		let currentPath = ''

		for (const [index, segment] of segments.entries()) {
			currentPath = currentPath ? `${currentPath}/${segment}` : segment
			ensureNode(
				currentPath,
				index === segments.length - 1 ? 'file' : 'folder',
				false,
				filePaths.has(currentPath)
			)
		}
	}

	return order.map((path) => nodes.get(path)!).filter(Boolean)
}
