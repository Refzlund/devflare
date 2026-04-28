<script lang="ts">
	let { data, form } = $props()
</script>

<form method="POST">
	<input name="email" value="creator@example.com" />
	<button type="submit">Send magic link</button>
</form>

<p data-case18-configured-var>{data.configuredVar}</p>
<p data-case18-missing-var>{data.missingVar}</p>

{#if form?.ok}
	<p data-case18-service-result>
		service-action:{form.email}:{form.prefix}:{form.serviceHeader}:{form.configuredVar}:{form.missingVar}
	</p>
{:else if form?.error}
	<p data-case18-service-error>{form.error}</p>
{/if}
