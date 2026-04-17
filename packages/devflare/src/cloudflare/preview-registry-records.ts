// Barrel module: preview-registry-records splits into three cohesive layers.
// - Transport: Cloudflare API reads → ./preview-registry-transport
// - Inference: pure normalized-model derivation → ./preview-registry-inference
// - Shape: persistence-oriented record projection → ./preview-registry-shape
export * from './preview-registry-inference'
export * from './preview-registry-shape'
export * from './preview-registry-transport'
