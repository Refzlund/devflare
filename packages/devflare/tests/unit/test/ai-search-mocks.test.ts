import { describe, expect, test } from 'bun:test'
import { createMockAISearchInstance, createMockAISearchNamespace } from '../../../src/test'

describe('createMockAISearchInstance', () => {
	test('searches seeded and uploaded items deterministically', async () => {
		const instance = createMockAISearchInstance({
			id: 'docs',
			items: [
				{
					key: 'cache.md',
					content: 'Cloudflare cache API stores responses',
					metadata: { slug: '/cache' }
				},
				{
					key: 'queues.md',
					content: 'Queues process asynchronous jobs'
				}
			]
		})

		const initial = await instance.search({ query: 'cache' })
		expect(initial.search_query).toBe('cache')
		expect(initial.chunks).toHaveLength(1)
		expect(initial.chunks[0].text).toContain('cache API')
		expect(initial.chunks[0].item.metadata).toEqual({ slug: '/cache' })

		const uploaded = await instance.items.upload(
			'offline.md',
			'Offline fixtures avoid network access'
		)
		expect(uploaded.status).toBe('completed')

		const afterUpload = await instance.search({ query: 'offline' })
		expect(afterUpload.chunks.map((chunk) => chunk.item.key)).toEqual(['offline.md'])
		expect((await instance.items.list()).result.map((item) => item.key)).toEqual([
			'cache.md',
			'queues.md',
			'offline.md'
		])
	})

	test('supports item and job helper APIs without network access', async () => {
		const instance = createMockAISearchInstance({
			id: 'docs',
			items: [
				{
					key: 'offline.md',
					content: 'Offline testing support'
				}
			]
		})

		const itemInfo = (await instance.items.list()).result[0]
		const item = instance.items.get(itemInfo.id)
		const download = await item.download()
		expect(download.filename).toBe('offline.md')
		expect(await new Response(download.body).text()).toBe('Offline testing support')
		expect((await item.chunks()).result[0].text).toBe('Offline testing support')

		const job = await instance.jobs.create({ description: 'manual sync' })
		expect(job.source).toBe('user')
		expect((await instance.jobs.list()).result).toEqual([job])
		expect((await instance.jobs.get(job.id).cancel()).end_reason).toBe('cancelled')
	})

	test('returns deterministic chat completions from matched chunks', async () => {
		const instance = createMockAISearchInstance({
			id: 'docs',
			items: [
				{
					key: 'cache.md',
					content: 'Cache API stores responses near users'
				}
			]
		})

		const completion = await instance.chatCompletions({
			messages: [
				{
					role: 'user',
					content: 'Where are responses stored?'
				}
			]
		})

		expect(completion.choices[0].message.content).toContain('Cache API stores responses')
		expect(completion.chunks).toHaveLength(1)
	})
})

describe('createMockAISearchNamespace', () => {
	test('creates, lists, gets, deletes, and multi-searches instances', async () => {
		const namespace = createMockAISearchNamespace({
			instances: {
				docs: {
					items: [
						{
							key: 'docs.md',
							content: 'Documentation explains offline support'
						}
					]
				},
				blog: {
					items: [
						{
							key: 'blog.md',
							content: 'Release notes explain remote boundaries'
						}
					]
				}
			}
		})

		expect((await namespace.list()).result.map((instance) => instance.id)).toEqual(['docs', 'blog'])

		const created = await namespace.create({ id: 'guides' })
		await created.items.upload('guide.md', 'Guides cover fixtures')
		expect((await namespace.get('guides').search({ query: 'fixtures' })).chunks).toHaveLength(1)

		const multi = await namespace.search({
			query: 'support',
			ai_search_options: {
				instance_ids: ['docs', 'blog', 'guides']
			}
		})
		expect(multi.chunks.map((chunk) => chunk.instance_id)).toEqual(['docs'])

		await namespace.delete('blog')
		expect((await namespace.list()).result.map((instance) => instance.id)).toEqual([
			'docs',
			'guides'
		])
	})
})
