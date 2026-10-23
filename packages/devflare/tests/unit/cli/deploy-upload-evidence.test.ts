import { describe, expect, test } from 'bun:test'
import {
	describeMissingUploadEvidence,
	readWranglerUploadReport
} from '../../../src/cli/commands/deploy/upload-evidence'

const SESSION_ENTRY = JSON.stringify({
	type: 'wrangler-session',
	version: 1,
	wrangler_version: '4.128.0',
	command_line_args: ['deploy'],
	log_file_path: '/tmp/wrangler-debug.log'
})

function deployEntry(versionId: string | null): string {
	return JSON.stringify({
		type: 'deploy',
		version: 1,
		worker_name: 'demo-worker',
		worker_tag: 'tag-1',
		version_id: versionId,
		targets: ['https://demo-worker.example.workers.dev']
	})
}

function versionUploadEntry(versionId: string | null): string {
	return JSON.stringify({
		type: 'version-upload',
		version: 1,
		worker_name: 'demo-worker',
		worker_tag: 'tag-1',
		version_id: versionId
	})
}

describe('readWranglerUploadReport', () => {
	test('a deploy entry carrying a version id is proof of an upload', () => {
		const report = readWranglerUploadReport(
			`${SESSION_ENTRY}\n${deployEntry('version-abc')}\n`,
			'deploy'
		)

		expect(report.wranglerRan).toBe(true)
		expect(report.uploadedVersionId).toBe('version-abc')
		expect(report.uploadedWithoutVersionId).toBe(false)
		expect(report.commandFailure).toBeUndefined()
	})

	test('a version-upload entry is not read as the deploy entry that was asked for', () => {
		// A preview upload and a deploy are different Wrangler commands writing
		// different entries, so a failure must name the one that was expected
		// rather than reporting whichever entry happened to be there.
		const report = readWranglerUploadReport(
			`${SESSION_ENTRY}\n${versionUploadEntry('version-preview')}\n`,
			'deploy'
		)

		expect(report.wranglerRan).toBe(true)
		expect(report.uploadedVersionId).toBeUndefined()
		expect(report.uploadedWithoutVersionId).toBe(false)
	})

	test('a deploy entry with a null version id is what Wrangler writes when it uploaded nothing', () => {
		const report = readWranglerUploadReport(`${SESSION_ENTRY}\n${deployEntry(null)}\n`, 'deploy')

		expect(report.uploadedVersionId).toBeUndefined()
		expect(report.uploadedWithoutVersionId).toBe(true)
	})

	test('a version id beside a null-version entry still counts as an upload', () => {
		const report = readWranglerUploadReport(
			`${SESSION_ENTRY}\n${deployEntry(null)}\n${deployEntry('version-abc')}\n`,
			'deploy'
		)

		expect(report.uploadedVersionId).toBe('version-abc')
		expect(report.uploadedWithoutVersionId).toBe(false)
	})

	test('an empty output file means Wrangler never reached its argument parsing', () => {
		const report = readWranglerUploadReport('', 'deploy')

		expect(report.wranglerRan).toBe(false)
		expect(report.uploadedVersionId).toBeUndefined()
		expect(report.uploadedWithoutVersionId).toBe(false)
		expect(report.logFilePath).toBeUndefined()
	})

	test('a session entry alone proves Wrangler ran and names its debug log', () => {
		const report = readWranglerUploadReport(`${SESSION_ENTRY}\n`, 'deploy')

		expect(report.wranglerRan).toBe(true)
		expect(report.logFilePath).toBe('/tmp/wrangler-debug.log')
		expect(report.uploadedVersionId).toBeUndefined()
	})

	test('a command-failed entry carries its message through', () => {
		const report = readWranglerUploadReport(
			`${SESSION_ENTRY}\n${JSON.stringify({
				type: 'command-failed',
				version: 1,
				code: 10007,
				message: 'This Worker does not exist on your account'
			})}\n`,
			'deploy'
		)

		expect(report.commandFailure).toBe('This Worker does not exist on your account')
	})

	test('a truncated final line does not discard the entries before it', () => {
		// A killed Wrangler leaves a half-written line; the earlier lines are
		// still the only record of what happened and must survive it.
		const report = readWranglerUploadReport(
			`${SESSION_ENTRY}\n${deployEntry('version-abc')}\n{"type":"deplo`,
			'deploy'
		)

		expect(report.uploadedVersionId).toBe('version-abc')
		expect(report.wranglerRan).toBe(true)
	})

	test('a version-upload entry is read when that is the upload devflare asked for', () => {
		const report = readWranglerUploadReport(
			`${SESSION_ENTRY}\n${versionUploadEntry('version-preview')}\n`,
			'version-upload'
		)

		expect(report.uploadedVersionId).toBe('version-preview')
	})
})

