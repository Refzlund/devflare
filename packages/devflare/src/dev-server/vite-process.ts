import { spawn, type ChildProcess } from 'node:child_process'
import type { ConsolaInstance } from 'consola'
import { waitForViteReady } from './vite-utils'

export interface StartViteProcessOptions {
	cwd: string
	vitePort: number
	miniflarePort: number
	generatedViteConfigPath: string | null
	logger?: ConsolaInstance
}

/**
 * Start the Vite dev server process.
 */
export async function startViteProcess(options: StartViteProcessOptions): Promise<ChildProcess> {
	const {
		cwd,
		vitePort,
		miniflarePort,
		generatedViteConfigPath,
		logger
	} = options

	const args = ['vite', 'dev', '--port', String(vitePort)]
	if (generatedViteConfigPath) {
		args.push('--config', generatedViteConfigPath)
	}

	const viteProcess = spawn('bunx', args, {
		cwd,
		stdio: ['inherit', 'pipe', 'pipe'],
		windowsHide: true,
		env: {
			...process.env,
			DEVFLARE_DEV: 'true',
			DEVFLARE_BRIDGE_PORT: String(miniflarePort),
			FORCE_COLOR: '1'
		}
	})

	const readyUrl = await waitForViteReady(viteProcess, {
		onStdout(chunk) {
			process.stdout.write(chunk)
		},
		onStderr(chunk) {
			process.stderr.write(chunk)
		}
	})

	if (readyUrl) {
		logger?.success(`Vite dev server started on ${readyUrl}`)
		return viteProcess
	}

	logger?.warn('Vite process started, but the final local URL could not be confirmed yet')
	return viteProcess
}
