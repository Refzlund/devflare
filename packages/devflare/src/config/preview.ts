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

export type PreviewScopeFn = (
	baseName: string,
	options?: PreviewScopedNameOptions
) => PreviewScopedName

export interface PreviewResolutionOptions {
	environment?: string
	env?: Record<string, string | undefined>
	identifier?: string
}

export type PreviewIdentifierSource =
	| 'identifier'
	| 'env-identifier'
	| 'env-pr'
	| 'env-branch'
	| 'environment'
	| 'none'

export interface ResolvedPreviewIdentifier {
	identifier?: string
	source: PreviewIdentifierSource
}

function getPreviewScopedSeparator(
	options: PreviewScopedNameOptions | PreviewScopeOptions | undefined
): string {
	return options?.separator ?? '-'
}

function encodePreviewScopedName(value: EncodedPreviewScopedName): PreviewScopedName {
	return `${PREVIEW_SCOPED_NAME_PREFIX}${JSON.stringify(value)}` as PreviewScopedName
}

function invalidPreviewScopedName(reason: string): never {
	throw new Error(
		`Invalid Devflare preview-scoped value: ${reason}. Recreate it with preview.scope(...) instead of constructing preview markers manually.`
	)
}

function decodePreviewScopedName(value: PreviewScopedName): EncodedPreviewScopedName {
	const payload = value.slice(PREVIEW_SCOPED_NAME_PREFIX.length)
	let parsed: Partial<EncodedPreviewScopedName>

	try {
		parsed = JSON.parse(payload) as Partial<EncodedPreviewScopedName>
	} catch {
		invalidPreviewScopedName('the encoded payload is not valid JSON')
	}

	const baseName = typeof parsed.baseName === 'string' ? parsed.baseName : ''

	if (!baseName.trim()) {
		invalidPreviewScopedName('the encoded payload is missing a non-empty baseName')
	}

	return {
		baseName,
		separator:
			typeof parsed.separator === 'string' && parsed.separator.length > 0 ? parsed.separator : '-'
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

function getPreviewIdentifierFromEnv(
	env: Record<string, string | undefined>
): ResolvedPreviewIdentifier {
	const explicitIdentifier = env.DEVFLARE_PREVIEW_IDENTIFIER?.trim()
	if (explicitIdentifier) {
		return {
			identifier: normalizePreviewFragment(explicitIdentifier),
			source: 'env-identifier'
		}
	}

	const previewPr = env.DEVFLARE_PREVIEW_PR?.trim()
	if (previewPr) {
		return {
			identifier: normalizePreviewFragment(`pr-${previewPr}`),
			source: 'env-pr'
		}
	}

	const previewBranch = env.DEVFLARE_PREVIEW_BRANCH?.trim()
	if (previewBranch) {
		return {
			identifier: normalizePreviewFragment(previewBranch),
			source: 'env-branch'
		}
	}

	return {
		identifier: undefined,
		source: 'none'
	}
}

export function resolvePreviewIdentifier(
	options: PreviewResolutionOptions = {}
): ResolvedPreviewIdentifier {
	if (options.identifier?.trim()) {
		return {
			identifier: normalizePreviewFragment(options.identifier),
			source: 'identifier'
		}
	}

	const env = options.env ?? process.env
	const envIdentifier = getPreviewIdentifierFromEnv(env)
	if (envIdentifier.identifier) {
		return envIdentifier
	}

	return options.environment === 'preview'
		? {
				identifier: 'preview',
				source: 'environment'
			}
		: {
				identifier: undefined,
				source: 'none'
			}
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
			if (!baseName.trim()) {
				throw new Error('preview.scope(...) requires a non-empty baseName.')
			}

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
	const previewIdentifier = resolvePreviewIdentifier(options).identifier

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
	const hasPreviewIdentifier = Boolean(resolvePreviewIdentifier(options).identifier)

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
							return typeof binding === 'string'
								? materializePreviewScopedString(binding, options)
								: {
										...binding,
										bucketName: materializePreviewScopedString(binding.bucketName, options)
									}
						})
					}
				: {}),
			...(bindings.queues
				? {
						queues: {
							...bindings.queues,
							...(bindings.queues.producers
								? {
										producers: mapRecordValues(bindings.queues.producers, (producer) => {
											return typeof producer === 'string'
												? materializePreviewScopedString(producer, options)
												: {
														...producer,
														queue: materializePreviewScopedString(producer.queue, options)
													}
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
														deadLetterQueue: materializePreviewScopedString(
															consumer.deadLetterQueue,
															options
														)
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
							if (typeof binding === 'string') {
								return materializePreviewScopedString(binding, options)
							}
							if (
								binding &&
								typeof binding === 'object' &&
								'name' in binding &&
								typeof binding.name === 'string'
							) {
								if (hasPreviewIdentifier && binding.previewId) {
									return {
										id: binding.previewId,
										...(binding.localConnectionString && {
											localConnectionString: binding.localConnectionString
										}),
										...(!binding.localConnectionString &&
											binding.previewLocalConnectionString && {
												localConnectionString: binding.previewLocalConnectionString
											})
									}
								}
								return {
									...binding,
									name: materializePreviewScopedString(binding.name, options)
								}
							}
							return binding
						})
					}
				: {}),
			...(bindings.browser
				? {
						browser: mapRecordValues(bindings.browser, (binding) => {
							return typeof binding === 'string'
								? materializePreviewScopedString(binding, options)
								: binding
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
