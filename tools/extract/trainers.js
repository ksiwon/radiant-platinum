// 트레이너 추출 (DATA.md §2.9)
//
//   /poketool/trainer/trdata.narc   928 × 20B  분류·AI 플래그·가방·더블 여부
//   /poketool/trainer/trpoke.narc   928 × 가변  파티 1~6마리
//
// **포맷은 크기 합으로 확정했다.** trpoke 항목 크기는 trdata의 `type` 플래그와
// 파티 인원에서 정확히 계산되고, 928개 중 927개가 한 바이트도 안 틀린다(나머지
// 하나는 파티가 0인 0번 자리표시자다). 플래그 비트를 반대로 읽는 가설은 203건,
// 꼬리 2B가 없다는 가설은 531건에서 깨진다 — 그래서 이 배치가 유일하다.
'use strict'
const { openRom, openText, writeJson, LOCALES } = require('./rom')

const TRDATA_SIZE = 20
const COUNT = 928

/** trdata `type` 비트. 실측으로 정한 것이다 — 반대로 읽으면 크기가 안 맞는다 */
const HAS_MOVES = 1
const HAS_ITEM = 2

/**
 * 개체 하나의 바이트 수.
 *
 * 기본 6B(개체값·특성바이트·레벨·종족) + 도구 2B + 기술 8B + 꼬리 2B.
 * 꼬리는 볼 캡슐 씰이다 — 플래티넘에서 추가된 자리라 DP 문서를 그대로 쓰면 어긋난다
 */
function monSize(type) {
  return 6 + (type & HAS_MOVES ? 8 : 0) + (type & HAS_ITEM ? 2 : 0) + 2
}

/**
 * 종족 필드는 폼을 같이 담는다. **하위 10비트가 종족, 나머지가 폼이다.**
 *
 * 11비트로 끊는 가설도 종족값 자체는 맞게 나오지만, 그러면 트레이너 203이 데리고
 * 있는 도롱충이 두 마리가 "폼 0의 1436번"과 "폼 1의 412번"이 되어 서로 다른 종이
 * 된다. 10비트로 끊으면 같은 412번의 폼 1·2가 되고, 그게 원작이다
 */
const SPECIES_MASK = 0x3ff
const FORM_SHIFT = 10

function parseParty(buf, type, count) {
  const size = monSize(type)
  const party = []
  for (let i = 0; i < count; i++) {
    const o = i * size
    const raw = buf.readUInt16LE(o + 4)
    const mon = {
      /** 난이도 바이트 0~255. 실제 개체값은 `ivs × 31 / 255`다 */
      ivs: buf[o],
      level: buf.readUInt16LE(o + 2),
      species: raw & SPECIES_MASK,
      /** 지정된 기술. 비어 있으면 그 레벨의 레벨업 기술을 쓴다 */
      moves: [],
    }
    const form = raw >> FORM_SHIFT
    if (form) mon.form = form
    if (type & HAS_ITEM) {
      const item = buf.readUInt16LE(o + 6)
      if (item) mon.item = item
    }
    if (type & HAS_MOVES) {
      const base = o + 6 + (type & HAS_ITEM ? 2 : 0)
      mon.moves = [0, 1, 2, 3].map((j) => buf.readUInt16LE(base + j * 2)).filter((m) => m !== 0)
    }
    const seal = buf.readUInt16LE(o + size - 2)
    if (seal) mon.seal = seal
    // 1878마리 중 딱 하나(전진의 에레키블)만 0이 아니다. 무슨 뜻인지 모르므로
    // 값을 보존만 한다 — 버리면 나중에 알아낼 방법이 없어진다
    if (buf[o + 1]) mon.unknown1 = buf[o + 1]
    party.push(mon)
  }
  return party
}

