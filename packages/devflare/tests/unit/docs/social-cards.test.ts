import { describe, expect, test } from 'bun:test'
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import documentationPackageJson from '../../../../../apps/documentation/package.json'
import {
	createSocialCardPages,
	generateSocialCards,
	renderSocialCardHtml
} from '../../../../../apps/documentation/scripts/social-cards'
import { docs } from '../../../../../apps/documentation/src/lib/docs/content'
import {
	DEFAULT_SOCIAL_CARD_TITLE,
	DEFAULT_SOCIAL_DESCRIPTION,
	getSocialCardPath,
	getSocialTitle
} from '../../../../../apps/documentation/src/lib/site/social'

const transparentLogoSvg =
	'<svg width="886" height="396" viewBox="0 0 886 396" xmlns="http://www.w3.org/2000/svg"><path fill="#ff5000" d="M0 0h886v396H0z"/></svg>'

function readPngDimensions(bytes: Buffer): { width: number; height: number } {
	return {
		width: bytes.readUInt32BE(16),
		height: bytes.readUInt32BE(20)
	}
}

describe('documentation social cards', () => {
	test('uses generated page-specific social card paths', () => {
		const whyDevflare = docs.find((doc) => doc.slug === 'what-devflare-is')

		expect(getSocialCardPath(undefined)).toBe('/social-cards/home.png')
		expect(getSocialCardPath(whyDevflare)).toBe('/social-cards/docs/what-devflare-is.png')
		expect(getSocialCardPath(whyDevflare)).not.toBe('/devflare-social-card.png')
	})

	test('creates one home card and one card per published docs page', () => {
		const pages = createSocialCardPages()
		const paths = pages.map((page) => page.path)

		expect(pages).toHaveLength(docs.length + 1)
		expect(paths).toContain('/social-cards/home.png')
		expect(paths).toContain('/social-cards/docs/what-devflare-is.png')
		expect(new Set(paths).size).toBe(paths.length)
		expect(pages.find((page) => page.path === '/social-cards/home.png')).toMatchObject({
			title: DEFAULT_SOCIAL_CARD_TITLE,
			description: DEFAULT_SOCIAL_DESCRIPTION
		})
	})

	test('renders the cleaner Svelte card template with browser-owned badge spacing', async () => {
		const html = await renderSocialCardHtml(
			{
				path: '/social-cards/docs/what-devflare-is.png',
				title: getSocialTitle(docs.find((doc) => doc.slug === 'what-devflare-is')),
				description:
					'Devflare gives you one clearer story for config, worker compilation, local development, runtime helpers, testing, and deploy flows.'
			},
			{ logoSvg: transparentLogoSvg, npmLogoPng: Buffer.alloc(0) }
		)

		expect(html).toContain('DEVFLARE DOCS')
		expect(html).toContain('social-card-grid')
		expect(html).toContain('social-card-blob')
		expect(html).toContain('social-card-badge')
		expect(html).toContain('Refzlund/devflare')
		expect(html).toContain('npmjs')
		expect(html).toContain('Local-first toolkit for Cloudflare Workers')
		expect(html).toContain('display: inline-flex')
		expect(html).toContain('gap: 10px')
		expect(html).toContain('padding: 0 10px')
		expect(html).toContain('border-radius: 7px')
		expect(html).not.toContain('>df<')
		expect(html.match(/DEVFLARE DOCS/g) ?? []).toHaveLength(1)
		expect(html).not.toContain('devflare docs')
		expect(html).not.toContain('textLength')
		expect(html).not.toContain('lengthAdjust')
	})

	test('uses a standalone Svelte compiler config for social cards', async () => {
		const source = await readFile(
			new URL('../../../../../apps/documentation/scripts/social-cards.ts', import.meta.url),
			'utf8'
		)

		expect(source).toContain('configFile: false')
	})

	test('generates social cards in docs runtime workflows without slowing dependency install', () => {
		const scripts = documentationPackageJson.scripts

		for (const scriptName of ['dev', 'build', 'deploy', 'deploy:preview', 'check', 'check:watch']) {
			expect(scripts[scriptName as keyof typeof scripts]).toContain('social:generate')
		}

		expect(scripts.prepare).not.toContain('social:generate')
	})

	test('generates crawlable 1200x630 png files into the requested output directory', async () => {
		const outputDir = await mkdtemp(join(tmpdir(), 'devflare-social-cards-'))
		const pngBytes = Buffer.from(
			'89504e470d0a1a0a0000000d49484452000004b00000027608060000006255f19e000000017352474200aece1ce90000000467414d410000b18f0bfc6105000000097048597300000ec300000ec301c76fa8640000001849444154785eedc1010d000000c2a0f74f6d0e37a0000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000080810b9b4300019702a3010000000049454e44ae426082',
			'hex'
		)

		try {
			const result = await generateSocialCards({
				logoSvg: transparentLogoSvg,
				outputDir,
				renderPng: async ({ outputPath }) => {
					await Bun.write(outputPath, pngBytes)
				},
				pages: [
					{
						path: '/social-cards/docs/what-devflare-is.png',
						title: 'Why Devflare - Devflare Docs',
						description: 'A concise page-specific preview.'
					}
				]
			})
			const outputPath = join(outputDir, 'docs', 'what-devflare-is.png')
			const bytes = await readFile(outputPath)
			const metadata = readPngDimensions(bytes)
			const file = await stat(outputPath)

			expect(result.outputFiles).toEqual([outputPath])
			expect(bytes.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a')
			expect(metadata).toEqual({ width: 1200, height: 630 })
			expect(file.size).toBeGreaterThan(100)
		} finally {
			await rm(outputDir, { recursive: true, force: true })
		}
	})

	test('reuses generated cards when inputs have not changed', async () => {
		const outputDir = await mkdtemp(join(tmpdir(), 'devflare-social-cards-cache-'))
		let renderCount = 0
		const page = {
			path: '/social-cards/docs/what-devflare-is.png',
			title: 'Why Devflare - Devflare Docs',
			description: 'A concise page-specific preview.'
		}

		try {
			await generateSocialCards({
				logoSvg: transparentLogoSvg,
				outputDir,
				pages: [page],
				renderPng: async ({ outputPath }) => {
					renderCount += 1
					await Bun.write(outputPath, 'png placeholder')
				}
			})

			await generateSocialCards({
				logoSvg: transparentLogoSvg,
				outputDir,
				pages: [page],
				renderPng: async () => {
					renderCount += 1
					throw new Error('cached social card should not render again')
				}
			})

			expect(renderCount).toBe(1)
		} finally {
			await rm(outputDir, { recursive: true, force: true })
		}
	})

	test('can force social card regeneration when cached inputs match', async () => {
		const outputDir = await mkdtemp(join(tmpdir(), 'devflare-social-cards-force-'))
		let renderCount = 0
		const page = {
			path: '/social-cards/docs/what-devflare-is.png',
			title: 'Why Devflare - Devflare Docs',
			description: 'A concise page-specific preview.'
		}

		try {
			await generateSocialCards({
				logoSvg: transparentLogoSvg,
				outputDir,
				pages: [page],
				renderPng: async ({ outputPath }) => {
					renderCount += 1
					await Bun.write(outputPath, 'png placeholder')
				}
			})

			await generateSocialCards({
				force: true,
				logoSvg: transparentLogoSvg,
				outputDir,
				pages: [page],
				renderPng: async ({ outputPath }) => {
					renderCount += 1
					await Bun.write(outputPath, 'png placeholder')
				}
			})

			expect(renderCount).toBe(2)
		} finally {
			await rm(outputDir, { recursive: true, force: true })
		}
	}, 30_000)
})
