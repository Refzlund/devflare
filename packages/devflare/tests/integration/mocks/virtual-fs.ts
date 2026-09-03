// =============================================================================
// Virtual File System — Deep mock for fs/promises
// =============================================================================

import type { MakeDirectoryOptions, PathLike, Stats } from 'node:fs'

/**
 * In-memory file system node
 */
interface FSNode {
	type: 'file' | 'directory'
	content?: string
	children?: Map<string, FSNode>
	mtime: Date
	mode: number
}

/**
 * Virtual File System for integration testing
 * Simulates fs operations in memory
 */
export class VirtualFileSystem {
	private root: FSNode = {
		type: 'directory',
		children: new Map(),
		mtime: new Date(),
		mode: 0o755
	}

	private cwd = '/'

	// Track all operations for assertions
	public operations: Array<{
		op: string
		path: string
		args?: unknown[]
	}> = []

	/**
	 * Normalize path separators and resolve relative paths
	 */
	private normalizePath(p: string | PathLike): string {
		let pathStr = String(p)

		// Normalize separators
		pathStr = pathStr.replace(/\\/g, '/')

		// Handle Windows-style paths (C:\...)
		if (/^[A-Za-z]:/.test(pathStr)) {
			pathStr = pathStr.substring(2) // Remove drive letter
		}

		// Make absolute if relative
		if (!pathStr.startsWith('/')) {
			pathStr = `${this.cwd}/${pathStr}`
		}

		// Resolve . and ..
		const parts = pathStr.split('/').filter(Boolean)
		const resolved: string[] = []

		for (const part of parts) {
			if (part === '..') {
				resolved.pop()
			} else if (part !== '.') {
				resolved.push(part)
			}
		}

		return '/' + resolved.join('/')
	}

	/**
	 * Get parts of a path
	 */
	private getPathParts(p: string): string[] {
		return p.split('/').filter(Boolean)
	}

	/**
	 * Navigate to a node, optionally creating directories
	 */
	private getNode(p: string, create = false): FSNode | null {
		const parts = this.getPathParts(p)
		let current = this.root

		for (let i = 0; i < parts.length; i++) {
			const part = parts[i]

			if (current.type !== 'directory' || !current.children) {
				return null
			}

			let child = current.children.get(part)

			if (!child) {
				if (create && i < parts.length - 1) {
					// Create intermediate directory
					child = {
						type: 'directory',
						children: new Map(),
						mtime: new Date(),
						mode: 0o755
					}
					current.children.set(part, child)
				} else if (!create) {
					return null
				}
			}

			if (child) {
				current = child
			} else {
				return null
			}
		}

		return current
	}

	/**
	 * Get parent directory node
	 */
	private getParentNode(p: string): { parent: FSNode; name: string } | null {
		const parts = this.getPathParts(p)
		if (parts.length === 0) return null

		const name = parts.pop()!
		const parentPath = '/' + parts.join('/')

		const parent = this.getNode(parentPath)
		if (!parent || parent.type !== 'directory') {
			return null
		}

		return { parent, name }
	}

	// =========================================================================
	// fs/promises API Implementation
	// =========================================================================

	async readFile(
		path: PathLike,
		options?: { encoding?: BufferEncoding } | BufferEncoding
	): Promise<string | Buffer> {
		const normalPath = this.normalizePath(path)
		this.operations.push({ op: 'readFile', path: normalPath })

		const node = this.getNode(normalPath)
		if (!node || node.type !== 'file') {
			const error = new Error(`ENOENT: no such file or directory, open '${normalPath}'`)
			;(error as NodeJS.ErrnoException).code = 'ENOENT'
			throw error
		}

		const encoding = typeof options === 'string' ? options : options?.encoding
		if (encoding) {
			return node.content || ''
		}
		return Buffer.from(node.content || '', 'utf-8')
	}

