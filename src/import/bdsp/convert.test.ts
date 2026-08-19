// BDSP 그룹 변환 — 진짜 `AssetAssistant`로 (IMPORT.md §12 · §13-6)
//
// ⚠️ **여기서 재는 것은 "돌아간다"가 아니라 "맞다"다.** 세 그룹 전부 몇십 분씩
// 도는 일이라 시험이 다 굽지는 않는다 — 대신 **한 벌씩 골라 실측값으로 못 박는다.**
// 숫자가 바뀌면 굽는 규칙이 바뀐 것이고, 그때 개발 추출기와 다시 대조해야 한다
// (`tools/spike/glbDiff.py`).
//
// 실측 근거: `pnpm exec node --import ./tools/spike/tsResolve.mjs
// --experimental-strip-types tools/spike/bdspGroups.mjs <그룹>`으로 구워
// `public/models`의 개발 산출물과 대조했다. 무대 g001은 **모두 같다**,
// 인물은 그림만 최대 2~3/255 다르다 (`glbDiff.py` 머리말에 임자가 적혀 있다).
import { it, expect } from 'vitest'
import { readFileSync, existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { openEnvironment } from './environment'
import { exportArena } from './arena'
import { exportModel } from './model'
import { arenaFiles } from './convert'
import { verifyGlb } from './glb'
import { encodePng } from '../platinum/png'
import { SPRITE_NAMES } from '../platinum/spriteTable'
import { TRAINER_CLIPS, modelFor } from '../../engine/actor/npcModels'
import { TRAINER_CLIP } from '../../scene/battle/battleTrainerVisual'
import { TRAINER_MODELS } from './trainerModels'
import { bdspDir, withLocal } from '../../data/romData.testkit'

const AA = bdspDir('root')
const arena = (name: string): string | null => {
  const dir = bdspDir('arenas')
  return dir ? join(dir, 'ground', name) : null
}
const person = (build: string, name: string): string | null => {
  const dir = bdspDir('characters')
  return dir ? join(dir, 'persons', build, name) : null
}
const mon = (name: string): string[] => {
  const battle = bdspDir('pokemon')
  const common = bdspDir('pokemonCommon')
  if (!battle || !common) return []
  const stem = name.replace(/_\d\d$/, '')
  return [join(battle, name), join(common, stem), join(common, name)].filter((p) => existsSync(p))
}

const bytes = (path: string): Uint8Array => new Uint8Array(readFileSync(path))

const suite = withLocal('BDSP AssetAssistant', AA, arena('g001'), person('battle', 'tr0002_00'))

suite('무대', () => {
  it('g001을 개발 추출기와 같은 수로 굽는다', async () => {
    const env = openEnvironment([bytes(arena('g001')!)])
    const { glb, stat } = await exportArena(env, encodePng, { name: 'g001' })
    // ⚠️ 메시 158개가 다 살아 있어야 한다. `m_StreamData`나 `dimension` 플래그를
    // 빠뜨리면 여기가 51로 떨어지고, 화면에서는 "무대가 좀 휑하다"로만 보인다
    expect(stat.meshes).toBe(158)
    expect(stat.dropped).toBe(0)
    expect(stat.vertices).toBe(141918)
    expect(stat.triangles).toBe(129589)
    expect(stat.materials).toBe(6)
    // 재질별로 합쳐 드로우콜을 줄인다 — 메시 수만큼 나면 안 된다
    expect(stat.draws).toBe(6)
    expect(stat.problems).toEqual([])
    expect(verifyGlb(glb)).toEqual([])
  }, 120_000)

  it('구울 목록은 무대표가 임자다', () => {
    const files = arenaFiles()
    expect(files.length).toBeGreaterThanOrEqual(30)
    expect(files).toContain('g001.glb')
    expect(new Set(files).size).toBe(files.length)
    // 표에 있는 것은 실제 덤프에도 있어야 한다 — 없으면 그 맵의 배틀이 빈 땅이다
    const missing = files.filter((f) => !existsSync(arena(f.replace(/\.glb$/, ''))!))
    expect(missing).toEqual([])
  })
})

suite('인물', () => {
  it('tr0002_00(라이벌)을 뼈·재질까지 굽는다', async () => {
    const env = openEnvironment([bytes(person('battle', 'tr0002_00')!)])
    const { glb, stat } = await exportModel(env, encodePng, { maxSize: 256, keepClips: false })
    expect(stat.bones).toBeGreaterThan(100)
    expect(stat.vertices).toBeGreaterThan(3000)
    expect(stat.materials).toBeGreaterThan(3)
    // 클립을 안 실었으면 애니메이션이 0이어야 한다 — 걷기는 엔진이 만든다
    expect(stat.anim.clips).toBe(0)
    // 감기 순서가 뒤집히면 얼굴 안쪽이 보인다. 0.4 아래면 통째로 뒤집힌 것이다
    expect(stat.outward).toBeGreaterThan(0.5)
    expect(stat.problems).toEqual([])
    expect(verifyGlb(glb)).toEqual([])
  }, 120_000)

  // ⚠️ **굽는 쪽이 둘이라 여기서 브라우저 쪽을 잡는다.** 노드 추출기가 셋을
  // 실어도 이쪽이 안 실으면 설치본의 트레이너만 안 움직인다 — 개발 서버에서는
  // 멀쩡히 보이므로 눈으로는 절대 안 걸린다
  it('등신 몸에 배틀 클립 셋만 실린다', async () => {
    const env = openEnvironment([bytes(person('battle', 'tr0002_00')!)])
    const { glb, stat } = await exportModel(env, encodePng, {
      maxSize: 256, keepClips: true, clipFilter: TRAINER_CLIPS,
    })
    expect(stat.anim.clips).toBe(3)
    // 걸러진 것이 있어야 한다 — 규칙이 아무것도 안 거르면 셋이 나올 리 없다
    expect(stat.anim.skipped).toBeGreaterThan(0)
    expect(stat.anim.channels).toBeGreaterThan(500)
    expect(verifyGlb(glb)).toEqual([])
    // 실린 이름이 화면이 부르는 이름과 같아야 한다. glb의 JSON 청크는
    // 12바이트 머리 뒤 8바이트 청크 머리 다음부터다
    const head = new DataView(glb.buffer, glb.byteOffset, glb.byteLength)
    const json = new TextDecoder().decode(glb.subarray(20, 20 + head.getUint32(12, true)))
    const clipNames = (JSON.parse(json) as { animations?: { name: string }[] }).animations ?? []
    expect(new Set(clipNames.map((a) => a.name)))
      .toEqual(new Set(Object.values(TRAINER_CLIP)))
  }, 120_000)

  it('그림 번호가 BDSP 번들로 이어진다', () => {
    // 규칙은 `engine/actor/npcModels`가 임자다. 여기서는 **그 규칙이 가리키는
    // 번들이 실제 덤프에 있는지**만 본다
    const dir = join(bdspDir('characters')!, 'persons/battle')
    const battle = readdirSync(dir)
    expect(battle.length).toBeGreaterThan(100)
    const table = {
      battle: { bundles: {}, vocabulary: [] },
      field: { bundles: {}, vocabulary: [] },
    }
    // 갈래로 이어지는 사람은 낱말표가 비어 있어도 붙는다
    expect(modelFor('BARRY', table)?.bundles[0]).toBe('tr0002_00')
    expect(modelFor('CYNTHIA', table)?.bundles[0]).toBe('tr0001_00')
    expect(modelFor('PLAYER_F', table)?.bundles[0]).toBe('pc0002_00')
    const missing = TRAINER_MODELS
      .map((r) => r[1])
      .filter((b) => b.startsWith('tr') || b.startsWith('pc'))
      .filter((b) => !existsSync(join(dir, b)))
    expect(missing).toEqual([])
    // 그림표에 그 이름들이 실제로 있어야 짝이 성립한다
    const names = new Set(Object.values(SPRITE_NAMES))
    for (const n of ['BARRY', 'CYNTHIA', 'WORKER', 'PLAYER_F']) expect(names.has(n)).toBe(true)
  })
})

suite('포켓몬', () => {
  it('번들 셋을 합쳐야 메시가 나온다', async () => {
    const trio = mon('pm0387_00_00')
    expect(trio.length).toBe(3)
    // ⚠️ **배틀 번들만 열면 메시가 208바이트짜리 껍데기다.** 그대로 구우면 빈
    // glb가 나온다 — 그래서 셋을 한 환경에 올린다
    await expect(
      exportModel(openEnvironment([bytes(trio[0]!)]), encodePng, { maxSize: 256 }),
    ).rejects.toThrow()

    const env = openEnvironment(trio.map(bytes))
    const { glb, stat } = await exportModel(env, encodePng, {
      maxSize: 256, keepClips: true, clipFilter: /_ba\d\d_/, mainProps: ['_Col0Tex', '_MainTex'],
    })
    expect(stat.vertices).toBe(2489)
    expect(stat.triangles).toBe(3806)
    expect(stat.bones).toBe(53)
    expect(stat.anim.clips).toBe(8)
    expect(stat.anim.unresolved).toBe(0)
    expect(stat.problems).toEqual([])
    expect(verifyGlb(glb)).toEqual([])
  }, 120_000)
})
