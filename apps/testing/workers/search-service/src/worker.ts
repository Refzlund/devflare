export interface SearchHit {
	id: string
	title: string
	score: number
}

export function getServiceInfo(): {
	service: string
	channel: string
	indexedCollections: string[]
} {
	return {
		service: 'devflare-testing-search-service',
		channel: 'staging',
		indexedCollections: ['documents', 'search']
	}
}

export function search(query: string): {
	query: string
	results: SearchHit[]
} {
	const normalized = query.trim() || 'devflare'
	return {
		query: normalized,
		results: [
			{
				id: 'devflare-testing',
				title: `Result for ${normalized}`,
				score: 0.99
			}
		]
	}
}
