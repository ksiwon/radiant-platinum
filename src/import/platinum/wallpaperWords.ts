// 벽지 암호의 낱말표 — 브라우저에서 (`engine/world/wallpaperPassword`)
//
// ⚠️ **`tools/extract/wallpaperWords.js`와 한 줄씩 같아야 한다.** 머리말은 그쪽에 있다.
// 이쪽은 설치한 롬의 판을 따른다(`readRomFile`이 일본판 자리를 그 판의 자리로 옮긴다)
import { narcCount, narcEntry } from './nds'
import { check, readRomFile, type ConvertContext, type Produced } from './convertTypes'

const NARC = '/arc/pms_aikotoba.narc'

export async function convertWallpaperWords(ctx: ConvertContext): Promise<Produced> {
  const narc = await readRomFile(ctx, NARC)
  const count = narcCount(narc)
  if (count !== 1) throw new Error(`pms_aikotoba가 ${String(count)}칸이다 — 한 칸이라야 한다`)
  const bytes = narcEntry(narc, 0)
  if (!bytes || bytes.length % 4 !== 0) throw new Error('낱말표가 4의 배수가 아니다')
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const words: number[] = []
  for (let i = 0; i < bytes.length; i += 4) words.push(view.getUint32(i, true))
  check(ctx)
  return new Map([['data/wallpaperWords.json', new TextEncoder().encode(JSON.stringify({ words }))]])
}