	async writeFile(
		path: PathLike,
		data: string | Buffer,
		_options?: { encoding?: BufferEncoding }
	): Promise<void> {
		const normalPath = this.normalizePath(path)
		this.operations.push({ op: 'writeFile', path: normalPath })

		// Get or create parent directory
		const parts = this.getPathParts(normalPath)
		const fileName = parts.pop()!
		const parentPath = '/' + parts.join('/')

		// Ensure parent exists
		await this.mkdir(parentPath, { recursive: true }).catch(() => {})

		const parentInfo = this.getParentNode(normalPath)
		if (!parentInfo) {
			const error = new Error(`ENOENT: no such file or directory, open '${normalPath}'`)
			;(error as NodeJS.ErrnoException).code = 'ENOENT'
			throw error
		}

		parentInfo.parent.children!.set(fileName, {
			type: 'file',
			content: typeof data === 'string' ? data : data.toString('utf-8'),
			mtime: new Date(),
			mode: 0o644
		})
	}

	async mkdir(path: PathLike, options?: MakeDirectoryOptions): Promise<string | undefined> {
		const normalPath = this.normalizePath(path)
		this.operations.push({
			op: 'mkdir',
			path: normalPath,
			args: [options]
		})

		const parts = this.getPathParts(normalPath)
		let current = this.root

		for (let i = 0; i < parts.length; i++) {
			const part = parts[i]

			if (current.type !== 'directory' || !current.children) {
				const error = new Error(`ENOTDIR: not a directory, mkdir '${normalPath}'`)
				;(error as NodeJS.ErrnoException).code = 'ENOTDIR'
				throw error
			}

			let child = current.children.get(part)

			if (!child) {
				if (options?.recursive || i === parts.length - 1) {
					child = {
						type: 'directory',
						children: new Map(),
						mtime: new Date(),
						mode: 0o755
					}
					current.children.set(part, child)
				} else {
					const error = new Error(`ENOENT: no such file or directory, mkdir '${normalPath}'`)
					;(error as NodeJS.ErrnoException).code = 'ENOENT'
					throw error
				}
			} else if (child.type !== 'directory') {
				const error = new Error(`EEXIST: file already exists, mkdir '${normalPath}'`)
				;(error as NodeJS.ErrnoException).code = 'EEXIST'
				throw error
			}

			current = child
		}

		return normalPath
	}

	async access(path: PathLike, _mode?: number): Promise<void> {
		const normalPath = this.normalizePath(path)
		this.operations.push({ op: 'access', path: normalPath })

		const node = this.getNode(normalPath)
		if (!node) {
			const error = new Error(`ENOENT: no such file or directory, access '${normalPath}'`)
			;(error as NodeJS.ErrnoException).code = 'ENOENT'
			throw error
		}
	}

	async stat(path: PathLike): Promise<Stats> {
		const normalPath = this.normalizePath(path)
		this.operations.push({ op: 'stat', path: normalPath })

		const node = this.getNode(normalPath)
		if (!node) {
			const error = new Error(`ENOENT: no such file or directory, stat '${normalPath}'`)
			;(error as NodeJS.ErrnoException).code = 'ENOENT'
			throw error
		}

		return {
			isFile: () => node.type === 'file',
			isDirectory: () => node.type === 'directory',
			isBlockDevice: () => false,
			isCharacterDevice: () => false,
			isSymbolicLink: () => false,
			isFIFO: () => false,
			isSocket: () => false,
			dev: 0,
			ino: 0,
			mode: node.mode,
			nlink: 1,
			uid: 0,
			gid: 0,
			rdev: 0,
			size: node.content?.length || 0,
			blksize: 4096,
			blocks: 0,
			atimeMs: node.mtime.getTime(),
			mtimeMs: node.mtime.getTime(),
			ctimeMs: node.mtime.getTime(),
			birthtimeMs: node.mtime.getTime(),
			atime: node.mtime,
			mtime: node.mtime,
			ctime: node.mtime,
			birthtime: node.mtime
		} as Stats
	}

