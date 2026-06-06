/**
 * Logarithmic rubber-band resistance, ported from vaul.
 *
 * Applied when the user drags *past* the fully-open position: the further they
 * pull, the less the drawer actually moves, giving an elastic "can't go further"
 * feel. `dampenValue(0) ≈ -16`, growing slowly thereafter.
 */
export function dampenValue(v: number): number {
	return 8 * (Math.log(v + 1) - 2);
}
