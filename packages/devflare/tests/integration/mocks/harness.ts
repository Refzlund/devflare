// =============================================================================
// CLI Test Harness — Integration testing utilities
// =============================================================================

import { type Mock, mock } from 'bun:test'
import { type MockExeca, createEmptyMockExeca, createMockExeca } from './mock-execa'
import { type VirtualFileSystem, createVirtualFS } from './virtual-fs'

/**
 * Test harness configuration
 */
export interface TestHarnessOptions {
	/** Initial working directory */
	cwd?: string
	/** Pre-populate files */
	files?: Record<string, string>
	/** Use empty execa mock (no default handlers) */
	emptyExeca?: boolean
	/** Silent logger (suppress all output) */
	silent?: boolean
}

/**
 * Logger interface matching Consola
 */
export interface TestLogger {
	info: Mock<(...args: unknown[]) => void>
	warn: Mock<(...args: unknown[]) => void>
	error: Mock<(...args: unknown[]) => void>
	success: Mock<(...args: unknown[]) => void>
	debug: Mock<(...args: unknown[]) => void>
	log: Mock<(...args: unknown[]) => void>
	messages: Array<{ level: string; args: unknown[] }>
}

/**
 * Test harness for CLI integration tests
 */
export interface TestHarness {
	/** Virtual file system */
	fs: VirtualFileSystem
	/** Mock execa */
	execa: MockExeca
	/** Mock logger with captured messages */
	logger: TestLogger
	/** Current working directory */
	cwd: string
	/** Clean up and reset */
	reset: () => void
	/** Inject mocks into a module */
	withMocks: <T>(fn: () => T | Promise<T>) => Promise<T>
}

/**
 * Create a test logger that captures all messages
 */
function createTestLogger(silent = true): TestLogger {
	const messages: Array<{ level: string; args: unknown[] }> = []

	const createMethod = (level: string) => {
		return mock((...args: unknown[]) => {
			messages.push({ level, args })
			if (!silent) {
				console.log(`[${level}]`, ...args)
			}
		})
	}

	return {
		info: createMethod('info'),
		warn: createMethod('warn'),
		error: createMethod('error'),
		success: createMethod('success'),
		debug: createMethod('debug'),
		log: createMethod('log'),
		messages
	}
}

/**
 * Create a test harness for CLI integration tests
 */
export function createTestHarness(options: TestHarnessOptions = {}): TestHarness {
	const cwd = options.cwd || '/project'
	const fs = createVirtualFS()
	const execa = options.emptyExeca ? createEmptyMockExeca() : createMockExeca()
	const logger = createTestLogger(options.silent !== false)

	// Set up initial file system state
	fs.setCwd(cwd)

	// Pre-populate files
	if (options.files) {
		for (const [path, content] of Object.entries(options.files)) {
			fs.addFile(path.startsWith('/') ? path : `${cwd}/${path}`, content)
		}
	}

	const reset = () => {
		fs.reset()
		execa.reset()
		logger.messages.length = 0

		// Reset pre-populated files
		fs.setCwd(cwd)
		if (options.files) {
			for (const [path, content] of Object.entries(options.files)) {
				fs.addFile(path.startsWith('/') ? path : `${cwd}/${path}`, content)
			}
		}
	}

	const withMocks = async <T>(fn: () => T | Promise<T>): Promise<T> => {
		// Store original imports
		const originalFsImport = await import('node:fs/promises')
		const originalExeca = await import('execa')

		// Mock the modules
		// Note: In Bun, we need to use a different approach
		// We'll pass the mocks to the functions that need them

		try {
			return await fn()
		} finally {
			// Restore (handled by test isolation)
		}
	}

	return {
		fs,
		execa,
		logger,
		cwd,
		reset,
		withMocks
	}
}

/**
 * Create parsed args for testing commands
 */
export function createParsedArgs(
	command: string,
	args: string[] = [],
	options: Record<string, string | boolean> = {}
) {
	return {
		command,
		args,
		options
	}
}

/**
 * Standard project files for a devflare project
 */
export const STANDARD_PROJECT_FILES = {
	'package.json': JSON.stringify(
		{
			name: 'test-project',
			version: '0.0.1',
			type: 'module',
			dependencies: {},
			devDependencies: {
				devflare: '^0.1.0',
				vite: '^5.0.0',
				'@cloudflare/vite-plugin': '^1.0.0'
			}
		},
		null,
		2
	),
	'devflare.config.ts': `import { defineConfig } from 'devflare/config'

export default defineConfig({
	name: 'test-project',
	compatibilityDate: '2024-01-01',
	files: {
		fetch: 'src/fetch.ts'
	},
	bindings: {
		kv: { CACHE: 'cache-ns' },
		d1: { DB: 'my-database' }
	},
	vars: {
		API_URL: 'https://api.example.com'
	}
})
`,
	'tsconfig.json': JSON.stringify(
		{
			compilerOptions: {
				target: 'ESNext',
				module: 'ESNext',
				moduleResolution: 'bundler',
				strict: true
			}
		},
		null,
		2
	),
	'vite.config.ts': `import { defineConfig } from 'vite'
import { cloudflare } from '@cloudflare/vite-plugin'

export default defineConfig({
	plugins: [cloudflare()]
})
`,
	'src/fetch.ts': `export async function fetch(_request: Request): Promise<Response> {
	return new Response('Hello World!')
}
`
}

/**
 * Create a harness with standard project files
 */
export function createStandardProjectHarness(extraFiles?: Record<string, string>): TestHarness {
	return createTestHarness({
		files: {
			...STANDARD_PROJECT_FILES,
			...extraFiles
		}
	})
}
