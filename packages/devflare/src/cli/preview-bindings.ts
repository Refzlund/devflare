import { type APIClientOptions, type WorkerDeploymentInfo, account } from '../cloudflare'
import { compileBuildConfig } from '../config/compiler'
import type { DevflareConfig } from '../config/schema'
import type { ProcessRunner } from './dependencies'

export interface ParsedWranglerBindingRow {
	type: string
	bindingName: string
	resource: string
}

export interface ParsedQueueAssociation {
	queueName: string
	producerWorkers: string[]
	consumerWorkers: string[]
}

interface BindingAssociationTarget {
	key: string
	referenceLabels: string[]
	type: string
	resource: string
	notes: string[]
	queueName?: string
}

export interface BindingAssociationRow {
	reference: string
	type: string
	resource: string
	workerCount: number
	connectedWorkers: string[]
	notes: string[]
	producerWorkers?: string[]
	consumerWorkers?: string[]
}

export interface BindingAssociationInspection {
	workerName: string
	rows: BindingAssociationRow[]
	targets: number
	scannedWorkers: string[]
	warnings: string[]
}

export interface InspectBindingAssociationsOptions {
	accountId: string
	config: DevflareConfig
	workerName?: string
	cwd: string
	exec: ProcessRunner
	apiOptions?: APIClientOptions
}

function normalizeCell(value: string | undefined): string {
	return (value ?? '').trim().replace(/\s+/g, ' ')
}

function buildAssociationKey(type: string, resource: string): string {
	return `${normalizeCell(type).toLowerCase()}\u0000${normalizeCell(resource).toLowerCase()}`
}

function uniqueStrings(values: string[]): string[] {
	return Array.from(new Set(values.filter((value) => value.trim().length > 0)))
}

function formatSendEmailResource(entry: {
	destination_address?: string
	allowed_destination_addresses?: string[]
	allowed_sender_addresses?: string[]
}): string {
	const destination = entry.destination_address?.trim()
	if (destination) {
		return destination
	}

	const destinations = uniqueStrings(entry.allowed_destination_addresses ?? [])
	const senders = uniqueStrings(entry.allowed_sender_addresses ?? [])
	const destinationLabel =
		destinations.length > 0 ? destinations.join(', ') : 'configured destinations'

	if (senders.length === 0) {
		return destinationLabel
	}

	return `${destinationLabel} - senders: ${senders.join(', ')}`
}

function addAssociationTarget(
	targets: Map<string, BindingAssociationTarget>,
	input: {
		reference?: string
		type: string
		resource?: string
		note?: string
		queueName?: string
	}
): void {
	const type = normalizeCell(input.type)
	const resource = normalizeCell(input.resource)
	const key = buildAssociationKey(type, resource)
	const existing = targets.get(key)

	if (existing) {
		if (input.reference) {
			existing.referenceLabels = uniqueStrings([...existing.referenceLabels, input.reference])
		}
		if (input.note) {
			existing.notes = uniqueStrings([...existing.notes, input.note])
		}
		if (!existing.queueName && input.queueName) {
			existing.queueName = input.queueName
		}
		return
	}

	targets.set(key, {
		key,
		referenceLabels: input.reference ? [input.reference] : [],
		type,
		resource,
		notes: input.note ? [input.note] : [],
		queueName: input.queueName
	})
}

