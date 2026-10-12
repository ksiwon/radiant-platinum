/**
 * **게임 전체 판의 칸** (`docs/orders/JOURNEY_CELLS_20261011.md`).
 *
 * 새 게임 한 판이 배지 7까지만 4시간을 넘겼고, 한 자리가 서면 판 전체가 섰다
 * (2026-10-08 `journey-965c569-stuck`). 여섯 파트로 나눴다가(10-08) 하네스 하나 고칠 때마다
 * 파트를 처음부터 돌아 1~2.5시간씩 잃어(10-10 일곱 번) **열여섯 칸**으로 더 잘게 나눴다.
 * 앞 칸이 통과하며 남긴 끝 세이브가 다음 칸의 시작 세이브다.
 *
 * ⚠️ **열여섯 칸 전부 `journey.mjs` 하나가 돈다** (사용자 10-11). 칸 1~7은 journey 구간,
 * 칸 8~16은 깨어진 세계 · 리그 다리다 — 그 걸음(`badgesDW.mjs` · `badgesLeague.mjs`)을 journey가 부른다.
 *
 * ⚠️ **배지 칸의 경계는 관장을 이긴 마을의 센터에서 회복하고 나온 자리다.** 지금의
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
 * **어느 칸이든 도는 끝 점검** — ①첫 화면 · ⑬끝 리포트 · ⑭이어하기 · ⑮캔버스 · ⑯콘솔 · ⑨⑨.
 *
 * ⚠️ **번호로 자르면 안 된다.** 13~16은 번호로는 배지 1 앞이지만 판의 **끝**에서
 * 돈다. ⑬이 곧 그 칸의 끝 세이브이고, ⑭가 그 세이브로 정말 이어지는지를 잰다
 */
const END_CHECKS = ['01', '13', '14', '15', '16', '99']
const withEnd = (ids) => [...new Set([...ids, ...END_CHECKS])].sort()

/**
 * 칸 표.
 *
 * · 배지 칸(`kind: 'stops'`): `first` · `last`는 journey의 `AFTER_STOPS` id(두 자리 문자열 비교), `badges`는 끝에서 가져야 할
 *   배지 수, `center`는 경계에서 회복하는 센터 맵(`maps.json`의 `C0nPC0101`)
 * · 다리 칸(`kind: 'leg'`): `leg`는 `badgesDW` · `badgesLeague`의 다리 글자, `row`는 그 다리의 결과 줄, `candy`는 다리 앞에서
 *   맞추는 레벨(탐침 판들이 통과한 값 — P4 `HANDOFF_20260923` 78/76/76 · P5 `_league` 머리 주석 80/78/78)
 * · `budget`은 초 — 실측의 두 배(설계서 §5). 배지 칸 2~7은 90분 — 트레이너전을 진짜로 치르자 칸 3이
 *   60분에 연고 체육관 방 2에서 끊겼다(2026-10-13 · 30730a28 · 트레이너 17번)
 * · `cases`는 그 칸 봉투가 기대하는 결과 줄
 */
const stops = (n, what, first, last, badges, center, rows, budget) => [n, {
  n, kind: 'stops', what, first, last, badges, center, budget, cases: withEnd(rows),
}]
const leg = (n, what, letter, row, budget, candy = null) => [n, {
  n, kind: 'leg', what, leg: letter, row, budget, candy, cases: withEnd([row]),
}]
export const CELLS = Object.fromEntries([
  stops(1, '새 게임 → 배지 1', null, '11', 1, 48, range(1, 12), 3600),
  stops(2, '→ 배지 2', '18', '21', 2, 69, range(17, 22), 5400),
  stops(3, '→ 배지 3', '23', '30', 3, 101, range(23, 31), 5400),
  stops(4, '→ 배지 4', '32', '34', 4, 134, range(32, 35), 5400),
  stops(5, '창고 → 배지 5', '35', '37', 5, 123, range(36, 40), 5400),
  stops(6, '→ 배지 6', '38', '44', 6, 36, range(41, 49), 5400),
  stops(7, '강철섬 → 배지 7', '45', '49', 7, 168, range(50, 56), 5400),
  leg(8, '예지호수 장면', 'e', '61', 2700),
  leg(9, '갤럭시단 아지트 · 호수 셋', 'f', '62', 2700),
  leg(10, '창기둥 → 깨어진 세계 1F', 'g', '63', 2700),
  leg(11, '깨어진 세계 → 기라티나 방', 'h', '64', 5400, '78,76,76'),
  leg(12, '기라티나 → 송별의 샘', 'i', '65', 2700),
  leg(13, '배지 8', 'j', '71', 2700, '80,78,78'),
  leg(14, '승리의 길 → 리그 남 센터', 'k', '72', 2700),
  leg(15, '챔피언로드 → 리그 북 센터', 'l', '73', 2700),
  leg(16, '사천왕 · 난천 → 전당 → 이어하기', 'm', '74', 5400),
])
export const CELL_COUNT = Object.keys(CELLS).length

