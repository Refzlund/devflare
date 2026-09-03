// =============================================================================
// Mock Images Binding
// =============================================================================

export interface MockImagesBindingOptions {
	info?: ImageInfoResponse
	response?: Response
}

function createEmptyImageStream(): ReadableStream<Uint8Array> {
	return new ReadableStream<Uint8Array>({
		start(controller) {
			controller.close()
		}
	})
}

function createMockImageTransformationResult(response: Response): ImageTransformationResult {
	return {
		response(): Response {
			return response.clone()
		},
		contentType(): string {
			return response.headers.get('Content-Type') ?? 'image/png'
		},
		image(): ReadableStream<Uint8Array> {
			const cloned = response.clone()
			return cloned.body ?? createEmptyImageStream()
		}
	} as ImageTransformationResult
}

function createMockImageTransformer(response: Response): ImageTransformer {
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
		async output(_options: ImageOutputOptions): Promise<ImageTransformationResult> {
			return createMockImageTransformationResult(response)
		}
	}

	return transformer
}

function createMockHostedImagesBinding(): HostedImagesBinding {
	const unsupported = () => {
		throw new Error(
			'Mock Images hosted API is not implemented. Pass a custom ImagesBinding through createMockEnv({ images }) if your test needs hosted image behavior.'
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

/**
 * Creates an Images binding for pure unit tests.
 */
export function createMockImagesBinding(options: MockImagesBindingOptions = {}): ImagesBinding {
	const response =
		options.response ??
		new Response('', {
			headers: { 'Content-Type': 'image/png' }
		})
	const info = options.info ?? {
		format: response.headers.get('Content-Type') ?? 'image/png',
		fileSize: 0,
		width: 0,
		height: 0
	}

	return {
		async info(
			_stream: ReadableStream<Uint8Array>,
			_options?: ImageInputOptions
		): Promise<ImageInfoResponse> {
			return info
		},
		input(_stream: ReadableStream<Uint8Array>, _options?: ImageInputOptions): ImageTransformer {
			return createMockImageTransformer(response)
		},
		hosted: createMockHostedImagesBinding()
	} as ImagesBinding
}

// =============================================================================
// Mock Media Transformations Binding
// =============================================================================

export interface MockMediaBindingOptions {
	response?: Response
}

function createEmptyMediaStream(): ReadableStream<Uint8Array> {
	return new ReadableStream<Uint8Array>({
		start(controller) {
			controller.close()
		}
	})
}

function createMockMediaTransformationResult(response: Response): MediaTransformationResult {
	return {
		async media(): Promise<ReadableStream<Uint8Array>> {
			const cloned = response.clone()
			return cloned.body ?? createEmptyMediaStream()
		},
		async response(): Promise<Response> {
			return response.clone()
		},
		async contentType(): Promise<string> {
			return response.headers.get('Content-Type') ?? 'video/mp4'
		}
	} as MediaTransformationResult
}

function createMockMediaTransformer(response: Response): MediaTransformer {
	const transformer: MediaTransformer = {
		transform(_transform?: MediaTransformationInputOptions): MediaTransformationGenerator {
			return {
				output(_output?: MediaTransformationOutputOptions): MediaTransformationResult {
					return createMockMediaTransformationResult(response)
				}
			}
		},
		output(_output?: MediaTransformationOutputOptions): MediaTransformationResult {
			return createMockMediaTransformationResult(response)
		}
	}

	return transformer
}

/**
 * Creates a Media Transformations binding for pure unit tests.
 */
export function createMockMediaBinding(options: MockMediaBindingOptions = {}): MediaBinding {
	const response =
		options.response ??
		new Response('', {
			headers: { 'Content-Type': 'video/mp4' }
		})

	return {
		input(_media: ReadableStream<Uint8Array>): MediaTransformer {
			return createMockMediaTransformer(response)
		}
	} as MediaBinding
}
