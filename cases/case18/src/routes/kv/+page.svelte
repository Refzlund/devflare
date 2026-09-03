<script lang="ts">
	interface KvKey {
		name: string
		expiration?: number
		metadata?: Record<string, string>
	}

	interface KvListResponse {
		keys?: KvKey[]
		error?: string
	}

	interface KvValueResponse {
		value?: unknown
		error?: string
	}

	interface KvMutationResponse {
		success?: boolean
		error?: string
	}

	let keys = $state<KvKey[]>([])
	let loading = $state(true)
	let error = $state<string | null>(null)
	
	// Form state
	let newKey = $state('')
	let newValue = $state('')
	let newTtl = $state<number | undefined>(undefined)
	let saving = $state(false)
	
	// Selected key view
	let selectedKey = $state<string | null>(null)
	let selectedValue = $state<unknown>(null)
	let loadingValue = $state(false)

	$effect(() => {
		loadKeys()
	})

	async function loadKeys() {
		loading = true
		error = null

		try {
			const response = await fetch('/kv')
			const data: KvListResponse = await response.json()

			if (data.error) {
				error = data.error
			} else if (data.keys) {
				keys = data.keys
			}
		} catch (e) {
			error = e instanceof Error ? e.message : 'Failed to load keys'
		} finally {
			loading = false
		}
	}

	async function saveKey() {
		if (!newKey.trim()) return

		saving = true
		error = null

		try {
			// Try to parse as JSON
			let value: unknown
			try {
				value = JSON.parse(newValue)
			} catch {
				value = newValue
			}

			const response = await fetch('/kv', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					key: newKey,
					value,
					expirationTtl: newTtl
				})
			})

			const data: KvMutationResponse = await response.json()

			if (data.success) {
				newKey = ''
				newValue = ''
				newTtl = undefined
				await loadKeys()
			} else if (data.error) {
				error = data.error
			}
		} catch (e) {
			error = e instanceof Error ? e.message : 'Failed to save'
		} finally {
			saving = false
		}
	}

	async function deleteKey(key: string) {
		if (!confirm(`Delete key "${key}"?`)) return

		try {
			const response = await fetch(`/kv?key=${encodeURIComponent(key)}`, {
				method: 'DELETE'
			})
			const data: KvMutationResponse = await response.json()

			if (data.success) {
				keys = keys.filter((k) => k.name !== key)
				if (selectedKey === key) {
					selectedKey = null
					selectedValue = null
				}
			}
		} catch (e) {
			alert('Failed to delete key')
		}
	}

	async function viewKey(key: string) {
		selectedKey = key
		loadingValue = true

		try {
			const response = await fetch(`/kv?key=${encodeURIComponent(key)}`)
			const data: KvValueResponse = await response.json()

			if (data.error) {
				selectedValue = null
				error = data.error
			} else {
				selectedValue = data.value
			}
		} catch (e) {
			error = e instanceof Error ? e.message : 'Failed to load value'
		} finally {
			loadingValue = false
		}
	}

	function formatExpiration(exp?: number): string {
		if (!exp) return 'Never'
		return new Date(exp * 1000).toLocaleString()
	}
</script>