describe('describeMissingUploadEvidence', () => {
	const emptyReport = readWranglerUploadReport('', 'deploy')

	test('names the empty-output case and always reports the deploy as a failure', () => {
		const message = describeMissingUploadEvidence({
			workerName: 'demo-worker',
			kind: 'deploy',
			report: emptyReport,
			accountResolved: true,
			recoveryDiagnostics: []
		})

		expect(message).toContain('wrote no structured output at all')
		expect(message).toContain('"demo-worker"')
		expect(message).toContain('FAILURE')
	})

	test('names the dry-run / aborted shape when Wrangler recorded an upload with no version id', () => {
		const message = describeMissingUploadEvidence({
			workerName: 'demo-worker',
			kind: 'deploy',
			report: readWranglerUploadReport(`${SESSION_ENTRY}\n${deployEntry(null)}\n`, 'deploy'),
			accountResolved: true,
			recoveryDiagnostics: []
		})

		expect(message).toContain('"deploy" entry with no version id')
		expect(message).toContain('uploaded nothing')
	})

	test('says Wrangler ran without uploading when only a session entry was written', () => {
		const message = describeMissingUploadEvidence({
			workerName: 'demo-worker',
			kind: 'version-upload',
			report: readWranglerUploadReport(`${SESSION_ENTRY}\n`, 'version-upload'),
			accountResolved: true,
			recoveryDiagnostics: []
		})

		expect(message).toContain('never recorded a "version-upload" entry')
		expect(message).toContain('`wrangler versions upload`')
	})

	test("quotes Wrangler's own recorded command failure ahead of everything else", () => {
		const message = describeMissingUploadEvidence({
			workerName: 'demo-worker',
			kind: 'deploy',
			report: readWranglerUploadReport(
				`${SESSION_ENTRY}\n${JSON.stringify({
					type: 'command-failed',
					version: 1,
					message: 'This Worker does not exist on your account'
				})}\n`,
				'deploy'
			),
			accountResolved: true,
			recoveryDiagnostics: []
		})

		expect(message).toContain('This Worker does not exist on your account')
		expect(message).toContain('exited 0 but recorded a failed command')
	})

	test('lists what each Cloudflare fallback reported', () => {
		const message = describeMissingUploadEvidence({
			workerName: 'demo-worker',
			kind: 'deploy',
			report: emptyReport,
			accountResolved: true,
			recoveryDiagnostics: ['version lookup: 10007 not found', 'deployment lookup: 10007 not found']
		})

		expect(message).toContain('version lookup: 10007 not found')
		expect(message).toContain('deployment lookup: 10007 not found')
	})

	test('says the API cross-check never ran when no account id resolved', () => {
		const message = describeMissingUploadEvidence({
			workerName: 'demo-worker',
			kind: 'deploy',
			report: emptyReport,
			accountResolved: false,
			recoveryDiagnostics: []
		})

		expect(message).toContain('could not resolve a Cloudflare account id')
		expect(message).toContain('CLOUDFLARE_API_TOKEN')
	})

	test("names Wrangler's debug log when the run wrote one", () => {
		const message = describeMissingUploadEvidence({
			workerName: 'demo-worker',
			kind: 'deploy',
			report: readWranglerUploadReport(`${SESSION_ENTRY}\n`, 'deploy'),
			accountResolved: true,
			recoveryDiagnostics: []
		})

		expect(message).toContain('/tmp/wrangler-debug.log')
	})
})
