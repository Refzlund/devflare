import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { type DevflareConfig, normalizeSecretsStoreBinding } from '../config'

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

/**
 * Local Secrets Store values exposed as service bindings to one tiny worker per
 * secret, whose `get()` RPC method answers with the locally stored value.
 *
 * → Miniflare 4 offered `wrappedBindings` for this; Miniflare 5 removed them, so
 *   the binding is now an RPC entrypoint — the shape the local media/images
 *   shims (`shims/local-media-bindings.ts`) already use. `await env.X.get()`
 *   reads the same either way.
 */
export interface LocalSecretServiceBindingConfig {
	/** Secrets Store binding names served locally (left out of the native `secretsStoreSecrets`). */
	localBindingNames: string[]
	/** Per binding name, the secret worker and entrypoint to bind it to. */
	serviceBindings: Record<string, { name: string; entrypoint: string }>
	/** The secret workers, each carrying its value as the `value` var. */
	workers: Array<{
		name: string
		modules: true
		script: string
		compatibilityDate: string
		bindings: { value: string }
	}>
}

export interface LocalSecretsStoreSecretBinding {
	get(): Promise<string>
}

/** Entrypoint class each local secret worker exports. */
const LOCAL_SECRET_ENTRYPOINT = 'LocalSecretsStoreSecret'

/**
 * Fixed rather than the user's date: the worker is devflare's own and only needs
 * RPC (2024-04-03+). A user config pinned before that must not take it away.
 */
const LOCAL_SECRET_COMPATIBILITY_DATE = '2025-01-01'

const LOCAL_SECRET_BINDING_SCRIPT = `
import { WorkerEntrypoint } from 'cloudflare:workers'

export class ${LOCAL_SECRET_ENTRYPOINT} extends WorkerEntrypoint {
	async get() {
		return this.env.value
	}
}

export default {
	fetch() {
		return new Response('Local Secrets Store binding: call get()', { status: 404 })
	}
}
`

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

function toLocalSecretWorkerName(bindingName: string, index: number): string {
	const slug =
		bindingName
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, '-')
			.replace(/^-+|-+$/g, '') || 'secret'

	return `devflare-local-secret-${index}-${slug}`
}

/**
 * @description Builds the service bindings and secret workers that serve each
 * Secrets Store binding with a value in `.devflare/secrets.local.json`.
 * Bindings without a local value are absent, so they keep resolving through the
 * native Secrets Store binding.
 * @param config - the bindings and default store id to resolve
 * @param cwd - project root holding `.devflare/secrets.local.json`
 * @returns the bindings to merge into each worker and the workers to add
 */
export function buildLocalSecretServiceBindingConfig(
	config: Pick<DevflareConfig, 'bindings' | 'secretsStoreId'>,
	cwd: string
): LocalSecretServiceBindingConfig {
	const entries = Object.entries(resolveLocalSecretValuesForBindings(config, cwd))

	return {
		localBindingNames: entries.map(([bindingName]) => bindingName),
		serviceBindings: Object.fromEntries(
			entries.map(([bindingName], index) => [
				bindingName,
				{ name: toLocalSecretWorkerName(bindingName, index), entrypoint: LOCAL_SECRET_ENTRYPOINT }
			])
		),
		workers: entries.map(([bindingName, value], index) => ({
			name: toLocalSecretWorkerName(bindingName, index),
			modules: true,
			script: LOCAL_SECRET_BINDING_SCRIPT,
			compatibilityDate: LOCAL_SECRET_COMPATIBILITY_DATE,
			bindings: { value }
		}))
	}
}

export function buildLocalSecretNodeBindings(
	config: Pick<DevflareConfig, 'bindings' | 'secretsStoreId'>,
	cwd: string
): Record<string, LocalSecretsStoreSecretBinding> {
	const values = resolveLocalSecretValuesForBindings(config, cwd)

	return Object.fromEntries(
		Object.entries(values).map(([bindingName, value]) => [
			bindingName,
			{
				async get() {
					return value
				}
			}
		])
	)
}

function hasSecretsStoreAdminApi(value: unknown): value is MiniflareSecretsStoreSeeder {
	return (
		typeof (value as { getSecretsStoreSecretAPI?: unknown }).getSecretsStoreSecretAPI === 'function'
	)
}

async function getSecretAdmin(
	miniflare: MiniflareSecretsStoreSeeder,
	bindingName: string
): Promise<SecretsStoreSecretAdmin> {
	const adminOrFactory = await miniflare.getSecretsStoreSecretAPI(bindingName)
	return typeof adminOrFactory === 'function' ? adminOrFactory() : adminOrFactory
}

async function upsertMiniflareSecret(admin: SecretsStoreSecretAdmin, value: string): Promise<void> {
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
	miniflare: unknown,
	config: Pick<DevflareConfig, 'bindings' | 'secretsStoreId'>,
	cwd: string
): Promise<void> {
	if (!hasSecretsStoreAdminApi(miniflare)) {
		return
	}

	const values = resolveLocalSecretValuesForBindings(config, cwd)

	for (const [bindingName, value] of Object.entries(values)) {
		const admin = await getSecretAdmin(miniflare, bindingName)
		await upsertMiniflareSecret(admin, value)
	}
}
