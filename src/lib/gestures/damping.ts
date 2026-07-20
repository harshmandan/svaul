/**
 * Logarithmic rubber-band resistance, ported from vaul.
 *
 * Applied when the user drags *past* the fully-open position: the further they pull, the less the
 * drawer actually moves, giving an elastic "can't go further" feel. The curve is offset (`dampenValue(0)
 * ≈ -16`), so callers negate it and clamp to the open direction (`Math.min(-dampenValue(x), 0)`) — the
 * offset creates a short dead zone near the boundary and prevents any motion back toward closed.
 */
export function dampenValue(v: number): number {
	return 8 * (Math.log(v + 1) - 2);
}
