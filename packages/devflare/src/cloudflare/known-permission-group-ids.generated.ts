// =============================================================================
// AUTO-GENERATED FILE — Do not edit by hand.
//
// Regenerate with:
//   bun run --cwd packages/devflare refresh-permission-groups
//
// Source of truth:
//   GET /accounts/:id/tokens/permission_groups (Cloudflare API)
//
// Each entry maps a Devflare symbolic permission-group name to the
// authoritative Cloudflare permission-group UUID, or `null` when no
// verified UUID is known yet (in which case `tokens.ts` falls back to
// exact display-name matching with a console.warn).
// =============================================================================

export const KNOWN_PERMISSION_GROUP_IDS_DATA: {
	WORKERS_SCRIPTS_WRITE: string | null
	WORKERS_SCRIPTS_READ: string | null
	ACCOUNT_SETTINGS_READ: string | null
	WORKERS_KV_STORAGE_WRITE: string | null
	WORKERS_KV_STORAGE_READ: string | null
	ACCOUNT_API_TOKENS_WRITE: string | null
	ACCOUNT_API_TOKENS_READ: string | null
} = {
	WORKERS_SCRIPTS_WRITE: null,
	WORKERS_SCRIPTS_READ: null,
	ACCOUNT_SETTINGS_READ: null,
	WORKERS_KV_STORAGE_WRITE: null,
	WORKERS_KV_STORAGE_READ: null,
	ACCOUNT_API_TOKENS_WRITE: null,
	ACCOUNT_API_TOKENS_READ: null
}
