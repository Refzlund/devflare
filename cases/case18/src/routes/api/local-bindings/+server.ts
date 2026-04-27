import type { RequestHandler } from './$types'
import { env } from 'devflare'

const PNG_1X1_BASE64 =
	'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII='

function streamFromText(text: string): ReadableStream<Uint8Array> {
	return new Response(text).body!
}

function streamFromBase64(base64: string): ReadableStream<Uint8Array> {
	const bytes = Uint8Array.from(atob(base64), (char) => char.charCodeAt(0))
	return new Response(bytes).body!
}

export const GET: RequestHandler = async () => {
	const workflow = await env.ORDER_WORKFLOW.create({
		id: 'case18-order-1',
		params: { orderId: 'case18-order-1', total: 42 }
	})
	const workflowStatus = await workflow.status()

	const imageInfo = await env.IMAGES_SERVICE.info(streamFromBase64(PNG_1X1_BASE64))
	const imageTransformer = await env.IMAGES_SERVICE.input(streamFromBase64(PNG_1X1_BASE64))
	const transformedImage = await imageTransformer.transform({ width: 1 })
	const imageOutput = await transformedImage.output({ format: 'image/png' })
	const imageResponse = await imageOutput.response()

	const mediaTransformer = await env.MEDIA_SERVICE.input(streamFromText('case18 media payload'))
	const mediaOutput = await mediaTransformer.output({ format: 'video/mp4' })
	const mediaResponse = await mediaOutput.response()

	await env.EMAIL.send({
		from: 'sender@example.com',
		to: 'recipient@example.com',
		subject: 'Case 18 local binding probe',
		text: 'Sent through the local Send Email binding'
	})

	const loadedWorker = await env.WORKER_LOADER.load({
		compatibilityDate: '2026-04-27',
		mainModule: 'worker.js',
		modules: {
			'worker.js': {
				js: "export default { async fetch() { return new Response('case18-loader-ok') } }"
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
