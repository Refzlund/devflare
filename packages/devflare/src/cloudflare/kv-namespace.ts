import { apiGetAll, apiPost, type APIClientOptions } from './api'
import type { KVNamespace } from './types'

export const DEVFLARE_KV_NAMESPACE_TITLE = 'devflare-usage'

export async function getOrCreateNamedKVNamespace(
	accountId: string,
	title: string = DEVFLARE_KV_NAMESPACE_TITLE,
	options?: APIClientOptions
): Promise<string> {
	const namespaces = await apiGetAll<KVNamespace>(
		`/accounts/${accountId}/storage/kv/namespaces`,
		options
	)

	const existing = namespaces.find((namespace) => namespace.title === title)
	if (existing) {
		return existing.id
	}

	const created = await apiPost<KVNamespace>(
		`/accounts/${accountId}/storage/kv/namespaces`,
		{ title },
		options
	)

	return created.id
}
