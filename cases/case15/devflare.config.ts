import { defineConfig } from 'devflare/config'

const accountId = process.env.CLOUDFLARE_ACCOUNT_ID?.trim()

export default defineConfig({
	name: 'case15-ai-vectorize',
	accountId,

	bindings: {
		// AI binding — use Devflare remote mode for real inference
		// No local simulation exists for GPU inference
		ai: {
			binding: 'AI'
		},

		// Vectorize binding — use Devflare remote mode for real queries
		// Vector database is a managed service
		vectorize: {
			VECTORIZE: {
				indexName: 'embeddings-index'
			}
		},

		// KV for caching embeddings locally
		kv: {
			CACHE: 'cache-kv-id'
		}
	},

	vars: {
		// Model to use for embeddings
		EMBEDDING_MODEL: '@cf/baai/bge-base-en-v1.5',
		// Model for text generation
		TEXT_MODEL: '@cf/meta/llama-3.1-8b-instruct'
	}
})
