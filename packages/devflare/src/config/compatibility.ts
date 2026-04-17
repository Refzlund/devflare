export const FORCED_COMPATIBILITY_FLAGS = ['nodejs_compat', 'nodejs_als']

export function normalizeCompatibilityFlags(flags: string[] = []): string[] {
	return [...new Set([...FORCED_COMPATIBILITY_FLAGS, ...flags])]
}