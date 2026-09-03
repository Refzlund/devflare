// =============================================================================
// CLI AI Command
// =============================================================================
// `devflare ai` — View AI models and pricing info
// Pricing scraped from: https://developers.cloudflare.com/workers-ai/platform/pricing/
// =============================================================================

import {
	FREE_TIER_NEURONS_PER_DAY,
	PRICE_PER_1000_NEURONS_USD,
	PRICING_DOCS_URL
} from '../../cloudflare/pricing'
import { BG_BLUE, BOLD, DIM, RESET, WHITE } from '../colors'
import type { CliResult } from '../index'

// -----------------------------------------------------------------------------
// Pricing Data (from Cloudflare docs)
// -----------------------------------------------------------------------------

interface ModelPricing {
	model: string
	inputPrice: string
	outputPrice: string
	inputNeurons?: string
	outputNeurons?: string
}

const LLM_PRICING: ModelPricing[] = [
	{
		model: '@cf/ibm-granite/granite-4.0-h-micro',
		inputPrice: '$0.017',
		outputPrice: '$0.112',
		inputNeurons: '1542',
		outputNeurons: '10158'
	},
	{
		model: '@cf/meta/llama-3.2-1b-instruct',
		inputPrice: '$0.027',
		outputPrice: '$0.201',
		inputNeurons: '2457',
		outputNeurons: '18252'
	},
	{
		model: '@cf/meta/llama-3.2-3b-instruct',
		inputPrice: '$0.051',
		outputPrice: '$0.335',
		inputNeurons: '4625',
		outputNeurons: '30475'
	},
	{
		model: '@cf/qwen/qwen3-30b-a3b-fp8',
		inputPrice: '$0.051',
		outputPrice: '$0.335',
		inputNeurons: '4625',
		outputNeurons: '30475'
	},
	{
		model: '@cf/meta/llama-3.1-8b-instruct-fp8-fast',
		inputPrice: '$0.045',
		outputPrice: '$0.384',
		inputNeurons: '4119',
		outputNeurons: '34868'
	},
	{
		model: '@cf/meta/llama-3.2-11b-vision-instruct',
		inputPrice: '$0.049',
		outputPrice: '$0.676',
		inputNeurons: '4410',
		outputNeurons: '61493'
	},
	{
		model: '@cf/mistral/mistral-7b-instruct-v0.1',
		inputPrice: '$0.110',
		outputPrice: '$0.190',
		inputNeurons: '10000',
		outputNeurons: '17300'
	},
	{
		model: '@cf/meta/llama-3-8b-instruct-awq',
		inputPrice: '$0.123',
		outputPrice: '$0.266',
		inputNeurons: '11161',
		outputNeurons: '24215'
	},
	{
		model: '@cf/meta/llama-3.1-8b-instruct-awq',
		inputPrice: '$0.123',
		outputPrice: '$0.266',
		inputNeurons: '11161',
		outputNeurons: '24215'
	},
	{
		model: '@cf/meta/llama-3.1-8b-instruct-fp8',
		inputPrice: '$0.152',
		outputPrice: '$0.287',
		inputNeurons: '13778',
		outputNeurons: '26128'
	},
	{
		model: '@cf/openai/gpt-oss-20b',
		inputPrice: '$0.200',
		outputPrice: '$0.300',
		inputNeurons: '18182',
		outputNeurons: '27273'
	},
	{
		model: '@cf/meta/llama-4-scout-17b-16e-instruct',
		inputPrice: '$0.270',
		outputPrice: '$0.850',
		inputNeurons: '24545',
		outputNeurons: '77273'
	},
	{
		model: '@cf/meta/llama-3.1-8b-instruct',
		inputPrice: '$0.282',
		outputPrice: '$0.827',
		inputNeurons: '25608',
		outputNeurons: '75147'
	},
	{
		model: '@cf/meta/llama-3-8b-instruct',
		inputPrice: '$0.282',
		outputPrice: '$0.827',
		inputNeurons: '25608',
		outputNeurons: '75147'
	},
	{
		model: '@cf/meta/llama-3.1-70b-instruct-fp8-fast',
		inputPrice: '$0.293',
		outputPrice: '$2.253',
		inputNeurons: '26668',
		outputNeurons: '204805'
	},
	{
		model: '@cf/meta/llama-3.3-70b-instruct-fp8-fast',
		inputPrice: '$0.293',
		outputPrice: '$2.253',
		inputNeurons: '26668',
		outputNeurons: '204805'
	},
	{
		model: '@cf/google/gemma-3-12b-it',
		inputPrice: '$0.345',
		outputPrice: '$0.556',
		inputNeurons: '31371',
		outputNeurons: '50560'
	},
	{
		model: '@cf/openai/gpt-oss-120b',
		inputPrice: '$0.350',
		outputPrice: '$0.750',
		inputNeurons: '31818',
		outputNeurons: '68182'
	},
	{
		model: '@cf/mistralai/mistral-small-3.1-24b-instruct',
		inputPrice: '$0.351',
		outputPrice: '$0.555',
		inputNeurons: '31876',
		outputNeurons: '50488'
	},
	{
		model: '@cf/aisingapore/gemma-sea-lion-v4-27b-it',
		inputPrice: '$0.351',
		outputPrice: '$0.555',
		inputNeurons: '31876',
		outputNeurons: '50488'
	},
	{
		model: '@cf/meta/llama-guard-3-8b',
		inputPrice: '$0.484',
		outputPrice: '$0.030',
		inputNeurons: '44003',
		outputNeurons: '2730'
	},
	{
		model: '@cf/deepseek-ai/deepseek-r1-distill-qwen-32b',
		inputPrice: '$0.497',
		outputPrice: '$4.881',
		inputNeurons: '45170',
		outputNeurons: '443756'
	},
	{
		model: '@cf/meta/llama-2-7b-chat-fp16',
		inputPrice: '$0.556',
		outputPrice: '$6.667',
		inputNeurons: '50505',
		outputNeurons: '606061'
	},
	{
		model: '@cf/qwen/qwq-32b',
		inputPrice: '$0.660',
		outputPrice: '$1.000',
		inputNeurons: '60000',
		outputNeurons: '90909'
	},
	{
		model: '@cf/qwen/qwen2.5-coder-32b-instruct',
		inputPrice: '$0.660',
		outputPrice: '$1.000',
		inputNeurons: '60000',
		outputNeurons: '90909'
	}
]

