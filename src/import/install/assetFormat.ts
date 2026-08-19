// 설치물의 판 — 언제 다시 만들어야 하는가 (IMPORT.md §8·§15)
//
// ⚠️ **판이 넷이고 서로 다른 것을 뜻한다.** 하나로 뭉치면 오타 하나 고친 배포가
// 사용자의 600MB를 다시 만들게 한다:
//
//   `APP_VERSION`     앱 코드의 판. 사람이 올린다
//   `BUILD_ID`        이 빌드의 신원(커밋 SHA). **판이 아니다** — 매 빌드 바뀐다
//   `SAVE_VERSION`    리포트 내용의 판 (`state/save/`)
//   `ASSET_FORMAT`    설치물이 어떤 모양인가. **여기만 설치를 무효로 만든다**
//
// 앱을 고쳐도, 커밋이 바뀌어도, 리포트 판이 올라도 **설치물은 그대로 쓴다.**
// 그것이 "한 번만 고르면 된다"의 실질이다.
//
// ⚠️ **그리고 그룹마다 따로 센다.** 모델 포맷을 바꿨다고 글 표까지 다시 만들
// 이유가 없다. 통짜 판 하나로 두면 언제나 전부 다시 만들게 된다.

/**
 * 설치물 전체의 모양 판.
 *
 * 매니페스트 구조가 아니라 **그 안에 담긴 산출물의 모양**이다. 구조는
 * `CONTRACT_VERSION`이 따로 센다 (`manifestSchema.ts`)
 */
export const ASSET_FORMAT = 1

/**
 * 그룹마다의 산출물 판. 적혀 있지 않으면 1이다.
 *
 * 변환기를 고쳐서 **같은 입력이 다른 바이트를 내게** 되면 여기를 올린다.
 * 진행률 표시를 고친 정도로는 안 올린다 — 그건 산출물이 같다
 */
export const GROUP_FORMAT: Readonly<Record<string, number>> = {
  moves: 1,
  marts: 1,
  /**
   * 2 — 맵 헤더의 글 뱅크 번호를 us 번호로 되돌린다.
   *
   * ⚠️ **이미 깔린 것을 그냥 두면 안 된다.** 한국판·일본판 롬으로 설치한 사람의
   * `maps.json`은 593개 맵이 전부 자기 롬의 뱅크 번호를 들고 있고, 대사 파일
   * 이름은 us 번호라서 맵마다 이웃 뱅크가 나온다. 바이트가 달라지므로 판을 올려
   * 이 그룹만 다시 만들게 한다
   */
  maps: 2,
  /** 2 — 일본판 게임코너 뱅크(us #147)가 빠져 있었다. 그 파일이 늘어난다 */
  text: 2,
  /**
   * 2 — 등신 몸에 배틀 클립 셋을 싣는다 (`TRAINER_CLIPS`).
   *
   * 그전에는 인물 106벌이 전부 클립 0개로 구워졌다. glb 바이트가 달라지므로
   * 이미 깔린 사람도 이 그룹만 다시 굽게 한다 — 안 올리면 설치본의 트레이너가
   * 계속 절차형 몸짓만 한다
   */
  npcModels: 2,
}

export function groupFormat(name: string): number {
  return GROUP_FORMAT[name] ?? 1
}

/**
 * 옛 판 산출물을 **원본 없이** 지금 판으로 옮기는 함수.
 *
 * 원본이 필요하면 migration이 아니다 — 그건 재생성이다. 그 구별이 이 계약의
 * 핵심이라, 여기 들어오는 함수는 이미 설치된 바이트만으로 답을 내야 한다
 */
export type Migration = (files: ReadonlyMap<string, Uint8Array>) => Promise<Map<string, Uint8Array>>

/**
 * `그룹 → 어느 판에서 → 어떻게`.
 *
 * ⚠️ **지금은 비어 있다.** `ASSET_FORMAT`이 1이고 판을 올린 적이 없으니
 * 옮길 것도 없다. 없는 과거를 지어내지 않는다 — 길만 놓고 첫 승격 때 채운다.
 * 길이 실제로 도는지는 `assetFormat.test.ts`가 인공 migration으로 확인한다
 */
export const MIGRATIONS: Readonly<Record<string, Readonly<Record<number, Migration>>>> = {}

/** 그 그룹의 이 판에서 지금 판으로 갈 길이 있는가 */
export function migrationFor(group: string, from: number): Migration | null {
  if (from === groupFormat(group)) return null
  return MIGRATIONS[group]?.[from] ?? null
}

export interface AssetPlan {
  /** 그대로 쓴다 */
  reuse: string[]
  /** 원본 없이 옮길 수 있다 */
  migrate: { group: string, from: number }[]
  /** 원본을 다시 골라야 한다 */
  regenerate: { group: string, from: number, to: number }[]
}

/**
 * 설치된 그룹들을 지금 판과 맞대 본다.
 *
 * ⚠️ **전부 다시 만들기는 마지막 수단이다.** 그래서 그룹마다 따로 답을 낸다 —
 * 하나가 낡았다고 나머지를 버리지 않는다
 */
export function planAssets(installed: Readonly<Record<string, { format?: number }>>): AssetPlan {
  const plan: AssetPlan = { reuse: [], migrate: [], regenerate: [] }
  for (const [group, record] of Object.entries(installed)) {
    const from = record.format ?? 1
    const to = groupFormat(group)
    if (from === to) { plan.reuse.push(group); continue }
    if (migrationFor(group, from)) { plan.migrate.push({ group, from }); continue }
    plan.regenerate.push({ group, from, to })
  }
  return plan
}

/** 원본을 다시 골라야 하는가. 여기가 false면 다음 실행은 아무것도 안 묻는다 */
export function needsSource(plan: AssetPlan): boolean {
  return plan.regenerate.length > 0
}
