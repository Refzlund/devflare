import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'pathe'
import {
	cleanupTempDirs,
	fetchTextWithTimeout,
	getAvailablePort,
	installBuiltDevflare,
	waitForText
} from '../helpers/built-devflare.helpers'

export { cleanupTempDirs, getAvailablePort, waitForText } from '../helpers/built-devflare.helpers'

export interface MultiSurfaceProjectOptions {
	prefix: string
	config: string
	files: Record<string, string>
}

export interface CapturedLogEntry {
	level: string
	message: string
}

export interface CapturedLogger {
	messages: CapturedLogEntry[]
	log: (...args: unknown[]) => void
	info: (...args: unknown[]) => void
	warn: (...args: unknown[]) => void
	error: (...args: unknown[]) => void
	success: (...args: unknown[]) => void
	debug: (...args: unknown[]) => void
}
export async function createProject(
	tempDirs: string[],
	options: MultiSurfaceProjectOptions
): Promise<string> {
	const projectDir = await mkdtemp(join(tmpdir(), options.prefix))
	tempDirs.push(projectDir)

	await installBuiltDevflare(projectDir)

	await writeFile(join(projectDir, 'package.json'), JSON.stringify({
		name: options.prefix,
		private: true,
		type: 'module'
	}, null, 2))

	await writeFile(join(projectDir, 'tsconfig.json'), JSON.stringify({
		compilerOptions: {
			target: 'ESNext',
			module: 'ESNext',
			moduleResolution: 'Bundler'
		}
	}, null, 2))

	await writeFile(join(projectDir, 'devflare.config.ts'), options.config)

	for (const [relativePath, content] of Object.entries(options.files)) {
		const absolutePath = join(projectDir, relativePath)
		await mkdir(dirname(absolutePath), { recursive: true })
		await writeFile(absolutePath, content)
	}

	return projectDir
}

export async function readWorkerText(url: string): Promise<string> {
	return await fetchTextWithTimeout(url)
}

function formatLogValue(value: unknown): string {
	if (typeof value === 'string') {
		return value
	}

	if (value instanceof Error) {
		return value.stack ?? value.message
	}

	try {
		return JSON.stringify(value) ?? String(value)
	} catch {
		return String(value)
	}
}

export function createCapturedLogger(): CapturedLogger {
	const messages: CapturedLogEntry[] = []
	const capture = (level: string) => (...args: unknown[]) => {
		messages.push({
			level,
			message: args.map((arg) => formatLogValue(arg)).join(' ')
		})
	}

	return {
		messages,
		log: capture('log'),
		info: capture('info'),
		warn: capture('warn'),
		error: capture('error'),
		success: capture('success'),
		debug: capture('debug')
	}
}

export async function waitForLogEntry(
	logger: CapturedLogger,
	expectedText: string,
	timeoutMs = 8000
): Promise<CapturedLogEntry> {
	const deadline = Date.now() + timeoutMs
	let lastSeen = ''

	while (Date.now() < deadline) {
		const matchedEntry = logger.messages.find((entry) => entry.message.includes(expectedText))
		if (matchedEntry) {
			return matchedEntry
		}

		lastSeen = logger.messages.map((entry) => `${entry.level}: ${entry.message}`).join('\n')
		await new Promise((resolvePromise) => setTimeout(resolvePromise, 200))
	}

	throw new Error(`Timed out waiting for log containing "${expectedText}". Captured logs:\n${lastSeen}`)
}
