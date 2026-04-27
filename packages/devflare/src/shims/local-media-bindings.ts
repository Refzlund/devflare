import type { DevflareConfig } from '../config'

type LocalMediaShimKind = 'images' | 'media'

function emptyNodeStream(): ReadableStream<Uint8Array> {
	return new ReadableStream<Uint8Array>({
		start(controller) {
			controller.close()
		}
	})
}

function normalizeNodeContentType(value: string | undefined, fallback: string): string {
	if (!value) return fallback
	if (value.includes('/')) return value
	if (value === 'jpg' || value === 'jpeg') return 'image/jpeg'
	if (value === 'png') return 'image/png'
	if (value === 'webp') return 'image/webp'
	if (value === 'avif') return 'image/avif'
	if (value === 'mp4') return 'video/mp4'
	return value
}

async function readNodeBytes(stream: ReadableStream<Uint8Array> | null | undefined): Promise<Uint8Array> {
	const buffer = await new Response(stream ?? emptyNodeStream()).arrayBuffer()
	return new Uint8Array(buffer)
}

function streamFromNodeBytes(bytes: Uint8Array): ReadableStream<Uint8Array> {
	const copy = new Uint8Array(bytes.byteLength)
	copy.set(bytes)
	return new Response(copy).body ?? emptyNodeStream()
}

function createUnsupportedHostedImagesBinding(): HostedImagesBinding {
	const unsupported = () => {
		throw new Error(
			'Devflare local Images hosted API is not implemented. Use transform/info APIs locally, or connect to Cloudflare for hosted image storage.'
		)
	}

	return {
		image(_imageId: string): ImageHandle {
			return {
				details: unsupported,
				bytes: unsupported,
				update: unsupported,
				delete: unsupported
			} as ImageHandle
		},
		upload: unsupported,
		list: unsupported
	} as HostedImagesBinding
}

function createNodeImageResult(bytes: Uint8Array, contentType: string): ImageTransformationResult {
	return {
		response(): Response {
			return new Response(streamFromNodeBytes(bytes), {
				headers: { 'Content-Type': contentType }
			})
		},
		contentType(): string {
			return contentType
		},
		image(): ReadableStream<Uint8Array> {
			return streamFromNodeBytes(bytes)
		}
	} as ImageTransformationResult
}

function createNodeImageTransformer(bytesPromise: Promise<Uint8Array>): ImageTransformer {
	const transformer: ImageTransformer = {
		transform(_transform: ImageTransform): ImageTransformer {
			return transformer
		},
		draw(
			_image: ReadableStream<Uint8Array> | ImageTransformer,
			_options?: ImageDrawOptions
		): ImageTransformer {
			return transformer
		},
		async output(options: ImageOutputOptions): Promise<ImageTransformationResult> {
			return createNodeImageResult(
				await bytesPromise,
				normalizeNodeContentType(options?.format, 'image/png')
			)
		}
	}

	return transformer
}

export function createLocalImagesBinding(): ImagesBinding {
	return {
		async info(stream: ReadableStream<Uint8Array>): Promise<ImageInfoResponse> {
			const bytes = await readNodeBytes(stream)
			return {
				format: 'image/png',
				fileSize: bytes.byteLength,
				width: 1,
				height: 1
			}
		},
		input(stream: ReadableStream<Uint8Array>): ImageTransformer {
			return createNodeImageTransformer(readNodeBytes(stream))
		},
		hosted: createUnsupportedHostedImagesBinding()
	} as ImagesBinding
}

function createNodeMediaResult(
	bytesPromise: Promise<Uint8Array>,
	contentType: string
): MediaTransformationResult {
	return {
		async media(): Promise<ReadableStream<Uint8Array>> {
			return streamFromNodeBytes(await bytesPromise)
		},
		async response(): Promise<Response> {
			return new Response(streamFromNodeBytes(await bytesPromise), {
				headers: { 'Content-Type': contentType }
			})
		},
		async contentType(): Promise<string> {
			return contentType
		}
	} as MediaTransformationResult
}

function createNodeMediaTransformer(bytesPromise: Promise<Uint8Array>): MediaTransformer {
	const output = (options: MediaTransformationOutputOptions = {}) =>
		createNodeMediaResult(
			bytesPromise,
			normalizeNodeContentType(options.format, 'video/mp4')
		)

	return {
		transform(_transform?: MediaTransformationInputOptions): MediaTransformationGenerator {
			return {
				output(options?: MediaTransformationOutputOptions): MediaTransformationResult {
					return output(options)
				}
			}
		},
		output(options?: MediaTransformationOutputOptions): MediaTransformationResult {
			return output(options)
		}
	} as MediaTransformer
}

export function createLocalMediaBinding(): MediaBinding {
	return {
		input(stream: ReadableStream<Uint8Array>): MediaTransformer {
			return createNodeMediaTransformer(readNodeBytes(stream))
		}
	} as MediaBinding
}

export interface LocalBindingShimServiceConfig {
	localBindingNames: string[]
	serviceBindings: Record<string, { name: string; entrypoint: string }>
	workers: Array<{
		name: string
		modules: true
		script: string
		compatibilityDate: string
		compatibilityFlags?: string[]
	}>
}

