import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { normalizeSecretsStoreBinding, type DevflareConfig } from '../config'

export const LOCAL_SECRETS_PATH = join('.devflare', 'secrets.local.json')

interface StoredLocalSecret {
	value: string
	updatedAt: string
}

interface LocalSecretsFile {
	version: 1
	stores: Record<string, Record<string, StoredLocalSecret>>
}

export interface LocalSecretReference {
	cwd: string
	storeId: string
	name: string
}

export interface LocalSecretWrite extends LocalSecretReference {
	value: string
}

export interface LocalSecretListOptions {
	cwd: string
	storeId?: string
}

export interface LocalSecretListItem {
	storeId: string
	name: string
	hasValue: boolean
	updatedAt: string
}

interface SecretsStoreSecretAdmin {
	create(value: string): Promise<string>
	update?(value: string, id: string): Promise<string>
	list?(): Promise<Array<{ name?: string; metadata?: { uuid?: string } }>>
}

interface MiniflareSecretsStoreSeeder {
	getSecretsStoreSecretAPI(
		bindingName: string,
		workerName?: string
	): Promise<SecretsStoreSecretAdmin | (() => SecretsStoreSecretAdmin)>
}

function createEmptyLocalSecretsFile(): LocalSecretsFile {
	return {
		version: 1,
		stores: {}
	}
}

function getLocalSecretsFilePath(cwd: string): string {
	return join(cwd, LOCAL_SECRETS_PATH)
}

function parseLocalSecretsFile(raw: string): LocalSecretsFile {
	const parsed = JSON.parse(raw) as Partial<LocalSecretsFile>
	if (parsed.version !== 1 || !parsed.stores || typeof parsed.stores !== 'object') {
		return createEmptyLocalSecretsFile()
	}

	return {
		version: 1,
		stores: parsed.stores
	}
}

function readLocalSecretsFile(cwd: string): LocalSecretsFile {
	const filePath = getLocalSecretsFilePath(cwd)
	if (!existsSync(filePath)) {
		return createEmptyLocalSecretsFile()
	}

	return parseLocalSecretsFile(readFileSync(filePath, 'utf8'))
}

function writeLocalSecretsFile(cwd: string, file: LocalSecretsFile): void {
	const filePath = getLocalSecretsFilePath(cwd)
	mkdirSync(dirname(filePath), { recursive: true })
	writeFileSync(filePath, `${JSON.stringify(file, null, '\t')}\n`, {
		encoding: 'utf8',
		mode: 0o600
	})
}

export function writeLocalSecret({ cwd, storeId, name, value }: LocalSecretWrite): void {
	const file = readLocalSecretsFile(cwd)
	file.stores[storeId] ??= {}
	file.stores[storeId][name] = {
		value,
		updatedAt: new Date().toISOString()
	}
	writeLocalSecretsFile(cwd, file)
}

export function readLocalSecret({ cwd, storeId, name }: LocalSecretReference): string | undefined {
	return readLocalSecretsFile(cwd).stores[storeId]?.[name]?.value
}

export function deleteLocalSecret({ cwd, storeId, name }: LocalSecretReference): boolean {
	const file = readLocalSecretsFile(cwd)
	const store = file.stores[storeId]
	if (!store || !(name in store)) {
		return false
	}

	delete store[name]
	if (Object.keys(store).length === 0) {
		delete file.stores[storeId]
	}
	writeLocalSecretsFile(cwd, file)
	return true
}

export function listLocalSecrets({ cwd, storeId }: LocalSecretListOptions): LocalSecretListItem[] {
	const file = readLocalSecretsFile(cwd)
	const stores = storeId ? { [storeId]: file.stores[storeId] ?? {} } : file.stores

	return Object.entries(stores).flatMap(([currentStoreId, secrets]) =>
		Object.entries(secrets).map(([name, secret]) => ({
			storeId: currentStoreId,
			name,
			hasValue: typeof secret.value === 'string',
			updatedAt: secret.updatedAt
		}))
	)
}

export function resolveLocalSecretValuesForBindings(
	config: Pick<DevflareConfig, 'bindings' | 'secretsStoreId'>,
	cwd: string
): Record<string, string> {
	const values: Record<string, string> = {}

	for (const [bindingName, binding] of Object.entries(config.bindings?.secretsStore ?? {})) {
		const normalized = normalizeSecretsStoreBinding(binding, config.secretsStoreId, bindingName)
		const value = readLocalSecret({
			cwd,
			storeId: normalized.storeId,
			name: normalized.secretName
		})

		if (value !== undefined) {
			values[bindingName] = value
		}
	}

	return values
}

async function getSecretAdmin(
	miniflare: MiniflareSecretsStoreSeeder,
	bindingName: string
): Promise<SecretsStoreSecretAdmin> {
	const adminOrFactory = await miniflare.getSecretsStoreSecretAPI(bindingName)
	return typeof adminOrFactory === 'function' ? adminOrFactory() : adminOrFactory
}

async function upsertMiniflareSecret(
	admin: SecretsStoreSecretAdmin,
	value: string
): Promise<void> {
	if (admin.list && admin.update) {
		const [existing] = await admin.list()
		const id = existing?.metadata?.uuid ?? existing?.name
		if (id) {
			await admin.update(value, id)
			return
		}
	}

	await admin.create(value)
}

export async function seedMiniflareLocalSecrets(
	miniflare: MiniflareSecretsStoreSeeder,
	config: Pick<DevflareConfig, 'bindings' | 'secretsStoreId'>,
	cwd: string
): Promise<void> {
	const values = resolveLocalSecretValuesForBindings(config, cwd)

	for (const [bindingName, value] of Object.entries(values)) {
		const admin = await getSecretAdmin(miniflare, bindingName)
		await upsertMiniflareSecret(admin, value)
	}
}
