import type { DevflareConfig } from './schema'

const PREVIEW_SCOPED_NAME_PREFIX = '__DEVFLARE_PREVIEW_SCOPE__:'

export interface PreviewScopeOptions {
	separator?: string
}

export interface PreviewScopedNameOptions {
	separator?: string
}

interface EncodedPreviewScopedName {
	baseName: string
	separator: string
}

export type PreviewScopedName = string & {
	readonly __devflarePreviewScopedName: unique symbol
}

export interface PreviewScopeFn {
	(baseName: string, options?: PreviewScopedNameOptions): PreviewScopedName
}

export interface PreviewResolutionOptions {
	environment?: string
	env?: Record<string, string | undefined>
	identifier?: string
}

function getPreviewScopedSeparator(options: PreviewScopedNameOptions | PreviewScopeOptions | undefined): string {
	return options?.separator ?? '-'
}

function encodePreviewScopedName(value: EncodedPreviewScopedName): PreviewScopedName {
	return `${PREVIEW_SCOPED_NAME_PREFIX}${JSON.stringify(value)}` as PreviewScopedName
}

function decodePreviewScopedName(value: PreviewScopedName): EncodedPreviewScopedName {
	const payload = value.slice(PREVIEW_SCOPED_NAME_PREFIX.length)
	const parsed = JSON.parse(payload) as Partial<EncodedPreviewScopedName>

	return {
		baseName: typeof parsed.baseName === 'string' ? parsed.baseName : '',
		separator: typeof parsed.separator === 'string' && parsed.separator.length > 0
			? parsed.separator
			: '-'
	}
}

function normalizePreviewFragment(rawValue: string): string {
	let normalized = rawValue
		.toLowerCase()
		.replace(/[^a-z0-9-]+/g, '-')
		.replace(/-+/g, '-')
		.replace(/^-+|-+$/g, '')

	if (!normalized) {
		normalized = 'preview'
	}

	if (!/^[a-z]/.test(normalized)) {
		normalized = `b-${normalized}`
	}

	return normalized
}

function getPreviewIdentifierFromEnv(env: Record<string, string | undefined>): string | undefined {
	const explicitIdentifier = env.DEVFLARE_PREVIEW_IDENTIFIER?.trim()
	if (explicitIdentifier) {
		return normalizePreviewFragment(explicitIdentifier)
	}

	const previewPr = env.DEVFLARE_PREVIEW_PR?.trim()
	if (previewPr) {
		return normalizePreviewFragment(`pr-${previewPr}`)
	}

	const previewBranch = env.DEVFLARE_PREVIEW_BRANCH?.trim()
	if (previewBranch) {
		return normalizePreviewFragment(previewBranch)
	}

	return undefined
}

function resolvePreviewIdentifier(options: PreviewResolutionOptions = {}): string | undefined {
	if (options.identifier?.trim()) {
		return normalizePreviewFragment(options.identifier)
	}

	const env = options.env ?? process.env
	const envIdentifier = getPreviewIdentifierFromEnv(env)
	if (envIdentifier) {
		return envIdentifier
	}

	return options.environment === 'preview'
		? 'preview'
		: undefined
}

function mapRecordValues<TValue>(
	record: Record<string, TValue>,
	mapper: (value: TValue) => TValue
): Record<string, TValue> {
	return Object.fromEntries(
		Object.entries(record).map(([key, value]) => [key, mapper(value)])
	) as Record<string, TValue>
}

export const preview = {
	scope(defaults: PreviewScopeOptions = {}): PreviewScopeFn {
		return (baseName: string, options: PreviewScopedNameOptions = {}) => {
			return encodePreviewScopedName({
				baseName,
				separator: getPreviewScopedSeparator({
					...defaults,
					...options
				})
			})
		}
	}
}

export function isPreviewScopedName(value: unknown): value is PreviewScopedName {
	return typeof value === 'string' && value.startsWith(PREVIEW_SCOPED_NAME_PREFIX)
}

export function materializePreviewScopedString(
	value: string,
	options: PreviewResolutionOptions = {}
): string {
	if (!isPreviewScopedName(value)) {
		return value
	}

	const scoped = decodePreviewScopedName(value)
	const previewIdentifier = resolvePreviewIdentifier(options)

	return previewIdentifier
		? `${scoped.baseName}${scoped.separator}${previewIdentifier}`
		: scoped.baseName
}

export function materializePreviewScopedConfig(
	config: DevflareConfig,
	options: PreviewResolutionOptions = {}
): DevflareConfig {
	if (!config.bindings) {
		return config
	}

	const bindings = config.bindings

	return {
		...config,
		bindings: {
			...bindings,
			...(bindings.kv
				? {
					kv: mapRecordValues(bindings.kv, (binding) => {
						return typeof binding === 'string'
							? materializePreviewScopedString(binding, options)
							: binding
					})
				}
				: {}),
			...(bindings.d1
				? {
					d1: mapRecordValues(bindings.d1, (binding) => {
						return typeof binding === 'string'
							? materializePreviewScopedString(binding, options)
							: binding
					})
				}
				: {}),
			...(bindings.r2
				? {
					r2: mapRecordValues(bindings.r2, (binding) => {
						return materializePreviewScopedString(binding, options)
					})
				}
				: {}),
			...(bindings.queues
				? {
					queues: {
						...bindings.queues,
						...(bindings.queues.producers
							? {
								producers: mapRecordValues(bindings.queues.producers, (queueName) => {
									return materializePreviewScopedString(queueName, options)
								})
							}
							: {}),
						...(bindings.queues.consumers
							? {
								consumers: bindings.queues.consumers.map((consumer) => ({
									...consumer,
									queue: materializePreviewScopedString(consumer.queue, options),
									...(consumer.deadLetterQueue
										? {
											deadLetterQueue: materializePreviewScopedString(consumer.deadLetterQueue, options)
										}
										: {})
								}))
							}
							: {})
					}
				}
				: {}),
			...(bindings.services
				? {
					services: mapRecordValues(bindings.services, (binding) => ({
						...binding,
						service: materializePreviewScopedString(binding.service, options)
					}))
				}
				: {}),
			...(bindings.vectorize
				? {
					vectorize: mapRecordValues(bindings.vectorize, (binding) => ({
						...binding,
						indexName: materializePreviewScopedString(binding.indexName, options)
					}))
				}
				: {}),
			...(bindings.hyperdrive
				? {
					hyperdrive: mapRecordValues(bindings.hyperdrive, (binding) => {
						return typeof binding === 'string'
							? materializePreviewScopedString(binding, options)
							: binding
					})
				}
				: {}),
			...(bindings.browser
				? {
					browser: mapRecordValues(bindings.browser, (binding) => {
						return materializePreviewScopedString(binding, options)
					})
				}
				: {}),
			...(bindings.analyticsEngine
				? {
					analyticsEngine: mapRecordValues(bindings.analyticsEngine, (binding) => ({
						...binding,
						dataset: materializePreviewScopedString(binding.dataset, options)
					}))
				}
				: {})
		}
	}
}