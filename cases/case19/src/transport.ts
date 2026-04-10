import { DoubleableNumber } from "./DoubleableNumber"

// SvelteKit transport signature
export const transport = {
	DoubleableNumber: {
		encode: (v: unknown) => v instanceof DoubleableNumber && v.value,
		decode: (v: number) => new DoubleableNumber(v)
	}
}
