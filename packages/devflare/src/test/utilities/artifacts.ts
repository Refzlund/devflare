// =============================================================================
// Mock Artifacts
// =============================================================================

export interface MockArtifactsOptions {
	repos?: Array<Partial<ArtifactsRepoInfo> & { name: string }>
}

function createArtifactTimestamp(): string {
	return new Date('2026-04-26T00:00:00.000Z').toISOString()
}

function createArtifactsRepoInfo(
	name: string,
	options: {
		description?: string | null
		readOnly?: boolean
		defaultBranch?: string
		source?: string | null
	} = {}
): ArtifactsRepoInfo {
	const now = createArtifactTimestamp()
	return {
		id: `repo-${name}`,
		name,
		description: options.description ?? null,
		defaultBranch: options.defaultBranch ?? 'main',
		createdAt: now,
		updatedAt: now,
		lastPushAt: null,
		source: options.source ?? null,
		readOnly: options.readOnly ?? false,
		remote: `https://example.com/artifacts/default/${name}.git`
	}
}

export function isArtifactsBinding(value: MockArtifactsOptions | Artifacts): value is Artifacts {
	return typeof (value as { create?: unknown }).create === 'function'
}

/**
 * Creates an in-memory Artifacts binding for pure unit tests.
 */
export function createMockArtifacts(options: MockArtifactsOptions = {}): Artifacts {
	const repos = new Map<string, ArtifactsRepoInfo>()
	const tokens = new Map<string, ArtifactsTokenInfo[]>()

	const addRepo = (info: ArtifactsRepoInfo) => {
		repos.set(info.name, info)
		if (!tokens.has(info.name)) {
			tokens.set(info.name, [])
		}
	}

	for (const repo of options.repos ?? []) {
		addRepo({
			...createArtifactsRepoInfo(repo.name),
			...repo
		})
	}

	const createToken = (
		repoName: string,
		scope: 'write' | 'read' = 'write',
		ttl = 86400
	): ArtifactsCreateTokenResult => {
		const existing = tokens.get(repoName) ?? []
		const id = `token-${repoName}-${existing.length + 1}`
		const expiresAt = new Date(Date.parse(createArtifactTimestamp()) + ttl * 1000).toISOString()
		const token: ArtifactsTokenInfo = {
			id,
			scope,
			state: 'active',
			createdAt: createArtifactTimestamp(),
			expiresAt
		}
		tokens.set(repoName, [...existing, token])
		return {
			id,
			plaintext: `${id}-plaintext`,
			scope,
			expiresAt
		}
	}

	const createRepoHandle = (info: ArtifactsRepoInfo): ArtifactsRepo =>
		({
			...info,
			async createToken(
				scope?: 'write' | 'read',
				ttl?: number
			): Promise<ArtifactsCreateTokenResult> {
				return createToken(info.name, scope, ttl)
			},
			async listTokens(): Promise<ArtifactsTokenListResult> {
				const repoTokens = tokens.get(info.name) ?? []
				return {
					tokens: repoTokens,
					total: repoTokens.length
				}
			},
			async revokeToken(tokenOrId: string): Promise<boolean> {
				const repoTokens = tokens.get(info.name) ?? []
				const index = repoTokens.findIndex((token) => token.id === tokenOrId)
				if (index === -1) {
					return false
				}

				repoTokens[index] = {
					...repoTokens[index],
					state: 'revoked'
				}
				tokens.set(info.name, repoTokens)
				return true
			},
			async fork(
				name: string,
				forkOptions?: { description?: string; readOnly?: boolean; defaultBranchOnly?: boolean }
			): Promise<ArtifactsCreateRepoResult> {
				return createRepo(name, {
					description: forkOptions?.description ?? info.description ?? undefined,
					readOnly: forkOptions?.readOnly ?? info.readOnly,
					setDefaultBranch: info.defaultBranch,
					source: `artifacts:default/${info.name}`
				})
			}
		}) as ArtifactsRepo

	const createRepo = async (
		name: string,
		createOptions: {
			readOnly?: boolean
			description?: string
			setDefaultBranch?: string
			source?: string | null
		} = {}
	): Promise<ArtifactsCreateRepoResult> => {
		const info = createArtifactsRepoInfo(name, {
			description: createOptions.description,
			readOnly: createOptions.readOnly,
			defaultBranch: createOptions.setDefaultBranch,
			source: createOptions.source
		})
		addRepo(info)
		const token = createToken(name)
		return {
			id: info.id,
			name: info.name,
			description: info.description,
			defaultBranch: info.defaultBranch,
			remote: info.remote,
			token: token.plaintext,
			tokenExpiresAt: token.expiresAt
		}
	}

	return {
		create: createRepo,
		async get(name: string): Promise<ArtifactsRepo | null> {
			const repo = repos.get(name)
			return repo ? createRepoHandle(repo) : null
		},
		async import(params: {
			source: { url: string; branch?: string; depth?: number }
			target: { name: string; opts?: { description?: string; readOnly?: boolean } }
		}): Promise<ArtifactsCreateRepoResult> {
			return createRepo(params.target.name, {
				description: params.target.opts?.description,
				readOnly: params.target.opts?.readOnly,
				source: params.source.url
			})
		},
		async list(opts?: { limit?: number; cursor?: string }): Promise<ArtifactsRepoListResult> {
			const limit = opts?.limit ?? 50
			const repoList = Array.from(repos.values())
				.slice(0, limit)
				.map((repo) => {
					const { remote: _remote, ...rest } = repo
					return rest
				})

			return {
				repos: repoList,
				total: repos.size,
				...(repos.size > repoList.length && { cursor: String(repoList.length) })
			}
		},
		async delete(name: string): Promise<boolean> {
			tokens.delete(name)
			return repos.delete(name)
		}
	} as unknown as Artifacts
}