	async readdir(
		path: PathLike,
		options?: { withFileTypes?: boolean }
	): Promise<
		string[] | Array<{ name: string; isDirectory: () => boolean; isFile: () => boolean }>
	> {
		const normalPath = this.normalizePath(path)
		this.operations.push({ op: 'readdir', path: normalPath })

		const node = this.getNode(normalPath)
		if (!node || node.type !== 'directory') {
			const error = new Error(`ENOENT: no such file or directory, scandir '${normalPath}'`)
			;(error as NodeJS.ErrnoException).code = 'ENOENT'
			throw error
		}

		const entries = Array.from(node.children?.keys() || [])

		if (options?.withFileTypes) {
			return entries.map((name) => {
				const child = node.children!.get(name)!
				return {
					name,
					isDirectory: () => child.type === 'directory',
					isFile: () => child.type === 'file'
				}
			})
		}

		return entries
	}

	async rm(path: PathLike, options?: { recursive?: boolean; force?: boolean }): Promise<void> {
		const normalPath = this.normalizePath(path)
		this.operations.push({ op: 'rm', path: normalPath, args: [options] })

		const parentInfo = this.getParentNode(normalPath)
		if (!parentInfo) {
			if (options?.force) return
			const error = new Error(`ENOENT: no such file or directory, rm '${normalPath}'`)
			;(error as NodeJS.ErrnoException).code = 'ENOENT'
			throw error
		}

		const node = parentInfo.parent.children!.get(parentInfo.name)
		if (!node) {
			if (options?.force) return
			const error = new Error(`ENOENT: no such file or directory, rm '${normalPath}'`)
			;(error as NodeJS.ErrnoException).code = 'ENOENT'
			throw error
		}

		if (node.type === 'directory' && !options?.recursive) {
			const error = new Error(`EISDIR: illegal operation on a directory, rm '${normalPath}'`)
			;(error as NodeJS.ErrnoException).code = 'EISDIR'
			throw error
		}

		parentInfo.parent.children!.delete(parentInfo.name)
	}

	async unlink(path: PathLike): Promise<void> {
		const normalPath = this.normalizePath(path)
		this.operations.push({ op: 'unlink', path: normalPath })

		const parentInfo = this.getParentNode(normalPath)
		if (!parentInfo) {
			const error = new Error(`ENOENT: no such file or directory, unlink '${normalPath}'`)
			;(error as NodeJS.ErrnoException).code = 'ENOENT'
			throw error
		}

		const node = parentInfo.parent.children!.get(parentInfo.name)
		if (!node) {
			const error = new Error(`ENOENT: no such file or directory, unlink '${normalPath}'`)
			;(error as NodeJS.ErrnoException).code = 'ENOENT'
			throw error
		}

		if (node.type !== 'file') {
			const error = new Error(`EISDIR: illegal operation on a directory, unlink '${normalPath}'`)
			;(error as NodeJS.ErrnoException).code = 'EISDIR'
			throw error
		}

		parentInfo.parent.children!.delete(parentInfo.name)
	}

	async rename(oldPath: PathLike, newPath: PathLike): Promise<void> {
		const normalOld = this.normalizePath(oldPath)
		const normalNew = this.normalizePath(newPath)
		this.operations.push({
			op: 'rename',
			path: normalOld,
			args: [normalNew]
		})

		const oldParent = this.getParentNode(normalOld)
		if (!oldParent) {
			const error = new Error(`ENOENT: no such file or directory, rename '${normalOld}'`)
			;(error as NodeJS.ErrnoException).code = 'ENOENT'
			throw error
		}

		const node = oldParent.parent.children!.get(oldParent.name)
		if (!node) {
			const error = new Error(`ENOENT: no such file or directory, rename '${normalOld}'`)
			;(error as NodeJS.ErrnoException).code = 'ENOENT'
			throw error
		}

		// Ensure new parent exists
		const newParts = this.getPathParts(normalNew)
		const newName = newParts.pop()!
		const newParentPath = '/' + newParts.join('/')
		await this.mkdir(newParentPath, { recursive: true }).catch(() => {})

		const newParent = this.getParentNode(normalNew)
		if (!newParent) {
			const error = new Error(`ENOENT: no such file or directory, rename '${normalNew}'`)
			;(error as NodeJS.ErrnoException).code = 'ENOENT'
			throw error
		}

		// Move node
		oldParent.parent.children!.delete(oldParent.name)
		newParent.parent.children!.set(newName, node)
	}

