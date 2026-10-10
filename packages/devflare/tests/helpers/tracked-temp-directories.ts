import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

export interface TrackedTempDirectories {
	create(prefix: string): string
	track(directory: string): string
	cleanup(): void
}

export function createTrackedTempDirectories(): TrackedTempDirectories {
	const directories = new Set<string>()

	return {
		create(prefix: string): string {
			const directory = mkdtempSync(join(tmpdir(), prefix))
			directories.add(directory)
			return directory
		},
		track(directory: string): string {
			directories.add(directory)
			return directory
		},
		cleanup(): void {
			for (const directory of directories) {
				rmSync(directory, { recursive: true, force: true })
			}
			directories.clear()
		}
	}
}
