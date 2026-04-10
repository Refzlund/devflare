import { stat } from 'node:fs/promises'
import { resolveConfigPath } from '../config/loader'
import { findFiles } from '../utils/glob'

export const CONFIG_FILE_EXTENSIONS = ['.ts', '.mts', '.js', '.mjs'] as const
export const SUPPORTED_CONFIG_FILENAMES = CONFIG_FILE_EXTENSIONS.map(
	(extension) => `devflare.config${extension}`
)

function hasKnownConfigExtension(filePath: string): boolean {
	return CONFIG_FILE_EXTENSIONS.some((extension) => filePath.endsWith(extension))
}

async function getExistingFilePath(filePath: string): Promise<string | null> {
	try {
		const fileStat = await stat(filePath)
		return fileStat.isFile() ? filePath : null
	} catch {
		return null
	}
}

export async function resolveConfigCandidatePath(candidatePath: string): Promise<string | null> {
	const candidates = [candidatePath]

	if (!hasKnownConfigExtension(candidatePath)) {
		for (const extension of CONFIG_FILE_EXTENSIONS) {
			candidates.push(`${candidatePath}${extension}`)
		}
	}

	for (const candidate of candidates) {
		const existingFilePath = await getExistingFilePath(candidate)
		if (existingFilePath) {
			return existingFilePath
		}
	}

	return await resolveConfigPath(candidatePath) ?? null
}

export async function findConfigPathsUnderDirectory(rootDir: string): Promise<string[]> {
	const matches = await findFiles(
		[
			...SUPPORTED_CONFIG_FILENAMES,
			...SUPPORTED_CONFIG_FILENAMES.map((filename) => `**/${filename}`)
		],
		{
			cwd: rootDir,
			absolute: true
		}
	)

	return [...new Set(matches)].sort((left, right) => left.localeCompare(right))
}

export function formatSupportedConfigFilenames(): string {
	return SUPPORTED_CONFIG_FILENAMES.join(', ')
}
