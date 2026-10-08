<script lang="ts">
let { data, form } = $props()
</script>

<form method="POST">
	<input name="email" value="creator@example.com" />
	<button type="submit">Send magic link</button>
</form>

<p data-case20-configured-var>{data.configuredVar}</p>
<p data-case20-missing-var>{data.missingVar}</p>

{#if form?.ok}
	<p data-case20-service-result>
		service-action:{form.email}:{form.prefix}:{form.serviceHeader}:{form.configuredVar}:{form.missingVar}
	</p>
{/if}
