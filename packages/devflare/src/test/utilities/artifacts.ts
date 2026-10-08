// =============================================================================
// Mock Artifacts
// =============================================================================
// An in-memory Artifacts binding for pure unit tests. It keeps repository and
// token metadata; it holds no git objects.
//
// → A repo handle carries both API generations, so it type-checks against
//   either `@cloudflare/workers-types` major: 4.x describes the handle as the
//   repo's metadata fields plus token methods; 5.x drops the fields for
//   `info()` and adds the git read methods and `[Symbol.dispose]`.
// → The git read methods answer truthfully only where the mock knows the
//   answer. A repo made with `create()` is empty, as a new Artifacts repo is,
//   so reads find nothing. A repo made with `import()` or `fork()` would hold
//   commits the mock never fetched, so reads there throw instead of returning
//   an empty answer that looks real.
// =============================================================================

export interface MockArtifactsOptions {
	repos?: Array<Partial<ArtifactsRepoInfo> & { name: string }>
}

/** What the mock knows about a repo's git content. */
type RepoContent = 'empty' | 'not-held'

/** A repo the mock tracks: its public metadata and what it knows of its content. */
interface MockRepo {
	/** Metadata as `ArtifactsRepoInfo` reports it. */
	info: ArtifactsRepoInfo
	/** `empty` for a repo made with `create()`; `not-held` for an imported or forked one. */
	content: RepoContent
}

/** The codes the Artifacts binding documents for `ArtifactsError`. */
type MockArtifactsErrorCode = 'NOT_FOUND' | 'INVALID_INPUT'

/** A lowercase, 40-character SHA-1 object ID, the only form the read methods accept. */
const OBJECT_ID_PATTERN = /^[0-9a-f]{40}$/

function createArtifactTimestamp(): string {
	return new Date('2026-04-26T00:00:00.000Z').toISOString()
}

/**
 * @description Builds the error the Artifacts binding throws: an `Error` named
 * `ArtifactsError` with the documented string `code`.
 * @param code - the documented error code
 * @param message - what went wrong
 * @returns the error, for the caller to throw
 */
function createArtifactsError(code: MockArtifactsErrorCode, message: string): Error {
	const error = new Error(message) as Error & { code: MockArtifactsErrorCode }
	error.name = 'ArtifactsError'
	error.code = code
	return error
}

/**
 * @description The error for a git read on a repo whose commits the mock never held.
 * @param repoName - the imported or forked repo
 * @param method - the read method that was called
 */