function collectBindingAssociationTargets(config: DevflareConfig): BindingAssociationTarget[] {
	const compiled = compileBuildConfig(config)
	const targets = new Map<string, BindingAssociationTarget>()

	for (const binding of compiled.kv_namespaces ?? []) {
		addAssociationTarget(targets, {
			reference: binding.binding,
			type: 'KV Namespace',
			resource: 'id' in binding ? binding.id : binding.name
		})
	}

	for (const binding of compiled.d1_databases ?? []) {
		addAssociationTarget(targets, {
			reference: binding.binding,
			type: 'D1 Database',
			resource: 'database_id' in binding ? binding.database_id : binding.database_name
		})
	}

	for (const binding of compiled.r2_buckets ?? []) {
		addAssociationTarget(targets, {
			reference: binding.binding,
			type: 'R2 Bucket',
			resource: binding.bucket_name
		})
	}

	for (const binding of compiled.durable_objects?.bindings ?? []) {
		addAssociationTarget(targets, {
			reference: binding.name,
			type: 'Durable Object Namespace',
			resource: binding.class_name,
			note: binding.script_name ? `script ${binding.script_name}` : undefined
		})
	}

	for (const binding of compiled.queues?.producers ?? []) {
		addAssociationTarget(targets, {
			reference: binding.binding,
			type: 'Queue',
			resource: binding.queue,
			note: 'producer binding',
			queueName: binding.queue
		})
	}

	for (const binding of compiled.queues?.consumers ?? []) {
		addAssociationTarget(targets, {
			type: 'Queue',
			resource: binding.queue,
			note: 'consumer attachment',
			queueName: binding.queue
		})

		if (binding.dead_letter_queue) {
			addAssociationTarget(targets, {
				type: 'Queue',
				resource: binding.dead_letter_queue,
				note: 'dead letter queue',
				queueName: binding.dead_letter_queue
			})
		}
	}

	for (const binding of compiled.ratelimits ?? []) {
		addAssociationTarget(targets, {
			reference: binding.name,
			type: 'Rate Limiting',
			resource: binding.namespace_id
		})
	}

	if (compiled.version_metadata) {
		addAssociationTarget(targets, {
			reference: compiled.version_metadata.binding,
			type: 'Version Metadata',
			resource: 'Version Metadata'
		})
	}

	for (const binding of compiled.worker_loaders ?? []) {
		addAssociationTarget(targets, {
			reference: binding.binding,
			type: 'Worker Loader',
			resource: 'Worker Loader'
		})
	}

	for (const binding of compiled.mtls_certificates ?? []) {
		addAssociationTarget(targets, {
			reference: binding.binding,
			type: 'mTLS Certificate',
			resource: binding.certificate_id
		})
	}

	for (const binding of compiled.dispatch_namespaces ?? []) {
		addAssociationTarget(targets, {
			reference: binding.binding,
			type: 'Dispatch Namespace',
			resource: binding.namespace,
			note: binding.outbound ? `outbound ${binding.outbound.service}` : undefined
		})
	}

	for (const binding of compiled.workflows ?? []) {
		addAssociationTarget(targets, {
			reference: binding.binding,
			type: 'Workflow',
			resource: binding.name,
			note: binding.script_name ? `script ${binding.script_name}` : binding.class_name
		})
	}

	for (const binding of compiled.pipelines ?? []) {
		addAssociationTarget(targets, {
			reference: binding.binding,
			type: 'Pipeline',
			resource: binding.pipeline,
			note: binding.remote ? 'remote local binding' : undefined
		})
	}

	if (compiled.images) {
		addAssociationTarget(targets, {
			reference: compiled.images.binding,
			type: 'Images',
			resource: 'Images',
			note: compiled.images.remote ? 'remote local binding' : undefined
		})
	}

	if (compiled.media) {
		addAssociationTarget(targets, {
			reference: compiled.media.binding,
			type: 'Media Transformations',
			resource: 'Media Transformations',
			note: compiled.media.remote ? 'remote local binding' : undefined
		})
	}

	for (const binding of compiled.artifacts ?? []) {
		addAssociationTarget(targets, {
			reference: binding.binding,
			type: 'Artifacts',
			resource: binding.namespace,
			note: binding.remote ? 'remote local binding' : undefined
		})
	}

	for (const binding of compiled.secrets_store_secrets ?? []) {
		addAssociationTarget(targets, {
			reference: binding.binding,
			type: 'Secrets Store',
			resource: `${binding.store_id}/${binding.secret_name}`
		})
	}

	for (const consumer of compiled.tail_consumers ?? []) {
		addAssociationTarget(targets, {
			type: 'Tail Consumer',
			resource: consumer.service,
			note: consumer.environment ? `env ${consumer.environment}` : undefined
		})
	}

	for (const binding of compiled.services ?? []) {
		addAssociationTarget(targets, {
			reference: binding.binding,
			type: 'Worker',
			resource: binding.entrypoint ? `${binding.service}#${binding.entrypoint}` : binding.service,
			note: binding.environment ? `env ${binding.environment}` : undefined
		})
	}

	if (compiled.ai?.binding) {
		addAssociationTarget(targets, {
			reference: compiled.ai.binding,
			type: 'AI',
			resource: 'Workers AI'
		})
	}

	for (const binding of compiled.vectorize ?? []) {
		addAssociationTarget(targets, {
			reference: binding.binding,
			type: 'Vectorize',
			resource: binding.index_name
		})
	}

	for (const binding of compiled.hyperdrive ?? []) {
		addAssociationTarget(targets, {
			reference: binding.binding,
			type: 'Hyperdrive',
			resource: 'id' in binding ? binding.id : binding.name
		})
	}

	if (compiled.browser?.binding) {
		addAssociationTarget(targets, {
			reference: compiled.browser.binding,
			type: 'Browser',
			resource: 'Browser Rendering'
		})
	}

	for (const binding of compiled.analytics_engine_datasets ?? []) {
		addAssociationTarget(targets, {
			reference: binding.binding,
			type: 'Analytics Engine',
			resource: binding.dataset
		})
	}

	for (const binding of compiled.send_email ?? []) {
		addAssociationTarget(targets, {
			reference: binding.name,
			type: 'Send Email',
			resource: formatSendEmailResource(binding)
		})
	}

	return Array.from(targets.values())
}

