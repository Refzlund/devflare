export interface IssuedServiceToken {
	subject: string
	token: string
	scopes: string[]
	issuedAt: string
}

export function getServiceInfo(): {
	service: string
	version: string
	capabilities: string[]
} {
	return {
		service: 'devflare-testing-auth-service',
		version: '1.0.0',
		capabilities: ['getServiceInfo', 'issueServiceToken']
	}
}

export function issueServiceToken(subject: string): IssuedServiceToken {
	const trimmedSubject = subject.trim() || 'anonymous'
	return {
		subject: trimmedSubject,
		token: `testing-token-${trimmedSubject}`,
		scopes: ['smoke:run', 'service:read'],
		issuedAt: new Date().toISOString()
	}
}
