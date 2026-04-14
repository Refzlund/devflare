import {
	account,
	listTrackedRegistryState,
	type DevflareDeploymentRecord,
	type DevflarePreviewAliasRecord,
	type DevflarePreviewRecord,
	type WorkerInfo
} from '../../../cloudflare'
import {
	resolveConfigForEnvironment,
	type DevflareConfig
} from '../../../config'
import { loadConfig, ConfigNotFoundError } from '../../../config/loader'
import { shortenVersionId } from './theme'
import type {
	ConfiguredWorkerFamilyMember,
	PreviewScopeRow,
	PreviewStateScope,
	StableWorkerRow,
	WorkerDisplayGroup
} from './types'

function isRelatedWorkerName(workerName: string, familyName: string): boolean {
	return workerName === familyName || workerName.startsWith(`${familyName}-`)
}

function getPreviewDisplayTimestamp(record: DevflarePreviewRecord): number {
	return (record.updatedAt ?? record.createdAt).getTime()
}

function getAliasDisplayTimestamp(record: DevflarePreviewAliasRecord): number {
	return (record.updatedAt ?? record.createdAt).getTime()
}

function getDeploymentDisplayTimestamp(record: DevflareDeploymentRecord): number {
	return record.createdAt.getTime()
}

function comparePreviewScopeRows(left: PreviewScopeRow, right: PreviewScopeRow): number {
	const leftTime = left.updatedAt?.getTime() ?? 0
	const rightTime = right.updatedAt?.getTime() ?? 0
	if (rightTime !== leftTime) {
		return rightTime - leftTime
	}

	return left.scope.localeCompare(right.scope)
}

function ensureWorkerGroup(
	groups: Map<string, WorkerDisplayGroup>,
	workerName: string
): WorkerDisplayGroup {
	const existing = groups.get(workerName)
	if (existing) {
		return existing
	}

	const created: WorkerDisplayGroup = {
		workerName,
		previews: [],
		aliases: [],
		deployments: [],
		latestTimestamp: 0
	}
	groups.set(workerName, created)
	return created
}

function appendWorkerGroupRecords<RecordType extends { workerName: string }>(
	groups: Map<string, WorkerDisplayGroup>,
	records: RecordType[],
	options: {
		append: (group: WorkerDisplayGroup, record: RecordType) => void
		getTimestamp: (record: RecordType) => number
	}
): void {
	for (const record of records) {
		const group = ensureWorkerGroup(groups, record.workerName)
		options.append(group, record)
		group.latestTimestamp = Math.max(group.latestTimestamp, options.getTimestamp(record))
	}
}

function isVisibleTrackedRecord(
	record: {
		deletedAt?: Date | null
		status: string
	},
	includeAll: boolean
): boolean {
	return includeAll || (!record.deletedAt && record.status === 'active')
}

export function getPreviewDisplayLabel(record: DevflarePreviewRecord): string {
	if (record.alias) {
		return record.alias
	}

	if (record.branchName?.trim()) {
		return record.branchName.trim()
	}

	return `version ${shortenVersionId(record.versionId, 10)}`
}

export function buildWorkerGroups(
	previews: DevflarePreviewRecord[],
	aliases: DevflarePreviewAliasRecord[],
	deployments: DevflareDeploymentRecord[]
): WorkerDisplayGroup[] {
	const groups = new Map<string, WorkerDisplayGroup>()

	appendWorkerGroupRecords(groups, previews, {
		append: (group, record) => {
			group.previews.push(record)
		},
		getTimestamp: getPreviewDisplayTimestamp
	})
	appendWorkerGroupRecords(groups, aliases, {
		append: (group, record) => {
			group.aliases.push(record)
		},
		getTimestamp: getAliasDisplayTimestamp
	})
	appendWorkerGroupRecords(groups, deployments, {
		append: (group, record) => {
			group.deployments.push(record)
		},
		getTimestamp: getDeploymentDisplayTimestamp
	})

	return Array.from(groups.values()).sort((left, right) => {
		if (right.latestTimestamp !== left.latestTimestamp) {
			return right.latestTimestamp - left.latestTimestamp
		}

		return left.workerName.localeCompare(right.workerName)
	})
}

export function collectConfiguredWorkerFamilies(
	config: DevflareConfig,
	environment: string | undefined
): ConfiguredWorkerFamilyMember[] {
	const resolvedConfig = resolveConfigForEnvironment(config, environment)
	const families = new Map<string, ConfiguredWorkerFamilyMember>()

	families.set(resolvedConfig.name, {
		baseName: resolvedConfig.name,
		roleLabel: 'primary',
		role: 'primary'
	})

	for (const [bindingName, binding] of Object.entries(resolvedConfig.bindings?.services ?? {})) {
		const existing = families.get(binding.service)
		if (existing) {
			continue
		}

		families.set(binding.service, {
			baseName: binding.service,
			roleLabel: bindingName,
			role: 'service'
		})
	}

	return Array.from(families.values())
}