function createContentNotHeldError(repoName: string, method: string): Error {
	return new Error(
		`createMockArtifacts(): repo "${repoName}" was imported or forked, and the mock holds no git ` +
			`content for it, so ${method}() cannot answer. Use Cloudflare to read git content.`
	)
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
	const repos = new Map<string, MockRepo>()
	const tokens = new Map<string, ArtifactsTokenInfo[]>()

	const addRepo = (info: ArtifactsRepoInfo, content: RepoContent) => {
		repos.set(info.name, { info, content })
		if (!tokens.has(info.name)) {
			tokens.set(info.name, [])
		}
	}

	for (const repo of options.repos ?? []) {
		// A seeded repo with a source stands for an import: its content is not held.
		const info = { ...createArtifactsRepoInfo(repo.name), ...repo }
		addRepo(info, info.source ? 'not-held' : 'empty')
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

	/**
	 * Lets a git read through only for a repo the mock knows to be empty, where
	 * the true answer is "nothing found".
	 * @throws NOT_FOUND for a deleted repo; a clear error for one whose content
	 *   the mock does not hold
	 */
	const assertKnownEmpty = (repoName: string, method: string): void => {
		const repo = repos.get(repoName)
		if (!repo) {
			throw createArtifactsError('NOT_FOUND', `Artifacts repo "${repoName}" does not exist`)
		}
		if (repo.content === 'not-held') {
			throw createContentNotHeldError(repoName, method)
		}
	}

	const requireObjectId = (hash: string) => {
		if (!OBJECT_ID_PATTERN.test(hash)) {
			throw createArtifactsError(
				'INVALID_INPUT',
				`Expected a lowercase, 40-character SHA-1 object ID, got "${hash}"`
			)
		}
	}

	const createRepoHandle = (repo: MockRepo): ArtifactsRepo => {
		const repoName = repo.info.name
		const handle = {
			// Workers-types 4.x describes the handle as the repo's metadata fields.
			...repo.info,
			async createToken(
				scope?: 'write' | 'read',
				ttl?: number
			): Promise<ArtifactsCreateTokenResult> {
				return createToken(repoName, scope, ttl)
			},
			async listTokens(): Promise<ArtifactsTokenListResult> {
				const repoTokens = tokens.get(repoName) ?? []
				return {
					tokens: repoTokens,
					total: repoTokens.length
				}
			},
			async revokeToken(tokenOrId: string): Promise<boolean> {
				const repoTokens = tokens.get(repoName) ?? []
				const index = repoTokens.findIndex((token) => token.id === tokenOrId)
				if (index === -1) {
					return false
				}

				repoTokens[index] = {
					...repoTokens[index],
					state: 'revoked'
				}
				tokens.set(repoName, repoTokens)
				return true
			},
			async info(): Promise<ArtifactsRepoInfo> {
				// A fresh lookup each call, as the binding documents.
				const current = repos.get(repoName)
				if (!current) {
					throw createArtifactsError('NOT_FOUND', `Artifacts repo "${repoName}" was deleted`)
				}
				return { ...current.info }
			},
			// The git reads are typed by what they return here, which fits 5.x's signatures;
			// naming 5.x-only types such as ArtifactsTreeEntry would not compile against 4.x.
			async readBlob(hash: string): Promise<null> {
				requireObjectId(hash)
				assertKnownEmpty(repoName, 'readBlob')
				return null
			},
			async readTree(hash: string): Promise<null> {
				requireObjectId(hash)
				assertKnownEmpty(repoName, 'readTree')
				return null
			},
			async readCommit(hash: string): Promise<null> {
				requireObjectId(hash)
				assertKnownEmpty(repoName, 'readCommit')
				return null
			},
			async readFile(args: { ref: string; path: string }): Promise<null> {
				if (!args.ref || !args.path) {
					throw createArtifactsError('INVALID_INPUT', 'readFile() needs a non-empty ref and path')
				}
				assertKnownEmpty(repoName, 'readFile')
				return null
			},
			async log(_opts?: { ref?: string; limit?: number; offset?: number }): Promise<never[]> {
				assertKnownEmpty(repoName, 'log')
				return []
			},
			async fork(
				name: string,
				forkOptions?: { description?: string; readOnly?: boolean; defaultBranchOnly?: boolean }
			): Promise<ArtifactsCreateRepoResult> {
				return createRepo(
					name,
					{
						description: forkOptions?.description ?? repo.info.description ?? undefined,
						readOnly: forkOptions?.readOnly ?? repo.info.readOnly,
						setDefaultBranch: repo.info.defaultBranch,
						source: `artifacts:default/${repoName}`
					},
					'not-held'
				)
			},
			// The handle holds no resources, so disposing it has nothing to release.
			[Symbol.dispose]() {}
		}
		return handle
	}

	const createRepo = async (
		name: string,
		createOptions: {
			readOnly?: boolean
			description?: string
			setDefaultBranch?: string
			source?: string | null
		} = {},
		content: RepoContent = 'empty'
	): Promise<ArtifactsCreateRepoResult> => {
		const info = createArtifactsRepoInfo(name, {
			description: createOptions.description,
			readOnly: createOptions.readOnly,
			defaultBranch: createOptions.setDefaultBranch,
			source: createOptions.source
		})
		addRepo(info, content)
		const token = createToken(name)
		const result = {
			id: info.id,
			name: info.name,
			description: info.description,
			defaultBranch: info.defaultBranch,
			remote: info.remote,
			token: token.plaintext,
			// Workers-types 4.x lists this field; 5.x no longer does.
			tokenExpiresAt: token.expiresAt
		}
		return result
	}

	return {
		create: (
			name: string,
			opts?: { readOnly?: boolean; description?: string; setDefaultBranch?: string }
		) => createRepo(name, opts),
		async get(name: string): Promise<ArtifactsRepo | null> {
			const repo = repos.get(name)
			return repo ? createRepoHandle(repo) : null
		},
		async import(params: {
			source: { url: string; branch?: string; depth?: number }
			target: { name: string; opts?: { description?: string; readOnly?: boolean } }
		}): Promise<ArtifactsCreateRepoResult> {
			return createRepo(
				params.target.name,
				{
					description: params.target.opts?.description,
					readOnly: params.target.opts?.readOnly,
					source: params.source.url
				},
				'not-held'
			)
		},
		async list(opts?: { limit?: number; cursor?: string }): Promise<ArtifactsRepoListResult> {
			const limit = opts?.limit ?? 50
			const repoList = Array.from(repos.values())
				.slice(0, limit)
				.map((repo) => {
					const { remote: _remote, ...rest } = repo.info
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
