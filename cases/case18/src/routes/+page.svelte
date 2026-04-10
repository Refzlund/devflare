<script lang="ts">
	const features = [
		{
			title: 'Image Upload',
			description: 'Upload images to Cloudflare R2 bucket',
			icon: '📷',
			href: '/upload',
			binding: 'R2'
		},
		{
			title: 'Image Gallery',
			description: 'View uploaded images from R2',
			icon: '🖼️',
			href: '/images',
			binding: 'R2'
		},
		{
			title: 'Real-time Chat',
			description: 'WebSocket chat via Durable Object with hibernation',
			icon: '💬',
			href: '/chat',
			binding: 'DO + WebSocket'
		},
		{
			title: 'KV Storage',
			description: 'Key-value storage operations',
			icon: '🗄️',
			href: '/kv',
			binding: 'KV'
		},
		{
			title: 'Database CRUD',
			description: 'D1 SQLite database operations',
			icon: '🗃️',
			href: '/db',
			binding: 'D1'
		},
		{
			title: 'PDF Generator',
			description: 'Generate PDFs from URLs using Browser Rendering',
			icon: '📄',
			href: '/pdf',
			binding: 'Browser + DO'
		}
	]
</script>

<div class="home">
	<section class="intro">
		<h2>Welcome to Case 18</h2>
		<p>
			This is a comprehensive SvelteKit application demonstrating ALL major 
			Cloudflare Worker bindings through <strong>devflare</strong>.
		</p>
	</section>
	
	<section class="features">
		<h3>Available Features</h3>
		<div class="grid">
			{#each features as feature}
				<a href={feature.href} class="card">
					<div class="card-icon">{feature.icon}</div>
					<div class="card-content">
						<h4>{feature.title}</h4>
						<p>{feature.description}</p>
						<span class="binding">{feature.binding}</span>
					</div>
				</a>
			{/each}
		</div>
	</section>
	
	<section class="tech">
		<h3>Technology Stack</h3>
		<ul>
			<li><strong>SvelteKit 2</strong> with Svelte 5</li>
			<li><strong>@sveltejs/adapter-cloudflare</strong> for Workers deployment</li>
			<li><strong>devflare</strong> for configuration management</li>
			<li><strong>Vite</strong> with @cloudflare/vite-plugin</li>
			<li><strong>TypeScript</strong> with strict types</li>
		</ul>
	</section>
	
	<section class="bindings">
		<h3>Cloudflare Bindings Used</h3>
		<div class="binding-list">
			<div class="binding-item">
				<span class="badge r2">R2</span>
				<span>Object storage for images</span>
			</div>
			<div class="binding-item">
				<span class="badge kv">KV</span>
				<span>Key-value storage</span>
			</div>
			<div class="binding-item">
				<span class="badge d1">D1</span>
				<span>SQLite database</span>
			</div>
			<div class="binding-item">
				<span class="badge do">DO</span>
				<span>Durable Objects (ChatRoom, PdfRenderer)</span>
			</div>
			<div class="binding-item">
				<span class="badge browser">Browser</span>
				<span>Browser Rendering for PDF</span>
			</div>
		</div>
	</section>
</div>

<style>
	.home {
		display: flex;
		flex-direction: column;
		gap: 2.5rem;
	}
	
	section {
		background: white;
		padding: 1.5rem;
		border-radius: 8px;
		box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05);
	}
	
	h2 {
		color: #f48225;
		margin-bottom: 0.5rem;
	}
	
	h3 {
		color: #333;
		margin-bottom: 1rem;
		padding-bottom: 0.5rem;
		border-bottom: 2px solid #f48225;
	}
	
	.grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
		gap: 1rem;
	}
	
	.card {
		display: flex;
		gap: 1rem;
		padding: 1rem;
		background: #fafafa;
		border-radius: 8px;
		text-decoration: none;
		color: inherit;
		border: 2px solid transparent;
		transition: all 0.2s ease;
	}
	
	.card:hover {
		border-color: #f48225;
		transform: translateY(-2px);
		box-shadow: 0 4px 8px rgba(244, 130, 37, 0.15);
	}
	
	.card-icon {
		font-size: 2rem;
		line-height: 1;
	}
	
	.card-content h4 {
		color: #333;
		margin-bottom: 0.25rem;
	}
	
	.card-content p {
		font-size: 0.9rem;
		color: #666;
		margin-bottom: 0.5rem;
	}
	
	.binding {
		display: inline-block;
		font-size: 0.75rem;
		background: #e3f2fd;
		color: #1976d2;
		padding: 0.2rem 0.5rem;
		border-radius: 4px;
	}
	
	.tech ul {
		list-style: none;
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
		gap: 0.5rem;
	}
	
	.tech li {
		padding: 0.5rem;
		background: #f5f5f5;
		border-radius: 4px;
		font-size: 0.9rem;
	}
	
	.binding-list {
		display: flex;
		flex-wrap: wrap;
		gap: 1rem;
	}
	
	.binding-item {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		font-size: 0.9rem;
	}
	
	.badge {
		padding: 0.3rem 0.6rem;
		border-radius: 4px;
		font-weight: 600;
		font-size: 0.75rem;
		color: white;
	}
	
	.badge.r2 { background: #4caf50; }
	.badge.kv { background: #2196f3; }
	.badge.d1 { background: #9c27b0; }
	.badge.do { background: #ff5722; }
	.badge.browser { background: #607d8b; }
</style>
