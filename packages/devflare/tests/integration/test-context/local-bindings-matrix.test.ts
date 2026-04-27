import { afterAll, describe, expect, test } from 'bun:test'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'pathe'
import { env } from '../../../src'
import { writeLocalSecret } from '../../../src/secrets/local-secrets'
import { cf, createTestContext } from '../../../src/test'

const tempDirs: string[] = []
const PNG_1X1_BASE64 =
	'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII='

afterAll(async () => {
	for (const tempDir of tempDirs) {
		await rm(tempDir, { recursive: true, force: true })
	}
})

async function createMatrixProject(): Promise<string> {
	const projectDir = await mkdtemp(join(tmpdir(), 'devflare-local-bindings-matrix-'))
	tempDirs.push(projectDir)

	await mkdir(join(projectDir, 'src'), { recursive: true })
	await writeFile(
		join(projectDir, 'package.json'),
		JSON.stringify(
			{
				name: 'devflare-local-bindings-matrix',
				private: true,
				type: 'module'
			},
			null,
			2
		)
	)
	await writeFile(
		join(projectDir, 'devflare.config.ts'),
		`
export default {
	name: 'devflare-local-bindings-matrix',
	compatibilityDate: '2026-04-27',
	files: {
		fetch: 'src/fetch.ts',
		workflows: 'src/wf.*.ts'
	},
	secretsStoreId: 'store-local',
	bindings: {
		hyperdrive: {
			POSTGRES: {
				id: 'hyperdrive-local',
				localConnectionString: 'postgres://user:pass@localhost:5432/app'
			}
		},
		workerLoaders: {
			WORKER_LOADER: {}
		},
		workflows: {
			ORDER_WORKFLOW: {
				name: 'orders',
				className: 'OrderWorkflow'
			}
		},
		images: {
			IMAGES_SERVICE: true
		},
		media: {
			MEDIA_SERVICE: true
		},
		secretsStore: {
			API_TOKEN: 'api-token'
		},
		sendEmail: {
			EMAIL: {
				destinationAddress: 'recipient@example.com',
				allowedSenderAddresses: ['sender@example.com']
			}
		}
	}
}
`.trim()
	)
	await writeFile(
		join(projectDir, 'src', 'wf.order.ts'),
		`
import { WorkflowEntrypoint } from 'cloudflare:workers'

export class OrderWorkflow extends WorkflowEntrypoint {
	async run(event, step) {
		await step.do('record order', async () => ({
			orderId: event.payload.orderId,
			total: event.payload.total
		}))
	}
}
`.trim()
	)
	await writeFile(
		join(projectDir, 'src', 'fetch.ts'),
		`
const PNG_1X1_BASE64 = '${PNG_1X1_BASE64}'

function streamFromText(text) {
	return new Response(text).body
}

function streamFromBase64(base64) {
	const bytes = Uint8Array.from(atob(base64), (char) => char.charCodeAt(0))
	return new Response(bytes).body
}

export default {
	async fetch(_request, env, _ctx) {
		const workflow = await env.ORDER_WORKFLOW.create({
			id: 'order-1',
			params: { orderId: 'order-1', total: 42 }
		})
		const workflowStatus = await workflow.status()

		const imageInfo = await env.IMAGES_SERVICE.info(streamFromBase64(PNG_1X1_BASE64))
		const imageTransformer = await env.IMAGES_SERVICE.input(streamFromBase64(PNG_1X1_BASE64))
		const transformedImage = await imageTransformer.transform({ width: 1 })
		const imageOutput = await transformedImage.output({ format: 'image/png' })
		const imageResponse = await imageOutput.response()

		const mediaTransformer = await env.MEDIA_SERVICE.input(streamFromText('local media payload'))
		const mediaOutput = await mediaTransformer.output({ format: 'video/mp4' })
		const mediaResponse = await mediaOutput.response()

		await env.EMAIL.send({
			from: 'sender@example.com',
			to: 'recipient@example.com',
			subject: 'Local binding matrix',
			text: 'Sent through the local Send Email binding'
		})

		const loadedWorker = await env.WORKER_LOADER.load({
			compatibilityDate: '2026-04-27',
			mainModule: 'worker.js',
			modules: {
				'worker.js': {
					js: "export default { async fetch() { return new Response('loader-ok') } }"
				}
			}
		})
		const loadedEntrypoint = loadedWorker.getEntrypoint()
		const loadedResponse = await loadedEntrypoint.fetch('https://example.com/')

		return Response.json({
			secret: await env.API_TOKEN.get(),
			hyperdrive: {
				connectionString: env.POSTGRES.connectionString,
				database: env.POSTGRES.database
			},
			workflow: {
				id: workflow.id,
				status: workflowStatus.status
			},
			images: {
				width: imageInfo.width,
				contentType: await imageOutput.contentType(),
				status: imageResponse.status
			},
			media: {
				contentType: await mediaOutput.contentType(),
				status: mediaResponse.status
			},
			workerLoader: {
				status: loadedResponse.status,
				text: await loadedResponse.text()
			},
			email: 'sent'
		})
	}
}
`.trim()
	)

	writeLocalSecret({
		cwd: projectDir,
		storeId: 'store-local',
		name: 'api-token',
		value: 'secret-value'
	})

	return projectDir
}

describe('createTestContext local binding matrix', () => {
	test('runs local shims and Miniflare bindings for offline-first Cloudflare features', async () => {
		const projectDir = await createMatrixProject()
		const runtimeEnv = env as typeof env & {
			dispose(): Promise<void>
		}

		await createTestContext(join(projectDir, 'devflare.config.ts'))

		try {
			const response = await cf.worker.get('/matrix')
			expect(response.status).toBe(200)
			const payload = await response.json() as {
				secret: string
				hyperdrive: { connectionString: string; database: string }
				workflow: { id: string; status: string }
				images: { width: number; contentType: string; status: number }
				media: { contentType: string; status: number }
				workerLoader: { status: number; text: string }
				email: string
			}

			expect(payload.secret).toBe('secret-value')
			expect(payload.hyperdrive).toEqual({
				connectionString: 'postgres://user:pass@localhost:5432/app',
				database: 'app'
			})
			expect(payload.workflow.id).toBe('order-1')
			expect(['queued', 'running', 'complete', 'waiting']).toContain(payload.workflow.status)
			expect(payload.images).toEqual({
				width: 1,
				contentType: 'image/png',
				status: 200
			})
			expect(payload.media).toEqual({
				contentType: 'video/mp4',
				status: 200
			})
			expect(payload.workerLoader).toEqual({
				status: 200,
				text: 'loader-ok'
			})
			expect(payload.email).toBe('sent')
		} finally {
			await runtimeEnv.dispose()
		}
	})
})
