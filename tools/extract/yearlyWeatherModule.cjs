'use strict'
// 연간 날씨 표 366일 × 5곳 → src/engine/world/yearlyWeather.ts (PARITY §8.3)
//
//     pnpm gen:yearlyWeather
//
// ⚠️ **왜 소스에 굽는가.** 이 표는 롬 자료가 아니라 **코드 안의 표**다
// (`field_overworld_weather.c`의 `sYearlyWeather`). 맵 헤더의 날씨 32~36은 날씨가
// 아니라 이 표의 열 번호이고, 어느 날 무엇이 걸리는가는 어디에도 안 적혀 있다.
//
// ⚠️ **여기 담기는 것은 날씨 번호뿐이다.** 이름도 글도 한 바이트도 안 담는다.
//
// ⚠️ **손으로 고치지 않는다.** 고칠 곳은 디컴프이고 이 스크립트가 다시 만든다.
const fs = require('node:fs')
const path = require('node:path')

const { ROOT, requireDir } = require('../raw/sources.cjs')
const DECOMP = requireDir('references.decomp')
const OUT = path.join(ROOT, 'src/engine/world/yearlyWeather.ts')

const read = (p) => fs.readFileSync(path.join(DECOMP, p), 'utf8')

function main() {
  // 날씨 이름 → 번호 (`constants/overworld_weather.h`)
  const weather = new Map()
  for (const m of read('include/constants/overworld_weather.h')
    .matchAll(/#define (OVERWORLD_WEATHER_\w+)\s+(\d+)\s*$/gm)) {
    weather.set(m[1], Number(m[2]))
  }

  const src = read('src/field_overworld_weather.c')
  const table = src.match(/sYearlyWeather\[DAY_OF_YEAR_COUNT\]\[OVERWORLD_WEATHER_YEARLY_COUNT\] = \{([\s\S]*?)\n\};/)
  if (table === null) throw new Error('sYearlyWeather를 못 찾았다')

  const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC']
  // 윤년 달력 — 표는 29일이 든 해로 짠다 (`FieldSystem_GetWeather`가 평년의 3월 이후를 하루 민다)
  const LENGTH = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]

  const rows = []
  for (const m of table[1].matchAll(/\[DAY_OF_YEAR_(\w{3})_(\d\d) - 1\]\s*=\s*\{([^}]*)\}/g)) {
    const month = MONTHS.indexOf(m[1])
    const day = Number(m[2])
    const expected = LENGTH.slice(0, month).reduce((a, b) => a + b, 0) + day - 1
    if (month < 0 || expected !== rows.length) {
      throw new Error(`${m[1]}_${m[2]} 줄이 ${String(rows.length)}번째 자리에 있다 — ${String(expected)}여야 한다`)
    }
    const cols = m[3].split(',').map((x) => x.trim()).filter((x) => x !== '').map((name) => {
      const v = weather.get(name)
      if (v === undefined) throw new Error(`모르는 날씨: ${name}`)
      return v
    })
    if (cols.length !== 5) throw new Error(`${m[1]}_${m[2]}의 칸이 ${String(cols.length)}개다 — 5여야 한다`)
    rows.push(cols)
  }
  if (rows.length !== 366) throw new Error(`${String(rows.length)}일이다 — 366이어야 한다`)

  const out = `// 연간 날씨 표 366일 × 5곳 (PARITY §8.3 · \`sYearlyWeather\`)
//
// 맵 헤더의 날씨 32~36은 날씨가 아니라 이 표의 **열 번호**다 — 212번도로 남쪽·213번도로·
// 216번도로·아큐티 호반·눈설시티. 어느 날 무엇이 걸리는가가 이 표에 있다
// (\`FieldSystem_GetWeather\`).
//
// ⚠️ **손으로 고치지 않는다** — \`pnpm gen:yearlyWeather\`가 디컴프에서 다시 만든다
// (\`tools/extract/yearlyWeatherModule.cjs\`).
//
// ⚠️ **윤년 달력이다.** 2월 29일이 든 해로 짠 표라서 평년의 3월 이후는 하루를 밀어
// 읽는다 (\`resolveHeaderWeather\`).

/** 행은 1월 1일부터 12월 31일까지(윤년 기준), 열은 \`헤더 날씨 − 32\`. 값은 \`constants/overworld_weather.h\`의 번호 */
export const YEARLY_WEATHER: readonly (readonly [number, number, number, number, number])[] = [
${rows.map((r) => `  [${r.join(', ')}],`).join('\n')}
]
`
  fs.writeFileSync(OUT, out)
  console.log(`${path.relative(ROOT, OUT)} — ${rows.length}일 × 5곳`)
}

main()
