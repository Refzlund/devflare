<script lang="ts">
	interface PdfStats {
		generated: number
		errors: number
		cacheSize: number
		successRate: number
	}

	interface PdfErrorResponse {
		error?: string
	}

	let url = $state('https://example.com')
	let format = $state<'A4' | 'Letter' | 'Legal'>('A4')
	let landscape = $state(false)
	let printBackground = $state(true)
	let generating = $state(false)
	let error = $state<string | null>(null)
	let result = $state<{
		success: boolean
		pdfUrl?: string
		requestId?: string
		cached?: boolean
		durationMs?: number
	} | null>(null)
	let stats = $state<PdfStats | null>(null)

	$effect(() => {
		loadStats()
	})

	async function loadStats() {
		try {
			const response = await fetch('/pdf')
			const data: PdfStats & { error?: string } = await response.json()
			if (!data.error) {
				stats = data
			}
		} catch {
			// Ignore stats errors
		}
	}

	async function generatePdf() {
		if (!url.trim()) return

		generating = true
		error = null
		result = null

		try {
			const response = await fetch('/pdf', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					url,
					options: {
						format,
						landscape,
						printBackground
					}
				})
			})

			const requestId = response.headers.get('X-Request-Id')
			const cached = response.headers.get('X-Cached') === 'true'
			const durationMs = parseInt(response.headers.get('X-Duration-Ms') || '0')

			if (response.ok) {
				// Create blob URL for the PDF
				const blob = await response.blob()
				const pdfUrl = URL.createObjectURL(blob)

				result = {
					success: true,
					pdfUrl,
					requestId: requestId || undefined,
					cached,
					durationMs
				}

				// Refresh stats
				loadStats()
			} else {
				const data: PdfErrorResponse = await response.json()
				error = data.error || 'PDF generation failed'
				result = { success: false }
			}
		} catch (e) {
			error = e instanceof Error ? e.message : 'Request failed'
			result = { success: false }
		} finally {
			generating = false
		}
	}

	function downloadPdf() {
		if (!result?.pdfUrl) return

		const a = document.createElement('a')
		a.href = result.pdfUrl
		a.download = `pdf-${Date.now()}.pdf`
		document.body.appendChild(a)
		a.click()
		document.body.removeChild(a)
	}
</script>

