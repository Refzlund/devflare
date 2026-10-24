// =============================================================================
// SvelteKit Hooks — Server-side request handling
// =============================================================================
// Under `devflare dev`, devflare's handle serves this request's bindings, and
// `cloudflare:workers` reads them. Anything else goes after it in `sequence()`.
// =============================================================================

export { handle } from 'devflare/sveltekit'
