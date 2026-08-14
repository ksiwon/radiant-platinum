// 화석 되살리기 (PARITY §4.9 · §6.9) — `scrcmd_fossil.c`
//
// 탄갱박물관 안쪽 방의 사람이 화석 하나를 받아 포켓몬으로 되살려 준다.
// 규칙은 표 하나가 전부다 — **도구 일곱과 종족 일곱의 짝**.
//
// ⚠️ **차례가 뜻을 갖는다.** 스크립트가 「가진 화석 중 N번째」를 이 표의 차례로
// 찾는다(`FindFossilAtThreshold`) — 목록에 뜨는 줄 순서가 곧 이 표의 순서다.
// 옛호박이 첫 줄인 것도 그래서다(도구 번호는 103으로 중간인데).
//
// ⚠️ **되살릴 수 있는 자리가 여기뿐이다.** 지하통로(§7.2)에서 캐는 화석도
// 결국 이 사람에게 온다 — 그쪽이 아직 없어도 이 표는 온전하다.

/** 도구 → 종족. **차례가 곧 목록의 줄 번호다** (`sFossilItemToSpeciesMapping`) */
export const FOSSILS: readonly { item: number, species: number }[] = [
  { item: 103, species: 142 }, // 옛호박 → 프테라
  { item: 101, species: 138 }, // 나선화석 → 암나이트
  { item: 102, species: 140 }, // 껍질화석 → 투구
  { item: 99, species: 345 }, //  뿌리화석 → 릴링
  { item: 100, species: 347 }, // 발톱화석 → 아노딥스
  { item: 104, species: 410 }, // 갑옷화석 → 쉘돈
  { item: 105, species: 408 }, // 두개화석 → 두개도스
]

/** 가방에 있는 화석을 다 센다 (`ScrCmd_GetFossilCount`) */
export function fossilCount(quantityOf: (item: number) => number): number {
  return FOSSILS.reduce((n, f) => n + quantityOf(f.item), 0)
}

/** 그 화석이 되살아나면 무엇이 되는가. 화석이 아니면 0 */
export function speciesFromFossil(item: number): number {
  return FOSSILS.find((f) => f.item === item)?.species ?? 0
}

/**
 * 가진 화석을 차례로 세어 **문턱에 닿는 것**을 집는다
 * (`ScrCmd_FindFossilAtThreshold`).
 *
 * 목록에서 N번째 줄을 고르면 스크립트가 `threshold = N`으로 이걸 부른다.
 * 같은 화석을 둘 들고 있으면 그 둘이 목록에서 한 줄인 것이 아니라 **두 줄을
 * 먹는다** — 누적 개수로 세기 때문이다.
 *
 * 못 찾으면 둘 다 0이다 (원작이 그 값으로 시작한다)
 */
export function fossilAtThreshold(
  quantityOf: (item: number) => number, threshold: number,
): { item: number, index: number } {
  let running = 0
  for (const [index, f] of FOSSILS.entries()) {
    running += quantityOf(f.item)
    if (running >= threshold) return { item: f.item, index }
  }
  return { item: 0, index: 0 }
}
