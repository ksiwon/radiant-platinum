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