export async function loadConfiguredWorkerFamilies(
	cwd: string,
	configFile: string | undefined,
	environment: string | undefined
): Promise<ConfiguredWorkerFamilyMember[] | undefined> {
	try {
		const config = await loadConfig({ cwd, configFile })
		return collectConfiguredWorkerFamilies(config, environment)
	} catch (error) {
		if (error instanceof ConfigNotFoundError) {
			return undefined
		}

		throw error
	}
}

function getLatestDeployment(
	group: WorkerDisplayGroup,
	predicate?: (record: DevflareDeploymentRecord) => boolean
): DevflareDeploymentRecord | undefined {
	return [...group.deployments]
		.filter((record) => predicate ? predicate(record) : true)
		.sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime())[0]
}

function getGroupDisplayUrl(group: WorkerDisplayGroup): string | undefined {
	return getLatestDeployment(group, (record) => record.channel === 'production' && record.status === 'active' && Boolean(record.url))?.url
		?? getLatestDeployment(group, (record) => record.channel === 'preview' && record.status === 'active' && Boolean(record.url))?.url
		?? getLatestDeployment(group, (record) => Boolean(record.url))?.url
		?? [...group.previews]
			.sort((left, right) => getPreviewDisplayTimestamp(right) - getPreviewDisplayTimestamp(left))[0]
			?.aliasPreviewUrl
		?? [...group.previews]
			.sort((left, right) => getPreviewDisplayTimestamp(right) - getPreviewDisplayTimestamp(left))[0]
			?.previewUrl
}

function getStableWorkerUpdatedAt(group: WorkerDisplayGroup): Date | undefined {
	return getLatestDeployment(group, (record) => record.channel === 'production')?.createdAt
		?? (group.latestTimestamp > 0 ? new Date(group.latestTimestamp) : undefined)
}

function getStableWorkerUrl(group: WorkerDisplayGroup): string | undefined {
	return getLatestDeployment(group, (record) => record.channel === 'production' && Boolean(record.url))?.url
		?? getGroupDisplayUrl(group)
}

export function getWorkerScopeSuffix(workerName: string, baseName: string): string | undefined {
	if (!workerName.startsWith(`${baseName}-`)) {
		return undefined
	}

	const suffix = workerName.slice(baseName.length + 1).trim()
	return suffix || undefined
}

export function buildWorkerGroupMap(groups: WorkerDisplayGroup[]): Map<string, WorkerDisplayGroup> {
	return new Map(groups.map((group) => [group.workerName, group]))
}

function getDedicatedPreviewFamilyNames(
	families: ConfiguredWorkerFamilyMember[],
	groupsByWorker: Map<string, WorkerDisplayGroup>
): Set<string> {
	const familyNames = new Set<string>()
	const workerNames = Array.from(groupsByWorker.keys())

	for (const family of families) {
		if (family.role === 'primary') {
			familyNames.add(family.baseName)
			continue
		}

		if (workerNames.some((workerName) => Boolean(getWorkerScopeSuffix(workerName, family.baseName)))) {
			familyNames.add(family.baseName)
		}
	}

	return familyNames
}

export function buildStableWorkerRows(
	families: ConfiguredWorkerFamilyMember[],
	groupsByWorker: Map<string, WorkerDisplayGroup>
): StableWorkerRow[] {
	return families.map((family) => {
		const group = groupsByWorker.get(family.baseName)
		const status: StableWorkerRow['status'] = group ? 'active' : 'missing'

		return {
			workerName: family.baseName,
			role: family.roleLabel,
			status,
			updatedAt: group ? getStableWorkerUpdatedAt(group) : undefined,
			url: group ? getStableWorkerUrl(group) : undefined
		}
	}).sort((left, right) => {
		if (left.role === 'primary' && right.role !== 'primary') {
			return -1
		}

		if (left.role !== 'primary' && right.role === 'primary') {
			return 1
		}

		return left.workerName.localeCompare(right.workerName)
	})
}

