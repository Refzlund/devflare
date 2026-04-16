import type { WorkerInfo } from '../../../cloudflare'
import {
	resolveConfigForEnvironment,
	type DevflareConfig
} from '../../../config'
import type {
	ConfiguredWorkerFamilyMember,
	PreviewScopeRow,
	StableWorkerRow
} from './types'

function compareConfiguredWorkerFamilies(
	left: ConfiguredWorkerFamilyMember,
	right: ConfiguredWorkerFamilyMember
): number {
	if (left.role === 'primary' && right.role !== 'primary') {
		return -1
	}

	if (left.role !== 'primary' && right.role === 'primary') {
		return 1
	}

	return left.baseName.localeCompare(right.baseName)
}

function comparePreviewScopeRows(left: PreviewScopeRow, right: PreviewScopeRow): number {
	const leftTime = left.updatedAt?.getTime() ?? 0
	const rightTime = right.updatedAt?.getTime() ?? 0
	if (rightTime !== leftTime) {
		return rightTime - leftTime
	}

	return left.scope.localeCompare(right.scope)
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

	return Array.from(families.values()).sort(compareConfiguredWorkerFamilies)
}

function getWorkerUrl(workerName: string, workersSubdomain: string | null | undefined): string | undefined {
	if (!workersSubdomain) {
		return undefined
	}

	return `https://${workerName}.${workersSubdomain}.workers.dev`
}

export function getWorkerScopeSuffix(workerName: string, baseName: string): string | undefined {
	if (!workerName.startsWith(`${baseName}-`)) {
		return undefined
	}

	const suffix = workerName.slice(baseName.length + 1).trim()
	return suffix || undefined
}

export function buildStableWorkerRowsFromLiveWorkers(
	families: ConfiguredWorkerFamilyMember[],
	workers: WorkerInfo[],
	workersSubdomain: string | null | undefined
): StableWorkerRow[] {
	const workersByName = new Map(workers.map((worker) => [worker.name, worker]))

	return families.map((family) => {
		const worker = workersByName.get(family.baseName)
		const status: StableWorkerRow['status'] = worker ? 'active' : 'missing'

		return {
			workerName: family.baseName,
			role: family.roleLabel,
			status,
			updatedAt: worker?.modifiedOn,
			url: worker ? getWorkerUrl(family.baseName, workersSubdomain) : undefined
		}
	})
}

function getDedicatedPreviewFamilyNamesFromWorkers(
	families: ConfiguredWorkerFamilyMember[],
	workers: WorkerInfo[]
): Set<string> {
	const familyNames = new Set<string>()
	const workerNames = workers.map((worker) => worker.name)

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

export function buildPreviewScopeRowsFromLiveWorkers(
	families: ConfiguredWorkerFamilyMember[],
	workers: WorkerInfo[],
	workersSubdomain: string | null | undefined
): PreviewScopeRow[] {
	const workersByName = new Map(workers.map((worker) => [worker.name, worker]))
	const previewFamilyNames = getDedicatedPreviewFamilyNamesFromWorkers(families, workers)
	const expectedFamilies = families.filter((family) => previewFamilyNames.has(family.baseName))
	const workerCandidatesByScope = buildPreviewWorkerCandidatesByScope(families, workers)

	return Array.from(workerCandidatesByScope.keys()).map((scope) => {
		const resolvedFamilies = expectedFamilies.map((family) => ({
			family,
			worker: workersByName.get(`${family.baseName}-${scope}`)
		}))
		const presentFamilies = resolvedFamilies.filter((entry) => entry.worker)
		const updatedAt = presentFamilies.reduce<Date | undefined>((latest, entry) => {
			const currentDate = entry.worker?.modifiedOn
			if (!currentDate) {
				return latest
			}

			if (!latest || currentDate.getTime() > latest.getTime()) {
				return currentDate
			}

			return latest
		}, undefined)
		const primaryEntry = resolvedFamilies.find((entry) => entry.family.role === 'primary')
		const entryWorker = primaryEntry?.worker ?? presentFamilies[0]?.worker
		const missingLabels = resolvedFamilies
			.filter((entry) => !entry.worker)
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
			entryUrl: entryWorker ? getWorkerUrl(entryWorker.name, workersSubdomain) : undefined
		}
	}).sort(comparePreviewScopeRows)
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
