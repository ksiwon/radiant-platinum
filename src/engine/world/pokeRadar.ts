// 포켓몬레이더 — 사슬과 흔들리는 풀 (PARITY §6.5)
//
// `src/pokeradar.c` · `overlay006/wild_encounters.c`의 레이더 부분.
//
// 쓰면 주인공을 가운데 둔 **9×9 상자**에 풀 무더기 넷이 뜬다. 하나씩 고리
// 안쪽으로 들어가면서 뽑고(바깥 고리가 32칸, 안으로 24·16·8), 그 칸이 큰 풀이고
// 높이와 맵이 주인공과 같아야 산다.
//
// 그 무더기를 밟으면 야생이 나오고 **같은 종이 이어지면 사슬이 는다.** 사슬이
// 길수록 색이 다를 확률이 오른다 — 40번을 이으면 200분의 1이다.
//
// ⚠️ **흔들림 두 가지가 「사슬이 이어지는가」를 미리 말해 준다.** 이을 무더기는
// 사슬이 지금 쓰는 흔들림 그대로 흔들리고, 끊을 무더기는 **동전을 던져** 둘 중
// 하나로 흔든다(`SetupGrassPatches`). 그래서 흔들림만 보고는 못 가르지만,
// 네 무더기 중 「지금과 같은 것」을 고르는 것이 확률이 높다.
//
// ⚠️ **강하게 흔들리면 조우표가 갈린다.** 칸 4·5·10·11이 그 맵의 레이더 넷으로
// 바뀐다 — 이 넷이 레이더 없이는 못 만나는 종이다.
//
// ⚠️ **레벨이 칸의 최대값이다.** 보통 야생은 min~max에서 굴리는데 레이더는
// `encounterTable[slot].maxLevel`을 그대로 쓴다 (`CreateWildMon_FromRadarNoChain`).

/** 무더기 수 = 고리 수 (`NUM_GRASS_PATCHES`) */
export const RADAR_PATCHES = 4

/** 걸음으로 차는 배터리 (`RADAR_BATTERY_STEPS`). 다 차야 다시 쓴다 */
export const RADAR_BATTERY_STEPS = 50

/** 사슬 기록 칸 (`NUM_RADAR_RECORDS`) */
export const RADAR_RECORDS = 3

/** 사슬 상한 (`IncWithCap`) */
export const RADAR_CHAIN_MAX = 999

/** 흔들림 (`enum PatchShakeType`) */
export const PATCH_SHAKE = { soft: 0, hard: 1 } as const
export type PatchShake = (typeof PATCH_SHAKE)[keyof typeof PATCH_SHAKE]

/** 상자 한 변. 주인공이 한가운데다 */
export const RADAR_BOX = 9

/**
 * 고리마다의 칸 수 (`ringTileCount`). 0번이 제일 바깥이다.
 *
 * 한 변이 `9 − 고리×2`이므로 둘레는 `4×(변−1)` — 32·24·16·8이 그 값이다
 */
export const RING_TILES: readonly number[] = [32, 24, 16, 8]

/** 그 고리의 한 변 */
export function ringSide(ring: number): number {
  return RADAR_BOX - ring * 2
}

/**
 * 고리 안에서 뽑은 번호 → 상자 안 자리 (`RadarSpawnPatches`).
 *
 * 둘레를 한 줄로 편 번호다. 앞의 `변`개가 윗변, 다음 `변`개가 아랫변,
 * 나머지가 좌우 기둥인데 **좌우를 번갈아 센다**(짝수면 왼쪽, 홀수면 오른쪽).
 */
export function ringTile(ring: number, roll: number): { x: number, z: number } {
  const side = ringSide(ring)
  const band = Math.floor(roll / side)
  if (band === 0) return { x: ring + (roll % side), z: ring }
  if (band === 1) return { x: ring + (roll % side), z: ring + side - 1 }
  const rest = roll - side * 2
  return {
    x: rest % 2 === 0 ? ring : ring + side - 1,
    z: ring + Math.floor(rest / 2) + 1,
  }
}

/**
 * 그 고리의 무더기가 설 **월드 칸**.
 *
 * ⚠️ **가운데가 4다.** 원작이 `9 / 2`를 C 정수 나눗셈으로 쓴다 — 4.5가 아니다
 */
export function patchTile(
  ring: number, roll: number, playerX: number, playerZ: number,
): { x: number, z: number } {
  const at = ringTile(ring, roll)
  const half = Math.floor(RADAR_BOX / 2)
  return { x: playerX - half + at.x, z: playerZ - half + at.z }
}

