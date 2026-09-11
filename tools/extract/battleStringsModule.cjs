'use strict'
// 디컴프의 배틀 글 이름표 → src/import/platinum/battleStrings.ts
//
// 배틀이 여는 뱅크 셋의 줄에는 **줄마다 이름이 있다** — 디컴프 `res/text/*.json`의
// `id`다. 그 이름으로 「어느 효과가 어느 줄인가」를 짚을 수 있어야 화면이 적어 둔
// 번호를 검증할 수 있다.
//
// 셋을 한 파일로 내는 까닭은 셋 다 **배틀이 직접 여는 뱅크**라서다. 필드는
// 스크립트가 뱅크를 가리키는데 배틀은 `MessageLoader_Init`으로 제가 연다 —
// 위 화면이 `battle_strings`, 아래 화면이 `battle_bag`·`battle_party`다.
//
// ⚠️ **여기에는 롬에서 읽은 값이 하나도 없다.** `import/platinum/textBanks.ts`의
// `BANK_ORDER`와 같은 성격이다 — 디컴프가 붙인 **이름의 순서**뿐이고, 자리는
// 배열 인덱스다. 암호화 키도 항목 수도 안 적는다 (COPYRIGHT.md §6).
//
// 번호가 롬과 맞는다는 것은 이렇게 확인했다: 미국 롬에서 푼 글과 디컴프의 영어
// 원문을 통째로 맞대면 `battle_strings`는 글이 있는 1,256줄 중 **1,242줄이 완전
// 일치**하고(어긋난 열넷은 전부 같은 제어 부호를 디컴프가 `{YESNO}`, 우리
// 추출기가 `{SCREEN}`으로 적은 것뿐이다), 가방과 파티는 **어긋나는 줄이 없다**.
//
// ⚠️ **손으로 고치지 않는다.** `pnpm gen:battleStrings`가 이 파일을 다시 만든다.
const fs = require('fs')
const path = require('path')
const sources = require('../raw/sources.cjs')

const ROOT = path.resolve(__dirname, '../..')
const OUT = path.join(ROOT, 'src/import/platinum/battleStrings.ts')

/**
 * 배틀이 여는 뱅크 셋. 이름 앞가지가 뱅크마다 다르다.
 *
 * `us`는 미국 롬의 뱅크 번호다 — 산출물의 이름이 그 번호이므로(`dialogue.js`)
 * 화면이 뱅크를 부를 때 쓰는 값이 이것이고, 여기서는 주석에만 쓴다
 */
const BANKS = [
  {
    file: 'battle_strings', prefix: 'BattleStrings_Text_', us: 368,
    order: 'BATTLE_STRING_ORDER', at: 'battleMessage', what: '배틀 글',
  },
  {
    file: 'battle_bag', prefix: 'BattleBag_Text_', us: 2,
    order: 'BATTLE_BAG_ORDER', at: 'bagMessage', what: '배틀 안 가방',
  },
  {
    file: 'battle_party', prefix: 'BattleParty_Text_', us: 3,
    order: 'BATTLE_PARTY_ORDER', at: 'partyMessage', what: '배틀 안 파티',
  },
]

function main() {
  const decomp = sources.requireDir('references.decomp')
  const made = BANKS.map((bank) => {
    const data = JSON.parse(
      fs.readFileSync(path.join(decomp, 'res/text', `${bank.file}.json`), 'utf8'),
    )
    const ids = data.messages.map((m) => {
      const id = String(m.id ?? '')
      return id.startsWith(bank.prefix) ? id.slice(bank.prefix.length) : id
    })
    if (ids.length === 0) throw new Error(`${bank.file}의 이름이 하나도 없다`)

    // 이름이 겹치면 `indexOf`가 앞의 것을 집어 조용히 틀린다. 겹치면 터뜨린다
    const seen = new Map()
    for (const [i, id] of ids.entries()) {
      if (seen.has(id)) {
        throw new Error(`${bank.file}에 이름이 겹친다: ${id} (#${seen.get(id)} · #${i})`)
      }
      seen.set(id, i)
    }
    return { bank, ids }
  })

  fs.writeFileSync(OUT, render(made))
  const counts = made.map(({ bank, ids }) => `${bank.file} ${ids.length}`).join(' · ')
  console.log(`src/import/platinum/battleStrings.ts — ${counts}`)
}

/** 한 줄에 여러 이름을 담되 100칸을 안 넘긴다 — eslint의 줄 길이와 같은 자다 */
function pack(ids) {
  const out = []
  let line = ' '
  for (const id of ids) {
    const piece = ` '${id}',`
    if (line.length + piece.length > 99) { out.push(line); line = ' ' }
    line += piece
  }
  if (line.trim() !== '') out.push(line)
  return out.join('\n')
}

/** 뱅크 하나의 표와 그 표를 읽는 함수 */
function one({ bank, ids }) {
  return [
    `/** \`${bank.file}\` (us ${String(bank.us)}) 뱅크 안의 줄 순서. 자리가 곧 줄 번호다 */`,
    `export const ${bank.order}: readonly string[] = [`,
    pack(ids),
    ']',
    '',
    `const ${bank.at.toUpperCase()}_AT = new Map(${bank.order}.map((id, i) => [id, i]))`,
    '',
    '/**',
    ` * ${bank.what}의 이름 → 줄 번호. 없는 이름이면 던진다.`,
    ' *',
    ' * 조용히 -1을 내면 그 번호로 뱅크를 집었을 때 **뒤에서 세어** 엉뚱한 글이 뜬다',
    ' */',
    `export function ${bank.at}(name: string): number {`,
    `  const at = ${bank.at.toUpperCase()}_AT.get(name)`,
    `  if (at === undefined) throw new Error(\`${bank.what}에 그런 이름이 없다: \${name}\`)`,
    '  return at',
    '}',
  ].join('\n')
}

function render(made) {
  const banks = made
    .map(({ bank }) => `\`${bank.file}\` us ${String(bank.us)}`)
    .join(' · ')
  return [
    '// 배틀이 여는 뱅크 셋의 줄 이름 (DATA.md §2.11 · PARITY §2.24 · §2.26)',
    '//',
    `// ${banks} 세 뱅크의 줄 순서다. **자리 = 배열 인덱스**이고`,
    '// 이름은 디컴프 `res/text/*.json`의 `id`에서 뱅크별 앞가지를 뗀 것이다.',
    '//',
    '// ⚠️ **여기에는 롬에서 읽은 값이 하나도 없다** — `textBanks.ts`의 `BANK_ORDER`와',
    '// 같은 성격이다. 이름의 순서뿐이고, 그 순서가 곧 뱅크의 순서다 (COPYRIGHT.md §6).',
    '//',
    '// 쓰는 자리는 **시험 하나**다 (`ui/battle/romText.test.ts`). 화면이 읽는 번호는',
    '// `ui/battle/romText.ts`가 숫자로 들고 있고, 그 숫자가 여기 이름과 맞는지를',
    '// 그 시험이 잰다 — 그래서 이 표는 앱 묶음에 안 실린다.',
    '//',
    '// ⚠️ **손으로 고치지 않는다.** `pnpm gen:battleStrings`가 다시 만든다.',
    '',
    made.map(one).join('\n\n'),
  ].join('\n') + '\n'
}

main()
