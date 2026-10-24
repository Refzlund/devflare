// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
// DevflareEnv is declared globally by env.d.ts, generated via `bun run types`.

declare global {
	// SvelteKit 3's Cloudflare adapter serves the bindings from `cloudflare:workers`,
	// whose `env` is typed as `Cloudflare.Env`.
	namespace Cloudflare {
		interface Env extends DevflareEnv {}
	}

	namespace App {
		// interface Error {}
		// interface Locals {}
		// interface PageData {}
		// interface PageState {}
	}
}

export {}
