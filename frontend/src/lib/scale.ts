/** Linear scale: map a value in [d0,d1] to a pixel in [r0,r1], clamped. */
export function linearScale(d0: number, d1: number, r0: number, r1: number) {
  const span = d1 - d0 || 1;
  return (v: number) => {
    const t = (v - d0) / span;
    const clamped = Math.max(0, Math.min(1, t));
    return r0 + clamped * (r1 - r0);
  };
}

/** Symmetric half-span around a center so a reference line sits mid-axis. */
export function symmetricHalfSpan(
  center: number,
  min: number | null,
  max: number | null,
  minFloorFrac = 0.02
) {
  return Math.max(
    Math.abs((max ?? center) - center),
    Math.abs(center - (min ?? center)),
    Math.abs(center) * minFloorFrac,
    1e-6
  );
}
