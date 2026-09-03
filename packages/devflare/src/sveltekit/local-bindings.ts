import { type DevflareConfig, normalizeHyperdriveBinding } from '../config'
import { buildLocalSecretNodeBindings } from '../secrets/local-secrets'
import { createLocalHyperdrive } from '../shims/local-hyperdrive'
import { createLocalImagesBinding, createLocalMediaBinding } from '../shims/local-media-bindings'
import { createLocalWorkerLoaderBinding } from '../shims/local-worker-loader'
import { createLocalSendEmailBinding } from '../utils/send-email'

function buildLocalHyperdriveBindings(config: DevflareConfig): Record<string, Hyperdrive> {
	const bindings: Record<string, Hyperdrive> = {}

	for (const [name, binding] of Object.entries(config.bindings?.hyperdrive ?? {})) {
		const normalized = normalizeHyperdriveBinding(binding)
		if (normalized.localConnectionString) {
			bindings[name] = createLocalHyperdrive(normalized.localConnectionString)
		}
	}

	return bindings
}

export function buildSvelteKitLocalBindings(
	config: DevflareConfig,
	cwd: string
): Record<string, unknown> {
	const bindings: Record<string, unknown> = {
		...(config.vars ?? {}),
		...buildLocalHyperdriveBindings(config),
		...buildLocalSecretNodeBindings(config, cwd)
	}

	for (const [name, binding] of Object.entries(config.bindings?.sendEmail ?? {})) {
		bindings[name] = createLocalSendEmailBinding(binding)
	}

	for (const name of Object.keys(config.bindings?.workerLoaders ?? {})) {
		bindings[name] = createLocalWorkerLoaderBinding()
	}

	for (const name of Object.keys(config.bindings?.images ?? {})) {
		bindings[name] = createLocalImagesBinding()
	}

	for (const name of Object.keys(config.bindings?.media ?? {})) {
		bindings[name] = createLocalMediaBinding()
	}

	return bindings
}

export function overlayLocalBindings(
	baseEnv: Record<string, unknown>,
	localBindings: Record<string, unknown>
): Record<string, unknown> {
	if (Object.keys(localBindings).length === 0) {
		return baseEnv
	}

	return new Proxy(baseEnv, {
		get(target, prop, receiver) {
			if (typeof prop === 'string' && prop in localBindings) {
				return localBindings[prop]
			}

			return Reflect.get(target, prop, receiver)
		},
		has(target, prop) {
			return (typeof prop === 'string' && prop in localBindings) || Reflect.has(target, prop)
		},
		ownKeys(target) {
			return Array.from(new Set([...Reflect.ownKeys(target), ...Reflect.ownKeys(localBindings)]))
		},
		getOwnPropertyDescriptor(target, prop) {
			if (typeof prop === 'string' && prop in localBindings) {
				return {
					configurable: true,
					enumerable: true,
					writable: false,
					value: localBindings[prop]
				}
			}

			return Reflect.getOwnPropertyDescriptor(target, prop)
		}
	})
}
