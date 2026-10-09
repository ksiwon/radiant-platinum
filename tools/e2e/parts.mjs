/**
 * **게임 전체 판의 파트** (`docs/orders/JOURNEY_PARTS_20261008.md`).
 *
 * 새 게임 한 판이 배지 7까지만 4시간을 넘겼고, 한 자리가 서면 판 전체가 섰다
 * (2026-10-08 `journey-965c569-stuck`). 그래서 여섯 파트로 나눠 돈다 —
 * 앞 파트가 통과하며 남긴 끝 세이브가 다음 파트의 시작 세이브다.
 *
 * 여기 있는 것은 journey가 도는 P1~P3이다. P4 · P5는 `_dw` · `_league`를 올린다 — 그 줄 번호는 `partProbe.mjs`의 `PROBE_PARTS`.
 *
 * ⚠️ **경계는 관장을 이긴 마을의 센터에서 회복하고 나온 자리다.** 지금의
 * `seg-NN.rpsave`는 그 구간에 닿자마자 쓰므로 관장 앞이다 — 체육관 안에서
 * 이어 달리면 물 높이 · 샌드백처럼 세이브 밖의 상태를 몰라 출구에서 선다
 * (2026-10-08 `journey-90756e4-from37`: 들판 체육관 (10,3)에서 제자리)
 */
import { existsSync, readFileSync, writeFileSync, mkdirSync, copyFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
export const PARTS_DIR = resolve(ROOT, '.audit/parts')

const range = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => String(a + i).padStart(2, '0'))
/**
 * **어느 파트든 도는 끝 점검** — ①첫 화면 · ⑬끝 리포트 · ⑭이어하기 · ⑮캔버스 · ⑯콘솔 · ⑨⑨.
 *
 * ⚠️ **번호로 자르면 안 된다.** 13~16은 번호로는 배지 1 앞이지만 판의 **끝**에서
 * 돈다. ⑬이 곧 그 파트의 끝 세이브이고, ⑭가 그 세이브로 정말 이어지는지를 잰다
 */
const END_CHECKS = ['01', '13', '14', '15', '16', '99']

/**
 * 파트 표. `first` · `last`는 journey의 `AFTER_STOPS` id다(두 자리 문자열 비교).
 * `badges`는 끝에서 가져야 할 배지 수, `center`는 경계에서 회복하는 센터 맵이다.
 * `cases`는 그 파트 봉투가 기대하는 결과 줄이다 — 정본(`evidence.mjs`의 `JOURNEY_CASES`)의 부분집합
 */
export const JOURNEY_PARTS = {
  1: {
    what: '새 게임 → 배지 2', first: null, last: '21', badges: 2, center: 69,
    cases: [...new Set([...range(1, 12), ...range(17, 22), ...END_CHECKS])].sort(),
  },
  2: {
    what: '배지 2 뒤 → 배지 5', first: '23', last: '37', badges: 5, center: 123,
    cases: [...new Set([...range(23, 40), ...END_CHECKS])].sort(),
  },
  3: {
    what: '배지 5 뒤 → 배지 7', first: '38', last: '49', badges: 7, center: 168,
    cases: [...new Set([...range(41, 56), ...END_CHECKS])].sort(),
  },
}

export const partSave = (n) => resolve(PARTS_DIR, `part-${String(n)}.rpsave`)
export const partMemory = (n) => resolve(PARTS_DIR, `part-${String(n)}.memory.json`)
export const partEnvelope = (n) => resolve(PARTS_DIR, `part-${String(n)}.json`)

export const fileDigest = (file) => (existsSync(file)
  ? createHash('sha256').update(readFileSync(file)).digest('hex').slice(0, 16) : null)

/**
 * 파트 N의 시작점을 정한다.
 *
 * 기본은 **앞 파트의 끝 세이브**다. `--save`로 다른 세이브를 주면 그 판은 진단이다.
 * 앞 파트 봉투가 적은 끝 세이브 다이제스트와 지금 파일이 다르면 그것도 진단이다 —
 * 연쇄 판정(`parts-check.mjs`)이 다시 맞대 보므로 여기서는 이유만 적는다
 */
export function partStart(n, saveFlag = null) {
  if (n === 1) return { ok: true, save: null, memory: null, at: null, diagnostic: saveFlag !== null, why: [] }
  const why = []
  const save = saveFlag !== null ? resolve(ROOT, saveFlag) : partSave(n - 1)
  if (!existsSync(save)) return { ok: false, why: [`시작 세이브가 없다 (${save}) — 파트 ${String(n - 1)}을 먼저 돈다`] }
  if (saveFlag !== null) why.push(`시작 세이브를 손으로 줬다 (${saveFlag})`)
  const memFile = saveFlag !== null ? save.replace(/\.rpsave$/, '.memory.json') : partMemory(n - 1)
  const mem = existsSync(memFile) ? JSON.parse(readFileSync(memFile, 'utf8')) : null
  if (mem === null) why.push(`하네스 기억이 없다 (${memFile})`)
  const prev = existsSync(partEnvelope(n - 1)) ? JSON.parse(readFileSync(partEnvelope(n - 1), 'utf8')) : null
  const digest = fileDigest(save)
  if (saveFlag === null) {
    if (prev === null) why.push(`파트 ${String(n - 1)} 봉투가 없다`)
    else if (prev.part?.endSaveDigest !== digest) why.push(`파트 ${String(n - 1)} 봉투의 끝 세이브와 다르다`)
    else if (prev.part?.ok !== true) why.push(`파트 ${String(n - 1)}이 통과하지 않았다`)
  }
  return {
    ok: true, save, digest, memory: mem?.memory ?? null, at: mem?.at ?? null,
    prevSource: prev?.sourceDigest ?? null, prevData: prev?.dataDigest ?? null,
    diagnostic: why.length > 0, why,
  }
}

/** 파트 끝: 세이브를 파트 자리로 옮기고 하네스 기억을 옆에 적는다 */
export function keepPartEnd(n, fromFile, memory, at) {
  mkdirSync(PARTS_DIR, { recursive: true })
  copyFileSync(fromFile, partSave(n))
  writeFileSync(partMemory(n), `${JSON.stringify({ memory, at }, null, 1)}\n`)
  return fileDigest(partSave(n))
}
