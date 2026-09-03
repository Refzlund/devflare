import { type APIClientOptions, apiGet, apiGetAll } from './api'
import type { AccountInfo, CloudflareAccount } from './types'

export async function getAccounts(options?: APIClientOptions): Promise<AccountInfo[]> {
	const accounts = await apiGetAll<CloudflareAccount>('/accounts', options)

	return accounts.map((account) => ({
		id: account.id,
		name: account.name,
		type: account.type,
		createdOn: account.created_on ? new Date(account.created_on) : undefined
	}))
}

export async function getPrimaryAccount(options?: APIClientOptions): Promise<AccountInfo | null> {
	const accounts = await getAccounts(options)
	return accounts[0] ?? null
}

export async function getAccountById(
	accountId: string,
	options?: APIClientOptions
): Promise<AccountInfo | null> {
	try {
		const account = await apiGet<CloudflareAccount>(`/accounts/${accountId}`, options)
		return {
			id: account.id,
			name: account.name,
			type: account.type,
			createdOn: account.created_on ? new Date(account.created_on) : undefined
		}
	} catch {
		return null
	}
}
