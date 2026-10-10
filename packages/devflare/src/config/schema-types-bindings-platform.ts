/**
 * Browser Rendering binding value.
 */
export type BrowserBindingInput = string | BrowserBindingObjectInput

/**
 * Browser Rendering binding object form.
 */
export interface BrowserBindingObjectInput {
	/**
	 * Whether Wrangler local development should use the remote Browser
	 * Rendering service.
	 *
	 * @default Wrangler default behavior.
	 *
	 * @example
	 * ```ts
	 * browser: { BROWSER: { remote: true } }
	 * ```
	 */
	remote?: boolean
}

/**
 * Analytics Engine binding configuration.
 */
export interface AnalyticsBindingInput {
	/**
	 * Analytics Engine dataset name.
	 *
	 * @example
	 * ```ts
	 * analyticsEngine: { EVENTS: { dataset: 'worker_events' } }
	 * ```
	 */
	dataset: string
}

/**
 * Email sending binding configuration.
 */
export interface SendEmailBindingInput {
	/**
	 * Restrict this binding to a specific verified destination address.
	 *
	 * @default No single-address restriction.
	 *
	 * @example
	 * ```ts
	 * destinationAddress: 'ops@example.com'
	 * ```
	 */
	destinationAddress?: string

	/**
	 * Restrict this binding to a set of verified destination addresses.
	 *
	 * @default No destination allow-list restriction.
	 *
	 * @example
	 * ```ts
	 * allowedDestinationAddresses: ['ops@example.com']
	 * ```
	 */
	allowedDestinationAddresses?: string[]

	/**
	 * Restrict this binding to a set of verified sender addresses.
	 *
	 * @default No sender allow-list restriction.
	 *
	 * @example
	 * ```ts
	 * allowedSenderAddresses: ['noreply@example.com']
	 * ```
	 */
	allowedSenderAddresses?: string[]

	/**
	 * Whether Wrangler local development should connect this binding to the
	 * remote Email Routing service.
	 *
	 * @default Wrangler default behavior.
	 *
	 * @example
	 * ```ts
	 * remote: true
	 * ```
	 */
	remote?: boolean
}

/**
 * mTLS certificate binding by certificate ID or object form.
 */
export type MtlsCertificateBindingInput =
	| string
	| MtlsCertificateBindingByIdInput
	| MtlsCertificateBindingByWranglerIdInput

/**
 * mTLS certificate binding in Devflare camelCase form.
 */
export interface MtlsCertificateBindingByIdInput {
	/**
	 * Uploaded mTLS certificate UUID from `wrangler mtls-certificate upload`.
	 *
	 * @example
	 * ```ts
	 * certificateId: 'certificate-uuid'
	 * ```
	 */
	certificateId: string

	/**
	 * Whether Wrangler local development should use the remote certificate
	 * binding when available.
	 *
	 * @default Wrangler default behavior.
	 *
	 * @example
	 * ```ts
	 * remote: true
	 * ```
	 */
	remote?: boolean
}

/**
 * mTLS certificate binding in Wrangler snake_case form.
 */
export interface MtlsCertificateBindingByWranglerIdInput {
	/**
	 * Wrangler-native uploaded mTLS certificate UUID.
	 *
	 * @example
	 * ```ts
	 * certificate_id: 'certificate-uuid'
	 * ```
	 */
	certificate_id: string

	/**
	 * Whether Wrangler local development should use the remote certificate
	 * binding when available.
	 *
	 * @default Wrangler default behavior.
	 *
	 * @example
	 * ```ts
	 * remote: true
	 * ```
	 */
	remote?: boolean
}

/**
 * Dispatch Namespace binding by namespace name or object form.
 */
export type DispatchNamespaceBindingInput = string | DispatchNamespaceBindingObjectInput

/**
 * Dispatch Namespace binding object form.
 */
export interface DispatchNamespaceBindingObjectInput {
	/**
	 * Dispatch namespace name.
	 *
	 * @example
	 * ```ts
	 * namespace: 'customers'
	 * ```
	 */
	namespace: string

	/**
	 * Optional outbound worker binding configuration.
	 *
	 * @default No outbound worker binding.
	 *
	 * @example
	 * ```ts
	 * outbound: { service: 'customer-router' }
	 * ```
	 */
	outbound?: DispatchNamespaceOutboundInput

