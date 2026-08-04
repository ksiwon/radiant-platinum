// 도망 판정 (PLAN §7.6) — 4세대 공식.
//
// 야생전에서만 쓴다. 트레이너전은 도망 자체가 없다.

/**
 * 도망 확률의 분자 F. `rand(256) < F`면 도망친다.
 *
 * **우리가 더 빠르면 무조건 성공한다.** 느려도 시도할수록 쉬워진다 — 시도마다
 * 30씩 더해지므로 여덟 번쯤 하면 사실상 확정이다.
 *
 * ⚠️ 256으로 나눈 나머지를 쓴다. 카트리지가 8비트 값이라 그런 것이고, 이 나머지
 * 때문에 **아주 빠른데 시도를 많이 하면 오히려 확률이 떨어지는 구간**이 생긴다.
 * 우리가 더 빠르면 그 전에 확정 처리되므로 실제로는 안 걸린다
 */
export function escapeOdds(mySpeed: number, foeSpeed: number, attempts: number): number {
  if (foeSpeed <= 0) return 256
  if (mySpeed > foeSpeed) return 256
  return (Math.floor((mySpeed * 128) / foeSpeed) + 30 * attempts) % 256
}

/** 도망친다. `attempts`는 이번 것을 포함하지 않은 지금까지의 시도 횟수다 */
export function tryEscape(
  mySpeed: number,
  foeSpeed: number,
  attempts: number,
  random: () => number,
): boolean {
  const odds = escapeOdds(mySpeed, foeSpeed, attempts)
  if (odds >= 256) return true
  return Math.floor(random() * 256) < odds
}