/** 사슬을 이을 확률 (`CheckPatchContinueChain`) — 안쪽 고리일수록 낮다 */
export const CONTINUE_RATES = {
  /** 쓰러뜨렸다 (`BATTLE_RESULT_WIN`) */
  win: [88, 68, 48, 28] as readonly number[],
  /** 잡았다 (`BATTLE_RESULT_CAPTURED_MON`) — 10씩 높다 */
  captured: [98, 78, 58, 38] as readonly number[],
} as const

/**
 * 색이 다를 확률의 분모 (`CheckPatchShiny`).
 *
 * 사슬 0이면 아예 안 굴린다. 40번째부터 200으로 바닥을 친다
 */
export function shinyRate(chainCount: number): number {
  return Math.max(200, 8200 - chainCount * 200)
}

/** 그 무더기가 색이 다른가 */
export function rollShiny(chainCount: number, rand: (n: number) => number): boolean {
  if (chainCount === 0) return false
  return rand(shinyRate(chainCount)) === 0
}

/** 사슬을 하나 올린다. 999에서 멈춘다 (`IncWithCap`) */
export function incrementChain(count: number): number {
  return Math.min(count + 1, RADAR_CHAIN_MAX)
}

/** 무더기 하나 */
export interface Patch {
  x: number
  z: number
  shake: PatchShake
  /** 밟으면 사슬이 이어지는가. **밟기 전에 이미 정해져 있다** */
  continues: boolean
  shiny: boolean
}

/** 지금 도는 사슬 */
export interface RadarChain {
  /** 이어 온 횟수. 처음 밟은 판은 아직 0이다 */
  count: number
  /** 사슬이 쓰는 흔들림. 이을 무더기가 이대로 흔들린다 */
  shake: PatchShake
  /** 사슬이 묶인 종. 0이면 아직 안 정해졌다 */
  species: number
  level: number
  patches: Patch[]
  /**
   * ⚠️ **아직 한 번도 안 밟았는가** (`unk_14`).
   *
   * 레이더를 쓴 직후의 첫 판은 **사슬을 안 올린다** — 그 판이 종을 정하는
   * 판이다. 이걸 안 두면 첫 판부터 사슬이 1이 되어 색 확률이 일찍 오른다
   */
  fresh: boolean
  /** 무더기를 밟아 배틀에 들어갔는가 (`unk_18`) */
  fromPatch: boolean
}

/** 아무것도 안 도는 사슬 (`RadarChain_Clear`) */
export function clearChain(): RadarChain {
  return {
    count: 0, shake: PATCH_SHAKE.soft, species: 0, level: 0,
    patches: [], fresh: true, fromPatch: false,
  }
}

/**
 * 무더기 넷의 성격을 정한다 (`SetupGrassPatches`).
 *
 * `result`가 앞 판의 결과다 — 잡았으면 이을 확률이 고리마다 10씩 높다.
 *
 * ⚠️ **끊을 무더기는 흔들림을 다시 던진다.** 그래서 「지금과 다르게 흔들리는
 * 무더기」는 반드시 끊지만, 같게 흔들린다고 반드시 잇는 것은 아니다
 */
export function setupPatches(
  tiles: readonly { x: number, z: number }[],
  chain: RadarChain,
  result: 'win' | 'captured',
  rand: (n: number) => number,
): Patch[] {
  const rates = CONTINUE_RATES[result]
  return tiles.map((tile, ring) => {
    const continues = rand(100) < rates[ring]!
    if (!continues) {
      return {
        ...tile,
        shake: rand(100) < 50 ? PATCH_SHAKE.soft : PATCH_SHAKE.hard,
        continues: false,
        shiny: false,
      }
    }
    return {
      ...tile, shake: chain.shake, continues: true,
      shiny: rollShiny(chain.count, rand),
    }
  })
}

/** 밟은 무더기. 없으면 null */
export function patchAt(chain: RadarChain, x: number, z: number): Patch | null {
  return chain.patches.find((p) => p.x === x && p.z === z) ?? null
}

/** 무더기를 밟았을 때 무엇이 일어나는가 */
export interface PatchStep {
  shake: PatchShake
  /** 사슬을 그대로 두고 같은 종을 다시 내는가 (`preserveChain`) */
  preserve: boolean
  shiny: boolean
  chain: RadarChain
}

