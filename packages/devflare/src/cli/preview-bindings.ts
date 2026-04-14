import { account, type APIClientOptions, type WorkerDeploymentInfo } from '../cloudflare'
import { compileConfig } from '../config/compiler'
import type { DevflareConfig } from '../config/schema'
import type { ProcessRunner } from './dependencies'

const WRANGLER_TEXT_COLUMNS_REGEX = /\s{2,}/

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
	const destinationLabel = destinations.length > 0 ? destinations.join(', ') : 'configured destinations'

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
	const compiled = compileConfig(config)
	const targets = new Map<string, BindingAssociationTarget>()

	for (const binding of compiled.kv_namespaces ?? []) {
		addAssociationTarget(targets, {
			reference: binding.binding,
			type: 'KV Namespace',
			resource: binding.id
		})
	}

	for (const binding of compiled.d1_databases ?? []) {
		addAssociationTarget(targets, {
			reference: binding.binding,
			type: 'D1 Database',
			resource: binding.database_id
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

	for (const binding of compiled.services ?? []) {
		addAssociationTarget(targets, {
			reference: binding.binding,
			type: 'Worker',
			resource: binding.entrypoint
				? `${binding.service}#${binding.entrypoint}`
				: binding.service,
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
			resource: binding.id
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
	const sortedDeployments = [...deployments].sort((left, right) => right.createdOn.getTime() - left.createdOn.getTime())

	for (const deployment of sortedDeployments) {
		const version = [...deployment.versions].sort((left, right) => right.percentage - left.percentage)[0]
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

export function parseWranglerVersionBindings(output: string): ParsedWranglerBindingRow[] {
	const lines = output.split(/\r?\n/)
	const bindings: ParsedWranglerBindingRow[] = []
	let inBindingTable = false

	for (const rawLine of lines) {
		const trimmed = rawLine.trim()
		if (!trimmed) {
			continue
		}

		if (/^(binding\s+type|type)\s{2,}/i.test(rawLine) || /^(binding\s+type|type)$/i.test(trimmed)) {
			inBindingTable = true
			continue
		}

		if (!inBindingTable) {
			continue
		}

		if (/^-+$/.test(trimmed)) {
			continue
		}

		const segments = trimmed.split(WRANGLER_TEXT_COLUMNS_REGEX).filter(Boolean)
		if (segments.length < 2) {
			continue
		}

		if (segments[0].endsWith(':')) {
			break
		}

		const [type, bindingName, ...resourceParts] = segments
		if (!type || !bindingName) {
			continue
		}

		bindings.push({
			type: normalizeCell(type),
			bindingName: normalizeCell(bindingName),
			resource: normalizeCell(resourceParts.join('  '))
		})
	}

	return bindings
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
		['wrangler', 'versions', 'view', options.versionId, '--name', options.workerName],
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
			.filter((queueName): queueName is string => typeof queueName === 'string' && queueName.length > 0)
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
		const queueAssociation = target.queueName
			? queueAssociations.get(target.queueName)
			: undefined
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