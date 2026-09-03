// =============================================================================
// Browser Rendering Shim — Local Puppeteer Bridge
// =============================================================================
// Emulates Cloudflare's Browser Rendering binding locally by running
// a real Puppeteer/Chrome instance and exposing it via HTTP/WebSocket.
//
// This allows `@cloudflare/puppeteer` to connect to a local browser just like
// it would to Cloudflare's Browser Rendering service.
// =============================================================================

export { createBrowserShim, type BrowserShimOptions, type BrowserShim } from './server'
export { createBrowserNodeHandler, type BrowserNodeHandlerOptions } from './handler'