function extractTrainers(rom, text) {
  const trdata = rom.narc('/poketool/trainer/trdata.narc')
  const trpoke = rom.narc('/poketool/trainer/trpoke.narc')
  if (trdata.length !== COUNT || trpoke.length !== COUNT) {
    throw new Error(`트레이너 개수 ${trdata.length}/${trpoke.length} ≠ ${COUNT}`)
  }

  const trainers = []
  const sizeMismatch = []
  for (let id = 0; id < COUNT; id++) {
    const d = trdata[id]
    if (d.length !== TRDATA_SIZE) throw new Error(`trdata #${id} 크기 ${d.length}`)
    const type = d[0]
    const count = d[3]

    // 크기 합 검증. 여기가 어긋나면 배치 가정이 깨진 것이므로 조용히 넘어가면 안 된다.
    // NARC는 4바이트 경계로 패딩하므로 올림해서 비교한다.
    // **파싱보다 먼저 한다** — 배치가 틀리면 파싱이 버퍼 밖을 읽고 터져서
    // "왜 틀렸는지"가 안 보이는 예외로 바뀐다
    const want = (monSize(type) * count + 3) & ~3
    if (want > trpoke[id].length) {
      throw new Error(`trpoke #${id} 배치 불일치: 예상 ${want} > 실제 ${trpoke[id].length} — ` +
        '개체 크기 계산이 틀렸다')
    }
    if (want !== trpoke[id].length) sizeMismatch.push(`#${id} 예상 ${want} 실제 ${trpoke[id].length}`)

    trainers.push({
      id,
      class: d[1],
      /** 4세대 AI 비트. 실제로 쓰이는 값은 아홉 가지뿐이다 */
      ai: d.readUInt32LE(0x0c),
      /** 트레이너가 배틀 중에 쓰는 가방 도구 4칸 */
      items: [0, 2, 4, 6].map((o) => d.readUInt16LE(4 + o)).filter((v) => v !== 0),
      double: d.readUInt32LE(0x10) !== 0,
      party: parseParty(trpoke[id], type, count),
    })
  }

  // 0번은 파티가 0인 자리표시자인데 NARC가 4바이트를 못 줄여서 8바이트가 잡힌다
  const real = sizeMismatch.filter((m) => !m.startsWith('#0 '))
  if (real.length) throw new Error(`trpoke 크기 불일치 ${real.length}건: ${real.slice(0, 5).join(' / ')}`)

  const names = {}
  const classes = {}
  for (const loc of LOCALES) {
    // 영어 트레이너 이름 뱅크는 미국 롬에서 비어 있다 (DATA.md §2.9). 빈 배열이
    // 아니라 빈 문자열로 채워 두면 화면이 "이름 없음"으로 조용히 넘어간다
    names[loc] = text.bank('trainer_names', loc)
    classes[loc] = text.bank('trainer_classes', loc)
  }
  return { trainers, names, classes, sizeMismatch }
}

function main() {
  const romPath = process.argv.find((a) => a.startsWith('--rom='))?.slice(6)
  const rom = openRom(romPath)
  const text = openText()
  const { trainers, names, classes, sizeMismatch } = extractTrainers(rom, text)

  const out = writeJson('trainers.json', { count: trainers.length, trainers })
  console.log(`trainers: ${trainers.length}명 → ${out.rel} (${out.kb}KB)`)
  console.log(`  크기 합 검증: 불일치 ${sizeMismatch.length}건 ${sizeMismatch.join(' ')}`)

  for (const loc of LOCALES) {
    const n = writeJson(`names/trainers.${loc}.json`, names[loc])
    const c = writeJson(`names/trainerClasses.${loc}.json`, classes[loc])
    const filled = names[loc].filter((s) => s && s !== '{TRNAME-9bit}').length
    console.log(`  이름/${loc}: 트레이너 ${filled}/${names[loc].length} (${n.kb}KB) · ` +
      `분류 ${classes[loc].length} (${c.kb}KB)`)
  }

  const mons = trainers.flatMap((t) => t.party)
  console.log(`  개체 ${mons.length}마리 · 레벨 ${Math.min(...mons.map((m) => m.level))}~` +
    `${Math.max(...mons.map((m) => m.level))} · 폼 지정 ${mons.filter((m) => m.form).length}마리`)

  const ai = new Map()
  for (const t of trainers) ai.set(t.ai, (ai.get(t.ai) ?? 0) + 1)
  console.log(`  AI 플래그: ${[...ai].sort((a, b) => b[1] - a[1])
    .map(([v, c]) => `0x${v.toString(16)}×${c}`).join(' ')}`)
  console.log(`  더블 배틀 ${trainers.filter((t) => t.double).length}명 · ` +
    `지정 기술 ${trainers.filter((t) => t.party.some((m) => m.moves.length)).length}명`)

  // 원작 대조 — 강석(#250)은 자철석37/강철톤38/바리톱스41이다. 어긋나면 배치가 틀렸다
  const byron = trainers[250]
  console.log(`  검증 #250 ${names.ko[250]}(${classes.ko[byron.class]}): ` +
    byron.party.map((m) => `#${m.species} L${m.level}${m.item ? ` 도구${m.item}` : ''}`).join(' / ') +
    ` | AI 0x${byron.ai.toString(16)}`)
}

if (require.main === module) main()
module.exports = { extractTrainers, monSize, parseParty, HAS_MOVES, HAS_ITEM }
