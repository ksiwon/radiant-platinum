// 세 지역판 롬으로 **모든 그룹을 실제로 변환한다** — 따로 부를 때만 돈다
//
//   pnpm verify:locales
//
// ⚠️ **`pnpm check`에 안 넣는다.** 롬 셋을 통째로 훑고 700MB씩 세 번 만든다 —
// 십 분 단위로 걸리는 일이라 매 검사에 얹으면 아무도 검사를 안 돌린다.
// 대신 자리표(`localePaths.test.ts`)가 싼 값으로 같은 함정을 지킨다.
//
// ⚠️ **자리만 맞는지 보는 시험이 아니다.** 한국판은 그림 서른둘을 옮겨 놨을 뿐
// 아니라 그 안에 한글이 그려져 있다 — 칸 수나 압축이 달랐다면 파서가 여기서
// 죽는다. 그래서 "열린다"가 아니라 "변환된다"까지 본다.
//
// ⚠️ **읽은 값을 밖으로 안 낸다.** 그룹 이름과 개수·바이트 수까지만 적는다
// (COPYRIGHT.md §6).
import { describe, it, expect } from 'vitest'
import { openNds } from './nds'
import { GROUPS } from './convert'
import { SUPPORTED, type Release } from './validate'
import { REQUIRED_PLATINUM_GROUPS } from '../install/required'
import { romPath, fileSource } from '../../data/romData.testkit'

const LOCALES = ['en', 'ko', 'ja'] as const

const enabled = process.env.PT_LOCALE_SWEEP === '1'
const haveRoms = LOCALES.every((l) => romPath(l) !== null)

const release = (locale: string): Release => {
  const got = SUPPORTED.releases.find((r) => r.locale === locale)
  if (!got) throw new Error(`${locale} 판이 supported.json에 없다`)
  return got
}

/**
 * 자리표가 없는 산출물만 이름으로 확인할 수 있다.
 *
 * ⚠️ **자리표 표기가 두 가지다.** 대개 `{종족}`·`{번호}`처럼 괄호를 쓰지만
 * 소리 그룹만 `data/sound/seq/N.bin`으로 **맨 `N`**을 쓴다 (`convert.ts`).
 * 괄호만 걸렀더니 세 판 모두 "소리가 산출물을 안 만들었다"로 섰다 — 실제로는
 * 1,300개를 만들고 있었다
 */
const literal = (path: string): boolean =>
  !path.includes('{') && !path.includes('*') && !path.split('/').includes('N.bin')

describe.skipIf(!enabled || !haveRoms)('세 지역판 전체 변환', () => {
  for (const locale of LOCALES) {
    it(`${locale} 판에서 그룹 ${String(GROUPS.filter((g) => g.convert).length)}개가 다 변환된다`, async () => {
      const fs = await openNds(fileSource(romPath(locale)!))
      expect(fs, `${locale} 롬을 못 열었다`).not.toBeNull()

      const failed: string[] = []
      const thin: string[] = []
      const lines: string[] = []
      for (const group of GROUPS) {
        if (!group.convert) continue
        // 큰 그룹은 400MB를 만든다 — 세지만 하고 버린다
        let files = 0
        let bytes = 0
        const made = new Set<string>()
        const emit = (path: string, data: Uint8Array): void => {
          files += 1
          bytes += data.length
          made.add(path)
        }
        try {
          const out = await group.convert({ fs: fs!, locale, release: release(locale), emit })
          for (const [path, data] of out) {
            files += 1
            bytes += data.length
            made.add(path)
          }
        } catch (e) {
          failed.push(`${group.name}: ${e instanceof Error ? e.message : String(e)}`)
          continue
        }
        if (files === 0 || bytes === 0) thin.push(group.name)
        // 이름이 정해진 산출물은 진짜 그 이름으로 나왔는지 본다
        const want = group.outputs.filter(literal).filter((p) => !made.has(p))
        if (want.length > 0) failed.push(`${group.name}: ${want.join(' · ')}을 안 만들었다`)
        lines.push(`  ${group.name} ${String(files)}개 ${String(Math.round(bytes / 1024))}kB`)
      }

      console.log(`[${locale}]\n${lines.join('\n')}`)
      expect(failed, `${locale}: ${String(failed.length)}그룹 실패`).toEqual([])
      expect(thin, `${locale}: 빈 산출물`).toEqual([])
      // 필수 그룹이 표에서 빠지면 이 시험이 조용히 작아진다
      const ran = new Set(GROUPS.filter((g) => g.convert).map((g) => g.name))
      for (const name of REQUIRED_PLATINUM_GROUPS) expect(ran.has(name), name).toBe(true)
    }, 1_800_000)
  }
})
