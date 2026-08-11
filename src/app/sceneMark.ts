// 지금 무엇이 떠 있는지를 문서에 적어 둔다 — `<html data-scene="overworld" data-map="12">`
//
// ⚠️ **시험용 뒷문이 아니다.** `data-boot`과 같은 자리고(`boot.ts`), 아무것도
// 바꾸지 않고 **이미 정해진 것을 밖에서 읽을 수 있게만** 한다. 값을 써서
// 게임을 움직일 수 있는 길은 없다.
//
// 왜 필요한가: 화면 글자만 보고는 "지금 대사 중인가 · 어느 맵인가 · 배틀이
// 켜졌나"를 못 가른다. 글은 사용자 롬에서 오므로 판마다 다르고, 오버월드는
// 대부분이 캔버스라 DOM에 남는 것이 거의 없다. 지원 문의에도 같은 값이
// 필요하다 — 사용자가 개발자 도구를 열어 한 줄만 읽으면 된다.
//
// ⚠️ **롬에서 온 글은 안 적는다.** 지역 이름은 화면에 뜨는 것이고 여기 값은
// **번호**다 (COPYRIGHT.md §6 — 실제 데이터가 로그·스냅샷에 남지 않게 한다).

/**
 * 지금 조작을 받고 있는 층. 위에 있는 것이 이긴다.
 *
 * ⚠️ 오프닝은 여기 없다 — 그건 주소로 이미 보인다(`/intro`). 값이 두 군데
 * 있으면 언젠가 어긋난다
 */
export type Scene = 'title' | 'overworld' | 'battle' | 'menu'

const root = (): HTMLElement | null =>
  typeof document === 'undefined' ? null : document.documentElement

function put(key: string, value: string | null): void {
  const el = root()
  if (!el) return
  if (value === null) delete el.dataset[key]
  else if (el.dataset[key] !== value) el.dataset[key] = value
}

export function markScene(scene: Scene): void {
  put('scene', scene)
}

/** 맵 헤더 번호. 없으면(타이틀·오프닝) 지운다 */
export function markMap(id: number): void {
  put('map', id < 0 ? null : String(id))
}

/** 맨 위 메뉴 이름. 없으면 지운다 */
export function markMenu(name: string | null): void {
  put('menu', name)
}

/**
 * 대사창이 떠 있는가. `MessageBox`가 그리는 것과 같은 순간에 적는다.
 *
 * ⚠️ **`scene`을 여기서 안 바꾼다.** 대사는 배틀 중에도 뜨고 메뉴 위에도 뜬다 —
 * 층을 덮어쓰면 어디서 말하는 중인지를 잃는다
 */
export function markTalk(on: boolean): void {
  put('talk', on ? '1' : null)
}

/**
 * 서 있는 칸 — `data-tile="12,-34"`.
 *
 * ⚠️ **왜 필요한가.** 오버월드는 거의 전부가 캔버스라 "움직였는가"를 밖에서
 * 알 길이 없다. 벽에 붙어 있는지 걷고 있는지를 못 가르면 자동 검사가 제자리를
 * 걷는 것을 통과로 읽는다 — 실제로 다섯 걸음마다 방향을 바꾸는 걷기가
 * 알짜 이동 0인 채로 5분을 태웠고, 그때 화면에는 아무 표시도 없었다.
 * 지원 문의에도 같은 값이 필요하다 ("여기서 못 나가요").
 *
 * ⚠️ **좌표는 게임 데이터가 아니다.** 플레이어가 지금 어디 서 있는지고
 * 롬에서 온 글도 표도 아니다.
 *
 * 프레임마다 불리지만 **칸이 바뀔 때만** 쓴다 — 매 프레임 DOM을 만지면
 * 레이아웃이 흔들린다
 *
 * ⚠️ **`round`가 아니라 `floor`다.** 주인공은 칸 **가운데**에 서므로 좌표가
 * 늘 `칸 + 0.5`고, `round`는 그것을 위 칸으로 올린다 — 표식이 한 칸씩 어긋난
 * 채로 나갔다. 격자도 `isBlockedAtWorld`가 `floor`로 묻는다(`map/grid.ts`).
 * 실측으로 잡았다: 침실에서 표식이 (1,9)라고 했는데 그 칸은 벽이었다
 */
export function markTile(x: number, z: number): void {
  put('tile', `${String(Math.floor(x))},${String(Math.floor(z))}`)
}

/**
 * 필드 스크립트가 도는 중인가 — `data-script="1"`.
 *
 * ⚠️ **이게 없으면 밖에서 두 가지가 똑같이 보인다.** 스크립트가 발을 묶은
 * 것과 벽에 막힌 것 — 둘 다 대사도 없고 걸음도 없다. 실제로 그 둘을 못 갈라
 * 자동 검사가 "운이 나빠 배틀에 못 닿았다"고 읽고 있었다.
 *
 * 대사창(`data-talk`)과 다르다. 스크립트는 대사 없이도 돈다 — 카메라를
 * 옮기거나 NPC를 걷게 하는 동안이 그렇다
 */
export function markScript(on: boolean): void {
  put('script', on ? '1' : null)
}

/**
 * 어느 갈래의 배틀인가 — `data-battle="wild"` · `"trainer"`. 없으면 지운다.
 *
 * ⚠️ **`data-scene="battle"`만으로는 못 가른다.** 야생과 트레이너는 여는 길도
 * 규칙도 다른데(`battleStore`의 `startWild`·`startTrainer`) 밖에서는 똑같이
 * 보인다. 그러면 자동 검사가 "배틀 둘 다 됐다"를 증명할 수가 없다 —
 * 야생만 스무 번 나고도 통과한다
 */
export function markBattle(kind: 'wild' | 'trainer' | null): void {
  put('battle', kind)
}
