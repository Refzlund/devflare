import { DoubleableNumber } from './DoubleableNumber'

export class Counter {
	private count = 0

	getValue(): DoubleableNumber {
		return new DoubleableNumber(this.count)
	}

	increment(n: number = 1): DoubleableNumber {
		this.count += n
		return new DoubleableNumber(this.count)
	}
}