function buildDedicatedWorkerPreviewScopeRows(
	families: ConfiguredWorkerFamilyMember[],
	groupsByWorker: Map<string, WorkerDisplayGroup>
): PreviewScopeRow[] {
	const previewFamilyNames = getDedicatedPreviewFamilyNames(families, groupsByWorker)
	const expectedFamilies = families.filter((family) => previewFamilyNames.has(family.baseName))
	const scopeNames = new Set<string>()

	for (const family of expectedFamilies) {
		for (const workerName of groupsByWorker.keys()) {
			const scope = getWorkerScopeSuffix(workerName, family.baseName)
			if (scope) {
				scopeNames.add(scope)
			}
		}
	}

	return Array.from(scopeNames).map((scope) => {
		const resolvedFamilies = expectedFamilies.map((family) => ({
			family,
			group: groupsByWorker.get(`${family.baseName}-${scope}`)
		}))
		const presentFamilies = resolvedFamilies.filter((entry) => entry.group)
		const updatedAt = presentFamilies.reduce<Date | undefined>((latest, entry) => {
			const currentDate = entry.group && entry.group.latestTimestamp > 0
				? new Date(entry.group.latestTimestamp)
				: undefined
			if (!currentDate) {
				return latest
			}

			if (!latest || currentDate.getTime() > latest.getTime()) {
				return currentDate
			}

			return latest
		}, undefined)
		const primaryEntry = resolvedFamilies.find((entry) => entry.family.role === 'primary')
		const entryUrl = primaryEntry?.group
			? getGroupDisplayUrl(primaryEntry.group)
			: presentFamilies[0]?.group
				? getGroupDisplayUrl(presentFamilies[0].group)
				: undefined
		const missingLabels = resolvedFamilies
			.filter((entry) => !entry.group)
			.map((entry) => entry.family.role === 'primary' ? 'primary' : entry.family.roleLabel)
		const notes: string[] = []

		if (missingLabels.length > 0) {
			notes.push(`missing ${missingLabels.join(', ')}`)
		}
		const strategy: PreviewScopeRow['strategy'] = 'dedicated workers'
		const status: PreviewScopeRow['status'] = presentFamilies.length === resolvedFamilies.length ? 'ready' : 'partial'

		return {
			scope,
			strategy,
			workersLabel: `${presentFamilies.length}/${resolvedFamilies.length}`,
			status,
			updatedAt,
			notes: notes.length > 0 ? notes.join(' · ') : undefined,
			entryUrl
		}
	}).sort(comparePreviewScopeRows)
}

function buildSameWorkerPreviewScopeRows(
	families: ConfiguredWorkerFamilyMember[],
	groupsByWorker: Map<string, WorkerDisplayGroup>
): PreviewScopeRow[] {
	const previewScopes = new Map<string, {
		updatedAt?: Date
		status: PreviewScopeRow['status']
		entryUrl?: string
		participants: Set<string>
	}>()

	for (const family of families) {
		const group = groupsByWorker.get(family.baseName)
		if (!group) {
			continue
		}

		for (const record of group.previews) {
			const scope = record.alias?.trim() || record.branchName?.trim()
			if (!scope) {
				continue
			}
			const recordStatus: PreviewScopeRow['status'] = record.status

			const existing = previewScopes.get(scope) ?? {
				updatedAt: undefined,
				status: recordStatus,
				entryUrl: undefined,
				participants: new Set<string>()
			}
			const currentDate = record.updatedAt ?? record.createdAt

			if (!existing.updatedAt || currentDate.getTime() >= existing.updatedAt.getTime()) {
				existing.updatedAt = currentDate
				existing.status = recordStatus
			}

			if (!existing.entryUrl || family.role === 'primary') {
				existing.entryUrl = record.aliasPreviewUrl ?? record.previewUrl
			}

			existing.participants.add(family.roleLabel)
			previewScopes.set(scope, existing)
		}
	}

	return Array.from(previewScopes.entries()).map(([scope, previewScope]) => {
		const strategy: PreviewScopeRow['strategy'] = 'preview alias'

		return {
			scope,
			strategy,
			workersLabel: String(previewScope.participants.size),
			status: previewScope.status,
			updatedAt: previewScope.updatedAt,
			notes: previewScope.participants.size > 1
				? `present ${Array.from(previewScope.participants).sort((left, right) => left.localeCompare(right)).join(', ')}`
				: undefined,
			entryUrl: previewScope.entryUrl
		}
	}).sort(comparePreviewScopeRows)
}

export function buildPreviewScopeRows(
	families: ConfiguredWorkerFamilyMember[],
	groupsByWorker: Map<string, WorkerDisplayGroup>
): PreviewScopeRow[] {
	return [
		...buildDedicatedWorkerPreviewScopeRows(families, groupsByWorker),
		...buildSameWorkerPreviewScopeRows(families, groupsByWorker)
	].sort(comparePreviewScopeRows)
}

