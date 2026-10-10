// =============================================================================
// Mock Vectorize Index
// =============================================================================
// Deterministic, in-memory Vectorize binding for pure unit tests. Vector storage
// and cosine-similarity ranking are deterministic, so this is a real mock (not a
// stub): insert/upsert/delete/getByIds/query behave like a tiny vector store.
// Cloudflare's real hosted indexing, ANN ranking, sharding, and scale are not
// reproduced — use remote mode for those. Operations whose semantics are
// genuinely hosted-only (index dimension/metric configuration) throw a clear
// error rather than faking a value.
//
// The config type generator emits `VectorizeIndex` (the workers-types beta
// class) for `vectorize` bindings, so this mock implements that interface:
// `describe`, `query`, `insert`, `upsert`, `deleteByIds`, `getByIds`. A
// convenience alias `delete()` is also provided (it forwards to `deleteByIds`).
// =============================================================================

export interface MockVectorizeOptions {
	/** Index name reported by `describe()` (default `mock-vectorize`). */
	name?: string
	/** Distance metric reported by `describe()` (default `cosine`). */
	metric?: VectorizeDistanceMetric
	/**
	 * Dimensions reported by `describe()`. When omitted it is inferred from the
	 * first inserted/seeded vector; before any vector exists `describe()` reports
	 * `0`.
	 */
	dimensions?: number
	/** Vectors seeded into the index up front. */
	vectors?: VectorizeVector[]
}

export type MockVectorizeIndex = VectorizeIndex & {
	/** Inspect every stored vector (test helper). */
	_getVectors(): VectorizeVector[]
	/**
	 * Delete vectors by id. Convenience alias for `deleteByIds` so tests can call
	 * the same verb as KV/R2 mocks.
	 */
	delete(ids: string[]): Promise<VectorizeVectorMutation>
}

// Always returns a freshly-owned array so stored vectors and returned matches
// can never be corrupted by the caller mutating an array they passed in or got
// back (mirrors createMockAnalyticsEngine's structuredClone isolation).
function toNumberArray(values: VectorFloatArray | number[]): number[] {
	return Array.isArray(values) ? values.slice() : Array.from(values)
}

function cloneVector(vector: VectorizeVector): VectorizeVector {
	return {
		id: vector.id,
		values: toNumberArray(vector.values),
		...(vector.namespace !== undefined && { namespace: vector.namespace }),
		...(vector.metadata !== undefined && { metadata: structuredClone(vector.metadata) })
	}
}

/**
 * Cosine similarity between two equal-length vectors. Returns 0 when either
 * vector has zero magnitude (undefined direction), matching a "no similarity"
 * result rather than throwing.
 */
function cosineSimilarity(a: number[], b: number[]): number {
	let dot = 0
	let magA = 0
	let magB = 0
	const length = Math.min(a.length, b.length)
	for (let i = 0; i < length; i++) {
		dot += a[i] * b[i]
		magA += a[i] * a[i]
		magB += b[i] * b[i]
	}
	if (magA === 0 || magB === 0) {
		return 0
	}
	return dot / (Math.sqrt(magA) * Math.sqrt(magB))
}

type MetadataFilter = VectorizeVectorMetadataFilter
type MetadataValue = VectorizeVectorMetadataValue

function readMetadataField(
	metadata: Record<string, VectorizeVectorMetadata> | undefined,
	field: string
): VectorizeVectorMetadata | undefined {
	return metadata?.[field]
}

function compareScalar(op: string, actual: unknown, expected: unknown): boolean {
	switch (op) {
		case '$eq':
			return actual === expected
		case '$ne':
			return actual !== expected
		case '$lt':
			return typeof actual === 'number' && typeof expected === 'number' && actual < expected
		case '$lte':
			return typeof actual === 'number' && typeof expected === 'number' && actual <= expected
		case '$gt':
			return typeof actual === 'number' && typeof expected === 'number' && actual > expected
		case '$gte':
			return typeof actual === 'number' && typeof expected === 'number' && actual >= expected
		default:
			throw new Error(
				`Mock Vectorize query filter operator "${op}" is not supported. Supported operators: $eq, $ne, $lt, $lte, $gt, $gte, $in, $nin.`
			)
	}
}

function evaluateOperator(op: string, actual: unknown, expected: unknown): boolean {
	if (op === '$in') {
		return Array.isArray(expected) && expected.includes(actual as never)
	}
	if (op === '$nin') {
		return !Array.isArray(expected) || !expected.includes(actual as never)
	}
	return compareScalar(op, actual, expected)
}

/**
 * Evaluates one field's condition: either a scalar `$eq` shorthand or an
 * operator object where every operator must hold.
 */
function matchesCondition(
	actual: VectorizeVectorMetadata | undefined,
	condition: MetadataFilter[string]
): boolean {
	if (condition === null || typeof condition !== 'object' || Array.isArray(condition)) {
		// Scalar shorthand: `{ field: value }` is `$eq`.
		return actual === (condition as MetadataValue | null)
	}

	return Object.entries(condition).every(([op, expected]) => evaluateOperator(op, actual, expected))
}

/**
 * Evaluates a Vectorize metadata filter against a stored vector's metadata,
 * mirroring the documented filter grammar (scalar equality shorthand plus the
 * `$eq/$ne/$lt/$lte/$gt/$gte` and `$in/$nin` operators). All fields must match.
 */
