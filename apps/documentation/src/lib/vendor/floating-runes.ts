import type { Action } from 'svelte/action'

export interface FloatingRunesOptions {
	placement?: string
	strategy?: 'absolute' | 'fixed'
	middleware?: unknown[]
	autoPosition?: boolean
}

export type FloatingRunesAction = Action<HTMLElement> & {
	ref: Action<HTMLElement>
	arrow: Action<HTMLElement>
}

import floatingUIUntyped, {
	createSingleton as createSingletonUntyped,
	flip as flipUntyped,
	offset as offsetUntyped,
	portal as portalUntyped,
	shift as shiftUntyped
} from 'floating-runes'

const floatingUI = floatingUIUntyped as (options?: FloatingRunesOptions) => FloatingRunesAction

export const createSingleton = createSingletonUntyped
export const flip = flipUntyped
export const offset = offsetUntyped
export const portal = portalUntyped
export const shift = shiftUntyped

export default floatingUI
