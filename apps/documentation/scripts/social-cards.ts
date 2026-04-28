import { svelte } from '@sveltejs/vite-plugin-svelte'
import puppeteer, { type Browser } from 'puppeteer-core'
import { createHash } from 'node:crypto'
import { access, mkdir, readFile, readdir, rm } from 'node:fs/promises'
import { dirname, isAbsolute, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { render } from 'svelte/server'
import { createServer } from 'vite'
import { docs } from '../src/lib/docs/content'
import {
	DEFAULT_SOCIAL_CARD_TITLE,
	DEFAULT_SOCIAL_DESCRIPTION,
	getSocialCardPath,
	getSocialDescription
} from '../src/lib/site/social'

export interface SocialCardPage {
	path: string
	title: string
	description: string
}

export interface SocialCardAssets {
	logoSvg?: string
	npmLogoPng?: Buffer
}

export interface RenderSocialCardPngInput {
	html: string
	outputPath: string
	page: SocialCardPage
}

export type RenderSocialCardPng = (input: RenderSocialCardPngInput) => Promise<void>

export interface GenerateSocialCardsOptions extends SocialCardAssets {
	force?: boolean
	outputDir?: string
	pages?: readonly SocialCardPage[]
	renderPng?: RenderSocialCardPng
}

export interface GenerateSocialCardsResult {
	outputDir: string
	outputFiles: string[]
	pages: readonly SocialCardPage[]
}

interface ResolvedSocialCardAssets {
	logoDataUrl: string
	npmLogoDataUrl: string
}

interface SocialCardBlob {
	x: number
	y: number
	width: number
	height: number
	rotation: number
	opacity: number
	tone: 'orange' | 'amber'
}

interface SocialCardTemplateRenderer {
	renderHtml(page: SocialCardPage): string
	close(): Promise<void>
}

const CARD_WIDTH = 1200
const CARD_HEIGHT = 630
const MANIFEST_FILENAME = '.manifest.json'
const SOCIAL_CARD_COMPONENT_PATH = '/src/lib/social-card/SocialCard.svelte'

function randomBetween(min: number, max: number): number {
	return Math.round(min + Math.random() * (max - min))
}

function createBackgroundBlobs(): SocialCardBlob[] {
	return [
		{
			x: 792 + randomBetween(-38, 44),
			y: 18 + randomBetween(-26, 30),
			width: 440 + randomBetween(-34, 38),
			height: 240 + randomBetween(-22, 24),
			rotation: randomBetween(-9, 9),
			opacity: randomBetween(72, 88) / 100,
			tone: 'orange'
		},
		{
			x: 712 + randomBetween(-54, 60),
			y: 220 + randomBetween(-34, 38),
			width: 560 + randomBetween(-44, 52),
			height: 300 + randomBetween(-28, 30),
			rotation: randomBetween(-13, 13),
			opacity: randomBetween(68, 82) / 100,
			tone: 'amber'
		},
		{
			x: 936 + randomBetween(-44, 36),
			y: 424 + randomBetween(-30, 26),
			width: 360 + randomBetween(-30, 34),
			height: 230 + randomBetween(-24, 24),
			rotation: randomBetween(-10, 10),
			opacity: randomBetween(52, 68) / 100,
			tone: 'orange'
		}
	]
}

function getScriptDir(): string {
	return dirname(fileURLToPath(import.meta.url))
}

export function getDocumentationAppDir(): string {
	return resolve(getScriptDir(), '..')
}

export function getDocumentationStaticDir(): string {
	return resolve(getDocumentationAppDir(), 'static')
}

export function getSocialCardsOutputDir(): string {
	return resolve(getDocumentationStaticDir(), 'social-cards')
}

export function getNpmLogoAssetPath(): string {
	return resolve(getScriptDir(), 'assets/npmjs-logo.png')
}

function getSocialCardsManifestPath(outputDir: string): string {
	return resolve(outputDir, MANIFEST_FILENAME)
}

function toDataUrl(mimeType: string, bytes: string | Buffer): string {
	return `data:${mimeType};base64,${Buffer.from(bytes).toString('base64')}`
}

function toCardOutputPath(outputDir: string, cardPath: string): string {
	const relativePath = cardPath.replace(/^\/social-cards\/?/, '')
	const outputPath = resolve(outputDir, relativePath)
	const normalizedOutputDir = resolve(outputDir)
	const outputRelativePath = relative(normalizedOutputDir, outputPath)

	if (outputRelativePath.startsWith('..') || isAbsolute(outputRelativePath)) {
		throw new Error(`Refusing to write social card outside ${normalizedOutputDir}: ${outputPath}`)
	}

	return outputPath
}

function hashContent(content: string | Buffer): string {
	return createHash('sha256').update(content).digest('hex')
}

async function createSocialCardsFingerprint(
	pages: readonly SocialCardPage[],
	assets: ResolvedSocialCardAssets
): Promise<string> {
	const [scriptSource, componentSource] = await Promise.all([
		readFile(fileURLToPath(import.meta.url), 'utf8'),
		readFile(resolve(getDocumentationAppDir(), 'src/lib/social-card/SocialCard.svelte'), 'utf8')
	])

	return hashContent(
		JSON.stringify({
			version: 2,
			cardSize: [CARD_WIDTH, CARD_HEIGHT],
			pages,
			logoDataUrlHash: hashContent(assets.logoDataUrl),
			npmLogoDataUrlHash: hashContent(assets.npmLogoDataUrl),
			scriptSourceHash: hashContent(scriptSource),
			componentSourceHash: hashContent(componentSource)
		})
	)
}

async function readManifestFingerprint(outputDir: string): Promise<string | undefined> {
	try {
		const manifest = JSON.parse(await readFile(getSocialCardsManifestPath(outputDir), 'utf8'))

		return typeof manifest?.fingerprint === 'string' ? manifest.fingerprint : undefined
	} catch {
		return undefined
	}
}

async function writeManifest(outputDir: string, fingerprint: string): Promise<void> {
	await Bun.write(
		getSocialCardsManifestPath(outputDir),
		`${JSON.stringify(
			{
				fingerprint,
				generatedAt: new Date().toISOString()
			},
			null,
			2
		)}\n`
	)
}

async function allFilesExist(paths: readonly string[]): Promise<boolean> {
	const checks = await Promise.all(paths.map((path) => pathExists(path)))

	return checks.every(Boolean)
}

async function resolveSocialCardAssets(
	options: SocialCardAssets = {}
): Promise<ResolvedSocialCardAssets> {
	const logoSvg =
		options.logoSvg ?? (await readFile(resolve(getDocumentationStaticDir(), 'devflare-logo.svg'), 'utf8'))
	const npmLogoPng = options.npmLogoPng ?? (await readFile(getNpmLogoAssetPath()))

	return {
		logoDataUrl: toDataUrl('image/svg+xml', logoSvg),
		npmLogoDataUrl: toDataUrl('image/png', npmLogoPng)
	}
}

async function createSocialCardTemplateRenderer(
	assets: ResolvedSocialCardAssets
): Promise<SocialCardTemplateRenderer> {
	const vite = await createServer({
		appType: 'custom',
		configFile: false,
		logLevel: 'error',
		root: getDocumentationAppDir(),
		server: {
			hmr: false,
			middlewareMode: true
		},
		plugins: [
			svelte({
				configFile: false,
				compilerOptions: {
					dev: false
				}
			})
		]
	})
	const componentModule = await vite.ssrLoadModule(SOCIAL_CARD_COMPONENT_PATH)
	const SocialCard = componentModule.default

	return {
		renderHtml(page) {
			const rendered = render(SocialCard, {
				props: {
					title: page.title,
					description: page.description,
					logoDataUrl: assets.logoDataUrl,
					npmLogoDataUrl: assets.npmLogoDataUrl,
					blobs: createBackgroundBlobs()
				}
			})

			return `<!doctype html>
<html lang="en">
<head>
	<meta charset="utf-8" />
	<meta name="viewport" content="width=${CARD_WIDTH}, height=${CARD_HEIGHT}, initial-scale=1" />
	${rendered.head}
</head>
<body>${rendered.body}</body>
</html>`
		},
		close() {
			return vite.close()
		}
	}
}

export function createSocialCardPages(): SocialCardPage[] {
	return [
		{
			path: getSocialCardPath(undefined),
			title: DEFAULT_SOCIAL_CARD_TITLE,
			description: DEFAULT_SOCIAL_DESCRIPTION
		},
		...docs.map((doc) => ({
			path: getSocialCardPath(doc),
			title: doc.navTitle,
			description: getSocialDescription(doc)
		}))
	]
}

export async function renderSocialCardHtml(
	page: SocialCardPage,
	options: SocialCardAssets = {}
): Promise<string> {
	const assets = await resolveSocialCardAssets(options)
	const renderer = await createSocialCardTemplateRenderer(assets)

	try {
		return renderer.renderHtml(page)
	} finally {
		await renderer.close()
	}
}

async function pathExists(path: string): Promise<boolean> {
	try {
		await access(path)
		return true
	} catch {
		return false
	}
}

async function collectVersionedExecutableCandidates(
	parentDir: string | undefined,
	directoryPrefix: string,
	executableParts: string[]
): Promise<string[]> {
	if (!parentDir) {
		return []
	}

	try {
		const entries = await readdir(parentDir, { withFileTypes: true })

		return entries
			.filter((entry) => entry.isDirectory() && entry.name.startsWith(directoryPrefix))
			.sort((first, second) =>
				second.name.localeCompare(first.name, undefined, { numeric: true, sensitivity: 'base' })
			)
			.map((entry) => join(parentDir, entry.name, ...executableParts))
	} catch {
		return []
	}
}

async function getChromiumExecutableCandidates(): Promise<string[]> {
	const candidates = [
		process.env.DEVFLARE_SOCIAL_CARD_CHROME,
		process.env.PUPPETEER_EXECUTABLE_PATH,
		process.env.CHROME_PATH
	].filter((candidate): candidate is string => Boolean(candidate))

	if (process.platform === 'win32') {
		const localAppData = process.env.LOCALAPPDATA
		const userProfile = process.env.USERPROFILE

		candidates.push(
			...(await collectVersionedExecutableCandidates(localAppData && join(localAppData, 'ms-playwright'), 'chromium-', [
				'chrome-win64',
				'chrome.exe'
			])),
			...(await collectVersionedExecutableCandidates(
				localAppData && join(localAppData, 'xdg.cache', '.wrangler', 'chrome'),
				'win64-',
				['chrome-win64', 'chrome.exe']
			)),
			...(await collectVersionedExecutableCandidates(
				userProfile && join(userProfile, '.cache', 'puppeteer', 'chrome'),
				'win64-',
				['chrome-win64', 'chrome.exe']
			)),
			join(process.env.ProgramFiles ?? 'C:\\Program Files', 'Google', 'Chrome', 'Application', 'chrome.exe'),
			join(process.env['ProgramFiles(x86)'] ?? 'C:\\Program Files (x86)', 'Google', 'Chrome', 'Application', 'chrome.exe'),
			join(process.env.ProgramFiles ?? 'C:\\Program Files', 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
			join(process.env['ProgramFiles(x86)'] ?? 'C:\\Program Files (x86)', 'Microsoft', 'Edge', 'Application', 'msedge.exe')
		)
	} else if (process.platform === 'darwin') {
		const home = process.env.HOME

		candidates.push(
			'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
			'/Applications/Chromium.app/Contents/MacOS/Chromium',
			...(await collectVersionedExecutableCandidates(
				home && join(home, 'Library', 'Caches', 'ms-playwright'),
				'chromium-',
				['chrome-mac', 'Chromium.app', 'Contents', 'MacOS', 'Chromium']
			)),
			...(await collectVersionedExecutableCandidates(home && join(home, '.cache', 'puppeteer', 'chrome'), 'mac-', [
				'chrome-mac-x64',
				'Google Chrome for Testing.app',
				'Contents',
				'MacOS',
				'Google Chrome for Testing'
			]))
		)
	} else {
		const home = process.env.HOME

		candidates.push(
			'/usr/bin/google-chrome-stable',
			'/usr/bin/google-chrome',
			'/usr/bin/chromium',
			'/usr/bin/chromium-browser',
			'/snap/bin/chromium',
			...(await collectVersionedExecutableCandidates(home && join(home, '.cache', 'ms-playwright'), 'chromium-', [
				'chrome-linux',
				'chrome'
			])),
			...(await collectVersionedExecutableCandidates(home && join(home, '.cache', 'puppeteer', 'chrome'), 'linux-', [
				'chrome-linux64',
				'chrome'
			]))
		)
	}

	return candidates
}

export async function findChromiumExecutablePath(): Promise<string> {
	for (const candidate of await getChromiumExecutableCandidates()) {
		if (await pathExists(candidate)) {
			return candidate
		}
	}

	throw new Error(
		'Unable to find a Chromium-compatible browser for social card rendering. Install Chrome/Chromium, run Playwright/Puppeteer browser install, or set DEVFLARE_SOCIAL_CARD_CHROME to the browser executable.'
	)
}

async function createBrowserPngRenderer(): Promise<{
	renderPng: RenderSocialCardPng
	close(): Promise<void>
}> {
	const executablePath = await findChromiumExecutablePath()
	const browser: Browser = await puppeteer.launch({
		executablePath,
		headless: true,
		args: ['--no-sandbox', '--disable-setuid-sandbox']
	})
	const page = await browser.newPage()

	await page.setViewport({
		width: CARD_WIDTH,
		height: CARD_HEIGHT,
		deviceScaleFactor: 1
	})

	return {
		async renderPng({ html, outputPath }) {
			await page.setContent(html, { waitUntil: 'load' })
			await page.evaluate(() => document.fonts.ready)
			await page.screenshot({
				path: outputPath,
				type: 'png',
				clip: {
					x: 0,
					y: 0,
					width: CARD_WIDTH,
					height: CARD_HEIGHT
				}
			})
		},
		async close() {
			await page.close()
			await browser.close()
		}
	}
}

export async function generateSocialCards(
	options: GenerateSocialCardsOptions = {}
): Promise<GenerateSocialCardsResult> {
	const outputDir = options.outputDir ?? getSocialCardsOutputDir()
	const pages = options.pages ?? createSocialCardPages()
	const assets = await resolveSocialCardAssets(options)
	const outputFiles = pages.map((page) => toCardOutputPath(outputDir, page.path))
	const fingerprint = await createSocialCardsFingerprint(pages, assets)
	const force = options.force ?? process.env.DEVFLARE_SOCIAL_CARDS_FORCE === '1'

	if (!force && (await readManifestFingerprint(outputDir)) === fingerprint && (await allFilesExist(outputFiles))) {
		return {
			outputDir,
			outputFiles,
			pages
		}
	}

	const templateRenderer = await createSocialCardTemplateRenderer(assets)
	const browserRenderer = options.renderPng ? undefined : await createBrowserPngRenderer()
	const renderPng = options.renderPng ?? browserRenderer?.renderPng

	if (!renderPng) {
		throw new Error('Social card renderer was not configured.')
	}

	await rm(outputDir, { recursive: true, force: true })

	try {
		for (const [index, page] of pages.entries()) {
			const outputPath = outputFiles[index]
			const html = templateRenderer.renderHtml(page)

			await mkdir(dirname(outputPath), { recursive: true })
			await renderPng({ html, outputPath, page })
		}
		await writeManifest(outputDir, fingerprint)
	} finally {
		await Promise.all([templateRenderer.close(), browserRenderer?.close()])
	}

	return {
		outputDir,
		outputFiles,
		pages
	}
}
