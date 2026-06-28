const activeWorkerLoaderRuntimes = new Set<{ dispose(): Promise<void> }>()

type WorkerLoaderCodeModule = WorkerLoaderWorkerCode['modules'][string]

function getModuleSource(module: WorkerLoaderCodeModule | undefined, mainModule: string): string {
	if (typeof module === 'string') {
		return module
	}

	if (module && typeof module === 'object' && typeof module.js === 'string') {
		return module.js
	}

	throw new Error(
		`Worker Loader local shim only supports JavaScript main modules. Could not load "${mainModule}".`
	)
}

function createRequestInit(request: Request): RequestInit {
	return {
		method: request.method,
		headers: request.headers,
		body: request.body
	}
}

async function createRuntime(code: WorkerLoaderWorkerCode): Promise<any> {
	const { Miniflare } = await import('miniflare')
	const mainModule = code.mainModule
	const script = getModuleSource(code.modules[mainModule], mainModule)
	const miniflare = new Miniflare({
		modules: true,
		compatibilityDate: code.compatibilityDate,
		...(code.compatibilityFlags && { compatibilityFlags: code.compatibilityFlags }),
		...(code.env && { bindings: code.env }),
		script
	})

	await miniflare.ready
	activeWorkerLoaderRuntimes.add(miniflare)
	return miniflare
}

function createLocalWorkerStub(
	codeProvider: () => WorkerLoaderWorkerCode | Promise<WorkerLoaderWorkerCode>
): WorkerStub {
	let runtimePromise: Promise<any> | null = null

	const getRuntime = () => {
		runtimePromise ??= Promise.resolve(codeProvider()).then(createRuntime)
		return runtimePromise
	}

	const fetcher = {
		async fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
			const request = input instanceof Request ? input : new Request(input, init)
			const runtime = await getRuntime()
			return runtime.dispatchFetch(request.url, createRequestInit(request))
		}
	}

	return {
		getEntrypoint() {
			return fetcher
		},
		getDurableObjectClass() {
			// A DurableObjectClass is an opaque facet-spawning reference that
			// workerd only materialises inside the runtime (it is consumed solely
			// by FacetStartupOptions.class); there is no public Miniflare/workerd
			// API to construct one from outside. The local per-worker Miniflare
			// shim can run the loaded worker's fetch entrypoint, but cannot hand
			// back a standalone Durable Object class reference.
			throw new Error(
				'Worker Loader local shim cannot materialise a dynamic Durable Object class. '
				+ 'getDurableObjectClass() returns an opaque facet-spawning reference that workerd '
				+ 'only exposes inside the runtime. Use createTestContext() (a real Miniflare worker) '
				+ 'for Durable Object behavior, or createMockWorkerLoader({ stub }) to inject a stub.'
			)
		}
	} as unknown as WorkerStub
}

export function createLocalWorkerLoaderBinding(): WorkerLoader {
	return {
		get(
			_name: string | null,
			getCode: () => WorkerLoaderWorkerCode | Promise<WorkerLoaderWorkerCode>
		): WorkerStub {
			return createLocalWorkerStub(getCode)
		},
		load(code: WorkerLoaderWorkerCode): WorkerStub {
			return createLocalWorkerStub(() => code)
		}
	}
}

export async function disposeLocalWorkerLoaderBindings(): Promise<void> {
	const runtimes = Array.from(activeWorkerLoaderRuntimes)
	activeWorkerLoaderRuntimes.clear()

	await Promise.all(runtimes.map(async (runtime) => {
		await runtime.dispose()
	}))
}
