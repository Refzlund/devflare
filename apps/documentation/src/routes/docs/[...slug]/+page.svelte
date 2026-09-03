<script lang="ts">
	import Article from '$lib/components/article/Article.svelte'
	import type { DocPage } from '$lib/docs/types'

	let {
		data
	}: {
		data: {
			doc: DocPage
			previous?: DocPage
			next?: DocPage
		}
	} = $props()
</script>

<Article doc={data.doc} previous={data.previous} next={data.next} />