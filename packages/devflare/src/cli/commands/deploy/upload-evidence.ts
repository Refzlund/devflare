// =============================================================================
// Deploy Upload Evidence — reading Wrangler's own structured output
// =============================================================================
//
// Wrangler appends ND-JSON entries to the file named by
// `WRANGLER_OUTPUT_FILE_PATH`. That file is the only in-band, machine-readable
// record of what a `wrangler deploy` / `wrangler versions upload` run actually
// did — the console is rendered for humans and, because Devflare spawns
// Wrangler with `stdio: 'inherit'`, never reaches this process at all.
//
// → KEY: a zero exit code is NOT evidence of an upload. Wrangler exits 0 on a
//   dry run, on an aborted deploy, and (observed in the wild) on a run that
//   printed its banner and did nothing else. Every one of those leaves the
//   output file without an upload entry, which is what this module reports on.
// → GOTCHA: the entry shapes below are Wrangler's, not Devflare's. They are
//   declared by `OutputEntry` in `@cloudflare/workers-utils`
//   (`packages/workers-utils/src/output.ts` in cloudflare/workers-sdk); read
//   from the `wrangler@4.128.0` tag. Everything here is tolerant of unknown
//   entry kinds and unknown fields, so a newer Wrangler cannot break it.
// → NOTE: what this module produces is a DIAGNOSIS, not the verdict. The deploy
//   command decides on the resolved version id, which may come from this file
//   or from a Cloudflare API lookup; this is what turns "no version id" into a
//   sentence naming which of the four causes it was.

/**
 * The kind of upload Devflare asked Wrangler to perform.
 *
 * @description Selects which structured-output entry the report looks for: a
 * full `wrangler deploy` records a `deploy` entry, while `wrangler versions
 * upload` (a preview upload, or the first half of a percentage rollout) records
 * a `version-upload` entry. It is what lets a failure name the entry that was
 * expected and missing, instead of "some entry".
 */
export type WranglerUploadKind = 'deploy' | 'version-upload'

/**
 * What Wrangler's structured output says about the run Devflare just spawned.
 *
 * @description A read of the ND-JSON file, never a verdict — the caller decides
 * what to do with it. Every field answers a different question about the same
 * run, because the four "no upload happened" causes want four different things
 * said to the user.
 */
export interface WranglerUploadReport {
	/**
	 * Whether Wrangler wrote any structured entry at all.
	 *
	 * False means the process Devflare spawned never reached Wrangler's argument
	 * parsing — it writes a `wrangler-session` entry there, before any command
	 * runs — so the run failed earlier than any Wrangler command could report.
	 */
	wranglerRan: boolean
	/** The version id Wrangler recorded for the upload kind that was asked for, when it uploaded one. */
	uploadedVersionId: string | undefined
	/**
	 * Whether Wrangler recorded the expected upload entry but left its version id null.
	 *
	 * Wrangler emits exactly this on a dry run and on a deploy the user (or a
	 * non-interactive prompt) aborted: the command "succeeded" and uploaded
	 * nothing.
	 */
	uploadedWithoutVersionId: boolean
	/** The message from a `command-failed` entry — Wrangler recording its own failure. */
	commandFailure: string | undefined
	/** The debug log Wrangler wrote for this run, worth naming in a failure. */
	logFilePath: string | undefined
}

/** One line of Wrangler's ND-JSON output, narrowed to the fields Devflare reads. */
interface WranglerOutputEntry {
	type?: unknown
	version_id?: unknown
	message?: unknown
	log_file_path?: unknown
}

/**
 * Parse a Wrangler structured-output file into its entries.
 *
 * @param structuredOutput - The raw ND-JSON file contents; `''` when the file was absent or empty.
 * @returns One object per parseable line, in the order Wrangler appended them. Unparseable lines are dropped rather than throwing: a truncated final line is a normal consequence of a killed process, and it must not cost the diagnosis of the earlier lines.
 */
function parseWranglerOutputEntries(structuredOutput: string): WranglerOutputEntry[] {
	return structuredOutput
		.replace(/\r/g, '')
		.split('\n')
		.map((line) => line.trim())
		.filter(Boolean)
		.map((line) => {
			try {
				return JSON.parse(line) as unknown
			} catch {
				return null
			}
		})
		.filter(
			(entry): entry is WranglerOutputEntry =>
				entry !== null && typeof entry === 'object' && !Array.isArray(entry)
		)
}

