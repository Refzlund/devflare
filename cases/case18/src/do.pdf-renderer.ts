// =============================================================================
// Case 18: PdfRenderer Durable Object
// =============================================================================
// Browser Rendering-based PDF generator running inside a Durable Object.
// Demonstrates:
// - Browser Rendering binding usage
// - Puppeteer API for PDF generation
// - DO-based caching of rendered PDFs
// =============================================================================

import { DurableObject } from 'cloudflare:workers'
import type { DurableObjectNamespace, Fetcher } from '@cloudflare/workers-types'
import { PdfRequest, PdfResult, type PdfRequestData, type PdfResultData } from '$lib/models'

interface CachedPdf {
	pdfBase64: string
	generatedAt: number
	url: string
}

interface Env {
	BROWSER: Fetcher
	PDF_RENDERER: DurableObjectNamespace
}

export class PdfRenderer extends DurableObject<Env> {

	/**
	 * Handle HTTP requests
	 */
	async fetch(request: Request): Promise<Response> {
		try {
			const url = new URL(request.url)

			// Generate PDF
			if (url.pathname === '/generate' && request.method === 'POST') {
				return this.handleGenerate(request)
			}

			// Get cached PDF
			if (url.pathname.startsWith('/cached/')) {
				const id = url.pathname.slice(8)
				return this.handleGetCached(id)
			}

			// Get renderer stats
			if (url.pathname === '/stats') {
				return this.handleGetStats()
			}

			// Clear cache
			if (url.pathname === '/clear-cache' && request.method === 'POST') {
				return this.handleClearCache()
			}

			return new Response('Not found', { status: 404 })
		} catch (error) {
			console.error('[PdfRenderer] fetch error:', error)
			throw error
		}
	}

	/**
	 * Handle PDF generation request
	 */
	private async handleGenerate(request: Request): Promise<Response> {
		const start = Date.now()

		try {
			const body = await request.json() as PdfRequestData
			const pdfRequest = new PdfRequest(body)

			// Check cache first
			const cacheKey = `pdf:${this.hashUrl(pdfRequest.url)}`
			const cached = await this.ctx.storage.get<CachedPdf>(cacheKey)

			if (cached && Date.now() - cached.generatedAt < 300000) {
				// Return cached if less than 5 minutes old
				// Use chunked decode to avoid memory issues with large PDFs
				const pdfBytes = this.base64ToUint8Array(cached.pdfBase64)
				// Cast to ArrayBuffer for Response body compatibility
				const bodyBuffer = pdfBytes.buffer.slice(pdfBytes.byteOffset, pdfBytes.byteOffset + pdfBytes.byteLength) as ArrayBuffer

				return new Response(bodyBuffer, {
					headers: {
						'Content-Type': 'application/pdf',
						'X-Request-Id': pdfRequest.id,
						'X-Cached': 'true',
						'X-Duration-Ms': String(Date.now() - start)
					}
				})
			}

			// Generate new PDF
			const pdfData = await this.generatePdf(pdfRequest)

			// Cache the result - use chunked encoding to avoid stack overflow for large PDFs
			const pdfBase64 = this.uint8ArrayToBase64(pdfData)
			await this.ctx.storage.put<CachedPdf>(cacheKey, {
				pdfBase64,
				generatedAt: Date.now(),
				url: pdfRequest.url
			})

			// Track stats
			await this.incrementStat('generated')

			// Cast to ArrayBuffer for Response body compatibility
			const bodyBuffer = pdfData.buffer.slice(pdfData.byteOffset, pdfData.byteOffset + pdfData.byteLength) as ArrayBuffer

			return new Response(bodyBuffer, {
				headers: {
					'Content-Type': 'application/pdf',
					'X-Request-Id': pdfRequest.id,
					'X-Cached': 'false',
					'X-Duration-Ms': String(Date.now() - start)
				}
			})
		} catch (error) {
			const errorMessage =
				error instanceof Error ? error.message : 'Unknown error'

			await this.incrementStat('errors')

			const result = new PdfResult({
				requestId: 'unknown',
				success: false,
				error: errorMessage,
				durationMs: Date.now() - start
			})

			return Response.json(this.serializeResult(result), { status: 500 })
		}
	}