function getActiveVersionId(deployments: WorkerDeploymentInfo[]): string | undefined {
	const sortedDeployments = [...deployments].sort(
		(left, right) => right.createdOn.getTime() - left.createdOn.getTime()
	)

	for (const deployment of sortedDeployments) {
		const version = [...deployment.versions].sort(
			(left, right) => right.percentage - left.percentage
		)[0]
		if (version?.versionId) {
			return version.versionId
		}
	}

	return undefined
}

function extractWorkerNames(value: string): string[] {
	return Array.from(value.matchAll(/worker:([^,\s]+)/gi), (match) => match[1])
}

export function parseWranglerQueueInfo(output: string): ParsedQueueAssociation | null {
	const lines = output.split(/\r?\n/)
	let queueName = ''
	const producerWorkers: string[] = []
	const consumerWorkers: string[] = []
	let currentSection: 'producers' | 'consumers' | null = null

	for (const rawLine of lines) {
		const trimmed = rawLine.trim()
		if (!trimmed) {
			currentSection = null
			continue
		}

		const queueMatch = trimmed.match(/^Queue Name:\s*(.+)$/i)
		if (queueMatch) {
			queueName = normalizeCell(queueMatch[1])
			currentSection = null
			continue
		}

		const producerMatch = trimmed.match(/^Producers:\s*(.*)$/i)
		if (producerMatch) {
			producerWorkers.push(...extractWorkerNames(producerMatch[1]))
			currentSection = producerMatch[1] ? null : 'producers'
			continue
		}

		const consumerMatch = trimmed.match(/^Consumers:\s*(.*)$/i)
		if (consumerMatch) {
			consumerWorkers.push(...extractWorkerNames(consumerMatch[1]))
			currentSection = consumerMatch[1] ? null : 'consumers'
			continue
		}

		if (!currentSection) {
			continue
		}

		const extractedWorkers = extractWorkerNames(trimmed)
		if (currentSection === 'producers') {
			producerWorkers.push(...extractedWorkers)
		} else {
			consumerWorkers.push(...extractedWorkers)
		}
	}

	if (!queueName) {
		return null
	}

	return {
		queueName,
		producerWorkers: uniqueStrings(producerWorkers),
		consumerWorkers: uniqueStrings(consumerWorkers)
	}
}

/**
 * Parse the JSON output of `wrangler versions view --json` into a flat list
 * of `{ type, bindingName, resource }` rows that match the friendly type
 * labels used by `collectBindingAssociationTargets`.
 *
 * Requires Wrangler 3.99+ (the `--json` flag on `versions view`).
 */
export function parseWranglerVersionBindings(jsonOutput: string): ParsedWranglerBindingRow[] {
	let parsed: unknown
	try {
		parsed = JSON.parse(jsonOutput)
	} catch {
		return []
	}

	const bindings = extractBindingsArray(parsed)
	if (!bindings) {
		return []
	}

	const rows: ParsedWranglerBindingRow[] = []
	for (const raw of bindings) {
		const row = mapWranglerBindingToRow(raw)
		if (row) {
			rows.push(row)
		}
	}

	return rows
}

function extractBindingsArray(parsed: unknown): unknown[] | null {
	if (!parsed || typeof parsed !== 'object') {
		return null
	}

	const root = parsed as { resources?: { bindings?: unknown } }
	const bindings = root.resources?.bindings
	return Array.isArray(bindings) ? bindings : null
}

interface RawWranglerBinding {
	type?: string
	name?: string
	[key: string]: unknown
}