/**
 * 무더기를 밟았다 (`PokeRadar_ShouldDoRadarEncounter`).
 *
 * ⚠️ **첫 판은 사슬을 안 올린다.** `fresh`가 그 한 판을 가른다 — 그 판은
 * 조우표에서 종을 뽑고, 그 뒤로가 「같은 종인가」를 따지는 판이다
 */
export function stepOnPatch(chain: RadarChain, patch: Patch): PatchStep {
  if (chain.fresh) {
    return {
      shake: patch.shake, preserve: false, shiny: false,
      chain: { ...chain, fresh: false, fromPatch: true, shake: patch.shake },
    }
  }
  if (patch.continues) {
    return {
      shake: patch.shake, preserve: true, shiny: patch.shiny,
      chain: {
        ...chain, fromPatch: true, shake: patch.shake,
        count: incrementChain(chain.count),
      },
    }
  }
  return {
    shake: patch.shake, preserve: false, shiny: false,
    chain: { ...chain, fromPatch: true, shake: patch.shake },
  }
}

/**
 * 조우표에서 뽑은 뒤 사슬이 어떻게 되는가 (`CreateWildMon_FromRadarNoChain`).
 *
 * 셋 중 하나다 — 처음이면 그 종으로 **묶고**, 같은 종이면 **잇고**, 다른 종이면
 * **끊는다.** 끊긴 자리에서는 방금 뽑은 종이 그대로 나온다
 */
export function lockSpecies(
  chain: RadarChain, rolled: { species: number, level: number },
): { chain: RadarChain, species: number, level: number } {
  if (chain.species === 0) {
    return {
      chain: { ...chain, species: rolled.species, level: rolled.level, count: incrementChain(chain.count) },
      ...rolled,
    }
  }
  if (rolled.species === chain.species) {
    return {
      chain: { ...chain, count: incrementChain(chain.count) },
      species: chain.species, level: chain.level,
    }
  }
  return { chain: clearChain(), ...rolled }
}

/**
 * 강하게 흔들린 자리의 조우표 (`TryGenerateGrassEncounter_WithRadar`).
 *
 * 칸 넷이 그 맵의 레이더 종으로 갈린다. **레벨은 안 바뀐다** — 원래 칸의
 * 레벨을 그대로 쓴다
 */
export const RADAR_SLOTS: readonly number[] = [4, 5, 10, 11]

/** 사슬 기록 한 줄 */
export interface RadarRecord {
  species: number
  count: number
}

/** 빈 기록 셋 */
export function newRadarRecords(): RadarRecord[] {
  return Array.from({ length: RADAR_RECORDS }, () => ({ species: 0, count: 0 }))
}

/**
 * 리포트에 남는 것 전부.
 *
 * ⚠️ **사슬은 안 남는다** — 원작도 `RadarChain`을 필드 쪽에 두고 리포트에는
 * 이 둘만 적는다
 */
export interface RadarState {
  charge: number
  records: RadarRecord[]
}

/**
 * 기록을 갱신한다 (`TryReplaceLowestChainRecord` + `GetLowestChainRecordSlot`).
 *
 * 빈 칸이 있으면 거기, 아니면 제일 낮은 칸을 밀어낸다. 그 칸보다 낮으면 안 쓴다
 */
export function updateRadarRecords(
  records: readonly RadarRecord[], species: number, count: number,
): RadarRecord[] {
  const out = records.map((r) => ({ ...r }))
  const empty = out.findIndex((r) => r.species === 0)
  const at = empty >= 0
    ? empty
    : out.reduce((low, r, i) => (r.count < out[low]!.count ? i : low), 0)
  if (out[at]!.count >= count) return out
  out[at] = { species, count }
  // 원작이 갱신할 때마다 다시 줄 세운다 (`RadarChainRecords_SortSavedRecords`)
  out.sort((a, b) => b.count - a.count)
  return out
}

/** 배터리를 한 걸음 채운다 (`RadarChargeStep`) — 가방에 레이더가 있을 때만 */
export function chargeStep(charge: number): number {
  return Math.min(charge + 1, RADAR_BATTERY_STEPS)
}

/** 지금 쓸 수 있는가. 아니면 몇 걸음 남았는지 알려 준다 */
export function radarReady(charge: number): boolean {
  return charge >= RADAR_BATTERY_STEPS
}

/** 다 안 찼을 때 대사가 쓰는 수 (`SCRIPT_DATA_PARAMETER_0`) */
export function stepsLeft(charge: number): number {
  return RADAR_BATTERY_STEPS - charge
}
