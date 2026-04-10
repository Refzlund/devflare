<script lang="ts">
	let files: FileList | null = $state(null)
	let uploading = $state(false)
	let result = $state<{
		success: boolean
		filename?: string
		originalName?: string
		size?: number
		url?: string
		error?: string
	} | null>(null)
	let dragOver = $state(false)

	async function handleUpload() {
		if (!files || files.length === 0) return

		uploading = true
		result = null

		try {
			const formData = new FormData()
			formData.append('file', files[0])

			const response = await fetch('/upload', {
				method: 'POST',
				body: formData
			})

			result = await response.json()
		} catch (error) {
			result = {
				success: false,
				error: error instanceof Error ? error.message : 'Upload failed'
			}
		} finally {
			uploading = false
		}
	}

	function handleDrop(event: DragEvent) {
		event.preventDefault()
		dragOver = false
		
		if (event.dataTransfer?.files) {
			files = event.dataTransfer.files
		}
	}

	function handleDragOver(event: DragEvent) {
		event.preventDefault()
		dragOver = true
	}

	function handleDragLeave() {
		dragOver = false
	}

	function formatSize(bytes: number): string {
		if (bytes < 1024) return `${bytes} B`
		if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
		return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
	}
</script>

<div class="upload-page">
	<h2>📷 Image Upload (R2)</h2>
	<p class="description">Upload images to Cloudflare R2 bucket storage.</p>

	<div
		class="dropzone"
		class:dragover={dragOver}
		ondrop={handleDrop}
		ondragover={handleDragOver}
		ondragleave={handleDragLeave}
		role="button"
		tabindex="0"
		aria-label="Drop zone for file upload"
	>
		<div class="dropzone-content">
			<span class="icon">📁</span>
			<p>Drag and drop an image here, or</p>
			<label class="file-input">
				<input
					type="file"
					accept="image/jpeg,image/png,image/gif,image/webp"
					onchange={(e) => files = e.currentTarget.files}
				/>
				<span>Choose File</span>
			</label>
		</div>
	</div>

	{#if files && files.length > 0}
		<div class="preview">
			<h3>Selected File</h3>
			<div class="file-info">
				<span class="name">{files[0].name}</span>
				<span class="size">{formatSize(files[0].size)}</span>
				<span class="type">{files[0].type}</span>
			</div>
			<button
				class="upload-btn"
				onclick={handleUpload}
				disabled={uploading}
			>
				{uploading ? 'Uploading...' : 'Upload to R2'}
			</button>
		</div>
	{/if}

	{#if result}
		<div class="result" class:success={result.success} class:error={!result.success}>
			{#if result.success}
				<h3>✅ Upload Successful!</h3>
				<dl>
					<dt>Filename:</dt>
					<dd>{result.filename}</dd>
					<dt>Original Name:</dt>
					<dd>{result.originalName}</dd>
					<dt>Size:</dt>
					<dd>{formatSize(result.size || 0)}</dd>
					<dt>URL:</dt>
					<dd>
						<a href={result.url} target="_blank">{result.url}</a>
					</dd>
				</dl>
			{:else}
				<h3>❌ Upload Failed</h3>
				<p>{result.error}</p>
			{/if}
		</div>
	{/if}
</div>

<style>
	.upload-page {
		max-width: 600px;
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

	.dropzone {
		border: 2px dashed #ccc;
		border-radius: 8px;
		padding: 3rem 2rem;
		text-align: center;
		background: #fafafa;
		transition: all 0.2s ease;
		cursor: pointer;
	}

	.dropzone:hover,
	.dropzone.dragover {
		border-color: #f48225;
		background: #fff8f0;
	}

	.dropzone-content .icon {
		font-size: 3rem;
		display: block;
		margin-bottom: 1rem;
	}

	.file-input {
		display: inline-block;
		margin-top: 0.5rem;
	}

	.file-input input {
		display: none;
	}

	.file-input span {
		display: inline-block;
		padding: 0.5rem 1.5rem;
		background: #f48225;
		color: white;
		border-radius: 4px;
		cursor: pointer;
		transition: background 0.2s;
	}

	.file-input span:hover {
		background: #e07020;
	}

	.preview {
		margin-top: 1.5rem;
		padding: 1rem;
		background: white;
		border-radius: 8px;
		border: 1px solid #e0e0e0;
	}

	.preview h3 {
		margin-bottom: 0.5rem;
		font-size: 1rem;
	}

	.file-info {
		display: flex;
		gap: 1rem;
		flex-wrap: wrap;
		margin-bottom: 1rem;
		font-size: 0.9rem;
	}

	.file-info .name {
		font-weight: 600;
	}

	.file-info .size,
	.file-info .type {
		color: #666;
	}

	.upload-btn {
		padding: 0.75rem 2rem;
		background: #4caf50;
		color: white;
		border: none;
		border-radius: 4px;
		font-size: 1rem;
		cursor: pointer;
		transition: background 0.2s;
	}

	.upload-btn:hover:not(:disabled) {
		background: #43a047;
	}

	.upload-btn:disabled {
		background: #ccc;
		cursor: not-allowed;
	}

	.result {
		margin-top: 1.5rem;
		padding: 1rem;
		border-radius: 8px;
	}

	.result.success {
		background: #e8f5e9;
		border: 1px solid #c8e6c9;
	}

	.result.error {
		background: #ffebee;
		border: 1px solid #ffcdd2;
	}

	.result h3 {
		margin-bottom: 0.5rem;
	}

	.result dl {
		display: grid;
		grid-template-columns: auto 1fr;
		gap: 0.25rem 1rem;
		font-size: 0.9rem;
	}

	.result dt {
		font-weight: 600;
		color: #666;
	}

	.result dd {
		word-break: break-all;
	}

	.result a {
		color: #1976d2;
	}
</style>
