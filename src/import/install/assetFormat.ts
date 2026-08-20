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
   * 4 — 재질 없는 조각을 안 그린다. 세가 기본 흰색으로 칠하던 자리다
   * (`import/bdsp/model.ts` · 노드 추출기가 같은 일을 한다). glb 바이트가 준다.
   *
   * 3 — 주인공 둘에 치비에서 옮겨 온 필드 동작 열여섯을 얹는다
   * (`HERO_FIELD_CLIPS` · `import/bdsp/retarget.ts`). 주인공 둘이 합쳐 2.14MiB 는다.
   *
   * 2는 등신 몸에 배틀 클립 셋을 실은 판이다 (`TRAINER_CLIPS`). glb 바이트가
   * 달라지므로 이미 깔린 사람도 이 그룹만 다시 굽게 한다 — 안 올리면 설치본의
   * 주인공이 계속 절차형으로만 낚시한다
   */
  npcModels: 4,
  /**
   * 2 — 재질을 못 찾은 **껍데기 하나만** 버린다. 종을 통째로 버리지 않는다.
   *
   * 옛 판으로 깔린 설치본에는 **포켓몬 쉰 종·판이 아예 없다** — 껍데기 하나가
   * 바깥 파일의 재질을 가리키면 그 종이 통째로 빠졌다(독침붕·리자몽·강챙이·
   * 캐스퐁 셋·테오키스 넷·기라티나…). 목차가 27,420바이트로 노드의 29,438과
   * 갈렸고, 그 쉰은 배틀에 서지 않았다.
   *
   * 같은 판에서 **재질 없는 조각을 안 그리게** 됐다 — 세 셰이더의 기본 흰색이
   * 리자몽 꼬리·또가스 연기·로토무 오라에 흰 덩어리로 붙던 자리다. glb 바이트가
   * 달라지므로 이미 깔린 사람도 이 그룹만 다시 굽는다 (`import/bdsp/model.ts`)
   *
   * 3 — **깎개가 깊이로 깎아 내는 연기 껍데기를 안 굽는다.** 또가스·또도가스가
   * 몸을 통째로 가리는 크림색 구로 섰다 — 원판은 `SmokeMask*`가 깊이 버퍼로
   * 그 구를 깎아 연기 가닥을 만드는데 glTF에 그 단계가 없다. 몸을 감싸는
   * 여섯 껍데기가 빠지면서 두 종의 glb 바이트가 달라진다
   * (`import/bdsp/albedo.ts`의 `carvedShells`)
   */
  monModels: 3,
  /**
   * 2 — **텍스처 없는 재질에 확산색을 실어 준다.**
   *
   * 기라티나 그림자(갈래 20)가 화면에 **하얗게** 떴다. 텍스처가 없고 정점색이
   * 흰색 하나뿐인데 확산색 (0,0,0)을 안 실었기 때문이다. 텍스처 없는 재질
   * 넷(갈래 20·27·38)에만 `d`가 붙어서 `.bin` 셋의 바이트가 달라진다
   * (`import/platinum/chunks.ts`의 `untexturedDiffuse`)
   */
  distortionProps: 2,
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
