// =============================================================================
// AI Search Test Mocks
// =============================================================================
// Deterministic, in-memory AI Search bindings for pure unit tests. These mocks
// exercise application control flow without pretending to reproduce Cloudflare's
// hosted indexing, ranking, crawling, or model behavior.
// =============================================================================

type AISearchChunk = AiSearchSearchResponse['chunks'][number]
type AISearchMultiChunk = AiSearchMultiSearchResponse['chunks'][number]

export interface MockAISearchItemFixture {
	id?: string
	key: string
	content?: string
	contentType?: string
	metadata?: Record<string, unknown>
	status?: AiSearchItemInfo['status']
	chunks?: string[]
}

export interface MockAISearchInstanceOptions {
	id?: string
	namespace?: string
	info?: Partial<AiSearchInstanceInfo>
	items?: MockAISearchItemFixture[]
	chatMessage?:
		| string
		| ((chunks: AISearchChunk[], request: AiSearchChatCompletionsRequest) => string)
}

export interface MockAISearchNamespaceOptions {
	namespace?: string
	instances?: Record<string, MockAISearchInstanceOptions | AiSearchInstance>
}

export type MockAISearchInstance = AiSearchInstance & {
	_getSearches(): AiSearchSearchRequest[]
	_getItems(): AiSearchItemInfo[]
	_getJobs(): AiSearchJobInfo[]
}

export type MockAISearchNamespace = AiSearchNamespace & {
	_getInstances(): string[]
}

interface StoredAISearchItem {
	info: AiSearchItemInfo
	content: string
	contentType: string
	chunks: AiSearchItemChunk[]
	logs: AiSearchItemLog[]
}

const MOCK_TIMESTAMP = '2026-04-26T00:00:00.000Z'

function cloneInfo<T extends Record<string, unknown>>(value: T): T {
	return { ...value }
}

function extractSearchQuery(params: AiSearchSearchRequest | AiSearchMultiSearchRequest): string {
	if ('query' in params && typeof params.query === 'string') {
		return params.query
	}

	const messages = 'messages' in params ? params.messages : []
	return messages
		.filter((message) => message.role === 'user' && message.content)
		.map((message) => message.content)
		.join(' ')
}

function tokenize(value: string): string[] {
	return value
		.toLowerCase()
		.split(/[^a-z0-9_]+/)
		.filter((token) => token.length > 2)
}

function scoreText(query: string, text: string): number {
	const tokens = tokenize(query)
	if (tokens.length === 0) {
		return 1
	}

	const haystack = text.toLowerCase()
	const matches = tokens.filter((token) => haystack.includes(token)).length
	return matches === 0 ? 0 : Math.max(0.1, matches / tokens.length)
}

function streamFromText(text: string): ReadableStream<Uint8Array> {
	const encoded = new TextEncoder().encode(text)
	return new ReadableStream<Uint8Array>({
		start(controller) {
			controller.enqueue(encoded)
			controller.close()
		}
	})
}

async function contentToText(content: ReadableStream | Blob | string): Promise<string> {
	if (typeof content === 'string') {
		return content
	}
	if (content instanceof Blob) {
		return content.text()
	}
	return new Response(content).text()
}

function createItemInfo(
	id: string,
	key: string,
	content: string,
	options: {
		metadata?: Record<string, unknown>
		status?: AiSearchItemInfo['status']
		namespace?: string
		sourceId?: string
	} = {}
): AiSearchItemInfo {
	return {
		id,
		key,
		status: options.status ?? 'completed',
		next_action: null,
		namespace: options.namespace,
		chunks_count: content.length > 0 ? 1 : 0,
		file_size: new TextEncoder().encode(content).byteLength,
		source_id: options.sourceId ?? null,
		last_seen_at: MOCK_TIMESTAMP,
		created_at: MOCK_TIMESTAMP,
		metadata: options.metadata
	}
}