export function filterRecordsForScope<RecordType extends { workerName: string }>(
	records: RecordType[],
	scope: PreviewStateScope
): RecordType[] {
	if (scope.workerFamilyName) {
		return records.filter((record) => isRelatedWorkerName(record.workerName, scope.workerFamilyName!))
	}

	return records
}

export function filterFamilyRecords<RecordType extends { workerName: string }>(
	records: RecordType[],
	families: ConfiguredWorkerFamilyMember[]
): RecordType[] {
	return records.filter((record) => families.some((family) => isRelatedWorkerName(record.workerName, family.baseName)))
}

export function isVisiblePreviewRecord(record: DevflarePreviewRecord, includeAll: boolean): boolean {
	return isVisibleTrackedRecord(record, includeAll)
}

export function isVisibleAliasRecord(record: DevflarePreviewAliasRecord, includeAll: boolean): boolean {
	return isVisibleTrackedRecord(record, includeAll)
}

export function isVisibleDeploymentRecord(record: DevflareDeploymentRecord, includeAll: boolean): boolean {
	return isVisibleTrackedRecord(record, includeAll)
}

export async function loadTrackedPreviewScopeRows(
	accountId: string,
	databaseName: string | undefined,
	families: ConfiguredWorkerFamilyMember[],
	apiOptions?: { timeout?: number }
): Promise<PreviewScopeRow[]> {
	const registry = await account.getPreviewRegistryContext({
		accountId,
		databaseName,
		apiOptions,
		skipContextCache: true
	})

	if (!registry) {
		return []
	}

	const { previews, aliases, deployments } = await listTrackedRegistryState({
		registry,
		workerName: undefined,
		apiOptions
	})
	const filteredPreviews = filterFamilyRecords(previews, families)
		.filter((record) => isVisiblePreviewRecord(record, false))
	const filteredAliases = filterFamilyRecords(aliases, families)
		.filter((record) => isVisibleAliasRecord(record, false))
	const filteredDeployments = filterFamilyRecords(deployments, families)
		.filter((record) => isVisibleDeploymentRecord(record, false))
	const workerGroups = buildWorkerGroups(filteredPreviews, filteredAliases, filteredDeployments)

	return buildPreviewScopeRows(families, buildWorkerGroupMap(workerGroups))
}

export function buildPreviewWorkerCandidatesByScope(
	families: ConfiguredWorkerFamilyMember[],
	workers: WorkerInfo[]
): Map<string, string[]> {
	const candidates = new Map<string, Set<string>>()

	for (const worker of workers) {
		for (const family of families) {
			const scope = getWorkerScopeSuffix(worker.name, family.baseName)
			if (!scope) {
				continue
			}

			const names = candidates.get(scope) ?? new Set<string>()
			names.add(worker.name)
			candidates.set(scope, names)
		}
	}

	return new Map(Array.from(candidates.entries()).map(([scope, workerNames]) => {
		return [scope, Array.from(workerNames).sort((left, right) => left.localeCompare(right))]
	}))
}

export function orderPreviewWorkerNamesForDeletion(
	workerNames: string[],
	scope: string,
	families: ConfiguredWorkerFamilyMember[]
): string[] {
	const familyPriority = new Map<string, { priority: number; roleLabel: string }>()

	for (const family of families) {
		familyPriority.set(family.baseName, {
			priority: family.role === 'primary' ? 0 : 1,
			roleLabel: family.roleLabel
		})
	}

	const resolveFamilyForWorker = (workerName: string): { priority: number; roleLabel: string; baseName?: string } => {
		for (const family of families) {
			if (getWorkerScopeSuffix(workerName, family.baseName) === scope) {
				const resolved = familyPriority.get(family.baseName)
				if (resolved) {
					return {
						priority: resolved.priority,
						roleLabel: resolved.roleLabel,
						baseName: family.baseName
					}
				}
			}
		}

		return {
			priority: 2,
			roleLabel: workerName
		}
	}

	return [...workerNames].sort((left, right) => {
		const leftFamily = resolveFamilyForWorker(left)
		const rightFamily = resolveFamilyForWorker(right)

		if (leftFamily.priority !== rightFamily.priority) {
			return leftFamily.priority - rightFamily.priority
		}

		if (leftFamily.roleLabel !== rightFamily.roleLabel) {
			return leftFamily.roleLabel.localeCompare(rightFamily.roleLabel)
		}

		if (leftFamily.baseName && rightFamily.baseName && leftFamily.baseName !== rightFamily.baseName) {
			return leftFamily.baseName.localeCompare(rightFamily.baseName)
		}

		return left.localeCompare(right)
	})
}
