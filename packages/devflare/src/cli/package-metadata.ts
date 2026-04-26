import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'pathe'

interface PackageJsonMetadata {
	version?: string
	dependencies?: Record<string, string>
	devDependencies?: Record<string, string>
}

export interface InitDependencyVersions {
	devflare: string
	typescript: string
	wrangler: string
	workersTypes: string
}

let packageMetadataPromise: Promise<PackageJsonMetadata> | null = null

async function loadPackageMetadata(): Promise<PackageJsonMetadata> {
	let currentDir = dirname(fileURLToPath(import.meta.url))

	while (true) {
		const packageJsonPath = resolve(currentDir, 'package.json')

		try {
			const packageJson = await readFile(packageJsonPath, 'utf8')
			const metadata = JSON.parse(packageJson) as PackageJsonMetadata & { name?: string }

			if (metadata.name === 'devflare') {
				return metadata
			}
		} catch {
			// Keep walking upward until we find the published package root
		}

		const parentDir = dirname(currentDir)
		if (parentDir === currentDir) {
			throw new Error('Could not resolve the devflare package.json file')
		}

		currentDir = parentDir
	}
}

export async function getPackageMetadata(): Promise<PackageJsonMetadata> {
	if (!packageMetadataPromise) {
		packageMetadataPromise = loadPackageMetadata()
	}

	return packageMetadataPromise
}

export async function getPackageVersion(): Promise<string> {
	return (await getPackageMetadata()).version ?? '0.0.0'
}

export async function getInitDependencyVersions(): Promise<InitDependencyVersions> {
	const metadata = await getPackageMetadata()
	const dependencies = metadata.dependencies ?? {}
	const devDependencies = metadata.devDependencies ?? {}

	return {
		devflare: `^${metadata.version ?? '0.0.0'}`,
		typescript: devDependencies.typescript ?? '^5.7.0',
		wrangler: dependencies.wrangler ?? devDependencies.wrangler ?? '^4.85.0',
		workersTypes: devDependencies['@cloudflare/workers-types'] ?? '^4.20250109.0'
	}
}