function mapWranglerBindingToRow(raw: unknown): ParsedWranglerBindingRow | null {
	if (!raw || typeof raw !== 'object') {
		return null
	}

	const binding = raw as RawWranglerBinding
	const type = typeof binding.type === 'string' ? binding.type : ''
	const bindingName = typeof binding.name === 'string' ? binding.name : ''

	if (!type || !bindingName) {
		return null
	}

	const mapped = mapWranglerBindingType(type, binding)
	if (!mapped) {
		return null
	}

	return {
		type: mapped.friendlyType,
		bindingName,
		resource: mapped.resource
	}
}

function mapWranglerBindingType(
	type: string,
	binding: RawWranglerBinding
): { friendlyType: string; resource: string } | null {
	const stringField = (key: string): string =>
		typeof binding[key] === 'string' ? (binding[key] as string) : ''

	switch (type) {
		case 'kv_namespace':
			return { friendlyType: 'KV Namespace', resource: stringField('namespace_id') }
		case 'd1':
			return { friendlyType: 'D1 Database', resource: stringField('id') }
		case 'r2_bucket':
			return { friendlyType: 'R2 Bucket', resource: stringField('bucket_name') }
		case 'durable_object_namespace':
			return {
				friendlyType: 'Durable Object Namespace',
				resource: stringField('class_name')
			}
		case 'queue':
			return { friendlyType: 'Queue', resource: stringField('queue_name') }
		case 'ratelimit':
			return { friendlyType: 'Rate Limiting', resource: stringField('namespace_id') }
		case 'service': {
			const service = stringField('service') || (binding.name as string)
			const entrypoint = stringField('entrypoint')
			return {
				friendlyType: 'Worker',
				resource: entrypoint ? `${service}#${entrypoint}` : service
			}
		}
		case 'ai':
			return { friendlyType: 'AI', resource: 'Workers AI' }
		case 'vectorize':
			return { friendlyType: 'Vectorize', resource: stringField('index_name') }
		case 'hyperdrive':
			return { friendlyType: 'Hyperdrive', resource: stringField('id') }
		case 'browser':
			return { friendlyType: 'Browser', resource: 'Browser Rendering' }
		case 'analytics_engine':
			return { friendlyType: 'Analytics Engine', resource: stringField('dataset') }
		case 'send_email':
			return {
				friendlyType: 'Send Email',
				resource:
					stringField('destination_address') || stringField('name') || (binding.name as string)
			}
		case 'mtls_certificate':
			return { friendlyType: 'mTLS Certificate', resource: stringField('certificate_id') }
		case 'dispatch_namespace':
			return { friendlyType: 'Dispatch Namespace', resource: stringField('namespace') }
		case 'workflow':
			return {
				friendlyType: 'Workflow',
				resource: stringField('workflow_name') || stringField('name')
			}
		case 'pipeline':
			return { friendlyType: 'Pipeline', resource: stringField('pipeline') }
		case 'images':
			return { friendlyType: 'Images', resource: 'Images' }
		case 'media':
			return { friendlyType: 'Media Transformations', resource: 'Media Transformations' }
		case 'artifacts':
			return { friendlyType: 'Artifacts', resource: stringField('namespace') }
		case 'version_metadata':
			return { friendlyType: 'Version Metadata', resource: 'Version Metadata' }
		case 'worker_loader':
			return { friendlyType: 'Worker Loader', resource: 'Worker Loader' }
		case 'secrets_store_secret':
			return {
				friendlyType: 'Secrets Store',
				resource: `${stringField('store_id')}/${stringField('secret_name')}`
			}
		case 'plain_text':
		case 'json':
		case 'secret_text':
			// Vars / secrets are intentionally ignored — they don't participate
			// in cross-worker binding-association inspection.
			return null
		default:
			return { friendlyType: type, resource: stringField('id') || stringField('name') || '' }
	}
}

async function inspectWorkerBindings(
	exec: ProcessRunner,
	options: {
		accountId: string
		workerName: string
		versionId: string
		cwd: string
	}
): Promise<ParsedWranglerBindingRow[]> {
	const output = await runWranglerInspectionCommand(
		exec,
		['wrangler', 'versions', 'view', options.versionId, '--name', options.workerName, '--json'],
		options,
		'Wrangler versions view failed'
	)

	return parseWranglerVersionBindings(output)
}