function createItemChunks(item: AiSearchItemInfo, chunks: string[]): AiSearchItemChunk[] {
	let offset = 0
	return chunks.map((text, index) => {
		const start = offset
		const end = start + new TextEncoder().encode(text).byteLength
		offset = end
		return {
			id: `${item.id}:chunk-${index + 1}`,
			text,
			start_byte: start,
			end_byte: end,
			item: {
				timestamp: Date.parse(MOCK_TIMESTAMP),
				key: item.key,
				metadata: item.metadata
			}
		}
	})
}

function createStoredItem(
	sequence: number,
	fixture: MockAISearchItemFixture,
	namespace?: string
): StoredAISearchItem {
	const content = fixture.content ?? fixture.chunks?.join('\n') ?? ''
	const id = fixture.id ?? `item-${sequence}`
	const info = createItemInfo(id, fixture.key, content, {
		metadata: fixture.metadata,
		status: fixture.status,
		namespace
	})
	const chunks = createItemChunks(info, fixture.chunks ?? [content])
	return {
		info,
		content,
		contentType: fixture.contentType ?? 'text/plain',
		chunks,
		logs: [
			{
				timestamp: MOCK_TIMESTAMP,
				action: 'index',
				message: `Indexed ${fixture.key}`,
				fileKey: fixture.key,
				chunkCount: chunks.length,
				processingTimeMs: 0
			}
		]
	}
}

function isAISearchInstance(
	value: MockAISearchInstanceOptions | AiSearchInstance
): value is AiSearchInstance {
	return typeof (value as { search?: unknown }).search === 'function'
}

/**
 * Creates a deterministic AI Search instance binding for pure unit tests.
 */
