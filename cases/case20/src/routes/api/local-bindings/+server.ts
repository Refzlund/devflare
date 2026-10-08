import { env } from 'cloudflare:workers'
import type { RequestHandler } from './$types'

const PNG_1X1_BASE64 =
	'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII='

/**
 * A stream as the bindings name it. SvelteKit's type environment declares the global
 * `ReadableStream` from Node's types as well as workers-types, and that merged global is
 * not assignable to the workers-types class the binding signatures import. At runtime
 * they are one and the same stream.
 */
type BindingStream = Parameters<typeof env.IMAGES_SERVICE.info>[0]

function streamFromBytes(bytes: Uint8Array<ArrayBuffer> | string): BindingStream {
	return new Response(bytes).body as unknown as BindingStream
}

function streamFromBase64(base64: string): BindingStream {
	return streamFromBytes(Uint8Array.from(atob(base64), (char) => char.charCodeAt(0)))
}

export const GET: RequestHandler = async () => {
	const workflow = await env.ORDER_WORKFLOW.create({
		id: 'case20-order-1',
		params: { orderId: 'case20-order-1', total: 42 }
	})
	const workflowStatus = await workflow.status()

	const imageInfo = await env.IMAGES_SERVICE.info(streamFromBase64(PNG_1X1_BASE64))
	const imageOutput = await env.IMAGES_SERVICE.input(streamFromBase64(PNG_1X1_BASE64))
		.transform({ width: 1 })
		.output({ format: 'image/png' })
	const imageResponse = imageOutput.response()

	const mediaOutput = env.MEDIA_SERVICE.input(streamFromBytes('case20 media payload')).output({
		mode: 'video'
	})
	const mediaResponse = await mediaOutput.response()

	await env.EMAIL.send({
		from: 'sender@example.com',
		to: 'recipient@example.com',
		subject: 'Case 20 local binding probe',
		text: 'Sent through the local Send Email binding'
	})

	const loadedWorker = env.WORKER_LOADER.load({
		compatibilityDate: '2026-04-27',
		mainModule: 'worker.js',
		modules: {
			'worker.js': {
				js: "export default { async fetch() { return new Response('case20-loader-ok') } }"
			}
		}
	})
	const loadedResponse = await loadedWorker.getEntrypoint().fetch('https://example.com/')

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
			width: 'width' in imageInfo ? imageInfo.width : null,
			contentType: imageOutput.contentType(),
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
