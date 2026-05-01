/**
 * Wrangler config type — represents the output format for wrangler.jsonc
 */
export interface WranglerConfig {
	name: string
	account_id?: string
	main?: string
	compatibility_date: string
	compatibility_flags?: string[]
	rules?: WranglerModuleRule[]
	find_additional_modules?: boolean
	base_dir?: string
	preserve_file_names?: boolean
	preview_urls?: boolean
	workers_dev?: boolean

	// Bindings
	kv_namespaces?: WranglerKVNamespaceBinding[]
	d1_databases?: WranglerD1DatabaseBinding[]
	r2_buckets?: Array<{ binding: string; bucket_name: string }>
	durable_objects?: {
		bindings: Array<{
			name: string
			class_name: string
			script_name?: string
		}>
	}
	queues?: {
		producers?: Array<{ binding: string; queue: string }>
		consumers?: Array<{
			queue: string
			max_batch_size?: number
			max_batch_timeout?: number
			max_retries?: number
			dead_letter_queue?: string
			max_concurrency?: number
			retry_delay?: number
		}>
	}
	ratelimits?: Array<{
		name: string
		namespace_id: string
		simple: {
			limit: number
			period: 10 | 60
		}
	}>
	version_metadata?: {
		binding: string
	}
	worker_loaders?: Array<{
		binding: string
	}>
	secrets_store_secrets?: Array<{
		binding: string
		store_id: string
		secret_name: string
	}>
	mtls_certificates?: Array<{
		binding: string
		certificate_id: string
		remote?: boolean
	}>
	dispatch_namespaces?: Array<{
		binding: string
		namespace: string
		outbound?: {
			service: string
			environment?: string
			parameters?: string[]
		}
		remote?: boolean
	}>
	workflows?: Array<{
		binding: string
		name: string
		class_name: string
		script_name?: string
		remote?: boolean
		limits?: {
			steps: number
		}
	}>
	pipelines?: Array<{
		binding: string
		pipeline: string
		remote?: boolean
	}>
	services?: Array<{
		binding: string
		service: string
		entrypoint?: string
		environment?: string
	}>
	ai?: { binding: string; remote?: boolean; staging?: boolean }
	ai_search_namespaces?: Array<{ binding: string; namespace: string; remote?: boolean }>
	ai_search?: Array<{ binding: string; instance_name: string; remote?: boolean }>
	vectorize?: Array<{ binding: string; index_name: string; remote?: boolean }>
	hyperdrive?: WranglerHyperdriveBinding[]
	browser?: { binding: string; remote?: boolean }
	images?: {
		binding: string
		remote?: boolean
	}
	media?: {
		binding: string
		remote?: boolean
	}
	artifacts?: Array<{
		binding: string
		namespace: string
		remote?: boolean
	}>
	containers?: Array<{
		class_name: string
		image: string
		max_instances?: number
		instance_type?: string
		name?: string
		image_build_context?: string
		image_vars?: Record<string, string>
		rollout_active_grace_period?: number
		rollout_step_percentage?: number | number[]
	}>
	analytics_engine_datasets?: Array<{ binding: string; dataset: string }>
	send_email?: Array<{
		name: string
		destination_address?: string
		allowed_destination_addresses?: string[]
		allowed_sender_addresses?: string[]
	}>

	// Triggers
	triggers?: {
		crons?: string[]
	}
	tail_consumers?: Array<{
		service: string
		environment?: string
	}>

	// Variables
	vars?: Record<string, unknown>
	secrets?: {
		required?: string[]
	}

	// Routes
	routes?: Array<{
		pattern: string
		zone_name?: string
		zone_id?: string
		custom_domain?: boolean
	}>

	// Assets
	assets?: {
		directory: string
		binding?: string
		html_handling?: 'auto-trailing-slash' | 'force-trailing-slash' | 'drop-trailing-slash' | 'none'
		not_found_handling?: 'single-page-application' | '404-page' | 'none'
		run_worker_first?: boolean | string[]
	}

	// Placement
	placement?:
		| {
				mode: 'off' | 'smart'
				hint?: string
		  }
		| {
				mode?: 'targeted'
				region: string
		  }
		| {
				mode?: 'targeted'
				host: string
		  }
		| {
				mode?: 'targeted'
				hostname: string
		  }

	// Observability
	observability?: {
		enabled?: boolean
		head_sampling_rate?: number
		logs?: {
			enabled?: boolean
			head_sampling_rate?: number
			invocation_logs?: boolean
			persist?: boolean
			destinations?: string[]
		}
		traces?: {
			enabled?: boolean
			head_sampling_rate?: number
			persist?: boolean
			destinations?: string[]
		}
	}

	// Limits
	limits?: {
		cpu_ms?: number
		subrequests?: number
	}

	// Migrations
	migrations?: Array<{
		tag: string
		new_classes?: string[]
		renamed_classes?: Array<{ from: string; to: string }>
		deleted_classes?: string[]
		new_sqlite_classes?: string[]
	}>

	// Passthrough fields (any additional fields)
	[key: string]: unknown
}

export type WranglerKVNamespaceBinding =
	| { binding: string; id: string }
	| { binding: string; name: string }

export type WranglerD1DatabaseBinding =
	| { binding: string; database_id: string }
	| { binding: string; database_name: string }

export type WranglerHyperdriveBinding =
	| { binding: string; id: string; localConnectionString?: string }
	| { binding: string; name: string; localConnectionString?: string }

export interface WranglerModuleRule {
	type: 'ESModule' | 'CommonJS' | 'CompiledWasm' | 'Text' | 'Data'
	globs: string[]
	fallthrough?: boolean
}

export interface CompileConfigOptions {
	preserveNamedBindings?: boolean
	/**
	 * If true, skip the internal `resolveConfigForEnvironment` call. Use when
	 * the caller has already merged environment overrides and materialized
	 * preview-scoped bindings (e.g. the deploy path). Idempotent today, but
	 * `R1` step 4 will make env-merge non-idempotent for some array-additive
	 * fields, so callers on the deploy path should set this explicitly. (CR1.)
	 */
	alreadyResolved?: boolean
}