export function createMockAISearchInstance(
	options: MockAISearchInstanceOptions = {}
): MockAISearchInstance {
	const instanceId = options.id ?? options.info?.id ?? 'mock-ai-search'
	const namespace = options.namespace ?? options.info?.namespace
	const items = new Map<string, StoredAISearchItem>()
	const jobs = new Map<string, AiSearchJobInfo>()
	const searches: AiSearchSearchRequest[] = []
	let itemSequence = 0
	let jobSequence = 0
	let info: AiSearchInstanceInfo = {
		id: instanceId,
		type: 'builtin',
		namespace,
		status: 'ready',
		created_at: MOCK_TIMESTAMP,
		modified_at: MOCK_TIMESTAMP,
		index_method: {
			vector: true,
			keyword: true
		},
		fusion_method: 'rrf',
		...options.info
	}

	for (const fixture of options.items ?? []) {
		const stored = createStoredItem(++itemSequence, fixture, namespace)
		items.set(stored.info.id, stored)
	}

	const findMatches = (params: AiSearchSearchRequest): AiSearchSearchResponse => {
		searches.push(params)
		const query = extractSearchQuery(params)
		const maxResults = params.ai_search_options?.retrieval?.max_num_results ?? 10
		const chunks: AISearchChunk[] = []

		for (const item of items.values()) {
			for (const chunk of item.chunks) {
				const score = scoreText(query, `${item.info.key} ${chunk.text}`)
				if (score === 0) {
					continue
				}
				chunks.push({
					id: chunk.id,
					type: 'text',
					score,
					text: chunk.text,
					item: {
						timestamp: Date.parse(MOCK_TIMESTAMP),
						key: item.info.key,
						metadata: item.info.metadata
					},
					scoring_details: {
						keyword_score: score,
						vector_score: score,
						keyword_rank: chunks.length + 1,
						vector_rank: chunks.length + 1,
						fusion_method: 'rrf'
					}
				})
			}
		}

		return {
			search_query: query,
			chunks: chunks.slice(0, maxResults)
		}
	}

	const createItemHandle = (itemId: string): AiSearchItem =>
		({
			async info(): Promise<AiSearchItemInfo> {
				const item = items.get(itemId)
				if (!item) {
					throw new Error(`Mock AI Search item "${itemId}" was not found.`)
				}
				return cloneInfo(item.info)
			},
			async download(): Promise<AiSearchItemContentResult> {
				const item = items.get(itemId)
				if (!item) {
					throw new Error(`Mock AI Search item "${itemId}" was not found.`)
				}
				return {
					body: streamFromText(item.content),
					contentType: item.contentType,
					filename: item.info.key,
					size: new TextEncoder().encode(item.content).byteLength
				}
			},
			async sync(): Promise<AiSearchItemInfo> {
				const item = items.get(itemId)
				if (!item) {
					throw new Error(`Mock AI Search item "${itemId}" was not found.`)
				}
				item.info.status = 'completed'
				item.info.last_seen_at = MOCK_TIMESTAMP
				return cloneInfo(item.info)
			},
			async logs(params?: AiSearchItemLogsParams): Promise<AiSearchItemLogsResponse> {
				const item = items.get(itemId)
				if (!item) {
					throw new Error(`Mock AI Search item "${itemId}" was not found.`)
				}
				const limit = params?.limit ?? 50
				const result = item.logs.slice(0, limit)
				return {
					result,
					result_info: {
						count: result.length,
						per_page: limit,
						cursor: null,
						truncated: item.logs.length > result.length
					}
				}
			},
			async chunks(params?: AiSearchItemChunksParams): Promise<AiSearchItemChunksResponse> {
				const item = items.get(itemId)
				if (!item) {
					throw new Error(`Mock AI Search item "${itemId}" was not found.`)
				}
				const offset = params?.offset ?? 0
				const limit = params?.limit ?? 20
				const result = item.chunks.slice(offset, offset + limit)
				return {
					result,
					result_info: {
						count: result.length,
						total: item.chunks.length,
						limit,
						offset
					}
				}
			}
		}) as AiSearchItem

	const uploadItem = async (
		name: string,
		content: ReadableStream | Blob | string,
		uploadOptions?: AiSearchUploadItemOptions
	): Promise<AiSearchItemInfo> => {
		const text = await contentToText(content)
		const existing = Array.from(items.values()).find((item) => item.info.key === name)
		const stored = createStoredItem(
			existing ? Number(existing.info.id.replace(/^item-/, '')) || ++itemSequence : ++itemSequence,
			{
				id: existing?.info.id,
				key: name,
				content: text,
				metadata: uploadOptions?.metadata
			},
			namespace
		)
		items.set(stored.info.id, stored)
		return cloneInfo(stored.info)
	}

	const itemsApi: AiSearchItems = {
		async list(params?: AiSearchListItemsParams): Promise<AiSearchListItemsResponse> {
			let result = Array.from(items.values()).map((item) => cloneInfo(item.info))
			if (params?.search) {
				const search = params.search.toLowerCase()
				result = result.filter((item) => item.key.toLowerCase().includes(search))
			}
			if (params?.status) {
				result = result.filter((item) => item.status === params.status)
			}
			const page = params?.page ?? 1
			const perPage = (params?.per_page ?? result.length) || 50
			const start = (page - 1) * perPage
			const paged = result.slice(start, start + perPage)
			return {
				result: paged,
				result_info: {
					count: paged.length,
					page,
					per_page: perPage,
					total_count: result.length
				}
			}
		},
		upload: uploadItem,
		async uploadAndPoll(
			name: string,
			content: ReadableStream | Blob | string,
			uploadOptions?: AiSearchUploadItemOptions
		): Promise<AiSearchItemInfo> {
			return uploadItem(name, content, uploadOptions)
		},
		get(itemId: string): AiSearchItem {
			return createItemHandle(itemId)
		},
		async delete(itemId: string): Promise<void> {
			items.delete(itemId)
		}
	} as AiSearchItems

	const createJobHandle = (jobId: string): AiSearchJob =>
		({
			async info(): Promise<AiSearchJobInfo> {
				const job = jobs.get(jobId)
				if (!job) {
					throw new Error(`Mock AI Search job "${jobId}" was not found.`)
				}
				return cloneInfo(job)
			},
			async logs(params?: AiSearchJobLogsParams): Promise<AiSearchJobLogsResponse> {
				const perPage = params?.per_page ?? 50
				return {
					result: [
						{
							id: 1,
							message: `Mock job ${jobId}`,
							message_type: 0,
							created_at: Date.parse(MOCK_TIMESTAMP)
						}
					].slice(0, perPage),
					result_info: {
						count: 1,
						page: params?.page ?? 1,
						per_page: perPage,
						total_count: 1
					}
				}
			},
			async cancel(): Promise<AiSearchJobInfo> {
				const job = jobs.get(jobId)
				if (!job) {
					throw new Error(`Mock AI Search job "${jobId}" was not found.`)
				}
				const updated = {
					...job,
					ended_at: MOCK_TIMESTAMP,
					end_reason: 'cancelled'
				}
				jobs.set(jobId, updated)
				return cloneInfo(updated)
			}
		}) as AiSearchJob

	const jobsApi: AiSearchJobs = {
		async list(params?: AiSearchListJobsParams): Promise<AiSearchListJobsResponse> {
			const allJobs = Array.from(jobs.values()).map((job) => cloneInfo(job))
			const page = params?.page ?? 1
			const perPage = (params?.per_page ?? allJobs.length) || 50
			const start = (page - 1) * perPage
			const result = allJobs.slice(start, start + perPage)
			return {
				result,
				result_info: {
					count: result.length,
					page,
					per_page: perPage,
					total_count: allJobs.length
				}
			}
		},
		async create(params?: AiSearchCreateJobParams): Promise<AiSearchJobInfo> {
			const id = `job-${++jobSequence}`
			const job: AiSearchJobInfo = {
				id,
				source: 'user',
				description: params?.description,
				started_at: MOCK_TIMESTAMP
			}
			jobs.set(id, job)
			return cloneInfo(job)
		},
		get(jobId: string): AiSearchJob {
			return createJobHandle(jobId)
		}
	} as AiSearchJobs

	return {
		async search(params: AiSearchSearchRequest): Promise<AiSearchSearchResponse> {
			return findMatches(params)
		},
		async chatCompletions(
			params: AiSearchChatCompletionsRequest
		): Promise<AiSearchChatCompletionsResponse | ReadableStream> {
			const search = findMatches({
				messages: params.messages,
				ai_search_options: params.ai_search_options
			})
			const content =
				typeof options.chatMessage === 'function'
					? options.chatMessage(search.chunks, params)
					: (options.chatMessage ??
						(search.chunks.map((chunk) => chunk.text).join('\n') ||
							'No matching offline AI Search chunks.'))

			if (params.stream) {
				const payload = JSON.stringify({
					choices: [{ delta: { content } }],
					chunks: search.chunks
				})
				return streamFromText(`data: ${payload}\n\n`)
			}

			return {
				id: 'mock-ai-search-chat',
				object: 'chat.completion',
				model: params.model ?? 'mock-ai-search',
				choices: [
					{
						index: 0,
						message: {
							role: 'assistant',
							content
						}
					}
				],
				chunks: search.chunks
			}
		},
		async update(config: Partial<AiSearchConfig>): Promise<AiSearchInstanceInfo> {
			info = {
				...info,
				...config,
				modified_at: MOCK_TIMESTAMP
			}
			return cloneInfo(info)
		},
		async info(): Promise<AiSearchInstanceInfo> {
			return cloneInfo(info)
		},
		async stats(): Promise<AiSearchStatsResponse> {
			const stats: AiSearchStatsResponse = {
				queued: 0,
				running: 0,
				completed: 0,
				error: 0,
				skipped: 0,
				outdated: 0,
				last_activity: MOCK_TIMESTAMP,
				engine: {
					vectorize: {
						vectorsCount: items.size,
						dimensions: 0
					},
					r2: {
						payloadSizeBytes: Array.from(items.values()).reduce(
							(sum, item) => sum + item.info.file_size!,
							0
						),
						metadataSizeBytes: 0,
						objectCount: items.size
					}
				}
			}
			for (const item of items.values()) {
				stats[item.info.status] = (stats[item.info.status] ?? 0) + 1
			}
			return stats
		},
		get items(): AiSearchItems {
			return itemsApi
		},
		get jobs(): AiSearchJobs {
			return jobsApi
		},
		_getSearches(): AiSearchSearchRequest[] {
			return [...searches]
		},
		_getItems(): AiSearchItemInfo[] {
			return Array.from(items.values()).map((item) => cloneInfo(item.info))
		},
		_getJobs(): AiSearchJobInfo[] {
			return Array.from(jobs.values()).map((job) => cloneInfo(job))
		}
	} as MockAISearchInstance
}

