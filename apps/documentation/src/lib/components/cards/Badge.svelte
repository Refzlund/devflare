<script lang="ts">
type BadgeTone = 'info' | 'neutral' | 'soft'
type BadgeSize = 'sm' | 'xs'

let {
	label,
	tone = 'neutral',
	size = 'xs',
	uppercase = false,
	class: className = ''
}: {
	label: string
	tone?: BadgeTone
	size?: BadgeSize
	uppercase?: boolean
	class?: string
} = $props()

const toneClasses: Record<BadgeTone, string> = {
	neutral: 'docs-text-muted',
	soft: 'docs-text-body',
	info: 'docs-text-accent'
}

const sizeClasses: Record<BadgeSize, string> = {
	xs: 'text-[0.72rem] font-medium leading-5 tracking-[0.02em]',
	sm: 'text-[0.88rem] leading-6'
}
</script>

<span
	class={`inline-flex items-center rounded-full ${toneClasses[tone]} ${sizeClasses[size]} ${uppercase ? 'uppercase tracking-[0.08em]' : ''} ${className}`}
>
	{label}
</span>
