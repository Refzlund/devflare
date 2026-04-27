import { compactBindingGuidesPart1 } from './compact-guides-1'
import { compactBindingGuidesPart2 } from './compact-guides-2'
import { bindingGuidesPart1 } from './core-guides-1'
import { bindingGuidesPart2 } from './core-guides-2'
import { bindingGuidesPart3 } from './core-guides-3'
import { bindingGuidesPart4 } from './core-guides-4'
import { bindingGuidesPart5 } from './core-guides-5'
import { bindingGuidesPart6 } from './core-guides-6'
import { createBindingPages, getBindingSlugs } from './shared'

const activeBindingGuides = [
	bindingGuidesPart1,
	bindingGuidesPart2,
	bindingGuidesPart3,
	bindingGuidesPart4,
	bindingGuidesPart5,
	bindingGuidesPart6,
	compactBindingGuidesPart1,
	compactBindingGuidesPart2
].flat()

export interface BindingTestingGuideLink {
	label: string
	overviewSlug: string
	testingSlug: string
	summary: string
	defaultHarness: string
	localStory: string
	categoryDescription: string
}

export const bindingTestingGuides: BindingTestingGuideLink[] = activeBindingGuides.map((guide) => {
	const slugs = getBindingSlugs(guide)

	return {
		label: guide.label,
		overviewSlug: slugs.overview,
		testingSlug: slugs.testing,
		summary: guide.testing.summary,
		defaultHarness: guide.testing.defaultHarness,
		localStory: guide.localStory,
		categoryDescription: guide.categoryDescription
	}
})

export const bindingDocCategories = activeBindingGuides.map((guide) => {
	const slugs = getBindingSlugs(guide)

	return {
		id: `${guide.slugBase}-binding-library`,
		title: guide.label,
		description: guide.categoryDescription,
		sidebarDisplay: 'links' as const,
		slugs: [slugs.overview, slugs.internals, slugs.testing, slugs.example],
		sidebarSlugs: [slugs.overview]
	}
})

export const bindingDocs = activeBindingGuides.flatMap(createBindingPages)
