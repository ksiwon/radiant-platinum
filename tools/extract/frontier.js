// 배틀프런티어 개체·트레이너 추출 (DATA.md §2.24 · PARITY §9.3)
//
//   /battle/b_pl_tower/pl_btdpm.narc   951 × 16B  빌리는 개체의 「형」
//   /battle/b_pl_tower/pl_btdtr.narc   315 × 가변  트레이너 분류와 세트 번호
//
// **둘 다 크기가 스스로를 증명한다.** 개체 쪽은 951칸이 전부 정확히 16바이트라
// `FrontierPokemonBase`(종족2 + 기술8 + 노력치플래그1 + 성격1 + 도구2 + 폼2)와
// 한 바이트도 안 남는다. 트레이너 쪽은 앞 4바이트가 분류·세트수고 뒤가 세트
// 번호 배열이라 `4 + 2×세트수`가 파일 크기와 315/315 맞는다.
//
// ⚠️ **배틀팩토리는 트레이너의 세트 번호를 안 쓴다.** 팩토리에서 상대가 데리고
// 나오는 것은 트레이너 소유가 아니라 **빌리는 것과 같은 표에서 그 자리에서
// 뽑은 것**이다 (`ov104_0223AB0C`). 세트 번호는 배틀타워가 읽는다 — 지금 안
// 쓰지만 표의 나머지 절반을 버리면 나중에 다시 뽑아야 하므로 같이 굽는다.
//
// 이름과 대사는 여기 없다. 뱅크 21(이름 315)·614(대사 945 = 315×3)에 있고
// `pnpm extract:dialogue`가 굽는다
'use strict'
const { openRom, writeJson } = require('./rom')

const MON_PATH = '/battle/b_pl_tower/pl_btdpm.narc'
const TRAINER_PATH = '/battle/b_pl_tower/pl_btdtr.narc'

/** `FrontierPokemonBase` — 종족2 + 기술 4×2 + 노력치1 + 성격1 + 도구2 + 폼2 */
const MON_SIZE = 16
const MON_COUNT = 951
const TRAINER_COUNT = 315

/**
 * 개체의 「형」 하나.
 *
 * ⚠️ **개체값도 노력치도 여기 없다.** 개체값은 뽑는 쪽의 층이 정하고(0·4·8…31을
 * 여섯 능력에 똑같이), 노력치는 `evFlags`가 켠 능력에 **510을 나눠** 넣는다
 * (`FrontierPokemon_Init`). 그래서 이 표만으로는 능력치가 안 나온다
 */
function parseMon(buf) {
  const moves = []
  for (let i = 0; i < 4; i++) {
    const m = buf.readUInt16LE(2 + i * 2)
    if (m) moves.push(m)
  }
  const mon = {
    species: buf.readUInt16LE(0),
    moves,
    /** 노력치를 넣을 능력 비트 (HP·공격·방어·스피드·특공·특방 차례) */
    evFlags: buf[10],
    nature: buf[11],
  }
  const item = buf.readUInt16LE(12)
  if (item) mon.item = item
  const form = buf.readUInt16LE(14)
  if (form) mon.form = form
  return mon
}

/** `FrontierTrainerBase` — 분류2 + 세트수2 + 세트번호 2×n */
function parseTrainer(buf) {
  const type = buf.readUInt16LE(0)
  const count = buf.readUInt16LE(2)
  const sets = []
  for (let i = 0; i < count; i++) sets.push(buf.readUInt16LE(4 + i * 2))
  return { type, sets }
}

function extractFrontier(rom = openRom()) {
  const monNarc = rom.narc(MON_PATH)
  const trNarc = rom.narc(TRAINER_PATH)
  if (monNarc.length !== MON_COUNT) throw new Error(`개체 표가 ${monNarc.length}칸이다 — ${MON_COUNT}이어야 한다`)
  if (trNarc.length !== TRAINER_COUNT) throw new Error(`트레이너 표가 ${trNarc.length}칸이다 — ${TRAINER_COUNT}이어야 한다`)

  const sets = monNarc.map((f, i) => {
    if (f.length !== MON_SIZE) throw new Error(`개체 ${i}가 ${f.length}바이트다 — ${MON_SIZE}이어야 한다`)
    return parseMon(f)
  })
  const trainers = trNarc.map((f, i) => {
    const t = parseTrainer(f)
    // 크기가 배치를 증명한다. 어긋나면 앞 4바이트를 잘못 읽은 것이다.
    // ⚠️ **세트 수가 홀수면 뒤에 2바이트가 남는다** — NARC이 항목을 4바이트에
    // 맞추기 때문이다. 315칸 중 93칸이 그렇고, 전부 홀수 쪽이다
    const want = 4 + t.sets.length * 2
    if (f.length !== want + (want % 4 === 0 ? 0 : 2)) {
      throw new Error(`트레이너 ${i}: 세트 ${t.sets.length}개인데 파일이 ${f.length}바이트다`)
    }
    return t
  })
  return { count: sets.length, sets, trainers }
}

function main() {
  const data = extractFrontier()
  const { kb } = writeJson('frontier.json', data)

  const species = new Set(data.sets.map((m) => m.species))
  const held = data.sets.filter((m) => m.item).length
  const forms = data.sets.filter((m) => m.form).length
  console.log(`frontier.json (${kb}KB)`)
  console.log(`  개체 형 ${data.sets.length} · 종족 ${species.size}가지 · 도구 지님 ${held} · 폼 지정 ${forms}`)
  const moveCounts = new Map()
  for (const m of data.sets) moveCounts.set(m.moves.length, (moveCounts.get(m.moves.length) ?? 0) + 1)
  console.log(`  기술 수: ${[...moveCounts].sort((a, b) => a[0] - b[0]).map(([n, c]) => `${n}개×${c}`).join(' ')}`)

  const setCounts = data.trainers.map((t) => t.sets.length)
  console.log(`  트레이너 ${data.trainers.length} · 분류 ${new Set(data.trainers.map((t) => t.type)).size}가지 · ` +
    `세트 ${Math.min(...setCounts)}~${Math.max(...setCounts)}개`)

  // 팩토리가 뽑는 자리 — 시설장 소튼은 309(은)·310(금)이고 세트를 안 가진다
  const thorton = [309, 310].map((i) => `${i}:분류${data.trainers[i].type}/세트${data.trainers[i].sets.length}`)
  console.log(`  검증 소튼 ${thorton.join(' ')}`)
}

if (require.main === module) main()
module.exports = { extractFrontier, parseMon, parseTrainer, MON_COUNT, TRAINER_COUNT }
