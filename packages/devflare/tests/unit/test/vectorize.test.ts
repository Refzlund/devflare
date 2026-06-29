import { describe, expect, test } from 'bun:test'
import { createMockEnv, createMockVectorize } from '../../../src/test'

describe('createMockVectorize', () => {
	test('insert + getByIds round-trips vectors and rejects duplicate ids', async () => {
		const index = createMockVectorize()

		const inserted = await index.insert([
			{ id: 'a', values: [1, 0, 0], metadata: { topic: 'cats' } },
			{ id: 'b', values: [0, 1, 0] }
		])
		expect(inserted).toEqual({ ids: ['a', 'b'], count: 2 })

		const fetched = await index.getByIds(['a', 'missing'])
		expect(fetched).toHaveLength(1)
		expect(fetched[0].id).toBe('a')
		expect(fetched[0].metadata).toEqual({ topic: 'cats' })

		await expect(index.insert([{ id: 'a', values: [9, 9, 9] }])).rejects.toThrow('already exists')
	})

	test('upsert replaces existing vectors', async () => {
		const index = createMockVectorize({
			vectors: [{ id: 'a', values: [1, 0] }]
		})

		const result = await index.upsert([{ id: 'a', values: [0, 1] }])
		expect(result).toEqual({ ids: ['a'], count: 1 })

		const [vector] = await index.getByIds(['a'])
		expect(vector.values).toEqual([0, 1])
	})

	test('deleteByIds and delete() both remove vectors', async () => {
		const index = createMockVectorize({
			vectors: [
				{ id: 'a', values: [1, 0] },
				{ id: 'b', values: [0, 1] }
			]
		})

		expect(await index.deleteByIds(['a'])).toEqual({ ids: ['a'], count: 1 })
		expect(await index.delete(['b', 'gone'])).toEqual({ ids: ['b'], count: 1 })
		expect(await index.getByIds(['a', 'b'])).toEqual([])
	})

	test('query ranks by cosine similarity and honors topK', async () => {
		const index = createMockVectorize({
			vectors: [
				{ id: 'same', values: [1, 0, 0] },
				{ id: 'orthogonal', values: [0, 1, 0] },
				{ id: 'opposite', values: [-1, 0, 0] }
			]
		})

		const result = await index.query([1, 0, 0], { topK: 2 })
		expect(result.count).toBe(2)
		expect(result.matches.map((m) => m.id)).toEqual(['same', 'orthogonal'])
		expect(result.matches[0].score).toBeCloseTo(1, 5)
		expect(result.matches[1].score).toBeCloseTo(0, 5)
	})

	test('query returnValues/returnMetadata are off by default and opt-in', async () => {
		const index = createMockVectorize({
			vectors: [{ id: 'a', values: [1, 0], metadata: { lang: 'en' } }]
		})

		const lean = await index.query([1, 0], { topK: 1 })
		expect(lean.matches[0].values).toBeUndefined()
		expect(lean.matches[0].metadata).toBeUndefined()

		const full = await index.query([1, 0], {
			topK: 1,
			returnValues: true,
			returnMetadata: true
		})
		expect(full.matches[0].values).toEqual([1, 0])
		expect(full.matches[0].metadata).toEqual({ lang: 'en' })
	})

	test('query filters by namespace and metadata filter', async () => {
		const index = createMockVectorize({
			vectors: [
				{ id: 'en', values: [1, 0], namespace: 'docs', metadata: { lang: 'en', views: 10 } },
				{ id: 'fr', values: [1, 0], namespace: 'docs', metadata: { lang: 'fr', views: 5 } },
				{ id: 'other', values: [1, 0], namespace: 'blog', metadata: { lang: 'en', views: 99 } }
			]
		})

		const byNamespace = await index.query([1, 0], { namespace: 'docs', returnMetadata: true })
		expect(byNamespace.matches.map((m) => m.id).sort()).toEqual(['en', 'fr'])

		const byEquality = await index.query([1, 0], { filter: { lang: 'fr' } })
		expect(byEquality.matches.map((m) => m.id)).toEqual(['fr'])

		const byOperator = await index.query([1, 0], { filter: { views: { $gte: 10 } } })
		expect(byOperator.matches.map((m) => m.id).sort()).toEqual(['en', 'other'])

		const byIn = await index.query([1, 0], { filter: { lang: { $in: ['fr'] } } })
		expect(byIn.matches.map((m) => m.id)).toEqual(['fr'])
	})

	test('describe reports inferred dimensions and vector count', async () => {
		const index = createMockVectorize({ name: 'docs' })
		expect((await index.describe()).config).toEqual({ dimensions: 0, metric: 'cosine' })

		await index.insert([{ id: 'a', values: [1, 2, 3] }])
		const details = await index.describe()
		expect(details.name).toBe('docs')
		expect(details.vectorsCount).toBe(1)
		expect(details.config).toEqual({ dimensions: 3, metric: 'cosine' })
	})

	test('createMockEnv wires vectorize bindings', async () => {
		const env = createMockEnv({ vectorize: ['INDEX'] }) as { INDEX: VectorizeIndex }
		await env.INDEX.insert([{ id: 'a', values: [1, 0] }])
		expect((await env.INDEX.query([1, 0], { topK: 1 })).matches[0].id).toBe('a')
	})

	test('stored vectors are isolated from caller mutation (values + nested metadata)', async () => {
		const index = createMockVectorize()
		const source = [1, 0]
		await index.insert([{ id: 'a', values: source, metadata: { tags: ['x'] } }])
		// Mutating the array the caller passed in must not reach the store.
		source[0] = 999

		const got = await index.query([1, 0], { topK: 1, returnValues: true, returnMetadata: true })
		const match = got.matches[0]
		expect(match.values).toEqual([1, 0])
		// Mutating a returned values/metadata array must not corrupt the store.
		match.values?.splice(0, match.values.length, 42)
		;(match.metadata?.tags as string[]).push('leak')

		const again = await index.query([1, 0], { topK: 1, returnValues: true, returnMetadata: true })
		expect(again.matches[0].values).toEqual([1, 0])
		expect(again.matches[0].metadata?.tags).toEqual(['x'])
	})
})
