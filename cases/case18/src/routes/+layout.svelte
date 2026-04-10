<script lang="ts">
	import type { Snippet } from 'svelte'
	
	interface Props {
		children: Snippet
	}
	
	let { children }: Props = $props()
	
	const navItems = [
		{ href: '/', label: 'Home', icon: '🏠' },
		{ href: '/upload', label: 'Image Upload (R2)', icon: '📷' },
		{ href: '/images', label: 'Gallery (R2)', icon: '🖼️' },
		{ href: '/chat', label: 'Chat (WebSocket DO)', icon: '💬' },
		{ href: '/kv', label: 'KV Storage', icon: '🗄️' },
		{ href: '/db', label: 'Database (D1)', icon: '🗃️' },
		{ href: '/pdf', label: 'PDF Generator', icon: '📄' }
	]
</script>

<div class="app">
	<header>
		<h1>Case 18: SvelteKit Full Demo</h1>
		<p>Cloudflare Workers + All Bindings</p>
	</header>
	
	<nav>
		{#each navItems as item}
			<a href={item.href}>
				<span class="icon">{item.icon}</span>
				<span class="label">{item.label}</span>
			</a>
		{/each}
	</nav>
	
	<main>
		{@render children()}
	</main>
	
	<footer>
		<p>Powered by <strong>devflare</strong> • SvelteKit + Cloudflare Workers</p>
	</footer>
</div>

<style>
	:global(*) {
		box-sizing: border-box;
		margin: 0;
		padding: 0;
	}
	
	:global(body) {
		font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
		background: #f5f5f5;
		color: #333;
		line-height: 1.6;
	}
	
	.app {
		min-height: 100vh;
		display: flex;
		flex-direction: column;
	}
	
	header {
		background: linear-gradient(135deg, #f48225 0%, #ff6b35 100%);
		color: white;
		padding: 2rem;
		text-align: center;
	}
	
	header h1 {
		font-size: 1.8rem;
		margin-bottom: 0.5rem;
	}
	
	header p {
		opacity: 0.9;
		font-size: 0.95rem;
	}
	
	nav {
		background: white;
		padding: 1rem;
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
		justify-content: center;
		border-bottom: 1px solid #e0e0e0;
		position: sticky;
		top: 0;
		z-index: 100;
	}
	
	nav a {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.6rem 1rem;
		background: #f0f0f0;
		border-radius: 6px;
		text-decoration: none;
		color: #333;
		font-size: 0.9rem;
		transition: all 0.2s ease;
	}
	
	nav a:hover {
		background: #f48225;
		color: white;
	}
	
	.icon {
		font-size: 1.1rem;
	}
	
	main {
		flex: 1;
		padding: 2rem;
		max-width: 1200px;
		margin: 0 auto;
		width: 100%;
	}
	
	footer {
		background: #333;
		color: #aaa;
		padding: 1.5rem;
		text-align: center;
		font-size: 0.9rem;
	}
	
	footer strong {
		color: #f48225;
	}
</style>