async function runWranglerInspectionCommand(
	exec: ProcessRunner,
	args: string[],
	options: {
		accountId: string
		cwd: string
	},
	failureMessage: string
): Promise<string> {
	const result = await exec.exec('bunx', args, {
		cwd: options.cwd,
		env: {
			...process.env,
			CLOUDFLARE_ACCOUNT_ID: options.accountId,
			FORCE_COLOR: process.env.FORCE_COLOR ?? '0'
		}
	})

	if (result.exitCode !== 0) {
		throw new Error(result.stderr || result.stdout || failureMessage)
	}

	return `${result.stdout}\n${result.stderr}`
}

async function inspectQueueAssociation(
	exec: ProcessRunner,
	options: {
		accountId: string
		queueName: string
		cwd: string
	}
): Promise<ParsedQueueAssociation | null> {
	const output = await runWranglerInspectionCommand(
		exec,
		['wrangler', 'queues', 'info', options.queueName],
		options,
		'Wrangler queues info failed'
	)

	return parseWranglerQueueInfo(output)
}

function formatReference(target: BindingAssociationTarget): string {
	return target.referenceLabels.length > 0 ? target.referenceLabels.join(', ') : '—'
}

function formatResource(target: BindingAssociationTarget): string {
	return target.resource || '—'
}

function buildRowNotes(
	target: BindingAssociationTarget,
	queueAssociation: ParsedQueueAssociation | undefined
): string[] {
	const notes = [...target.notes]

	if (queueAssociation) {
		notes.push(`producers ${queueAssociation.producerWorkers.length}`)
		notes.push(`consumers ${queueAssociation.consumerWorkers.length}`)
	}

	return uniqueStrings(notes)
}

export async function inspectBindingAssociations(
	options: InspectBindingAssociationsOptions
): Promise<BindingAssociationInspection> {
	const targets = collectBindingAssociationTargets(options.config)
	const warnings: string[] = []
	const bindingUsage = new Map<string, Set<string>>()
	const scannedWorkers: string[] = []
	const queueTargets = uniqueStrings(
		targets
			.map((target) => target.queueName)
			.filter(
				(queueName): queueName is string => typeof queueName === 'string' && queueName.length > 0
			)
	)
	const queueAssociations = new Map<string, ParsedQueueAssociation>()

	const workers = await account.workers(options.accountId, options.apiOptions)
	for (const worker of workers) {
		let versionId: string | undefined

		try {
			const deployments = await account.workerDeployments(
				options.accountId,
				worker.name,
				options.apiOptions
			)
			versionId = getActiveVersionId(deployments)
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error)
			warnings.push(`Could not resolve active deployment for ${worker.name}: ${message}`)
			continue
		}

		if (!versionId) {
			continue
		}

		scannedWorkers.push(worker.name)

		try {
			const bindings = await inspectWorkerBindings(options.exec, {
				accountId: options.accountId,
				workerName: worker.name,
				versionId,
				cwd: options.cwd
			})

			for (const binding of bindings) {
				const key = buildAssociationKey(binding.type, binding.resource)
				const connectedWorkers = bindingUsage.get(key) ?? new Set<string>()
				connectedWorkers.add(worker.name)
				bindingUsage.set(key, connectedWorkers)
			}
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error)
			warnings.push(`Could not inspect bindings for ${worker.name}: ${message}`)
		}
	}

	for (const queueName of queueTargets) {
		try {
			const queueAssociation = await inspectQueueAssociation(options.exec, {
				accountId: options.accountId,
				queueName,
				cwd: options.cwd
			})

			if (queueAssociation) {
				queueAssociations.set(queueName, queueAssociation)
			}
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error)
			warnings.push(`Could not inspect queue ${queueName}: ${message}`)
		}
	}

	const rows = targets.map((target) => {
		const queueAssociation = target.queueName ? queueAssociations.get(target.queueName) : undefined
		const directlyConnectedWorkers = Array.from(bindingUsage.get(target.key) ?? [])
		const connectedWorkers = uniqueStrings([
			...directlyConnectedWorkers,
			...(queueAssociation?.producerWorkers ?? []),
			...(queueAssociation?.consumerWorkers ?? [])
		]).sort((left, right) => left.localeCompare(right))

		return {
			reference: formatReference(target),
			type: target.type,
			resource: formatResource(target),
			workerCount: connectedWorkers.length,
			connectedWorkers,
			notes: buildRowNotes(target, queueAssociation),
			producerWorkers: queueAssociation?.producerWorkers,
			consumerWorkers: queueAssociation?.consumerWorkers
		}
	})

	return {
		workerName: options.workerName ?? options.config.name,
		rows,
		targets: targets.length,
		scannedWorkers,
		warnings
	}
}