/**
 * Creates a deterministic AI Search namespace binding for pure unit tests.
 */
export function createMockAISearchNamespace(
	options: MockAISearchNamespaceOptions = {}
): MockAISearchNamespace {
	const namespaceName = options.namespace ?? 'default'
	const instances = new Map<string, AiSearchInstance>()

	for (const [name, instanceOptions] of Object.entries(options.instances ?? {})) {
		instances.set(
			name,
			isAISearchInstance(instanceOptions)
				? instanceOptions
				: createMockAISearchInstance({
						id: name,
						namespace: namespaceName,
						...instanceOptions
					})
		)
	}

	const getInstance = (name: string): AiSearchInstance => {
		const instance = instances.get(name)
		if (!instance) {
			throw new Error(`Mock AI Search namespace has no instance named "${name}".`)
		}
		return instance
	}

	return {
		get(name: string): AiSearchInstance {
			return getInstance(name)
		},
		async list(params?: AiSearchListInstancesParams): Promise<AiSearchListResponse> {
			let result = await Promise.all(
				Array.from(instances.entries()).map(async ([name, instance]) => ({
					...(await instance.info()),
					namespace: namespaceName,
					id: name
				}))
			)
			if (params?.search) {
				const search = params.search.toLowerCase()
				result = result.filter((instance) => instance.id.toLowerCase().includes(search))
			}
			const page = params?.page ?? 1
			const perPage = (params?.per_page ?? result.length) || 50
			const start = (page - 1) * perPage
			const paged = result.slice(start, start + perPage)
			return {
				result: paged,
				result_info: {
					count: paged.length,
					page,
					per_page: perPage,
					total_count: result.length
				}
			}
		},
		async create(config: AiSearchConfig): Promise<AiSearchInstance> {
			const instance = createMockAISearchInstance({
				id: config.id,
				namespace: namespaceName,
				info: config
			})
			instances.set(config.id, instance)
			return instance
		},
		async delete(name: string): Promise<void> {
			instances.delete(name)
		},
		async search(params: AiSearchMultiSearchRequest): Promise<AiSearchMultiSearchResponse> {
			const query = extractSearchQuery(params)
			const chunks: AISearchMultiChunk[] = []
			const errors: AiSearchMultiSearchError[] = []

			for (const instanceId of params.ai_search_options.instance_ids) {
				const instance = instances.get(instanceId)
				if (!instance) {
					errors.push({
						instance_id: instanceId,
						message: `Mock AI Search namespace has no instance named "${instanceId}".`
					})
					continue
				}

				const response =
					'query' in params
						? await instance.search({ query, ai_search_options: params.ai_search_options })
						: await instance.search({
								messages: params.messages,
								ai_search_options: params.ai_search_options
							})
				chunks.push(
					...response.chunks.map((chunk) => ({
						...chunk,
						instance_id: instanceId
					}))
				)
			}

			return {
				search_query: query,
				chunks,
				...(errors.length > 0 && { errors })
			}
		},
		async chatCompletions(
			params: AiSearchMultiChatCompletionsRequest
		): Promise<AiSearchMultiChatCompletionsResponse | ReadableStream> {
			const search = await (this as AiSearchNamespace).search({
				messages: params.messages as AiSearchMessage[],
				ai_search_options: params.ai_search_options
			})
			const content =
				search.chunks.map((chunk) => chunk.text).join('\n') ||
				'No matching offline AI Search chunks.'

			if (params.stream) {
				return streamFromText(`data: ${JSON.stringify({ chunks: search.chunks })}\n\n`)
			}

			return {
				id: 'mock-ai-search-namespace-chat',
				object: 'chat.completion',
				model: params.model ?? 'mock-ai-search',
				choices: [
					{
						index: 0,
						message: {
							role: 'assistant',
							content
						}
					}
				],
				chunks: search.chunks,
				errors: search.errors
			}
		},
		_getInstances(): string[] {
			return Array.from(instances.keys())
		}
	} as MockAISearchNamespace
}
