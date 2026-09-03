// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
// DevflareEnv is declared globally by env.d.ts, generated via `bun run types`.

declare global {
	namespace App {
		interface Platform {
			env: DevflareEnv
			context: ExecutionContext
			caches: CacheStorage
			cf: Record<string, unknown>
		}

		// interface Error {}
		// interface Locals {}
		// interface PageData {}
		// interface PageState {}
	}
}

export { }
