// =============================================================================
// Test-context transport encoding/decoding helpers
// =============================================================================
// Loads the user-defined transport module (if any) and builds a recursive
// `decode` function that walks an arbitrary value, looking for the
// `__transport` envelope produced by the bridge worker and applying the
// matching user decoder.
// =============================================================================

import { join } from 'path'

export type TransportDecoderMap = Map<string, (v: unknown) => unknown>

/**
 * Load the user's transport module from disk and build a name -> decoder map.
 * Returns `null` if the module exists but does not export a `transport` object
 * (a warning is logged in that case).
 */
export async function loadTransportDecoders(
	configDir: string,
	transportFile: string
): Promise<TransportDecoderMap | null> {
	const transportPath = join(configDir, transportFile)
	const transportModule = await import(transportPath)

	if (!transportModule.transport) {
		console.warn(
			`[devflare] Warning: Transport file "${transportFile}" does not export a named "transport" object.\n` +
				`Expected: export const transport = { ... }\n` +
				`Transport encoding/decoding will be disabled.`
		)
		return null
	}

	const decoders: TransportDecoderMap = new Map()
	for (const [typeName, transporter] of Object.entries(transportModule.transport)) {
		const t = transporter as { encode: (v: unknown) => unknown; decode: (v: unknown) => unknown }
		decoders.set(typeName, t.decode)
	}
	return decoders
}

/**
 * Recursively walk `value`, replacing `{ __transport, value }` envelopes with
 * the result of the registered decoder. Returns `value` unchanged when
 * `decoders` is `null` or no envelope is present.
 */
export function decodeTransportValue(
	decoders: TransportDecoderMap | null,
	value: unknown
): unknown {
	if (!decoders || value === null || typeof value !== 'object') {
		return value
	}

	if ('__transport' in (value as Record<string, unknown>)) {
		const encoded = value as { __transport: string; value: unknown }
		const decoder = decoders.get(encoded.__transport)
		if (decoder) {
			return decoder(encoded.value)
		}
	}

	if (Array.isArray(value)) {
		return value.map((item) => decodeTransportValue(decoders, item))
	}

	const result: Record<string, unknown> = {}
	for (const [k, v] of Object.entries(value)) {
		result[k] = decodeTransportValue(decoders, v)
	}
	return result
}