interface EmbeddingPricing {
	model: string
	price: string
	neurons: string
}

const EMBEDDING_PRICING: EmbeddingPricing[] = [
	{ model: '@cf/baai/bge-m3', price: '$0.012', neurons: '1075' },
	{ model: '@cf/qwen/qwen3-embedding-0.6b', price: '$0.012', neurons: '1075' },
	{ model: '@cf/pfnet/plamo-embedding-1b', price: '$0.019', neurons: '1689' },
	{ model: '@cf/baai/bge-small-en-v1.5', price: '$0.020', neurons: '1841' },
	{ model: '@cf/baai/bge-base-en-v1.5', price: '$0.067', neurons: '6058' },
	{ model: '@cf/baai/bge-large-en-v1.5', price: '$0.204', neurons: '18582' }
]

interface ImagePricing {
	model: string
	tilePrice: string
	stepPrice: string
}

const IMAGE_PRICING: ImagePricing[] = [
	{
		model: '@cf/black-forest-labs/flux-1-schnell',
		tilePrice: '$0.0000528',
		stepPrice: '$0.0001056'
	},
	{ model: '@cf/leonardo/phoenix-1.0', tilePrice: '$0.005830', stepPrice: '$0.000110' },
	{ model: '@cf/leonardo/lucid-origin', tilePrice: '$0.006996', stepPrice: '$0.000132' }
]

interface AudioPricing {
	model: string
	price: string
	unit: string
}

const AUDIO_PRICING: AudioPricing[] = [
	{ model: '@cf/myshell-ai/melotts', price: '$0.0002', unit: 'per audio minute' },
	{ model: '@cf/openai/whisper', price: '$0.0005', unit: 'per audio minute' },
	{ model: '@cf/openai/whisper-large-v3-turbo', price: '$0.0005', unit: 'per audio minute' },
	{ model: '@cf/deepgram/nova-3', price: '$0.0052', unit: 'per audio minute' },
	{ model: '@cf/deepgram/flux (WebSocket)', price: '$0.0077', unit: 'per audio minute' },
	{ model: '@cf/deepgram/nova-3 (WebSocket)', price: '$0.0092', unit: 'per audio minute' },
	{ model: '@cf/deepgram/aura-1', price: '$0.015', unit: 'per 1k characters' },
	{ model: '@cf/deepgram/aura-2-en', price: '$0.030', unit: 'per 1k characters' },
	{ model: '@cf/deepgram/aura-2-es', price: '$0.030', unit: 'per 1k characters' }
]

// -----------------------------------------------------------------------------
// Output Helpers (no ℹ prefix)
// -----------------------------------------------------------------------------

function log(message = ''): void {
	console.log(message)
}

function header(title: string): void {
	console.log(`\n${BG_BLUE}${WHITE}${BOLD} ${title} ${RESET}`)
}

// -----------------------------------------------------------------------------
// Main Command
// -----------------------------------------------------------------------------

export function runAICommand(): CliResult {
	log('🤖 Workers AI')
	log()
	log(`${BOLD}Pricing${RESET}  $${PRICE_PER_1000_NEURONS_USD.toFixed(3)} per 1,000 neurons`)
	log(`${BOLD}Free${RESET}     ${FREE_TIER_NEURONS_PER_DAY.toLocaleString('en-US')} neurons/day`)
	log(`${DIM}${PRICING_DOCS_URL}${RESET}`)

	// LLM Pricing
	header('LLM model pricing')
	for (const m of LLM_PRICING) {
		log(` • ${m.model}`)
		log(`   ${DIM}${m.inputPrice} per M input tokens${RESET}`)
		log(`   ${DIM}${m.outputPrice} per M output tokens${RESET}`)
	}

	// Embedding Pricing
	header('Embeddings model pricing')
	for (const m of EMBEDDING_PRICING) {
		log(` • ${m.model}`)
		log(`   ${DIM}${m.price} per M input tokens${RESET}`)
	}

	// Image Pricing
	header('Image model pricing')
	for (const m of IMAGE_PRICING) {
		log(` • ${m.model}`)
		log(`   ${DIM}${m.tilePrice} per 512x512 tile${RESET}`)
		log(`   ${DIM}${m.stepPrice} per step${RESET}`)
	}

	// Audio Pricing
	header('Audio model pricing')
	for (const m of AUDIO_PRICING) {
		log(` • ${m.model}`)
		log(`   ${DIM}${m.price} ${m.unit}${RESET}`)
	}

	log()

	return { exitCode: 0 }
}
