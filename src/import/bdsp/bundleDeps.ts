// 번들 → 같이 열어야 하는 번들 (DATA.md §3.6).
//
// ⚠️ **손으로 고치지 않는다** — `pnpm gen:bundleDeps`가 BDSP 번들 매니페스트
// (`Characters/Characters`)에서 다시 만든다.
//
// ⚠️ **이 표가 없으면 사람이 캡슐로 선다.** 유니티 `PPtr`의 `m_FileID`가 0이면
// 제 파일이고 1부터는 그 파일의 바깥 참조표다. 드래곤사역사(`tr1029_00`)는
// 재질 아홉이 다 `objects/ob0204_00`에 있어서, 그 번들을 같이 안 열면
// 재질을 못 찾은 껍데기가 통째로 버려진다 (`import/bdsp/model.ts`).
//
// ⚠️ **셰이더 번들은 안 담는다.** 재질은 우리가 합성한다.
//
// 실측 — 번들 441개 중 58개가 딴 번들을 가리킨다
// (배틀 사람 9 · 필드 사람 29 · 그 밖 20).

/** 번들 이름 → 같이 열 번들들. `Characters/` 밑의 경로 그대로다 */
const BUNDLE_DEPS: Readonly<Record<string, readonly string[]>> = {
  "assetviewer/viewer": [
    "common_resources",
    "petrifydata"
  ],
  "common_resources": [
    "tmpshader"
  ],
  "debug/networktest": [
    "tmpshader"
  ],
  "debug/scenes/debug_battle_boot": [
    "common_resources"
  ],
  "objects/ob1001_00": [
    "objects/ob0204_00"
  ],
  "objects/ob1009_01": [
    "objects/ob1009_00"
  ],
  "objects/ob1009_02": [
    "objects/ob1009_00"
  ],
  "objects/ob1009_03": [
    "objects/ob1009_00"
  ],
  "objects/ob1009_04": [
    "objects/ob1009_00"
  ],
  "objects/ob1009_05": [
    "objects/ob1009_00"
  ],
  "objects/ob1009_06": [
    "objects/ob1009_00"
  ],
  "objects/ob1009_07": [
    "objects/ob1009_00"
  ],
  "objects/ob1009_08": [
    "objects/ob1009_00"
  ],
  "persons/battle/pc0001_12": [
    "persons/battle/pc0001_00"
  ],
  "persons/battle/pc0002_10": [
    "persons/battle/pc0002_00"
  ],
  "persons/battle/pc0002_12": [
    "persons/battle/pc0001_12"
  ],
  "persons/battle/pc0002_21": [
    "persons/battle/pc0002_00"
  ],
  "persons/battle/tr1026_00": [
    "objects/ob0204_00"
  ],
  "persons/battle/tr1029_00": [
    "objects/ob0204_00"
  ],
  "persons/battle/tr1085_00": [
    "objects/ob0204_00"
  ],
  "persons/battle/tr2003_00": [
    "objects/ob0204_00"
  ],
  "persons/battle/tr2003_01": [
    "objects/ob0204_00"
  ],
  "persons/field/fc0001_00": [
    "persons/field/fc0001_11",
    "persons/field/pc_parts"
  ],
  "persons/field/fc0001_10": [
    "persons/field/fc0001_11",
    "persons/field/pc_parts"
  ],
  "persons/field/fc0001_12": [
    "persons/field/fc0001_11",
    "persons/field/pc_parts"
  ],
  "persons/field/fc0001_13": [
    "persons/field/fc0001_11",
    "persons/field/pc_parts"
  ],
  "persons/field/fc0001_14": [
    "persons/field/fc0001_11",
    "persons/field/pc_parts"
  ],
  "persons/field/fc0001_15": [
    "persons/field/fc0001_11",
    "persons/field/pc_parts"
  ],
  "persons/field/fc0001_16": [
    "persons/field/fc0001_11",
    "persons/field/pc_parts"
  ],
  "persons/field/fc0001_17": [
    "persons/field/fc0001_11",
    "persons/field/pc_parts"
  ],
  "persons/field/fc0001_18": [
    "persons/field/fc0001_11",
    "persons/field/pc_parts"
  ],
  "persons/field/fc0001_19": [
    "persons/field/fc0001_11",
    "persons/field/pc_parts"
  ],
  "persons/field/fc0001_20": [
    "persons/field/fc0001_11",
    "persons/field/pc_parts"
  ],
  "persons/field/fc0001_21": [
    "persons/field/fc0001_11",
    "persons/field/pc_parts"
  ],
  "persons/field/fc0001_22": [
    "persons/field/fc0001_11",
    "persons/field/pc_parts"
  ],
  "persons/field/fc0002_00": [
    "persons/field/fc0002_11",
    "persons/field/pc_parts"
  ],
  "persons/field/fc0002_10": [
    "persons/field/fc0002_11",
    "persons/field/pc_parts"
  ],
  "persons/field/fc0002_12": [
    "persons/field/fc0002_11",
    "persons/field/pc_parts"
  ],
  "persons/field/fc0002_13": [
    "persons/field/fc0002_11",
    "persons/field/pc_parts"
  ],
  "persons/field/fc0002_14": [
    "persons/field/fc0002_11",
    "persons/field/pc_parts"
  ],
  "persons/field/fc0002_15": [
    "persons/field/fc0002_11",
    "persons/field/pc_parts"
  ],
  "persons/field/fc0002_16": [
    "persons/field/fc0002_11",
    "persons/field/pc_parts"
  ],
  "persons/field/fc0002_17": [
    "persons/field/fc0002_11",
    "persons/field/pc_parts"
  ],
  "persons/field/fc0002_18": [
    "persons/field/fc0002_11",
    "persons/field/pc_parts"
  ],
  "persons/field/fc0002_19": [
    "persons/field/fc0002_11",
    "persons/field/pc_parts"
  ],
  "persons/field/fc0002_20": [
    "persons/field/fc0002_11",
    "persons/field/pc_parts"
  ],
  "persons/field/fc0002_21": [
    "persons/field/fc0002_11",
    "persons/field/pc_parts"
  ],
  "persons/field/fc0002_22": [
    "persons/field/fc0002_11",
    "persons/field/fc0002_15",
    "persons/field/pc_parts"
  ],
  "persons/field/fc1008_01": [
    "persons/field/fc1008_00"
  ],
  "persons/field/fc1029_00": [
    "objects/ob0204_00"
  ],
  "persons/field/fc2003_01": [
    "persons/field/fc2003_00"
  ],
  "petrifydata": [
    "petrify/0",
    "petrify/1",
    "petrify/2",
    "petrify/3",
    "petrify/4",
    "petrify/5",
    "petrify/6"
  ],
  "scenes/battle": [
    "common_resources"
  ],
  "scenes/contest": [
    "common_resources"
  ],
  "scenes/evolvedemo": [
    "common_resources"
  ],
  "scenes/field": [
    "common_resources"
  ],
  "scenes/gms": [
    "common_resources"
  ],
  "scenes/sealpreview": [
    "common_resources"
  ]
}


/**
 * 이 번들과 **같이 열어야 하는 것들**. 의존의 의존까지 따라간다.
 *
 * ⚠️ **사슬이 있다** — `pc0002_12`는 `pc0001_12`를 가리키고 그것이 다시
 * `pc0001_00`을 가리킨다. 한 단계만 따라가면 가운데가 빈다
 */
export function bundleDeps(name: string): string[] {
  const out: string[] = []
  const seen = new Set<string>([name])
  const queue = [...(BUNDLE_DEPS[name] ?? [])]
  while (queue.length > 0) {
    const at = queue.shift()!
    if (seen.has(at)) continue
    seen.add(at)
    out.push(at)
    queue.push(...(BUNDLE_DEPS[at] ?? []))
  }
  return out
}
