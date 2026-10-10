import { mkdir, writeFile } from 'node:fs/promises'
import { dirname } from 'pathe'

export interface DeployResultMetadata {
	status: 'success' | 'failure'
	exitCode: number
	workerName?: string
	preview: boolean
	branchScopedPreview: boolean
	previewScope?: string
	versionId?: string
	previewUrl?: string
	workersDevUrl?: string
	verificationNote?: string
	outputUrls: string[]
	structuredOutput?: string
	error?: string
}

export function inferRecordSource(): 'cli' | 'github-action' {
	return process.env.GITHUB_ACTIONS === 'true' ? 'github-action' : 'cli'
}

export async function writeDeployResultMetadata(metadata: DeployResultMetadata): Promise<void> {
	const metadataPath = process.env.DEVFLARE_DEPLOY_METADATA_PATH?.trim()
	if (!metadataPath) {
		return
	}

	await mkdir(dirname(metadataPath), { recursive: true })
	await writeFile(metadataPath, JSON.stringify(metadata, null, '\t'), 'utf8')
}
