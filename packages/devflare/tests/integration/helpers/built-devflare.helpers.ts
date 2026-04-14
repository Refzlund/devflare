import { cp, mkdir, rm } from 'node:fs/promises'
import { createServer } from 'node:net'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'pathe'

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), '../../../')
let buildPromise: Promise<void> | null = null

export interface InstallBuiltDevflareOptions {
	includeBin?: boolean
	runtimeDependencies?: readonly string[]
}

export async function ensurePackageBuilt(): Promise<void> {
	if (!buildPromise) {
		buildPromise = (async () => {
			const build = Bun.spawn(['bun', 'run', 'build'], {
				cwd: packageRoot,
				stdout: 'pipe',
				stderr: 'pipe'
			})

			const [stdout, stderr, exitCode] = await Promise.all([
				new Response(build.stdout).text(),
				new Response(build.stderr).text(),
				build.exited
			])

			if (exitCode !== 0) {
				throw new Error([
					'Package build failed',
					stdout.trim(),
					stderr.trim()
				].filter(Boolean).join('\n\n'))
			}
		})()
	}

	await buildPromise
}

export async function installBuiltDevflare(
	projectDir: string,
	options: InstallBuiltDevflareOptions = {}
): Promise<void> {
	await ensurePackageBuilt()

	await mkdir(join(projectDir, 'node_modules'), { recursive: true })

	const packagedDevflareDir = join(projectDir, 'node_modules', 'devflare')
	await mkdir(packagedDevflareDir, { recursive: true })
	await cp(join(packageRoot, 'package.json'), join(packagedDevflareDir, 'package.json'))
	await cp(join(packageRoot, 'dist'), join(packagedDevflareDir, 'dist'), { recursive: true })

	if (options.includeBin) {
		await cp(join(packageRoot, 'bin'), join(packagedDevflareDir, 'bin'), { recursive: true })
	}

	for (const dependencyName of options.runtimeDependencies ?? []) {
		await cp(
			join(packageRoot, 'node_modules', dependencyName),
			join(projectDir, 'node_modules', dependencyName),
			{ recursive: true, dereference: true }
		)
	}
}

export async function cleanupTempDirs(tempDirs: string[]): Promise<void> {
	for (const tempDir of tempDirs) {
		await rm(tempDir, { recursive: true, force: true })
	}
}

export async function getAvailablePort(): Promise<number> {
	return await new Promise((resolvePromise, rejectPromise) => {
		const server = createServer()

		server.on('error', rejectPromise)
		server.listen(0, '127.0.0.1', () => {
			const address = server.address()
			if (!address || typeof address === 'string') {
				server.close(() => rejectPromise(new Error('Could not determine an available port')))
				return
			}

			const { port } = address
			server.close((error) => {
				if (error) {
					rejectPromise(error)
					return
				}

				resolvePromise(port)
			})
		})
	})
}

export async function waitForText(
	getText: () => Promise<string>,
	expectedText: string,
	timeoutMs = 8000
): Promise<string> {
	const deadline = Date.now() + timeoutMs
	let lastText = ''
	let lastError: unknown = null

	while (Date.now() < deadline) {
		try {
			const text = await getText()
			lastText = text
			if (text === expectedText) {
				return text
			}
			lastError = new Error(`Expected "${expectedText}", received "${text}"`)
		} catch (error) {
			lastError = error
		}

		await new Promise((resolvePromise) => setTimeout(resolvePromise, 200))
	}

	if (lastError instanceof Error) {
		throw lastError
	}

	throw new Error(`Timed out waiting for "${expectedText}". Last value: "${lastText}"`)
}

export async function waitForResponseText(
	url: string,
	expectedText: string,
	timeoutMs = 8000
): Promise<string> {
	return await waitForText(async () => {
		const response = await fetch(url)
		return await response.text()
	}, expectedText, timeoutMs)
}
