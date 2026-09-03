// =============================================================================
// Bridge — Debug logging
// =============================================================================
// Internal helper for non-fatal bridge errors that were previously dropped on
// the floor via silent `catch {}`. Output is gated on the `DEVFLARE_DEBUG_BRIDGE`
// environment variable so production noise stays at zero by default.
// =============================================================================

const isDebugEnabled = (): boolean => {
	try {
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const env = (globalThis as any).process?.env
		return Boolean(env?.DEVFLARE_DEBUG_BRIDGE)
	} catch {
		return false
	}
}

export const bridgeLog = {
	warn(message: string, error?: unknown): void {
		if (!isDebugEnabled()) return
		console.warn(`[devflare:bridge] ${message}`, error)
	},
	debug(message: string, error?: unknown): void {
		if (!isDebugEnabled()) return
		console.debug(`[devflare:bridge] ${message}`, error)
	}
}