	/**
	 * Whether Wrangler local development should use the remote dispatch
	 * namespace.
	 *
	 * @default Wrangler default behavior.
	 *
	 * @example
	 * ```ts
	 * remote: true
	 * ```
	 */
	remote?: boolean
}

/**
 * Dispatch Namespace outbound worker binding configuration.
 */
export interface DispatchNamespaceOutboundInput {
	/**
	 * Outbound worker service name.
	 *
	 * @example
	 * ```ts
	 * service: 'customer-router'
	 * ```
	 */
	service: string

	/**
	 * Optional outbound worker environment.
	 *
	 * @default Target worker default environment.
	 *
	 * @example
	 * ```ts
	 * environment: 'production'
	 * ```
	 */
	environment?: string

	/**
	 * Outbound worker parameters.
	 *
	 * @default No parameters.
	 *
	 * @example
	 * ```ts
	 * parameters: ['account_id']
	 * ```
	 */
	parameters?: string[]
}

/**
 * Workflow binding configuration.
 */
export interface WorkflowBindingInput {
	/**
	 * Workflow binding name compiled for Wrangler.
	 *
	 * @example
	 * ```ts
	 * name: 'onboarding'
	 * ```
	 */
	name: string

	/**
	 * Workflow class name.
	 *
	 * @example
	 * ```ts
	 * className: 'OnboardingWorkflow'
	 * ```
	 */
	className: string

	/**
	 * Worker script name that hosts the workflow.
	 *
	 * @default Current worker.
	 *
	 * @example
	 * ```ts
	 * scriptName: 'workflow-worker'
	 * ```
	 */
	scriptName?: string

	/**
	 * Whether Wrangler local development should use the remote workflow
	 * binding.
	 *
	 * @default Wrangler default behavior.
	 *
	 * @example
	 * ```ts
	 * remote: true
	 * ```
	 */
	remote?: boolean

	/**
	 * Workflow execution limits.
	 *
	 * @default Cloudflare Workflows default behavior.
	 *
	 * @example
	 * ```ts
	 * limits: { steps: 100 }
	 * ```
	 */
	limits?: WorkflowLimitsInput
}

/**
 * Workflow execution limits.
 */
export interface WorkflowLimitsInput {
	/**
	 * Maximum number of workflow steps.
	 *
	 * @example
	 * ```ts
	 * steps: 100
	 * ```
	 */
	steps: number
}

/**
 * Cloudflare Pipelines binding by pipeline name or object form.
 */
export type PipelineBindingInput = string | PipelineBindingObjectInput

/**
 * Cloudflare Pipelines binding object form.
 */
export interface PipelineBindingObjectInput {
	/**
	 * Pipeline name.
	 *
	 * @example
	 * ```ts
	 * pipeline: 'events-pipeline'
	 * ```
	 */
	pipeline: string

	/**
	 * Whether Wrangler local development should use the remote pipeline
	 * binding.
	 *
	 * @default Wrangler default behavior.
	 *
	 * @example
	 * ```ts
	 * remote: true
	 * ```
	 */
	remote?: boolean
}

/**
 * Cloudflare Images binding value.
 */
export type ImagesBindingInput = true | ImagesBindingObjectInput

/**
 * Cloudflare Images binding object form.
 */
export interface ImagesBindingObjectInput {
	/**
	 * Whether Wrangler local development should use the remote Images service.
	 *
	 * @default Wrangler default behavior.
	 *
	 * @example
	 * ```ts
	 * images: { IMAGES: { remote: true } }
	 * ```
	 */
	remote?: boolean
}

/**
 * Cloudflare Media Transformations binding value.
 */
export type MediaBindingInput = true | MediaBindingObjectInput

/**
 * Cloudflare Media Transformations binding object form.
 */
export interface MediaBindingObjectInput {
	/**
	 * Whether Wrangler local development should use the remote Media service.
	 *
	 * @default Wrangler default behavior.
	 *
	 * @example
	 * ```ts
	 * media: { MEDIA: { remote: true } }
	 * ```
	 */
	remote?: boolean
}

/**
 * Cloudflare Stream binding value.
 */
export type StreamBindingInput = true | StreamBindingObjectInput

/**
 * Cloudflare Stream binding object form.
 */
