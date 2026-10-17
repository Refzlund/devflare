import { describe, expect, test } from 'bun:test'
import {
	createContainerManager,
	getContainerSkipReason,
	stopActiveContainers
} from '../../../src/test'

const DEFAULT_CONTAINER_IMAGE = 'ghcr.io/microsoft/magentic-ui-python-env:0.0.1'

// Resolve the skip reason once, at module load, so the real-engine path is
// reported as an explicit skip (test.skipIf) rather than a silent pass. A bare
// `return` inside the test body would make a green run falsely imply the
// engine-backed path was exercised.
const containerSkipReason = await getContainerSkipReason({
	engine: (process.env.DEVFLARE_CONTAINER_ENGINE as 'docker' | 'podman' | undefined) ?? 'auto'
})

if (containerSkipReason) {
	console.warn(`[devflare] skipping local container integration test: ${containerSkipReason}`)
}

describe('local container support', () => {
	test.skipIf(containerSkipReason !== null)(
		'launches a cached image offline and exposes fetch/state/log interaction APIs',
		async () => {
			const manager = createContainerManager({
				engine: (process.env.DEVFLARE_CONTAINER_ENGINE as 'docker' | 'podman' | undefined) ?? 'auto'
			})
			const image = process.env.DEVFLARE_CONTAINER_TEST_IMAGE ?? DEFAULT_CONTAINER_IMAGE
			const instance = await manager.start('PythonHttpServer', {
				image,
				port: 8080,
				entrypoint: ['python3'],
				command: ['-m', 'http.server', '8080', '--bind', '0.0.0.0'],
				offline: true,
				readyTimeoutMs: 30_000
			})

			try {
				const response = await instance.fetch('/')
				expect(response.status).toBe(200)
				expect(await response.text()).toContain('Directory listing')

				const state = await instance.getState()
				expect(state.running).toBe(true)

				const logs = await instance.logs()
				expect(logs).toContain('Serving HTTP')
			} finally {
				await instance.destroy()
				await stopActiveContainers()
			}
		},
		60_000
	)
})
