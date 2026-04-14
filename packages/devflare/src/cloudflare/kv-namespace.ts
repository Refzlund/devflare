import { apiGet, apiPost } from './api'
import type { KVNamespace } from './types'

export const DEVFLARE_KV_NAMESPACE_TITLE = 'devflare-usage'

export async function getOrCreateNamedKVNamespace(
	accountId: string,
	title: string = DEVFLARE_KV_NAMESPACE_TITLE
): Promise<string> {
	const namespaces = await apiGet<KVNamespace[]>(
		`/accounts/${accountId}/storage/kv/namespaces`
	)

	const existing = namespaces.find((namespace) => namespace.title === title)
	if (existing) {
		return existing.id
	}

	const created = await apiPost<KVNamespace>(
		`/accounts/${accountId}/storage/kv/namespaces`,
		{ title }
	)

	return created.id
}