export interface StreamBindingObjectInput {
	/**
	 * Whether Wrangler local development should use the remote Stream service.
	 *
	 * @default Wrangler default behavior.
	 *
	 * @example
	 * ```ts
	 * stream: { STREAM: { remote: true } }
	 * ```
	 */
	remote?: boolean
}

/**
 * VPC service binding configuration. Connects the Worker to a private service
 * reachable through a Cloudflare VPC connectivity service.
 */
export interface VpcServiceBindingInput {
	/**
	 * Service ID of the VPC connectivity service. Compiles to wrangler's
	 * `service_id`.
	 *
	 * @example
	 * ```ts
	 * vpcServices: { DB: { serviceId: 'service-uuid' } }
	 * ```
	 */
	serviceId: string

	/**
	 * Whether Wrangler local development should use the remote VPC service.
	 *
	 * @default Wrangler default behavior.
	 *
	 * @example
	 * ```ts
	 * vpcServices: { DB: { serviceId: 'service-uuid', remote: true } }
	 * ```
	 */
	remote?: boolean
}

/**
 * VPC network binding routed through a Cloudflare Tunnel or a network ID.
 * Use exactly one of `tunnelId` or `networkId` (they are mutually exclusive).
 */
export type VpcNetworkBindingInput = VpcNetworkByTunnelInput | VpcNetworkByNetworkInput

/**
 * VPC network binding routed through a Cloudflare Tunnel.
 */
export interface VpcNetworkByTunnelInput {
	/**
	 * Tunnel ID of the Cloudflare Tunnel to route traffic through. Compiles to
	 * wrangler's `tunnel_id`. Mutually exclusive with `networkId`.
	 *
	 * @example
	 * ```ts
	 * vpcNetworks: { NET: { tunnelId: 'tunnel-uuid' } }
	 * ```
	 */
	tunnelId: string

	/**
	 * Whether Wrangler local development should use the remote VPC network.
	 *
	 * @default Wrangler default behavior.
	 *
	 * @example
	 * ```ts
	 * vpcNetworks: { NET: { tunnelId: 'tunnel-uuid', remote: true } }
	 * ```
	 */
	remote?: boolean
}

/**
 * VPC network binding routed through a network ID.
 */
export interface VpcNetworkByNetworkInput {
	/**
	 * Network ID to route traffic through. Compiles to wrangler's `network_id`.
	 * Mutually exclusive with `tunnelId`.
	 *
	 * @example
	 * ```ts
	 * vpcNetworks: { NET: { networkId: 'network-uuid' } }
	 * ```
	 */
	networkId: string

	/**
	 * Whether Wrangler local development should use the remote VPC network.
	 *
	 * @default Wrangler default behavior.
	 *
	 * @example
	 * ```ts
	 * vpcNetworks: { NET: { networkId: 'network-uuid', remote: true } }
	 * ```
	 */
	remote?: boolean
}

/**
 * Flagship feature-flag binding configuration.
 */
export interface FlagshipBindingInput {
	/**
	 * Flagship app ID to bind to. Compiles to wrangler's `app_id`.
	 *
	 * @example
	 * ```ts
	 * flagship: { FLAGS: { appId: 'app-id' } }
	 * ```
	 */
	appId: string

	/**
	 * Whether Wrangler local development should use the remote Flagship service
	 * for flag evaluation.
	 *
	 * @default Wrangler default behavior.
	 *
	 * @example
	 * ```ts
	 * flagship: { FLAGS: { appId: 'app-id', remote: true } }
	 * ```
	 */
	remote?: boolean
}

/**
 * Cloudflare Artifacts binding by namespace name or object form.
 */
export type ArtifactsBindingInput = string | ArtifactsBindingObjectInput

/**
 * Cloudflare Artifacts binding object form.
 */
export interface ArtifactsBindingObjectInput {
	/**
	 * Artifacts namespace name.
	 *
	 * @example
	 * ```ts
	 * namespace: 'builds'
	 * ```
	 */
	namespace: string

	/**
	 * Whether Wrangler local development should use the remote Artifacts
	 * namespace.
	 *
	 * @default Wrangler default behavior.
	 *
	 * @example
	 * ```ts
	 * remote: true
	 * ```
	 */
	remote?: boolean
}