const LOCAL_MEDIA_BINDING_SCRIPT = `
import { RpcTarget, WorkerEntrypoint } from 'cloudflare:workers'

function emptyStream() {
	return new ReadableStream({
		start(controller) {
			controller.close()
		}
	})
}

function normalizeContentType(value, fallback) {
	if (typeof value !== 'string' || value.length === 0) return fallback
	if (value.includes('/')) return value
	if (value === 'jpg') return 'image/jpeg'
	if (value === 'jpeg') return 'image/jpeg'
	if (value === 'png') return 'image/png'
	if (value === 'webp') return 'image/webp'
	if (value === 'avif') return 'image/avif'
	if (value === 'mp4') return 'video/mp4'
	return value
}

async function readBytes(stream) {
	return await new Response(stream || emptyStream()).arrayBuffer()
}

function streamFromBytes(bytes) {
	return new Response(bytes.slice(0)).body || emptyStream()
}

function createBodyReader(bytes) {
	return function takeBody() {
		return streamFromBytes(bytes)
	}
}

class LocalImageResult extends RpcTarget {
	constructor(takeBody, contentType) {
		super()
		this.takeBody = takeBody
		this.contentTypeValue = contentType
	}

	response() {
		return new Response(this.takeBody(), {
			headers: { 'Content-Type': this.contentTypeValue }
		})
	}

	contentType() {
		return this.contentTypeValue
	}

	image() {
		return this.takeBody()
	}
}

class LocalImageTransformer extends RpcTarget {
	constructor(bytes) {
		super()
		this.takeBody = createBodyReader(bytes)
	}

	transform() {
		return this
	}

	draw() {
		return this
	}

	async output(options = {}) {
		return new LocalImageResult(
			this.takeBody,
			normalizeContentType(options.format, 'image/png')
		)
	}
}

function createHostedImagesBinding() {
	const unsupported = () => {
		throw new Error('Devflare local Images hosted API is not implemented. Use the transform/info APIs locally, or connect to Cloudflare for hosted image storage.')
	}
	return {
		image() {
			return {
				details: unsupported,
				bytes: unsupported,
				update: unsupported,
				delete: unsupported
			}
		},
		upload: unsupported,
		list: unsupported
	}
}

export class LocalImagesBinding extends WorkerEntrypoint {
	async info(stream) {
		const bytes = await readBytes(stream)
		return {
			format: 'image/png',
			fileSize: bytes.byteLength,
			width: 1,
			height: 1
		}
	}

	async input(stream) {
		return new LocalImageTransformer(await readBytes(stream))
	}

	get hosted() {
		return createHostedImagesBinding()
	}
}

class LocalMediaResult extends RpcTarget {
	constructor(takeBody, contentType) {
		super()
		this.takeBody = takeBody
		this.contentTypeValue = contentType
	}

	async media() {
		return this.takeBody()
	}

	async response() {
		return new Response(this.takeBody(), {
			headers: { 'Content-Type': this.contentTypeValue }
		})
	}

	async contentType() {
		return this.contentTypeValue
	}
}

class LocalMediaTransformationGenerator extends RpcTarget {
	constructor(takeBody) {
		super()
		this.takeBody = takeBody
	}

	output(options = {}) {
		return new LocalMediaResult(
			this.takeBody,
			normalizeContentType(options.format, 'video/mp4')
		)
	}
}

class LocalMediaTransformer extends RpcTarget {
	constructor(bytes) {
		super()
		this.takeBody = createBodyReader(bytes)
	}

	transform() {
		return new LocalMediaTransformationGenerator(this.takeBody)
	}

	output(options = {}) {
		return new LocalMediaResult(
			this.takeBody,
			normalizeContentType(options.format, 'video/mp4')
		)
	}
}

export class LocalMediaBinding extends WorkerEntrypoint {
	async input(stream) {
		return new LocalMediaTransformer(await readBytes(stream))
	}
}

export default {
	fetch() {
		return new Response('Devflare local Images/Media binding')
	}
}
`

function toLocalShimWorkerName(kind: LocalMediaShimKind, bindingName: string, index: number): string {
	const slug = bindingName
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '') || kind

	return `devflare-local-${kind}-${index}-${slug}`
}

function getEntrypoint(kind: LocalMediaShimKind): string {
	return kind === 'images' ? 'LocalImagesBinding' : 'LocalMediaBinding'
}

export function buildLocalBindingShimServiceConfig(
	config: Pick<DevflareConfig, 'bindings' | 'compatibilityDate' | 'compatibilityFlags'>
): LocalBindingShimServiceConfig {
	const entries: Array<{ bindingName: string; kind: LocalMediaShimKind }> = [
		...Object.keys(config.bindings?.images ?? {}).map((bindingName) => ({
			bindingName,
			kind: 'images' as const
		})),
		...Object.keys(config.bindings?.media ?? {}).map((bindingName) => ({
			bindingName,
			kind: 'media' as const
		}))
	]

	return {
		localBindingNames: entries.map((entry) => entry.bindingName),
		serviceBindings: Object.fromEntries(
			entries.map((entry, index) => {
				const workerName = toLocalShimWorkerName(entry.kind, entry.bindingName, index)
				return [
					entry.bindingName,
					{
						name: workerName,
						entrypoint: getEntrypoint(entry.kind)
					}
				]
			})
		),
		workers: entries.map((entry, index) => ({
			name: toLocalShimWorkerName(entry.kind, entry.bindingName, index),
			modules: true,
			script: LOCAL_MEDIA_BINDING_SCRIPT,
			compatibilityDate: config.compatibilityDate ?? '2025-01-01',
			...(config.compatibilityFlags && { compatibilityFlags: config.compatibilityFlags })
		}))
	}
}