export const partSave = (n) => resolve(PARTS_DIR, `cell-${String(n)}.rpsave`)
export const partMemory = (n) => resolve(PARTS_DIR, `cell-${String(n)}.memory.json`)
export const partEnvelope = (n) => resolve(PARTS_DIR, `cell-${String(n)}.json`)

export const fileDigest = (file) => (existsSync(file)
  ? createHash('sha256').update(readFileSync(file)).digest('hex').slice(0, 16) : null)

/**
 * 칸 N의 시작점을 정한다.
 *
 * 기본은 **앞 칸의 끝 세이브**다. `--save`로 다른 세이브를 주면 그 판은 진단이다.
 * 앞 칸 봉투가 적은 끝 세이브 다이제스트와 지금 파일이 다르면 그것도 진단이다 —
 * 연쇄 판정(`parts-check.mjs`)이 다시 맞대 보므로 여기서는 이유만 적는다
 */
export function partStart(n, saveFlag = null) {
  if (n === 1) return { ok: true, save: null, memory: null, at: null, diagnostic: saveFlag !== null, why: [] }
  const why = []
  const save = saveFlag !== null ? resolve(ROOT, saveFlag) : partSave(n - 1)
  if (!existsSync(save)) return { ok: false, why: [`시작 세이브가 없다 (${save}) — 칸 ${String(n - 1)}을 먼저 돈다`] }
  if (saveFlag !== null) why.push(`시작 세이브를 손으로 줬다 (${saveFlag})`)
  const memFile = saveFlag !== null ? save.replace(/\.rpsave$/, '.memory.json') : partMemory(n - 1)
  const mem = existsSync(memFile) ? JSON.parse(readFileSync(memFile, 'utf8')) : null
  if (mem === null) why.push(`하네스 기억이 없다 (${memFile})`)
  const prev = existsSync(partEnvelope(n - 1)) ? JSON.parse(readFileSync(partEnvelope(n - 1), 'utf8')) : null
  const digest = fileDigest(save)
  if (saveFlag === null) {
    if (prev === null) why.push(`칸 ${String(n - 1)} 봉투가 없다`)
    else if (prev.part?.endSaveDigest !== digest) why.push(`칸 ${String(n - 1)} 봉투의 끝 세이브와 다르다`)
    else if (prev.part?.ok !== true) why.push(`칸 ${String(n - 1)}이 통과하지 않았다`)
  }
  return {
    ok: true, save, digest, memory: mem?.memory ?? null, at: mem?.at ?? null,
    prevSource: prev?.sourceDigest ?? null, prevData: prev?.dataDigest ?? null, prevHarness: prev?.harnessDigest ?? null,
    diagnostic: why.length > 0, why,
  }
}

/** 칸 끝: 세이브를 칸 자리로 옮기고 하네스 기억을 옆에 적는다 */
export function keepPartEnd(n, fromFile, memory, at) {
  mkdirSync(PARTS_DIR, { recursive: true })
  copyFileSync(fromFile, partSave(n))
  writeFileSync(partMemory(n), `${JSON.stringify({ memory, at }, null, 1)}\n`)
  return fileDigest(partSave(n))
}
