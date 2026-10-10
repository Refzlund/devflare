// =============================================================================
// AI Pricing — Cloudflare Workers AI Pricing Reference
// =============================================================================
// Pricing is NOT available via API. For current pricing, see:
// https://developers.cloudflare.com/workers-ai/platform/pricing/
//
// Key facts:
// - Price: $0.011 per 1,000 neurons
// - Free tier: 10,000 neurons per day
// - Pricing varies per model (check docs for current rates)
// =============================================================================

/** Cloudflare Workers AI pricing documentation URL */
export const PRICING_DOCS_URL = 'https://developers.cloudflare.com/workers-ai/platform/pricing/'

/** Price per 1,000 neurons in USD (as of Jan 2026) */
export const PRICE_PER_1000_NEURONS_USD = 0.011

/** Free tier neurons per day */
export const FREE_TIER_NEURONS_PER_DAY = 10_000

/**
 * Convert neurons to approximate USD cost
 */
export function neuronsToUSD(neurons: number): number {
	return (neurons / 1000) * PRICE_PER_1000_NEURONS_USD
}

/**
 * Format a message about pricing with docs link
 */
export function getPricingInfo(): string {
	return `Workers AI: $${PRICE_PER_1000_NEURONS_USD} per 1,000 neurons (${FREE_TIER_NEURONS_PER_DAY.toLocaleString()} free/day)\nFull pricing: ${PRICING_DOCS_URL}`
}
