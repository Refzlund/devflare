import type { ConsolaInstance } from 'consola'
import { dim, green, logLine } from './theme'
import type {
	PreviewCleanupExecution,
	PreviewCleanupTarget,
	PreviewOutputTheme,
	PreviewScopeSelection
} from './types'

function comparePreviewCleanupScopeNames(left: string, right: string): number {
	if (left === 'preview' && right !== 'preview') {
		return 1
	}

	if (left !== 'preview' && right === 'preview') {
		return -1
	}

	return left.localeCompare(right)
}

export function buildPreviewCleanupTarget(
	scope: string,
	workerCandidatesByScope: Map<string, string[]>,
	environment: string | undefined
): PreviewCleanupTarget {
	const strategies = new Set<PreviewCleanupTarget['strategies'][number]>()
	const workerNames = [...(workerCandidatesByScope.get(scope) ?? [])]

	if (workerNames.length > 0) {
		strategies.add('dedicated workers')
	}

	if (scope === 'preview' && environment === 'preview') {
		strategies.add('default preview scope')
	}

	return {
		scope,
		strategies: Array.from(strategies),
		workerNames
	}
}

export function buildPreviewCleanupTargets(
	workerCandidatesByScope: Map<string, string[]>,
	environment: string | undefined
): PreviewCleanupTarget[] {
	const scopeNames = new Set<string>()

	for (const scope of workerCandidatesByScope.keys()) {
		scopeNames.add(scope)
	}

	return Array.from(scopeNames)
		.sort(comparePreviewCleanupScopeNames)
		.map((scope) => buildPreviewCleanupTarget(scope, workerCandidatesByScope, environment))
}

export function getPreviewCleanupResourceCandidateCount(
	result: PreviewCleanupExecution['result']
): number {
	return (
		result.candidates.kv.length +
		result.candidates.d1.length +
		result.candidates.r2.length +
		result.candidates.queues.length +
		result.candidates.vectorize.length +
		result.candidates.hyperdrive.length
	)
}

function buildPreviewCleanupResourceSummary(result: PreviewCleanupExecution['result']): string[] {
	return [
		result.candidates.kv.length > 0 ? `KV ${result.candidates.kv.length}` : null,
		result.candidates.d1.length > 0 ? `D1 ${result.candidates.d1.length}` : null,
		result.candidates.r2.length > 0 ? `R2 ${result.candidates.r2.length}` : null,
		result.candidates.queues.length > 0 ? `Queues ${result.candidates.queues.length}` : null,
		result.candidates.vectorize.length > 0
			? `Vectorize ${result.candidates.vectorize.length}`
			: null,
		result.candidates.hyperdrive.length > 0
			? `Hyperdrive ${result.candidates.hyperdrive.length}`
			: null
	].filter((segment): segment is string => segment !== null)
}

export function logResolvedPreviewScopes(
	logger: ConsolaInstance,
	targets: PreviewCleanupTarget[],
	theme: PreviewOutputTheme
): void {
	if (targets.length === 0) {
		logLine(logger, `${dim('preview scopes', theme)} ${dim('none discovered (--all)', theme)}`)
		logLine(logger)
		return
	}

	logLine(
		logger,
		`${dim('preview scopes', theme)} ${green(targets.map((target) => target.scope).join(', '), theme)} ${dim('(--all)', theme)}`
	)
	logLine(logger)
}

export function logPreviewCleanupScopeBreakdown(
	logger: ConsolaInstance,
	executions: PreviewCleanupExecution[],
	theme: PreviewOutputTheme
): void {
	const scopedExecutions = executions.filter((execution) => execution.target)
	if (scopedExecutions.length === 0) {
		return
	}

	logLine(logger, `${dim('scope breakdown', theme)}`)
	for (const execution of scopedExecutions) {
		const target = execution.target!
		const strategies =
			target.strategies.length > 0 ? dim(`(${target.strategies.join(' + ')})`, theme) : ''
		const summary = [
			target.workerNames.length > 0 ? `Workers ${target.workerNames.length}` : null,
			...buildPreviewCleanupResourceSummary(execution.result)
		].filter((segment): segment is string => segment !== null)

		logLine(
			logger,
			`  ${green(target.scope, theme)} ${strategies} ${dim('—', theme)} ${summary.length > 0 ? summary.join(' · ') : dim('none', theme)}`
		)
	}
	logLine(logger)
}

export function showNoPreviewCleanupCandidatesHint(
	logger: ConsolaInstance,
	selection: PreviewScopeSelection | undefined,
	includeAll: boolean,
	theme: PreviewOutputTheme
): void {
	if (includeAll) {
		logger.warn(
			'No preview-only resources or dedicated preview Worker scripts were discovered across the live preview scopes Devflare could resolve. This usually means those previews were already cleaned up or the remaining previews only share stable Workers and shared account resources.'
		)
		return
	}

	if (!selection?.identifier) {
		return
	}

	if (selection.source === 'environment') {
		logger.warn(
			`No preview-only resources or dedicated preview Worker scripts matched the default "${selection.identifier}" scope. If your previews use branch-style scopes such as "next" or "pr-1", rerun with --scope <name>, use --all, or set DEVFLARE_PREVIEW_BRANCH, DEVFLARE_PREVIEW_PR, or DEVFLARE_PREVIEW_IDENTIFIER.`
		)
		return
	}

	logger.warn(
		`No preview-only resources or dedicated preview Worker scripts matched the resolved "${selection.identifier}" scope. This usually means that scope was already cleaned up or the preview shares stable Workers without preview.scope() resources of its own.`
	)
}