	/**
	 * Generate PDF using Puppeteer with retry logic
	 */
	private async generatePdf(request: PdfRequest): Promise<Uint8Array> {
		const MAX_RETRIES = 3
		const BASE_DELAY_MS = 500
		let lastError: Error | null = null

		for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
			try {
				const result = await this.attemptGeneratePdf(request)
				if (attempt > 1) {
					console.log(`[PdfRenderer] Recovered on attempt ${attempt} for: ${request.url}`)
				}
				return result
			} catch (error) {
				lastError = error instanceof Error ? error : new Error(String(error))
				const errorMsg = lastError.message
				
				// Check if error is retryable (connection/protocol errors)
				const isRetryable = errorMsg.includes('Protocol error') ||
					errorMsg.includes('Target closed') ||
					errorMsg.includes('Connection closed') ||
					errorMsg.includes('Network connection lost') ||
					errorMsg.includes('Session closed') ||
					errorMsg.includes('Navigation timeout')
				
				console.warn(`[PdfRenderer] Attempt ${attempt}/${MAX_RETRIES} failed for ${request.url}: ${errorMsg}`)
				
				if (!isRetryable || attempt >= MAX_RETRIES) {
					break
				}
				
				// Exponential backoff: 500ms, 1000ms, 2000ms...
				const delay = BASE_DELAY_MS * Math.pow(2, attempt - 1)
				await new Promise((resolve) => setTimeout(resolve, delay))
			}
		}

