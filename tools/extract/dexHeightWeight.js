// 도감의 키 · 몸무게 표와 키 비교 화면의 자리 · 배율 (`pokedex_heightweight.c` · `zukan_data.narc`)
//
//   /application/zukanlist/zkn_data/zukan_data.narc       58칸. 0~10을 읽는다 (11 이후는 도감 글과 서식지)
//   /application/zukanlist/zkn_data/zukan_data_gira.narc  같은 모양 — **기라티나 어나더폼용** (`Pokedex_SetupGiratina(0)`이 이쪽을 연다)
//
//     0 키 `int[494]` — **데시미터** (이상해씨 7 = 0.7m)       1 몸무게 `int[494]` — **헥토그램** (이상해씨 69 = 6.9kg)
//     3 · 4 여자 주인공 · 포켓몬 **배율** `short[494]`            5 · 6 남자 주인공 · 포켓몬 배율
//     7 · 8 여자 주인공 · 포켓몬 **세로 자리** `short[494]`       9 · 10 남자 주인공 · 포켓몬 세로 자리
//   (`Pokedex_Comparison_{Pos,Scale}_{M,F}_Array` — `pokedex_heightweight.c:112-153`)
//
// 하나를 굽는다 (`public/data/dexHeightWeight.json`):
//
//   { count, height[], weight[], male:{trainerScale[],pokemonScale[],trainerPos[],pokemonPos[]}, female:{…}, giratinaAltered:{…} }
//
// 쓰는 법 (`pokedex_height_check.c`):
//   · 자리 — 그림 가운데 y는 `88 + 자리`(주인공은 x 168 · 포켓몬은 x 88). `:383` `:480`
//   · 배율 — **배율값 256이 1배**다. 그림 배율 = `256 / 값` (`SetTrainerScale` · `SetSpeciesScale` `:515` `:525`). 값이 클수록 그림이 작다
//   · 성별은 주인공 성별이다 (`PokedexSort_TrainerGender`) — 남자는 5 · 6 · 9 · 10, 여자는 3 · 4 · 7 · 8
//
// ⚠️ **기라티나는 표가 둘이다.** 기본 표(`zukan_data`)는 오리진폼(6.9m · 650.0kg)이고 `zukan_data_gira`는 어나더폼(4.5m · 750.0kg)이다.
// 두 표는 487번 한 칸만 다르다 — 이 굽기가 그것을 확인하고 `giratinaAltered`에 그 한 칸만 싣는다.
//
// ⚠️ **키 글은 종족 자료(`species.json`)와 다르다** (PARITY 7.13) — 도감이 보이는 키 · 몸무게는 이 표고 글은 `speciesHeight` 뱅크다.
//
// ⚠️ **0~10칸은 세 지역판이 바이트까지 같다** — 한 벌이다.
//
// ⚠️ **`src/import/platinum/dexHeightWeight.ts`와 한 줄씩 같아야 한다.**
'use strict'
const { openRom, writeJson } = require('./rom')

const BASE = '/application/zukanlist/zkn_data/zukan_data.narc'
const GIRA = '/application/zukanlist/zkn_data/zukan_data_gira.narc'
const MEMBERS = 58
const COUNT = 494
const GIRATINA = 487

const ints = (b) => Array.from({ length: COUNT }, (_, i) => b.readInt32LE(i * 4))
const shorts = (b) => Array.from({ length: COUNT }, (_, i) => b.readInt16LE(i * 2))

/** 한 NARC의 열한 칸 */
function table(narc) {
  if (narc.length !== MEMBERS) throw new Error(`zukan_data가 ${narc.length}칸이다 — ${MEMBERS}칸이라야 한다`)
  if (narc[0].length !== COUNT * 4 || narc[1].length !== COUNT * 4) throw new Error('키 · 몸무게 표가 494칸이 아니다')
  for (const m of [3, 4, 5, 6, 7, 8, 9, 10]) {
    if (narc[m].length !== COUNT * 2) throw new Error(`${m}번 칸이 494칸이 아니다`)
  }
  return {
    height: ints(narc[0]), weight: ints(narc[1]),
    male: { trainerScale: shorts(narc[5]), pokemonScale: shorts(narc[6]), trainerPos: shorts(narc[9]), pokemonPos: shorts(narc[10]) },
    female: { trainerScale: shorts(narc[3]), pokemonScale: shorts(narc[4]), trainerPos: shorts(narc[7]), pokemonPos: shorts(narc[8]) },
  }
}

/** 두 표의 한 종 — 다른 종이 있으면 던진다 */
function altered(base, gira) {
  const at = (t, i) => ({
    height: t.height[i], weight: t.weight[i],
    male: Object.fromEntries(Object.entries(t.male).map(([k, v]) => [k, v[i]])),
    female: Object.fromEntries(Object.entries(t.female).map(([k, v]) => [k, v[i]])),
  })
  for (let i = 0; i < COUNT; i++) {
    if (i !== GIRATINA && JSON.stringify(at(base, i)) !== JSON.stringify(at(gira, i))) {
      throw new Error(`기라티나 표가 ${i}번도 다르다 — 한 칸만 싣는 가정이 깨졌다`)
    }
  }
  return at(gira, GIRATINA)
}

function main() {
  const rom = openRom()
  const base = table(rom.narc(BASE))
  const gira = table(rom.narc(GIRA))
  const meta = writeJson('dexHeightWeight.json', {
    count: COUNT, ...base, giratinaAltered: altered(base, gira),
  })
  console.log(`도감 키·몸무게 — ${COUNT}칸 · 기라티나 어나더 ${base.height[GIRATINA]} → ${gira.height[GIRATINA]} · ${meta.kb}KB`)
}

main()