<div class="pdf-page">
	<h2>📄 PDF Generator</h2>
	<p class="description">
		Generate PDFs from URLs using Browser Rendering in a Durable Object.
	</p>

	{#if stats}
		<div class="stats">
			<div class="stat">
				<span class="value">{stats.generated}</span>
				<span class="label">Generated</span>
			</div>
			<div class="stat">
				<span class="value">{stats.cacheSize}</span>
				<span class="label">Cached</span>
			</div>
			<div class="stat">
				<span class="value">{stats.successRate.toFixed(0)}%</span>
				<span class="label">Success Rate</span>
			</div>
		</div>
	{/if}

	<div class="form">
		<div class="form-group">
			<label for="url">URL to convert</label>
			<input
				id="url"
				type="url"
				bind:value={url}
				placeholder="https://example.com"
			/>
		</div>

		<div class="options">
			<div class="form-group">
				<label for="format">Format</label>
				<select id="format" bind:value={format}>
					<option value="A4">A4</option>
					<option value="Letter">Letter</option>
					<option value="Legal">Legal</option>
				</select>
			</div>

			<label class="checkbox-label">
				<input type="checkbox" bind:checked={landscape} />
				Landscape
			</label>

			<label class="checkbox-label">
				<input type="checkbox" bind:checked={printBackground} />
				Print Background
			</label>
		</div>

		<button
			class="generate-btn"
			onclick={generatePdf}
			disabled={generating || !url.trim()}
		>
			{generating ? 'Generating...' : 'Generate PDF'}
		</button>
	</div>

	{#if error}
		<div class="error">
			<p>❌ {error}</p>
		</div>
	{/if}

	{#if result?.success}
		<div class="result">
			<h3>✅ PDF Generated!</h3>
			<div class="meta">
				{#if result.cached}
					<span class="tag cached">Cached</span>
				{/if}
				{#if result.durationMs}
					<span class="duration">{result.durationMs}ms</span>
				{/if}
			</div>

			<div class="actions">
				<a
					href={result.pdfUrl}
					target="_blank"
					class="btn view"
				>
					View PDF
				</a>
				<button class="btn download" onclick={downloadPdf}>
					Download
				</button>
			</div>

			{#if result.pdfUrl}
				<div class="preview">
					<iframe
						src={result.pdfUrl}
						title="PDF Preview"
						width="100%"
						height="500"
					></iframe>
				</div>
			{/if}
		</div>
	{/if}

	<div class="info">
		<h3>How it works</h3>
		<ol>
			<li>Your request is sent to a Durable Object (PdfRenderer)</li>
			<li>The DO uses the Browser Rendering binding to launch Puppeteer</li>
			<li>Puppeteer navigates to the URL and generates a PDF</li>
			<li>The PDF is cached in DO storage for 5 minutes</li>
			<li>The PDF is returned as a downloadable file</li>
		</ol>
	</div>
</div>

<style>
	.pdf-page {
		max-width: 700px;
		margin: 0 auto;
	}

	h2 {
		color: #333;
		margin-bottom: 0.5rem;
	}

	.description {
		color: #666;
		margin-bottom: 1.5rem;
	}

	.stats {
		display: flex;
		gap: 1rem;
		margin-bottom: 1.5rem;
	}

	.stat {
		flex: 1;
		background: white;
		padding: 1rem;
		border-radius: 8px;
		text-align: center;
		box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05);
	}

	.stat .value {
		display: block;
		font-size: 1.5rem;
		font-weight: 700;
		color: #f48225;
	}

	.stat .label {
		font-size: 0.8rem;
		color: #666;
	}

	.form {
		background: white;
		padding: 1.5rem;
		border-radius: 8px;
		box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
		margin-bottom: 1.5rem;
	}

	.form-group {
		margin-bottom: 1rem;
	}

	.form-group label {
		display: block;
		margin-bottom: 0.25rem;
		font-weight: 500;
		font-size: 0.9rem;
	}

	.form-group input,
	.form-group select {
		width: 100%;
		padding: 0.75rem;
		border: 1px solid #ddd;
		border-radius: 4px;
		font-size: 1rem;
	}

	.options {
		display: flex;
		gap: 1rem;
		flex-wrap: wrap;
		margin-bottom: 1rem;
		align-items: center;
	}

	.options .form-group {
		margin-bottom: 0;
	}

	.options select {
		width: auto;
	}

	.checkbox-label {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		font-size: 0.9rem;
		cursor: pointer;
	}

	.generate-btn {
		width: 100%;
		padding: 0.75rem;
		background: #9c27b0;
		color: white;
		border: none;
		border-radius: 4px;
		font-size: 1rem;
		cursor: pointer;
	}

	.generate-btn:disabled {
		background: #ccc;
	}

	.error {
		background: #ffebee;
		color: #c62828;
		padding: 1rem;
		border-radius: 8px;
		margin-bottom: 1rem;
	}

	.result {
		background: #e8f5e9;
		padding: 1.5rem;
		border-radius: 8px;
		margin-bottom: 1.5rem;
	}

	.result h3 {
		margin-bottom: 0.5rem;
	}

	.meta {
		display: flex;
		gap: 0.5rem;
		margin-bottom: 1rem;
	}

	.tag {
		padding: 0.2rem 0.5rem;
		border-radius: 4px;
		font-size: 0.75rem;
	}

	.tag.cached {
		background: #2196f3;
		color: white;
	}

	.duration {
		color: #666;
		font-size: 0.85rem;
	}

	.actions {
		display: flex;
		gap: 0.5rem;
		margin-bottom: 1rem;
	}

	.btn {
		padding: 0.5rem 1rem;
		border: none;
		border-radius: 4px;
		cursor: pointer;
		text-decoration: none;
		font-size: 0.9rem;
	}

	.btn.view {
		background: #1976d2;
		color: white;
	}

	.btn.download {
		background: #4caf50;
		color: white;
	}

	.preview {
		border: 1px solid #ccc;
		border-radius: 4px;
		overflow: hidden;
	}

	.preview iframe {
		display: block;
		border: none;
	}

	.info {
		background: #f5f5f5;
		padding: 1.5rem;
		border-radius: 8px;
	}

	.info h3 {
		margin-bottom: 0.75rem;
		font-size: 1rem;
	}

	.info ol {
		margin-left: 1.5rem;
		font-size: 0.9rem;
		color: #666;
	}

	.info li {
		margin-bottom: 0.5rem;
	}
</style>