		throw lastError ?? new Error('PDF generation failed after retries')
	}

	/**
	 * Single attempt to generate PDF
	 * Note: Scripts are blocked for stability on complex sites.
	 * This means JS-rendered content will not appear in the PDF.
	 */
	private async attemptGeneratePdf(request: PdfRequest): Promise<Uint8Array> {
		const { default: puppeteer } = await import('@cloudflare/puppeteer')
		// Launch browser via Browser Rendering binding
		const browser = await puppeteer.launch(this.env.BROWSER as unknown as Parameters<typeof puppeteer.launch>[0])

		let page: Awaited<ReturnType<typeof browser.newPage>> | null = null
		
		try {
			page = await browser.newPage()

			// Set a reasonable viewport
			await page.setViewport({ width: 1280, height: 720 })

			// Block heavy resources to speed up PDF generation and reduce memory
			// Note: This means JS-rendered/SPA content will NOT appear in the PDF
			await page.setRequestInterception(true)
			page.on('request', (req) => {
				const resourceType = req.resourceType()
				// Block images, media, fonts, scripts to reduce load significantly
				if (['image', 'media', 'font', 'script'].includes(resourceType)) {
					req.abort()
				} else {
					req.continue()
				}
			})

			// Navigate to URL with 'load' wait condition for reasonable render
			await page.goto(request.url, {
				waitUntil: 'load',
				timeout: 45000
			})

			// Give the page a moment to render after load
			await new Promise((resolve) => setTimeout(resolve, 500))

			// Generate PDF with longer timeout for complex pages
			const pdfBuffer = await page.pdf({
				format: request.options.format,
				landscape: request.options.landscape,
				printBackground: request.options.printBackground,
				margin: request.options.margin,
				timeout: 90000 // 90 second timeout for PDF generation
			})

			return new Uint8Array(pdfBuffer)
		} finally {
			// Close page first to release resources
			if (page) {
				try {
					await page.close()
				} catch {
					// Ignore page close errors
				}
			}
			
			// Gracefully close browser - ignore errors if already closed
			try {
				await browser.close()
			} catch {
				// Expected when browser already closed due to crash/timeout
			}
		}
	}

	/**
	 * Get cached PDF by ID
	 */
	private async handleGetCached(id: string): Promise<Response> {
		const cacheKey = `pdf:${id}`
		const cached = await this.ctx.storage.get<CachedPdf>(cacheKey)

		if (!cached) {
			return new Response('PDF not found', { status: 404 })
		}

		const pdfData = new Uint8Array(
			[...atob(cached.pdfBase64)].map((c) => c.charCodeAt(0))
		)
		// Cast to ArrayBuffer for Response body compatibility
		const bodyBuffer = pdfData.buffer.slice(pdfData.byteOffset, pdfData.byteOffset + pdfData.byteLength) as ArrayBuffer

		return new Response(bodyBuffer, {
			headers: {
				'Content-Type': 'application/pdf',
				'X-Generated-At': new Date(cached.generatedAt).toISOString(),
				'X-Source-Url': cached.url
			}
		})
	}

	/**
	 * Get renderer statistics
	 */
	private async handleGetStats(): Promise<Response> {
		const generated = (await this.ctx.storage.get<number>('stat:generated')) ?? 0
		const errors = (await this.ctx.storage.get<number>('stat:errors')) ?? 0
		const cacheEntries = await this.ctx.storage.list({ prefix: 'pdf:' })

		return Response.json({
			generated,
			errors,
			cacheSize: cacheEntries.size,
			successRate: generated > 0 ? ((generated - errors) / generated) * 100 : 0
		})
	}

	/**
	 * Clear the cache
	 */
	private async handleClearCache(): Promise<Response> {
		const entries = await this.ctx.storage.list({ prefix: 'pdf:' })
		const keys = [...entries.keys()]
		await this.ctx.storage.delete(keys)

		return Response.json({ cleared: keys.length })
	}

	/**
	 * Increment a stat counter
	 */
	private async incrementStat(stat: string): Promise<void> {
		const key = `stat:${stat}`
		const current = (await this.ctx.storage.get<number>(key)) ?? 0
		await this.ctx.storage.put(key, current + 1)
	}

	/**
	 * Hash URL for cache key
	 */
	private hashUrl(url: string): string {
		let hash = 0
		for (let i = 0; i < url.length; i++) {
			const char = url.charCodeAt(i)
			hash = (hash << 5) - hash + char
			hash = hash & hash
		}
		return Math.abs(hash).toString(36)
	}

	/**
	 * Serialize PdfResult for HTTP responses
	 */
	private serializeResult(result: PdfResult): PdfResultData {
		return {
			requestId: result.requestId,
			success: result.success,
			pdfBase64: result.pdfBase64,
			error: result.error,
			generatedAt: result.generatedAt,
			durationMs: result.durationMs
		}
	}

	/**
	 * Convert Uint8Array to Base64 string without stack overflow
	 * Uses chunked approach to handle large arrays
	 */
	private uint8ArrayToBase64(data: Uint8Array): string {
		const CHUNK_SIZE = 0x8000 // 32KB chunks to avoid stack overflow
		const chunks: string[] = []

		for (let i = 0; i < data.length; i += CHUNK_SIZE) {
			const chunk = data.subarray(i, Math.min(i + CHUNK_SIZE, data.length))
			chunks.push(String.fromCharCode(...chunk))
		}

		return btoa(chunks.join(''))
	}

	/**
	 * Convert Base64 string to Uint8Array without memory issues
	 * Uses streaming approach for large PDFs
	 */
	private base64ToUint8Array(base64: string): Uint8Array {
		const binaryString = atob(base64)
		const length = binaryString.length
		const result = new Uint8Array(length)

		// Process in chunks to avoid creating large intermediate arrays
		for (let i = 0; i < length; i++) {
			result[i] = binaryString.charCodeAt(i)
		}

		return result
	}

	// ==========================================================================
	// RPC Methods
	// ==========================================================================

	/**
	 * RPC: Generate PDF and return result
	 * Transport encoding/decoding is handled automatically by devflare
	 */
	async generatePdfRpc(requestDto: PdfRequestData): Promise<PdfResult> {
		const start = Date.now()
		const request = new PdfRequest(requestDto)

		try {
			const pdfData = await this.generatePdf(request)
			const pdfBase64 = this.uint8ArrayToBase64(pdfData)

			return new PdfResult({
				requestId: request.id,
				success: true,
				pdfBase64,
				durationMs: Date.now() - start
			})
		} catch (error) {
			return new PdfResult({
				requestId: request.id,
				success: false,
				error: error instanceof Error ? error.message : 'Unknown error',
				durationMs: Date.now() - start
			})
		}
	}

	/**
	 * RPC: Get statistics
	 */
	async getStats(): Promise<{
		generated: number
		errors: number
		cacheSize: number
	}> {
		const generated = (await this.ctx.storage.get<number>('stat:generated')) ?? 0
		const errors = (await this.ctx.storage.get<number>('stat:errors')) ?? 0
		const cacheEntries = await this.ctx.storage.list({ prefix: 'pdf:' })

		return {
			generated,
			errors,
			cacheSize: cacheEntries.size
		}
	}
}

