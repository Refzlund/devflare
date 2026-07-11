import { type ChildProcess, spawn } from 'node:child_process'
import type { ConsolaInstance } from 'consola'
import { waitForViteReady } from './vite-utils'

export interface StartViteProcessOptions {
	cwd: string
	configPath?: string
	vitePort: number
	miniflarePort: number
	generatedViteConfigPath: string | null
	/**
	 * Local R2 presign context, exposed to the app process as
	 * `DEVFLARE_R2_PRESIGN_SECRET`/`DEVFLARE_R2_PRESIGN_ORIGIN` so
	 * `presignR2Put`/`presignR2Get` mint gateway-local URLs in dev.
	 */
	r2Presign?: { secret: string; origin: string } | null
	logger?: ConsolaInstance
}

/**
 * Start the Vite dev server process.
 */
export async function startViteProcess(options: StartViteProcessOptions): Promise<ChildProcess> {
	const { cwd, configPath, vitePort, miniflarePort, generatedViteConfigPath, r2Presign, logger } =
		options

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
			...(configPath ? { DEVFLARE_CONFIG_PATH: configPath } : {}),
			...(r2Presign
				? {
						DEVFLARE_R2_PRESIGN_SECRET: r2Presign.secret,
						DEVFLARE_R2_PRESIGN_ORIGIN: r2Presign.origin
					}
				: {}),
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
