import type { ParsedArgs } from './index'
import { resolvePreviewIdentifier } from '../config'
import { asOptionalString } from './command-utils'

export type DeployTargetMode = 'implicit' | 'production' | 'preview-upload' | 'preview-scope'

export interface ResolvedDeployTarget {
	mode: DeployTargetMode
	environment?: string
	targetFlag?: '--prod' | '--production' | '--preview'
	previewScope?: string
	previewScopeRaw?: string
	envOverrides: Record<string, string | undefined>
}

export interface ResolveDeployTargetOptions {
	requireExplicitTarget?: boolean
}

export function resolveDeployTarget(
	parsed: ParsedArgs,
	options: ResolveDeployTargetOptions = {}
): ResolvedDeployTarget {
	const wantsProduction = parsed.options.prod === true || parsed.options.production === true
	const previewOption = parsed.options.preview
	const previewScopeRaw = asOptionalString(previewOption)
	const wantsPreview = previewOption === true || Boolean(previewScopeRaw)

	if (parsed.options['preview-alias'] !== undefined) {
		throw new Error(
			'Devflare deploy no longer accepts --preview-alias. Use --preview <name> for named preview deploys, or keep bare --preview and let the alias come from --branch-name, CI, or git metadata.'
		)
	}

	if (!wantsProduction && !wantsPreview) {
		if (options.requireExplicitTarget === true) {
			throw new Error(
				'Deploy needs an explicit target. Use --prod / --production for live traffic, or --preview <name> (or bare --preview) for preview deploys.'
			)
		}

		return {
			mode: 'implicit',
			envOverrides: {}
		}
	}

	if (wantsProduction && wantsPreview) {
		throw new Error('Choose either --prod / --production or --preview <name>, not both.')
	}

	const explicitEnvironment = asOptionalString(parsed.options.env)

	if (wantsProduction) {
		if (explicitEnvironment && explicitEnvironment !== 'production') {
			throw new Error(
				'Production deploys always target the production environment. Remove --env or use --env production.'
			)
		}

		if (parsed.options['branch-name'] !== undefined) {
			throw new Error('Production deploys do not accept --branch-name.')
		}

		return {
			mode: 'production',
			environment: 'production',
			targetFlag: parsed.options.production === true ? '--production' : '--prod',
			envOverrides: {
				DEVFLARE_PREVIEW_BRANCH: undefined,
				DEVFLARE_PREVIEW_IDENTIFIER: undefined,
				DEVFLARE_PREVIEW_PR: undefined
			}
		}
	}

	if (explicitEnvironment && explicitEnvironment !== 'preview') {
		throw new Error(
			'Preview deploys always target the preview environment. Remove --env or use --env preview.'
		)
	}

	if (previewScopeRaw) {
		const branchName = asOptionalString(parsed.options['branch-name'])
		if (branchName && branchName !== previewScopeRaw) {
			throw new Error(
				'Named preview deploys use the --preview value as the preview scope. Omit --branch-name or pass the same value to both flags.'
			)
		}

		const previewScope = resolvePreviewIdentifier({
			identifier: previewScopeRaw
		}).identifier ?? 'preview'

		return {
			mode: 'preview-scope',
			environment: 'preview',
			targetFlag: '--preview',
			previewScope,
			previewScopeRaw,
			envOverrides: {
				DEVFLARE_PREVIEW_BRANCH: previewScopeRaw,
				DEVFLARE_PREVIEW_IDENTIFIER: previewScope,
				DEVFLARE_PREVIEW_PR: undefined
			}
		}
	}

	return {
		mode: 'preview-upload',
		environment: 'preview',
		targetFlag: '--preview',
		envOverrides: {
			DEVFLARE_PREVIEW_BRANCH: undefined,
			DEVFLARE_PREVIEW_IDENTIFIER: undefined,
			DEVFLARE_PREVIEW_PR: undefined
		}
	}
}

export function applyResolvedDeployTarget(
	parsed: ParsedArgs,
	target: ResolvedDeployTarget
): ParsedArgs {
	if (!target.environment) {
		return parsed
	}

	return {
		...parsed,
		options: {
			...parsed.options,
			env: target.environment
		}
	}
}

export async function withTemporaryEnvironment<T>(
	overrides: Record<string, string | undefined>,
	operation: () => Promise<T>
): Promise<T> {
	const previousValues = new Map<string, string | undefined>()

	for (const [key, value] of Object.entries(overrides)) {
		previousValues.set(key, process.env[key])
		if (typeof value === 'string') {
			process.env[key] = value
			continue
		}

		delete process.env[key]
	}

	try {
		return await operation()
	} finally {
		for (const [key, value] of previousValues) {
			if (typeof value === 'string') {
				process.env[key] = value
				continue
			}

			delete process.env[key]
		}
	}
}
