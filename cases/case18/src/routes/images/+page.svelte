<script lang="ts">
	interface ImageInfo {
		key: string
		size: number
		uploaded: string
		etag: string
	}

	interface ImageListResponse {
		images?: ImageInfo[]
		error?: string
	}

	interface DeleteResponse {
		success?: boolean
		error?: string
	}

	let images = $state<ImageInfo[]>([])
	let loading = $state(true)
	let error = $state<string | null>(null)

	$effect(() => {
		loadImages()
	})

	async function loadImages() {
		loading = true
		error = null

		try {
			const response = await fetch('/images')
			const data: ImageListResponse = await response.json()

			if (data.error) {
				error = data.error
			} else if (data.images) {
				images = data.images
			}
		} catch (e) {
			error = e instanceof Error ? e.message : 'Failed to load images'
		} finally {
			loading = false
		}
	}

	async function deleteImage(key: string) {
		if (!confirm(`Delete ${key}?`)) return

		try {
			const response = await fetch(`/images/${key}`, { method: 'DELETE' })
			const data: DeleteResponse = await response.json()

			if (data.success) {
				images = images.filter((img) => img.key !== key)
			} else {
				alert(`Failed to delete: ${data.error}`)
			}
		} catch (e) {
			alert(`Error: ${e instanceof Error ? e.message : 'Unknown error'}`)
		}
	}

	function formatSize(bytes: number): string {
		if (bytes < 1024) return `${bytes} B`
		if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
		return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
	}

	function formatDate(iso: string): string {
		return new Date(iso).toLocaleString()
	}
</script>

<div class="gallery-page">
	<div class="header">
		<h2>🖼️ Image Gallery (R2)</h2>
		<button onclick={loadImages} disabled={loading}>
			{loading ? 'Loading...' : 'Refresh'}
		</button>
	</div>
	<p class="description">Images stored in Cloudflare R2 bucket.</p>

	{#if error}
		<div class="error">
			<p>❌ {error}</p>
		</div>
	{:else if loading}
		<div class="loading">
			<p>Loading images...</p>
		</div>
	{:else if images.length === 0}
		<div class="empty">
			<p>No images found. <a href="/upload">Upload one!</a></p>
		</div>
	{:else}
		<div class="grid">
			{#each images as image}
				<div class="image-card">
					<div class="image-wrapper">
						<img
							src={`/images/${image.key}`}
							alt={image.key}
							loading="lazy"
						/>
					</div>
					<div class="image-info">
						<p class="name" title={image.key}>{image.key}</p>
						<p class="meta">
							<span>{formatSize(image.size)}</span>
							<span>{formatDate(image.uploaded)}</span>
						</p>
						<div class="actions">
							<a
								href={`/images/${image.key}`}
								target="_blank"
								class="btn view"
							>
								View
							</a>
							<button
								class="btn delete"
								onclick={() => deleteImage(image.key)}
							>
								Delete
							</button>
						</div>
					</div>
				</div>
			{/each}
		</div>
	{/if}
</div>

<style>
	.gallery-page {
		max-width: 1000px;
		margin: 0 auto;
	}

	.header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 0.5rem;
	}

	.header button {
		padding: 0.5rem 1rem;
		background: #f48225;
		color: white;
		border: none;
		border-radius: 4px;
		cursor: pointer;
	}

	.header button:disabled {
		background: #ccc;
	}

	h2 {
		color: #333;
	}

	.description {
		color: #666;
		margin-bottom: 1.5rem;
	}

	.error,
	.loading,
	.empty {
		padding: 2rem;
		text-align: center;
		background: #f5f5f5;
		border-radius: 8px;
	}

	.error {
		background: #ffebee;
		color: #c62828;
	}

	.empty a {
		color: #f48225;
	}

	.grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
		gap: 1rem;
	}

	.image-card {
		background: white;
		border-radius: 8px;
		overflow: hidden;
		box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
	}

	.image-wrapper {
		aspect-ratio: 4/3;
		background: #f0f0f0;
		display: flex;
		align-items: center;
		justify-content: center;
		overflow: hidden;
	}

	.image-wrapper img {
		width: 100%;
		height: 100%;
		object-fit: cover;
	}

	.image-info {
		padding: 0.75rem;
	}

	.image-info .name {
		font-weight: 500;
		font-size: 0.85rem;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		margin-bottom: 0.25rem;
	}

	.image-info .meta {
		font-size: 0.75rem;
		color: #888;
		display: flex;
		gap: 1rem;
		margin-bottom: 0.5rem;
	}

	.actions {
		display: flex;
		gap: 0.5rem;
	}

	.btn {
		padding: 0.35rem 0.75rem;
		border: none;
		border-radius: 4px;
		font-size: 0.8rem;
		cursor: pointer;
		text-decoration: none;
	}

	.btn.view {
		background: #e3f2fd;
		color: #1976d2;
	}

	.btn.delete {
		background: #ffebee;
		color: #c62828;
	}

	.btn:hover {
		opacity: 0.8;
	}
</style>
