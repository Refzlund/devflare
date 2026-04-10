export class DoubleableNumber {
	value: number

	constructor(n: number) {
		this.value = n
	}

	get double() {
		return this.value * 2
	}
} 