/** Read a field as a non-empty trimmed string, or `undefined` — Wrangler types several of these as nullable. */
function readNonEmptyString(value: unknown): string | undefined {
	return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

/**
 * Read what Wrangler's structured output says about the upload that was asked for.
 *
 * @param structuredOutput - The raw ND-JSON Wrangler wrote; `''` when the file was absent or empty.
 * @param kind - The upload Devflare asked for; only an entry of this kind is read as that upload.
 * @returns A report describing the run. An empty `structuredOutput` yields an all-negative report rather than throwing — "Wrangler wrote nothing" is itself the most important thing this can say.
 */
export function readWranglerUploadReport(
	structuredOutput: string,
	kind: WranglerUploadKind
): WranglerUploadReport {
	const entries = parseWranglerOutputEntries(structuredOutput)
	let uploadedVersionId: string | undefined
	let uploadedWithoutVersionId = false
	let commandFailure: string | undefined
	let logFilePath: string | undefined

	for (const entry of entries) {
		if (entry.type === kind) {
			const versionId = readNonEmptyString(entry.version_id)
			if (versionId) {
				uploadedVersionId ??= versionId
			} else {
				uploadedWithoutVersionId = true
			}
			continue
		}

		if (entry.type === 'command-failed') {
			commandFailure ??= readNonEmptyString(entry.message) ?? 'no message'
			continue
		}

		if (entry.type === 'wrangler-session') {
			logFilePath ??= readNonEmptyString(entry.log_file_path)
		}
	}

	return {
		// Any entry proves Wrangler parsed its arguments; the session entry is
		// simply the first one it writes.
		wranglerRan: entries.length > 0,
		uploadedVersionId,
		// An upload entry that also carried a version id is proof of an upload,
		// so the null-version entry beside it (which cannot happen for one run,
		// but would if a file were ever reused) must not turn success into
		// failure.
		uploadedWithoutVersionId: uploadedWithoutVersionId && !uploadedVersionId,
		commandFailure,
		logFilePath
	}
}

/** The command Wrangler was asked to run, for a message the reader can act on. */
function describeCommand(kind: WranglerUploadKind): string {
	return kind === 'deploy' ? '`wrangler deploy`' : '`wrangler versions upload`'
}

/**
 * Explain why Devflare cannot prove an upload happened.
 *
 * @description The message a deploy fails with when no source of evidence
 * produced a Worker version id. It leads with what Wrangler's own output said,
 * because that distinguishes "Wrangler never ran" from "Wrangler ran and
 * declined to upload" — two very different things to go and check.
 * @param input.workerName - The Worker the deploy targeted, named so a wrong-name config is visible.
 * @param input.kind - The upload that was asked for.
 * @param input.report - What Wrangler's structured output recorded.
 * @param input.accountResolved - Whether Devflare had Cloudflare credentials to cross-check with; without them the API fallbacks never ran, which is worth saying rather than leaving as silence.
 * @param input.recoveryDiagnostics - What each Cloudflare fallback reported when it could not resolve a version. Collected during the deploy and, before this existed, dropped on the floor.
 * @returns A single-paragraph message; the caller prefixes it.
 */
export function describeMissingUploadEvidence(input: {
	workerName: string
	kind: WranglerUploadKind
	report: WranglerUploadReport
	accountResolved: boolean
	recoveryDiagnostics: string[]
}): string {
	const command = describeCommand(input.kind)
	const parts: string[] = []

	if (input.report.commandFailure) {
		parts.push(
			`${command} exited 0 but recorded a failed command in its structured output: ${input.report.commandFailure}.`
		)
	} else if (input.report.uploadedWithoutVersionId) {
		parts.push(
			`${command} recorded a "${input.kind}" entry with no version id, which is what Wrangler writes for a dry run or an aborted deploy — it uploaded nothing.`
		)
	} else if (input.report.wranglerRan) {
		parts.push(
			`${command} ran but never recorded a "${input.kind}" entry, so it exited without uploading a Worker version.`
		)
	} else {
		parts.push(
			`${command} wrote no structured output at all, so it exited before reaching its deploy command — check that Wrangler is installed and runnable in this environment, and re-run with the output it prints.`
		)
	}

	parts.push(
		`Devflare could not prove which version of "${input.workerName}" Cloudflare accepted, so this deploy is reported as a FAILURE rather than a success.`
	)

	if (input.recoveryDiagnostics.length > 0) {
		parts.push(`Cloudflare fallback checks also failed: ${input.recoveryDiagnostics.join(' | ')}.`)
	} else if (!input.accountResolved) {
		parts.push(
			'Devflare could not resolve a Cloudflare account id, so it could not cross-check the deploy against the Cloudflare API. Set CLOUDFLARE_API_TOKEN, or accountId in devflare.config.ts, to enable that fallback.'
		)
	}

	if (input.report.logFilePath) {
		parts.push(`Wrangler's debug log for this run: ${input.report.logFilePath}.`)
	}

	return parts.join(' ')
}