	// =========================================================================
	// Utility Methods for Testing
	// =========================================================================

	/**
	 * Set the current working directory
	 */
	setCwd(path: string): void {
		this.cwd = this.normalizePath(path)
	}

	/**
	 * Pre-populate files for test setup
	 */
	addFile(path: string, content: string): void {
		const normalPath = this.normalizePath(path)
		const parts = this.getPathParts(normalPath)
		const fileName = parts.pop()!

		// Create parent directories
		let current = this.root
		for (const part of parts) {
			if (!current.children!.has(part)) {
				current.children!.set(part, {
					type: 'directory',
					children: new Map(),
					mtime: new Date(),
					mode: 0o755
				})
			}
			current = current.children!.get(part)!
		}

		// Add file
		current.children!.set(fileName, {
			type: 'file',
			content,
			mtime: new Date(),
			mode: 0o644
		})
	}

	/**
	 * Check if a file exists (sync, for assertions)
	 */
	exists(path: string): boolean {
		const normalPath = this.normalizePath(path)
		return this.getNode(normalPath) !== null
	}

	/**
	 * Get file content (sync, for assertions)
	 */
	getContent(path: string): string | null {
		const normalPath = this.normalizePath(path)
		const node = this.getNode(normalPath)
		if (!node || node.type !== 'file') return null
		return node.content || ''
	}

	/**
	 * List directory contents (sync, for assertions)
	 */
	list(path: string): string[] {
		const normalPath = this.normalizePath(path)
		const node = this.getNode(normalPath)
		if (!node || node.type !== 'directory') return []
		return Array.from(node.children?.keys() || [])
	}

	/**
	 * Clear all files and reset
	 */
	reset(): void {
		this.root = {
			type: 'directory',
			children: new Map(),
			mtime: new Date(),
			mode: 0o755
		}
		this.operations = []
		this.cwd = '/'
	}

	/**
	 * Get all recorded operations, optionally filtered
	 */
	getOperations(opFilter?: string): Array<{ type: string; path: string; args?: unknown[] }> {
		const ops = this.operations.map((o) => ({
			type: o.op,
			path: o.path,
			args: o.args
		}))

		if (opFilter) {
			return ops.filter((o) => o.type === opFilter)
		}

		return ops
	}

	/**
	 * Create the mock module that can replace 'node:fs/promises'
	 */
	createMock(): typeof import('node:fs/promises') {
		return {
			readFile: this.readFile.bind(this),
			writeFile: this.writeFile.bind(this),
			mkdir: this.mkdir.bind(this),
			access: this.access.bind(this),
			stat: this.stat.bind(this),
			readdir: this.readdir.bind(this),
			rm: this.rm.bind(this),
			unlink: this.unlink.bind(this),
			rename: this.rename.bind(this),
			// Additional stubs for completeness
			lstat: this.stat.bind(this),
			realpath: async (p: PathLike) => this.normalizePath(p),
			copyFile: async (src: PathLike, dest: PathLike) => {
				const content = await this.readFile(src, 'utf-8')
				await this.writeFile(dest, content as string)
			},
			appendFile: async (path: PathLike, data: string | Buffer) => {
				const existing = await this.readFile(path, 'utf-8').catch(() => '')
				await this.writeFile(path, (existing as string) + data.toString())
			}
		} as unknown as typeof import('node:fs/promises')
	}
}

/**
 * Create a virtual file system instance for testing
 */
export function createVirtualFS(): VirtualFileSystem {
	return new VirtualFileSystem()
}