<div class="kv-page">
	<h2>🗄️ KV Storage</h2>
	<p class="description">Key-value storage using Cloudflare KV namespace.</p>

	<div class="layout">
		<div class="panel add-panel">
			<h3>Add/Update Key</h3>
			<div class="form-group">
				<label for="key">Key</label>
				<input
					id="key"
					type="text"
					bind:value={newKey}
					placeholder="my-key"
				/>
			</div>
			<div class="form-group">
				<label for="value">Value (JSON or string)</label>
				<textarea
					id="value"
					bind:value={newValue}
					placeholder={`{"example": "value"}`}
					rows="4"
				></textarea>
			</div>
			<div class="form-group">
				<label for="ttl">TTL (seconds, optional)</label>
				<input
					id="ttl"
					type="number"
					bind:value={newTtl}
					placeholder="3600"
					min="60"
				/>
			</div>
			<button onclick={saveKey} disabled={saving || !newKey.trim()}>
				{saving ? 'Saving...' : 'Save Key'}
			</button>
		</div>

		<div class="panel keys-panel">
			<div class="panel-header">
				<h3>Keys ({keys.length})</h3>
				<button class="refresh-btn" onclick={loadKeys} disabled={loading}>
					↻
				</button>
			</div>

			{#if error}
				<div class="error">{error}</div>
			{/if}

			{#if loading}
				<div class="loading">Loading...</div>
			{:else if keys.length === 0}
				<div class="empty">No keys found</div>
			{:else}
				<ul class="key-list">
					{#each keys as key}
						<li class:selected={selectedKey === key.name}>
							<button class="key-name" onclick={() => viewKey(key.name)}>
								{key.name}
							</button>
							<span class="expiration">
								{formatExpiration(key.expiration)}
							</span>
							<button class="delete-btn" onclick={() => deleteKey(key.name)}>
								×
							</button>
						</li>
					{/each}
				</ul>
			{/if}
		</div>

		<div class="panel value-panel">
			<h3>Value</h3>
			{#if selectedKey}
				<div class="selected-key">
					<strong>{selectedKey}</strong>
				</div>
				{#if loadingValue}
					<div class="loading">Loading...</div>
				{:else if selectedValue !== null}
					<pre>{JSON.stringify(selectedValue, null, 2)}</pre>
				{/if}
			{:else}
				<div class="empty">Select a key to view its value</div>
			{/if}
		</div>
	</div>
</div>

<style>
	.kv-page {
		max-width: 1100px;
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

	.layout {
		display: grid;
		grid-template-columns: 280px 1fr 1fr;
		gap: 1rem;
	}

	@media (max-width: 900px) {
		.layout {
			grid-template-columns: 1fr;
		}
	}

	.panel {
		background: white;
		padding: 1rem;
		border-radius: 8px;
		box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
	}

	.panel h3 {
		margin-bottom: 1rem;
		font-size: 1rem;
		color: #333;
	}

	.panel-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
	}

	.refresh-btn {
		background: #f0f0f0;
		border: none;
		padding: 0.25rem 0.5rem;
		border-radius: 4px;
		cursor: pointer;
	}

	.form-group {
		margin-bottom: 0.75rem;
	}

	.form-group label {
		display: block;
		margin-bottom: 0.25rem;
		font-size: 0.85rem;
		font-weight: 500;
	}

	.form-group input,
	.form-group textarea {
		width: 100%;
		padding: 0.5rem;
		border: 1px solid #ddd;
		border-radius: 4px;
		font-size: 0.9rem;
	}

	.add-panel button {
		width: 100%;
		padding: 0.75rem;
		background: #4caf50;
		color: white;
		border: none;
		border-radius: 4px;
		cursor: pointer;
	}

	.add-panel button:disabled {
		background: #ccc;
	}

	.key-list {
		list-style: none;
		max-height: 400px;
		overflow-y: auto;
	}

	.key-list li {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.5rem;
		border-radius: 4px;
		margin-bottom: 0.25rem;
	}

	.key-list li:hover {
		background: #f5f5f5;
	}

	.key-list li.selected {
		background: #e3f2fd;
	}

	.key-name {
		flex: 1;
		background: none;
		border: none;
		text-align: left;
		cursor: pointer;
		font-size: 0.9rem;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.expiration {
		font-size: 0.75rem;
		color: #999;
	}

	.delete-btn {
		background: #ffebee;
		border: none;
		color: #c62828;
		width: 24px;
		height: 24px;
		border-radius: 4px;
		cursor: pointer;
		font-size: 1.1rem;
	}

	.value-panel .selected-key {
		background: #f5f5f5;
		padding: 0.5rem;
		border-radius: 4px;
		margin-bottom: 0.5rem;
	}

	.value-panel pre {
		background: #f5f5f5;
		padding: 1rem;
		border-radius: 4px;
		overflow-x: auto;
		font-size: 0.85rem;
		max-height: 400px;
	}

	.error {
		color: #c62828;
		padding: 0.5rem;
		background: #ffebee;
		border-radius: 4px;
		font-size: 0.9rem;
	}

	.loading,
	.empty {
		color: #999;
		padding: 1rem;
		text-align: center;
	}
</style>
