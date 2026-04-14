import { isAuthenticated } from './auth'
import type {
	AccountInfo,
	CloudflareService,
	ServiceStatus
} from './types'
import { getAccountById } from './account-core'
import { listWorkers } from './account-workers'
import {
	listAIModels,
	listD1Databases,
	listHyperdrives,
	listKVNamespaces,
	listR2Buckets,
	listVectorizeIndexes
} from './account-resources'

const SERVICE_STATUS_TIMEOUT_MS = 10000

type ServiceInventoryFetcher = (accountId: string) => Promise<readonly unknown[]>

const serviceInventoryFetchers: Partial<Record<CloudflareService, ServiceInventoryFetcher>> = {
	workers: listWorkers,
	kv: listKVNamespaces,
	d1: listD1Databases,
	hyperdrive: listHyperdrives,
	r2: listR2Buckets,
	vectorize: listVectorizeIndexes,
	ai: listAIModels
}

async function withServiceTimeout<T>(operation: Promise<T>): Promise<T> {
	let timeoutId: ReturnType<typeof setTimeout> | null = null
	const timeoutPromise = new Promise<never>((_, reject) => {
		timeoutId = setTimeout(() => reject(new Error('timeout')), SERVICE_STATUS_TIMEOUT_MS)
	})

	try {
		return await Promise.race([
			operation,
			timeoutPromise
		])
	} finally {
		if (timeoutId) {
			clearTimeout(timeoutId)
		}
	}
}

function createAvailableServiceStatus(
	service: CloudflareService,
	count: number
): ServiceStatus {
	return {
		service,
		available: service === 'ai' ? count > 0 : true,
		count
	}
}

export async function getServiceStatus(
	accountId: string,
	service: CloudflareService
): Promise<ServiceStatus> {
	const fetchInventory = serviceInventoryFetchers[service]
	if (!fetchInventory) {
		return {
			service,
			available: false
		}
	}

	try {
		const inventory = await withServiceTimeout(fetchInventory(accountId))
		return createAvailableServiceStatus(service, inventory.length)
	} catch {
		return {
			service,
			available: false
		}
	}
}

export async function getAllServiceStatus(accountId: string): Promise<ServiceStatus[]> {
	const services: CloudflareService[] = [
		'workers',
		'kv',
		'd1',
		'hyperdrive',
		'r2',
		'vectorize',
		'ai'
	]

	return Promise.all(services.map((service) => getServiceStatus(accountId, service)))
}

export async function checkAuth(): Promise<boolean> {
	return isAuthenticated()
}

export async function hasService(
	accountId: string,
	service: CloudflareService
): Promise<boolean> {
	const status = await getServiceStatus(accountId, service)
	return status.available
}

export interface AccountSummary {
	account: AccountInfo
	services: ServiceStatus[]
}

export async function getAccountSummary(accountId: string): Promise<AccountSummary | null> {
	const account = await getAccountById(accountId)
	if (!account) {
		return null
	}

	const services = await getAllServiceStatus(accountId)
	return {
		account,
		services
	}
}