function matchesFilter(
	metadata: Record<string, VectorizeVectorMetadata> | undefined,
	filter: MetadataFilter
): boolean {
	return Object.entries(filter).every(([field, condition]) =>
		matchesCondition(readMetadataField(metadata, field), condition)
	)
}

function applyMetadataRetrieval(
	metadata: Record<string, VectorizeVectorMetadata> | undefined,
	returnMetadata: boolean | VectorizeMetadataRetrievalLevel | undefined
): Record<string, VectorizeVectorMetadata> | undefined {
	if (metadata === undefined) {
		return undefined
	}
	if (returnMetadata === undefined || returnMetadata === false || returnMetadata === 'none') {
		return undefined
	}
	// Deep-copy so a caller mutating a nested metadata array can't corrupt the
	// stored vector's metadata.
	return structuredClone(metadata)
}

/**
 * Creates a deterministic in-memory Vectorize index binding for pure unit tests.
 *
 * @example
 * ```ts
 * const index = createMockVectorize({
 *   vectors: [{ id: 'a', values: [1, 0], metadata: { topic: 'cats' } }]
 * })
 * await index.insert([{ id: 'b', values: [0, 1] }])
 * const result = await index.query([1, 0], { topK: 1, returnMetadata: true })
 * // result.matches[0].id === 'a'
 * ```
 */
export function createMockVectorize(options: MockVectorizeOptions = {}): MockVectorizeIndex {
	const store = new Map<string, VectorizeVector>()
	let inferredDimensions = options.dimensions

	const noteDimensions = (vector: VectorizeVector) => {
		if (inferredDimensions === undefined) {
			inferredDimensions = toNumberArray(vector.values).length
		}
	}

	for (const vector of options.vectors ?? []) {
		const stored = cloneVector(vector)
		noteDimensions(stored)
		store.set(stored.id, stored)
	}

	const insert = async (
		vectors: VectorizeVector[],
		{ overwrite }: { overwrite: boolean }
	): Promise<VectorizeVectorMutation> => {
		const ids: string[] = []
		for (const vector of vectors) {
			if (!overwrite && store.has(vector.id)) {
				throw new Error(
					`Mock Vectorize insert failed: a vector with id "${vector.id}" already exists. Use upsert() to replace it.`
				)
			}
			const stored = cloneVector(vector)
			noteDimensions(stored)
			store.set(stored.id, stored)
			ids.push(stored.id)
		}
		return { ids, count: ids.length }
	}

	const deleteByIds = async (ids: string[]): Promise<VectorizeVectorMutation> => {
		const deleted: string[] = []
		for (const id of ids) {
			if (store.delete(id)) {
				deleted.push(id)
			}
		}
		return { ids: deleted, count: deleted.length }
	}

	return {
		async describe(): Promise<VectorizeIndexDetails> {
			return {
				id: `mock-${options.name ?? 'mock-vectorize'}`,
				name: options.name ?? 'mock-vectorize',
				config: {
					dimensions: inferredDimensions ?? 0,
					metric: options.metric ?? 'cosine'
				},
				vectorsCount: store.size
			}
		},

		async insert(vectors: VectorizeVector[]): Promise<VectorizeVectorMutation> {
			return insert(vectors, { overwrite: false })
		},

		async upsert(vectors: VectorizeVector[]): Promise<VectorizeVectorMutation> {
			return insert(vectors, { overwrite: true })
		},

		async deleteByIds(ids: string[]): Promise<VectorizeVectorMutation> {
			return deleteByIds(ids)
		},

		async delete(ids: string[]): Promise<VectorizeVectorMutation> {
			return deleteByIds(ids)
		},

		async getByIds(ids: string[]): Promise<VectorizeVector[]> {
			const result: VectorizeVector[] = []
			for (const id of ids) {
				const vector = store.get(id)
				if (vector) {
					result.push(cloneVector(vector))
				}
			}
			return result
		},

		async query(
			vector: VectorFloatArray | number[],
			queryOptions?: VectorizeQueryOptions
		): Promise<VectorizeMatches> {
			const queryVector = toNumberArray(vector)
			const topK = queryOptions?.topK ?? 5
			const namespace = queryOptions?.namespace
			const filter = queryOptions?.filter
			const returnValues = queryOptions?.returnValues ?? false
			const returnMetadata = queryOptions?.returnMetadata

			const scored = Array.from(store.values())
				.filter((candidate) => namespace === undefined || candidate.namespace === namespace)
				.filter((candidate) => filter === undefined || matchesFilter(candidate.metadata, filter))
				.map((candidate) => ({
					candidate,
					score: cosineSimilarity(queryVector, toNumberArray(candidate.values))
				}))
				// Stable, deterministic ordering: score desc, then id asc on ties.
				.sort((a, b) => b.score - a.score || a.candidate.id.localeCompare(b.candidate.id))
				.slice(0, topK)

			const matches: VectorizeMatch[] = scored.map(({ candidate, score }) => {
				const match: VectorizeMatch = {
					id: candidate.id,
					score,
					...(candidate.namespace !== undefined && { namespace: candidate.namespace })
				}
				if (returnValues) {
					match.values = toNumberArray(candidate.values)
				}
				const metadata = applyMetadataRetrieval(candidate.metadata, returnMetadata)
				if (metadata !== undefined) {
					match.metadata = metadata
				}
				return match
			})

			return { matches, count: matches.length }
		},

		_getVectors(): VectorizeVector[] {
			return Array.from(store.values()).map(cloneVector)
		}
	} as MockVectorizeIndex
}
