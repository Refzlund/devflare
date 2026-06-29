// =============================================================================
// Mock Stream + Flagship Bindings
// =============================================================================
// Deterministic, low-fidelity pure-test mocks for the Cloudflare Stream and
// Flagship bindings. The binding shape is faithful so app-level wiring/routing
// tests pass; operations whose real behavior is hosted Cloudflare (video
// upload/transcode, remote flag rules) throw a clear "not implemented locally"
// error rather than returning fake data, mirroring the Images hosted-API mock.
// =============================================================================

export interface MockStreamBindingOptions {
	/** Videos returned by `videos.list()` and `video(id).details()`. */
	videos?: StreamVideo[]
	/** Watermark profiles returned by `watermarks.list()`. */
	watermarks?: StreamWatermark[]
}

function unsupportedStreamOperation(operation: string): () => never {
	return () => {
		throw new Error(
			`Mock Stream binding does not implement ${operation}: video upload/transcode is a hosted Cloudflare Stream behavior. Use Cloudflare (devflare remote enable) or inject a custom StreamBinding through createMockEnv({ stream }).`
		)
	}
}

function createMockStreamVideoHandle(
	id: string,
	video: StreamVideo | undefined
): StreamVideoHandle {
	return {
		id,
		async details(): Promise<StreamVideo> {
			if (video) {
				return video
			}
			return unsupportedStreamOperation(`stream.video("${id}").details()`)()
		},
		update: unsupportedStreamOperation(`stream.video("${id}").update()`),
		delete: unsupportedStreamOperation(`stream.video("${id}").delete()`),
		generateToken: unsupportedStreamOperation(`stream.video("${id}").generateToken()`),
		downloads: {
			create: unsupportedStreamOperation(`stream.video("${id}").downloads.create()`),
			get: unsupportedStreamOperation(`stream.video("${id}").downloads.get()`),
			delete: unsupportedStreamOperation(`stream.video("${id}").downloads.delete()`)
		} as unknown as StreamScopedDownloads,
		captions: {
			list: async () => [],
			get: unsupportedStreamOperation(`stream.video("${id}").captions.get()`),
			update: unsupportedStreamOperation(`stream.video("${id}").captions.update()`),
			delete: unsupportedStreamOperation(`stream.video("${id}").captions.delete()`)
		} as unknown as StreamScopedCaptions
	} as StreamVideoHandle
}

/**
 * Creates a Stream binding for pure unit tests.
 */
export function createMockStreamBinding(options: MockStreamBindingOptions = {}): StreamBinding {
	const videos = options.videos ?? []
	const watermarks = options.watermarks ?? []

	return {
		video(id: string): StreamVideoHandle {
			return createMockStreamVideoHandle(
				id,
				videos.find((video) => video.id === id)
			)
		},
		upload: unsupportedStreamOperation('stream.upload()'),
		createDirectUpload: unsupportedStreamOperation('stream.createDirectUpload()'),
		videos: {
			async list(): Promise<StreamVideo[]> {
				return videos
			}
		} as StreamVideos,
		watermarks: {
			async list(): Promise<StreamWatermark[]> {
				return watermarks
			},
			generate: unsupportedStreamOperation('stream.watermarks.generate()'),
			get: unsupportedStreamOperation('stream.watermarks.get()'),
			delete: unsupportedStreamOperation('stream.watermarks.delete()')
		} as unknown as StreamWatermarks
	} as StreamBinding
}

export interface MockFlagshipBindingOptions {
	/**
	 * Flag values keyed by flag key. When a flag is present, the mock returns
	 * its value; otherwise it returns the caller-supplied default value with
	 * `reason: 'DEFAULT'`.
	 */
	flags?: Record<string, unknown>
}

/**
 * Creates a Flagship feature-flag binding for pure unit tests.
 *
 * Each getter returns the configured flag value when present, otherwise the
 * caller's default value. Detail getters report `reason: 'TARGETING_MATCH'`
 * when a configured value is used and `reason: 'DEFAULT'` otherwise.
 */
export function createMockFlagshipBinding(options: MockFlagshipBindingOptions = {}): Flagship {
	const flags = options.flags ?? {}

	const resolve = <T>(flagKey: string, defaultValue: T): { value: T; matched: boolean } => {
		if (Object.hasOwn(flags, flagKey)) {
			return { value: flags[flagKey] as T, matched: true }
		}
		return { value: defaultValue, matched: false }
	}

	const details = <T>(flagKey: string, defaultValue: T): FlagshipEvaluationDetails<T> => {
		const { value, matched } = resolve(flagKey, defaultValue)
		return {
			flagKey,
			value,
			reason: matched ? 'TARGETING_MATCH' : 'DEFAULT'
		}
	}

	return {
		async get(flagKey: string, defaultValue?: unknown): Promise<unknown> {
			return resolve(flagKey, defaultValue).value
		},
		async getBooleanValue(flagKey: string, defaultValue: boolean): Promise<boolean> {
			return resolve(flagKey, defaultValue).value
		},
		async getStringValue(flagKey: string, defaultValue: string): Promise<string> {
			return resolve(flagKey, defaultValue).value
		},
		async getNumberValue(flagKey: string, defaultValue: number): Promise<number> {
			return resolve(flagKey, defaultValue).value
		},
		async getObjectValue<T extends object>(flagKey: string, defaultValue: T): Promise<T> {
			return resolve(flagKey, defaultValue).value
		},
		async getBooleanDetails(
			flagKey: string,
			defaultValue: boolean
		): Promise<FlagshipEvaluationDetails<boolean>> {
			return details(flagKey, defaultValue)
		},
		async getStringDetails(
			flagKey: string,
			defaultValue: string
		): Promise<FlagshipEvaluationDetails<string>> {
			return details(flagKey, defaultValue)
		},
		async getNumberDetails(
			flagKey: string,
			defaultValue: number
		): Promise<FlagshipEvaluationDetails<number>> {
			return details(flagKey, defaultValue)
		},
		async getObjectDetails<T extends object>(
			flagKey: string,
			defaultValue: T
		): Promise<FlagshipEvaluationDetails<T>> {
			return details(flagKey, defaultValue)
		}
	} as Flagship
}
