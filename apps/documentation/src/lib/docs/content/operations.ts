import type { DocPage } from '../types'

const docsLink = (slug: string): string => `/docs/${slug}`

export const operationsDocs: DocPage[] = [
	{
		slug: 'control-plane-operations',
		group: 'Ship & operate',
		navTitle: 'Control-plane operations',
		readTime: '6 min read',
		eyebrow: 'Operations',
		title:
			'Use the operator command families for account context, live production changes, renames, token bootstrap, and paid-test gates',
		summary:
			'Devflare’s deeper CLI families exist so account selection, live production inspection, Worker renames, token lifecycle, and remote paid-test gates stay documented instead of dissolving into ad-hoc command snippets.',
		description:
			'The root CLI page maps these command families, but once you start operating real Cloudflare state, the important questions change. Which account is this command acting on? Is this a read-only production inspection or a dry-run rollback? Does this rename update the local config too? Should remote paid tests be enabled at all? This page keeps those answers in one place.',
		highlights: [
			'Use `login` and `account` first so the account context is visible before a command mutates or inspects anything expensive. Not every command family resolves account lanes in the same order, so pass `--account` when ambiguity would be risky.',
			'`productions` reads live Cloudflare state and keeps `rollback` plus `delete` behind explicit dry-run versus `--apply` behavior.',
			'`worker rename` can sync the remote Worker name and the matching local config name when Devflare can resolve the config safely, but existing preview URLs may keep the old worker name until fresh previews are uploaded.',
			'`tokens`, `account usage|limits`, and `remote` are deliberate safety surfaces: one governs account-owned token bootstrap, one exposes Devflare-managed guardrails, and one gates paid remote tests.'
		],
		facts: [
			{
				label: 'Best for',
				value:
					'Teams operating live accounts, releases, and paid test flows instead of only building locally'
			},
			{
				label: 'Read-only production view',
				value: '`devflare productions` and `devflare productions versions`'
			},
			{
				label: 'Mutation safety habit',
				value: 'Prefer dry runs first, then add `--apply` only when the target is obvious'
			},
			{
				label: 'Paid-test gate',
				value: '`devflare remote status|enable|disable` plus `DEVFLARE_REMOTE` awareness'
			}
		],
		sourcePages: [
			'src/cli/help-pages/pages/core.ts',
			'src/cli/help-pages/pages/account.ts',
			'src/cli/help-pages/pages/productions.ts',
			'src/cli/help-pages/pages/misc.ts',
			'src/cli/command-utils.ts'
		],
		sections: [
			{
				id: 'account-context',
				title: 'Choose account context before you operate on anything important',
				paragraphs: [
					'The safest operational habit in Devflare is to resolve account context first. The CLI can infer an account from several places, but when real inventory, preview cleanup, token management, or production control-plane changes are involved, you should know which lane won.',
					'Not every command family resolves those lanes in the same order. Inventory-oriented commands, `productions` discovery, other config-backed operator commands, and token management each consult a slightly different subset of explicit flags, workspace settings, environment, config, and authenticated-account fallbacks.',
					'`login`, `account`, and the global or workspace account selectors exist for this reason. They make the account story explicit before the deeper command families start reading or mutating Cloudflare state.'
				],
				snippets: [
					{
						title: 'Get the account context visible first',
						language: 'bash',
						code: String.raw`bunx --bun devflare login
bunx --bun devflare account
bunx --bun devflare account workspace
bunx --bun devflare account workers`
					}
				],
				table: {
					headers: ['Command family', 'How account choice resolves', 'Practical habit'],
					rows: [
						[
							'`devflare account ...`',
							'`--account` wins, then workspace account selection, `CLOUDFLARE_ACCOUNT_ID`, resolved config `accountId`, and finally the primary authenticated account.',
							'Great for inventory, but still pass `--account` when a read or write must be unmistakable.'
						],
						[
							'`devflare productions ...`',
							'`--account` wins. Otherwise Devflare may scan local configs for primary workers, stop with an explicit error if that scan finds more than one configured `accountId`, and only then fall back to the narrower production account-resolution path.',
							'In a monorepo or mixed-account tree, pass `--account` instead of asking productions to guess.'
						],
						[
							'Other config-backed families such as `previews` and `worker rename`',
							'Explicit `--account` wins; otherwise Devflare can use resolved config `accountId` or later fall back to effective-account preferences and the authenticated account.',
							'Set `accountId` in package config when that package genuinely belongs to one account.'
						],
						[
							'`devflare tokens ...`',
							'Uses `--account` first, then workspace account selection, then the primary account visible to the bootstrap token.',
							'Treat token management as its own lane and make the target account obvious in logs.'
						]
					]
				},
				callouts: [
					{
						tone: 'info',
						title: 'Interactive account selection is a real workflow, not just a convenience extra',
						body: [
							'`devflare account global` and `devflare account workspace` exist so repeated operational commands can stay honest without pasting account ids into every invocation.',
							'The workspace preference lives with the workspace metadata, while the global default is cached locally and mirrored best-effort to Devflare-managed Cloudflare state when you are authenticated.',
							'Some command families consult those effective-account preferences directly, while others read a narrower lane first. That difference is why the docs call out the command family instead of pretending there is one universal resolution order.',
							'`devflare productions` is the strictest example here: if local config discovery turns up multiple configured account ids, it refuses to guess and asks for `--account`.'
						]
					}
				]
			},
			{
				id: 'usage-and-limits',
				title:
					'Treat usage and limits as Devflare-managed guardrails, not Cloudflare billing dashboards',
				paragraphs: [
					'`devflare account usage` and `devflare account limits` expose the counters and ceilings Devflare uses for its own safety decisions. They are useful operator data, but they are not a full Cloudflare billing or quota dashboard.',
					'Today that mostly means AI request counts, Vectorize operation counts, and related limits that help Devflare decide when remote or preview-heavy workflows should stay deliberate instead of accidental.'
				],
				bullets: [
					'Use these commands as guardrails for Devflare-managed flows, not as the final source of truth for account billing.',
					'If you need official product usage or invoice-level numbers, keep Cloudflare’s own dashboards and docs in the loop.',
					'Some limits are stored for future enforcement or reporting before every one of them becomes an active hard stop.'
				],
				callouts: [
					{
						tone: 'info',
						title: 'Operationally useful, intentionally narrower than billing',
						body: [
							'These numbers are here to help Devflare behave safely. They should inform operator decisions, but they are not a substitute for Cloudflare’s own product-level accounting.'
						]
					}
				]
			},
			{
				id: 'live-production',
				title: 'Inspect and change live production deliberately',
				paragraphs: [
					'`devflare productions` is the control-plane surface for live production state. It reads Cloudflare deployment data directly, lists current Workers and stored versions, and only mutates production when you move from the read-only views into `rollback` or `delete`.',
					'That split matters because production inspection and production mutation are not the same job. Keep `versions` nearby when you need context, keep dry runs as the default posture, and add `--apply` only when you are already confident about the target.'
				],
				table: {
					headers: ['Command', 'What it is for', 'Safety rule'],
					rows: [
						[
							'`devflare productions`',
							'Inspect live production Workers and the active deployment shape.',
							'Read-only by default.'
						],
						[
							'`devflare productions versions`',
							'Inspect recent stored production versions and see which version is active.',
							'Read-only by default.'
						],
						[
							'`devflare productions rollback`',
							'Create a fresh production deployment that points at a previous or specific version.',
							'Dry run unless you add `--apply`.'
						],
						[
							'`devflare productions delete`',
							'Delete one live production Worker script.',
							'Dry run unless you add `--apply`, and it does not delete independent account resources automatically.'
						]
					]
				},
				callouts: [
					{
						tone: 'info',
						title: 'Production versions are a focused view, not the entire deployment history',
						body: [
							'`devflare productions versions` focuses on the recent non-preview versions that matter operationally, and the latest production deployment can still reference more than one active version when Cloudflare is splitting traffic.'
						]
					},
					{
						tone: 'warning',
						title: 'Production deletion is intentionally narrow',
						body: [
							'`devflare productions delete` removes the Worker script only. Review KV, D1, R2, queues, and other account resources separately instead of assuming the control plane will clean them up for you.'
						]
					}
				]
			},
			{
				id: 'rename-and-access',
				title: 'Use documented commands for renames, token bootstrap, and pricing context',
				cards: [
					{
						label: 'Worker',
						title: '`worker rename`',
						body: 'Renames the remote Worker when needed, updates the matching local config name when it can resolve that config safely, warns about remaining local references, and may leave existing preview URLs showing the old worker name until fresh preview uploads exist.'
					},
					{
						label: 'Tokens',
						title: '`tokens`',
						body: 'Creates, rolls, lists, and deletes Devflare-managed account-owned API tokens using a bootstrap token that already has token-management permissions. Cloudflare returns token secrets only once, so the first output matters.'
					},
					{
						label: 'Pricing',
						title: '`ai`',
						body: 'Prints the built-in Workers AI pricing snapshot bundled with the current Devflare build. It is a reference command, not a live account-state query, so confirm current rates in Cloudflare docs when the numbers matter.'
					}
				],
				snippets: [
					{
						title: 'Keep these control-plane jobs explicit too',
						language: 'bash',
						code: String.raw`bunx --bun devflare worker rename docs --to devflare-docs
bunx --bun devflare tokens $BOOTSTRAP --list
bunx --bun devflare tokens $BOOTSTRAP --new preview
bunx --bun devflare ai`
					}
				],
				bullets: [
					'Prefer `worker rename` over hand-editing config names and remote Worker names separately.',
					'Keep bootstrap tokens out of transcripts and remember that returned managed-token secrets are a one-time output.',
					'Use the built-in AI pricing command when the question is cost reference, not model invocation.'
				]
			},
			{
				id: 'remote-mode',
				title: 'Gate paid remote test flows explicitly',
				paragraphs: [
					'Remote mode exists so paid Cloudflare features like AI or Vectorize do not get exercised casually by every local or CI run. The command family is deliberately small: inspect current status, enable it for a bounded window, or disable it again.',
					'That keeps the cost story visible. If remote tests are going to hit real infrastructure, the activation should be reviewable in command history or workflow logs instead of quietly implied.'
				],
				snippets: [
					{
						title: 'Make remote mode a deliberate choice',
						language: 'bash',
						code: String.raw`bunx --bun devflare remote status
bunx --bun devflare remote enable 30
bunx --bun devflare remote disable`
					}
				],
				bullets: [
					'The default `remote` action is `status`, so the current gate is easy to inspect before you run a paid test suite.',
					'`enable` defaults to 30 minutes when you do not pass a valid duration.',
					'`DEVFLARE_REMOTE` can keep effective remote mode active even after you run `disable`, so environment context still matters.'
				],
				callouts: [
					{
						tone: 'warning',
						title: 'Remote mode is a cost gate, not a convenience toggle',
						body: [
							'Remote tests hit real Cloudflare services. Use the shortest useful enable window and keep the activation visible in automation when cost or quotas matter.'
						]
					}
				]
			},
			{
				id: 'neighbor-pages',
				title: 'Use the neighboring docs when the job becomes preview lifecycle or CI policy',
				cards: [
					{
						label: 'Ship & operate',
						title: 'devflare/cloudflare',
						body: 'Open the library API page when a script or tool should use the same auth, inventory, registry, usage, or token helpers that the CLI command families use internally.',
						href: docsLink('cloudflare-api')
					},
					{
						label: 'Ship & operate',
						title: 'Preview operations',
						body: 'Open the preview lifecycle page when the job is inspection or resource cleanup for preview scopes.',
						href: docsLink('preview-operations')
					},
					{
						label: 'Ship & operate',
						title: 'GitHub workflows',
						body: 'Open the workflow page when those operator commands need to become reviewable CI jobs with feedback, cleanup, and permissions.',
						href: docsLink('github-workflows')
					},
					{
						label: 'Ship & operate',
						title: 'Production deploys',
						body: 'Open the production deploy page when the question is the deploy target itself rather than the later control-plane inspection or rollback flow.',
						href: docsLink('production-deploys')
					}
				]
			}
		]
	},
	{
		slug: 'cloudflare-api',
		group: 'Ship & operate',
		navTitle: 'devflare/cloudflare',
		readTime: '6 min read',
		eyebrow: 'Library API',
		title:
			'Use `devflare/cloudflare` when scripts should reuse Devflare’s account, registry, and token helpers instead of reimplementing them',
		summary:
			'The `devflare/cloudflare` subpath exposes the same account-aware building blocks the CLI uses for auth, resource inventory, usage and limits, preview registry access, preferences, and managed token workflows.',
		description:
			'This page is for Node-side scripts and tooling, not Worker runtime code. Reach for it when a release script, operator utility, or migration helper should reuse Devflare’s Cloudflare-side knowledge instead of rebuilding auth, pagination, account selection, or preview-registry calls from scratch.',
		highlights: [
			'Import from `devflare/cloudflare` for Node-side automation, not from the Worker runtime surface.',
			'The main public surface is the exported `account` object, which groups auth, inventory, usage, preview registry, preferences, and token helpers.',
			'Use the library when you need the same control-plane behavior as the CLI inside a script, and use the CLI when a command already exists and human-readable output is the real goal.',
			'Preview registry helpers and registry schemas are public too, so custom tooling can stay aligned with Devflare’s preview metadata contract.'
		],
		facts: [
			{ label: 'Import path', value: '`devflare/cloudflare`' },
			{
				label: 'Primary surface',
				value: 'A flat `account` object plus standalone preview-registry helpers and schema exports'
			},
			{
				label: 'Best for',
				value:
					'Release scripts, operator tooling, and Node-side automation that should reuse Devflare’s Cloudflare-side rules'
			}
		],
		sourcePages: [
			'src/cloudflare/index.ts',
			'src/cloudflare/preferences.ts',
			'src/cloudflare/preview-registry.ts',
			'src/cloudflare/registry-schema.ts'
		],
		sections: [
			{
				id: 'when-to-use-it',
				title:
					'Use the library when your script needs Devflare’s control-plane knowledge, not just a shell command',
				paragraphs: [
					'Reach for `devflare/cloudflare` when a script should authenticate once, resolve an account deliberately, inspect resources, or talk to the preview registry using the same rules Devflare already ships.',
					'If the job is already well-served by `devflare account`, `devflare previews`, or another CLI command and the main need is a readable operator workflow, the CLI is usually simpler. The library is for composition.'
				],
				cards: [
					{
						title: 'Good fit',
						body: 'A release script, CI helper, or internal ops tool needs account auth, inventory queries, preview registry reads, or token management as reusable functions.'
					},
					{
						title: 'Usually not the first fit',
						body: 'A human just needs to inspect state once. That is what the CLI pages and built-in help are already for.'
					}
				]
			},
			{
				id: 'what-it-exports',
				title: 'Know the main clusters on the public surface',
				table: {
					headers: ['Cluster', 'What it helps with', 'Examples'],
					rows: [
						[
							'Auth and account identity',
							'Check auth, inspect accounts, and resolve the account you should operate on.',
							'`account.isAuthenticated()`, `account.getAccounts()`, `account.getPrimaryAccount()`'
						],
						[
							'Resource inventory',
							'List Workers, D1 databases, KV namespaces, R2 buckets, Vectorize indexes, and related account resources.',
							'`account.workers(accountId)`, `account.d1(accountId)`, `account.r2(accountId)`'
						],
						[
							'Usage and limits',
							'Read Devflare-managed operational counters and ceilings that inform remote or preview-heavy workflows.',
							'`account.getUsageSummary(accountId, "ai")`, `account.getLimits(accountId)`'
						],
						[
							'Preferences and defaults',
							'Read or update Devflare’s stored global or workspace account preferences.',
							'`account.getGlobalDefaultAccountId(primaryId)`, `account.setWorkspaceAccountId(accountId)`, `account.getEffectiveAccountId(primaryId)`'
						],
						[
							'Managed tokens and preview registry',
							'Create or rotate Devflare-managed API tokens, and inspect or update preview-registry records with shared schemas.',
							'`account.listAccountOwnedAPITokens(accountId)`, `account.ensurePreviewRegistry({ ... })`, `devflarePreviewRecordSchema`'
						]
					]
				},
				callouts: [
					{
						tone: 'info',
						title: 'This is the same mental model as the CLI, just as functions',
						body: [
							'If a CLI page talks about account preferences, preview registry records, or managed tokens, this subpath is usually where the reusable implementation lives.'
						]
					}
				]
			},
			{
				id: 'example-script',
				title: 'A small script can reuse auth and inventory without rebuilding them',
				snippets: [
					{
						title: 'List Workers for the primary account',
						filename: 'scripts/list-workers.ts',
						language: 'ts',
						code: String.raw`import { account } from 'devflare/cloudflare'

const authenticated = await account.isAuthenticated()

if (!authenticated) {
	throw new Error('Run devflare login before using this script')
}

const primary = await account.getPrimaryAccount()

	if (!primary) {
		throw new Error('No Cloudflare account is available for this script')
	}

	const workers = await account.workers(primary.id)

for (const worker of workers) {
	console.log(worker.name)
}`
					}
				],
				bullets: [
					'Keep account choice explicit in scripts that can touch more than one account.',
					'Reuse the exported helpers instead of hand-rolling Cloudflare REST calls unless you genuinely need an unsupported endpoint.',
					'Prefer returning structured data from your own scripts and let the CLI own human-readable operator output.'
				]
			},
			{
				id: 'preview-registry-and-schemas',
				title: 'Preview registry helpers and schemas are public by design',
				paragraphs: [
					'Devflare exports preview-registry helpers plus the shared registry schemas and errors so custom tooling can inspect or update preview metadata without guessing the record shape.',
					'That is especially useful for automation that wants to inspect preview URLs, scope metadata, or cleanup state while staying aligned with the same contract the CLI and GitHub actions use.'
				],
				bullets: [
					'Use schema exports such as `devflarePreviewRecordSchema` when you need to validate preview-registry data in your own tooling.',
					'Use `account.ensurePreviewRegistry(...)`, `account.listTrackedPreviewRecords(...)`, or the standalone preview-registry exports when you want the same storage contract the CLI already understands.',
					'Keep custom preview automation aligned with the docs on preview lifecycle instead of inventing parallel record shapes.'
				]
			},
			{
				id: 'where-to-go-next',
				title:
					'Open the neighboring page when the question is policy or workflow, not raw API reuse',
				cards: [
					{
						label: 'Ship & operate',
						title: 'Control-plane operations',
						body: 'Go back to the CLI-oriented page when the question is operator workflow, dry-run safety, rollback posture, or command-family behavior.',
						href: docsLink('control-plane-operations')
					},
					{
						label: 'Ship & operate',
						title: 'Preview operations',
						body: 'Open the preview lifecycle page when your tool needs the broader policy around preview inspection and cleanup flows.',
						href: docsLink('preview-operations')
					},
					{
						label: 'Ship & operate',
						title: 'GitHub workflows',
						body: 'Open the workflow page when your automation question is really about CI structure, action outputs, or PR feedback instead of raw Cloudflare helpers.',
						href: docsLink('github-workflows')
					}
				]
			}
		]
	}
]
