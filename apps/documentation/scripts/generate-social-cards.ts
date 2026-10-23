import { generateSocialCards } from './social-cards'

async function main(): Promise<void> {
	const result = await generateSocialCards()

	console.log(`Generated ${result.outputFiles.length} social cards in ${result.outputDir}.`)
}

await main()
