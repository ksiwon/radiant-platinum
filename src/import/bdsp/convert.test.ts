// BDSP 그룹 변환 — 진짜 `AssetAssistant`로 (IMPORT.md §12 · §13-6)
//
// ⚠️ **여기서 재는 것은 "돌아간다"가 아니라 "맞다"다.** 세 그룹 전부 몇십 분씩
// 도는 일이라 시험이 다 굽지는 않는다 — 대신 **한 벌씩 골라 실측값으로 못 박는다.**
// 숫자가 바뀌면 굽는 규칙이 바뀐 것이고, 그때 개발 추출기와 다시 대조해야 한다
// (`tools/spike/glbDiff.py`).
//
// 실측 근거: `pnpm exec node --import ./tools/spike/tsResolve.mjs
// --experimental-strip-types tools/spike/bdspGroups.mjs <그룹>`으로 구워
// `public/models`의 개발 산출물과 대조했다. 무대 g001은 **모두 같다**.
// 인물 · 포켓몬 그림은 ASTC를 푸는 반올림이 갈려 최대 2/255 달랐는데(`astc.ts` — 개발 추출기는 astcenc의
// 위 8비트), 맞춘 뒤로 이상해씨 이로치 여섯 장은 0이고 라이벌 `tr0002_00` 여섯 장은 `wear`의 한 바이트만 1/255다.
import { it, expect } from 'vitest'
import { readFileSync, existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { openEnvironment } from './environment'
import { exportArena } from './arena'
import { exportModel } from './model'
import { bakeAlbedo } from './albedo'
import { anySex, pokemonCatalog, variantSuffix } from './convert'
import { POKEBALL, arenaFiles } from './convert'
import { verifyGlb } from './glb'
import { decodePng, encodePng } from '../platinum/png'
import { SPRITE_NAMES } from '../platinum/spriteTable'
import { HERO_FIELD_CLIPS, TRAINER_CLIPS, fieldClipDonor, modelFor } from '../../engine/actor/npcModels'
import { TRAINER_CLIP } from '../../scene/battle/battleTrainerVisual'
import { TRAINER_MODELS } from './trainerModels'
import { bundleDeps } from './bundleDeps'
import { bdspDir, withLocal } from '../../data/romData.testkit'

const AA = bdspDir('root')
const arena = (name: string): string | null => {
  const dir = bdspDir('arenas')
  return dir ? join(dir, 'ground', name) : null
}
const characters = (rel: string): string | null => {
  const dir = bdspDir('characters')
  return dir ? join(dir, ...rel.split('/')) : null
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

const berryBundle = (name: string): string | null => {
  const dir = bdspDir('environments')
  return dir ? join(dir, 'gimmick', name) : null
}
const BERRY_BAKED = join(__dirname, '../../../public/models/berry')

withLocal('BDSP AssetAssistant', berryBundle('kino001'))('나무열매 나무', () => {
  it('kino001이 묶음마다 노드로 나뉜다 — 이름순 Hana · Mi · Miki', async () => {
    const env = openEnvironment([bytes(berryBundle('kino001')!)])
    const { glb, stat } = await exportArena(env, encodePng, { name: 'kino001', maxSize: 256, groups: true, premultiplied: true, plant: true })
    expect(stat.problems).toEqual([])
    const json = new TextDecoder().decode(glb.subarray(20, 20 + new DataView(glb.buffer, glb.byteOffset).getUint32(12, true)))
    const gltf = JSON.parse(json) as { nodes: { name: string }[] }
    expect(gltf.nodes.map((n) => n.name)).toEqual(['Hana', 'Mi', 'Miki'])
  }, 60_000)

  // 노드 쪽 `bdspArena.py --berries`와 같아야 한다 (두 굽는 쪽이 갈리지 않게). PNG를 압축하는 쪽이 달라 파일 바이트는 갈리므로
  // **구조 · 정점 바이트 · 그림 픽셀**을 견준다. 산출물이 없으면 건너뛴다
  it.runIf(existsSync(join(BERRY_BAKED, 'kino001.glb')))('개발 산출물과 같다 — kino001 · kino002 · kinoseeding (정점 색 COLOR_0 · 꽃 마스크 굽기 포함)', async () => {
    interface Parsed { gltf: Record<string, unknown> & { bufferViews: { byteOffset: number, byteLength: number, target?: number }[], images: { bufferView: number }[] }, bin: Uint8Array }
    const parse = (g: Uint8Array): Parsed => {
      const dv = new DataView(g.buffer, g.byteOffset, g.byteLength)
      const n = dv.getUint32(12, true)
      const gltf = JSON.parse(new TextDecoder().decode(g.subarray(20, 20 + n))) as Parsed['gltf']
      const m = dv.getUint32(20 + n, true)
      return { gltf, bin: g.subarray(28 + n, 28 + n + m) }
    }
    for (const name of ['kino001', 'kino002', 'kinoseeding']) {
      const env = openEnvironment([bytes(berryBundle(name)!)])
      const mine = parse((await exportArena(env, encodePng, { name, maxSize: 256, groups: true, premultiplied: true, plant: true })).glb)
      const want = parse(new Uint8Array(readFileSync(join(BERRY_BAKED, `${name}.glb`))))
      for (const k of ['scenes', 'nodes', 'meshes', 'materials', 'textures', 'samplers', 'accessors']) {
        expect(mine.gltf[k], `${name} ${k}`).toEqual(want.gltf[k])
      }
      // 잎의 정점 색 — 열매 나무마다 있고 싹에는 없다
      expect(JSON.stringify(mine.gltf.meshes).includes('COLOR_0'), `${name} COLOR_0`).toBe(name !== 'kinoseeding')
      const pick = (p: Parsed, i: number): Uint8Array => {
        const v = p.gltf.bufferViews[i]!
        return p.bin.subarray(v.byteOffset, v.byteOffset + v.byteLength)
      }
      expect(mine.gltf.bufferViews.length).toBe(want.gltf.bufferViews.length)
      mine.gltf.bufferViews.forEach((v, i) => {
        if (v.target !== undefined) expect(Buffer.from(pick(mine, i)).equals(Buffer.from(pick(want, i))), `${name} 정점 ${i}`).toBe(true)
      })
      expect(mine.gltf.images.length).toBe(want.gltf.images.length)
      for (const [i, im] of mine.gltf.images.entries()) {
        const x = await decodePng(pick(mine, im.bufferView))
        const y = await decodePng(pick(want, want.gltf.images[i]!.bufferView))
        expect([x.width, x.height], `${name} 그림 ${i}`).toEqual([y.width, y.height])
        expect(Buffer.from(x.pixels).equals(Buffer.from(y.pixels)), `${name} 그림 ${i} 픽셀`).toBe(true)
      }
    }
  }, 60_000)
})

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

  // ⚠️ **재질이 딴 번들에 있는 사람이 있다.** 드래곤사역사(`tr1029_00`)는 재질
  // 아홉이 다 `objects/ob0204_00`에 있어서, 그 번들을 같이 안 얹으면 재질을 못
  // 찾은 껍데기가 통째로 버려지고 배틀에 **캡슐 사람**이 선다. 어느 번들이
  // 무엇을 가리키는지는 `bundleDeps`가 알고 노드 추출기도 같은 표를 본다
  it('의존 번들을 같이 얹어야 드래곤사역사가 선다', async () => {
    const self = person('battle', 'tr1029_00')
    const dep = characters('objects/ob0204_00')
    if (!self || !dep || !existsSync(self) || !existsSync(dep)) return

    // 표가 실제로 그 번들을 가리키는지부터 — 표가 비면 아래가 조용히 통과한다
    expect(bundleDeps('persons/battle/tr1029_00')).toContain('objects/ob0204_00')

    const alone = openEnvironment([bytes(self)])
    // 혼자 열면 껍데기가 다 버려져 세울 것이 없다
    await expect(exportModel(alone, encodePng, { maxSize: 256, keepClips: false }))
      .rejects.toThrow()

    const env = openEnvironment([bytes(self), bytes(dep)])
    const { glb, stat } = await exportModel(env, encodePng, { maxSize: 256, keepClips: false })
    expect(stat.dropped).toBe(0)
    expect(stat.materials).toBeGreaterThan(5)
    expect(stat.bones).toBeGreaterThan(100)
    expect(stat.problems).toEqual([])
    expect(verifyGlb(glb)).toEqual([])
  }, 180_000)

  // ⚠️ **굽는 쪽이 둘이라 여기서 브라우저 쪽을 잡는다.** 노드 추출기가 넷을
  // 실어도 이쪽이 안 실으면 설치본의 트레이너만 안 움직인다 — 개발 서버에서는
  // 멀쩡히 보이므로 눈으로는 절대 안 걸린다
  it('등신 몸에 배틀 클립 넷만 실린다', async () => {
    const env = openEnvironment([bytes(person('battle', 'tr0002_00')!)])
    const { glb, stat } = await exportModel(env, encodePng, {
      maxSize: 256, keepClips: true, clipFilter: TRAINER_CLIPS,
    })
    // 등장 · 쉬기 · 지시 · 패배 (`TRAINER_CLIP`). 쉬는 것이 빠지면 트레이너가
    // 등장 클립 끝 자세로 굳는다
    expect(stat.anim.clips).toBe(4)
    // 걸러진 것이 있어야 한다 — 규칙이 아무것도 안 거르면 넷이 나올 리 없다
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

  // ⚠️ **여기도 굽는 쪽 둘이다.** 필드 동작은 치비 번들에만 있어서 옮겨 와야
  // 하는데, 옮기는 도구가 한동안 파이썬에만 있었다 — 그러면 개발 서버에서는
  // 주인공이 낚싯대를 던지고 설치본에서는 안 던진다
  it('주인공 몸에 치비의 필드 동작 열여섯이 실린다', async () => {
    const hero = 'pc0001_00'
    const donor = fieldClipDonor(hero)
    expect(donor).toBe('fc0001_00')
    const env = openEnvironment([bytes(person('battle', hero)!)])
    // ⚠️ **치비 번들 하나만 연다.** 메시는 다른 번들에 나가 있지만(PLAN §16.9)
    // 여기서 쓰는 것은 Transform 계층과 AnimationClip뿐이고 그 둘은 이 안에 있다
    const from = openEnvironment([bytes(person('field', donor!)!)])
    expect(from.ofType('AnimationClip').length).toBe(56)
    expect(from.ofType('Transform').length).toBe(276)

    const { glb, stat } = await exportModel(env, encodePng, {
      maxSize: 256, keepClips: true, clipFilter: TRAINER_CLIPS,
      clipsFrom: from, borrowOnly: new Set(HERO_FIELD_CLIPS),
    })
    // 제 클립은 셋뿐이다 — 주인공에게는 `lose01_b`가 아예 없다 (원작이 안 만들었다)
    expect(stat.anim.clips).toBe(3)
    expect(stat.borrow?.borrowed).toBe(HERO_FIELD_CLIPS.length)
    expect(stat.borrow?.channels).toBe(1088)
    // 이름이 겹쳐 버린 뼈가 하나라도 있으면 그 자리가 조용히 안 움직인다
    expect(stat.borrow?.ambiguous).toBe(0)
    // 대수가 맞는가. 켤레를 잘못 걸면 0.1 단위로 벌어진다
    expect(stat.borrow?.roundTrip).toBeLessThan(1e-12)
    expect(verifyGlb(glb)).toEqual([])

    const head = new DataView(glb.buffer, glb.byteOffset, glb.byteLength)
    const json = new TextDecoder().decode(glb.subarray(20, 20 + head.getUint32(12, true)))
    const clips = (JSON.parse(json) as { animations?: { name: string }[] }).animations ?? []
    for (const name of HERO_FIELD_CLIPS) {
      expect(clips.some((c) => c.name === name), name).toBe(true)
    }
  }, 180_000)

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
  // ⚠️ **굽는 쪽이 둘이라 여기서 브라우저 쪽을 잡는다.** 이로치는 그림만 굽고
  // 화면이 갈아 끼우는데(`scene/battle/monModel`), 재질 이름이 한 글자라도
  // 어긋나면 **그 조각만 보통색으로 남는다** — 개발 서버에서는 노드 산출물이
  // 채워 주므로 눈으로는 절대 안 걸린다
  it('이로치 그림이 보통색과 같은 이름으로 나온다', async () => {
    const plain = mon('pm0387_00_00')
    const rare = mon('pm0387_00_01')
    if (plain.length !== 3 || rare.length === 0) return

    const names = (paths: string[]): string[] =>
      bakeAlbedo(openEnvironment(paths.map(bytes)), {
        maxSize: 256, mainProps: ['_Col0Tex', '_MainTex'],
      }).map((m) => variantSuffix(m.name)).sort()

    const before = names(plain)
    const after = names(rare)
    expect(after.length).toBeGreaterThan(0)
    // 이름이 같아야 갈아 끼울 수 있다 — `_rare` 꼬리와 앞머리를 뗀 뒤의 이름이다
    expect(after).toEqual(before)
    // 그림이 실제로 달라야 이로치다. 같으면 보통색 번들을 두 번 구운 것이다
    const pixels = (paths: string[]): Uint8Array =>
      bakeAlbedo(openEnvironment(paths.map(bytes)), {
        maxSize: 256, mainProps: ['_Col0Tex', '_MainTex'],
      })[0]!.pixels
    expect([...pixels(rare).slice(0, 256)]).not.toEqual([...pixels(plain).slice(0, 256)])
  }, 180_000)

  // ⚠️ **성별이 둘이 아니다.** 무성 종은 `Sex`가 2다 — 0과 1만 물으면 전기공·
  // 메타몽·폴리곤·프리져 같은 **108종의 이로치가 통째로 빠진다.** 실제로 그렇게
  // 빠졌었고(브라우저 449 vs 노드 557) 화면에서는 「이 종만 이로치가 안 뜬다」로만
  // 보인다
  it('무성 종의 이로치도 목록에 있다', async () => {
    const master = AA ? join(AA, 'Dpr', 'masterdatas') : null
    if (!master || !existsSync(master)) return
    const catalog = pokemonCatalog(openEnvironment([bytes(master)]))
    expect(catalog.size).toBeGreaterThan(1000)
    // 전기공(100) · 메타몽(132) · 폴리곤(137) — 셋 다 무성이다
    for (const dex of [100, 132, 137]) {
      expect(catalog.get(`${String(dex)}/0/0/1`), `${String(dex)} 수컷 이로치`).toBeUndefined()
      expect(anySex(catalog, dex, 0, 1), `${String(dex)} 이로치`).toBeDefined()
    }
    // 성별이 있는 종은 수컷 자리에 그대로 있다
    expect(catalog.get('387/0/0/1')).toBeDefined()
  }, 120_000)

  it('눈·입은 표정 칸 값(`_ColorBaseU`)을 1층 오프셋에 먹는다 — 두 눈이 뜬 눈 칸 하나를 거울로 읽는다', () => {
    const trio = mon('pm0387_00_00')
    if (trio.length !== 3) return
    const baked = bakeAlbedo(openEnvironment(trio.map(bytes)), { maxSize: 256, mainProps: ['_Col0Tex', '_MainTex'] })
    const eyes = baked.filter((m) => /-[LR]Eye$/.test(m.name))
    expect(eyes.map((m) => m.name).sort()).toEqual(['pm0387_00_00-LEye', 'pm0387_00_00-REye'])
    // 배율 (2,1)에 −0.5 — 모부기 오른눈 u 0.029~0.210 → −0.44~−0.08(거울로 0.08~0.44) · 왼눈 u 0.290~0.471 → 0.08~0.44.
    // 둘 다 왼쪽 칸(뜬 눈)이다. 오프셋이 0이면 왼눈이 0.58~0.94 — **반쯤 감긴 칸**이다 (DATA.md `_ColorBaseU`)
    for (const eye of eyes) {
      expect(eye.look.uv).toEqual([2, 1, -0.5, 0])
      expect(eye.look.wrap[0]).toBe(33648) // MIRRORED_REPEAT
    }
  }, 120_000)

  // ⚠️ **⑮가 처음 픽셀로 견준 BDSP 그림이 여기다** (`tools/e2e/parity.mjs`의 `comparePixels`). 이상해씨 이로치
  // `BodyA01`이 5,504개 갈렸다 — ASTC를 푸는 반올림이 개발 추출기(astcenc · 위 8비트)와 달랐다 (`astc.ts`).
  // 개발 산출물이 없는 기계에서는 못 잰다 — 통과로 안 세고 건너뛴다
  it('이로치 그림이 개발 산출물과 픽셀까지 같다 — 이상해씨', async () => {
    const rare = mon('pm0001_00_01')
    const nodeDir = join(__dirname, '../../../public/models/pokemon/variants/shiny/1')
    if (rare.length !== 3 || !existsSync(nodeDir)) return
    const baked = bakeAlbedo(openEnvironment(rare.map(bytes)), {
      maxSize: 256, mainProps: ['_Col0Tex', '_MainTex'],
    })
    expect(baked.length).toBe(6)
    const off: string[] = []
    for (const m of baked) {
      const node = await decodePng(bytes(join(nodeDir, `${variantSuffix(m.name)}.png`)))
      expect([m.width, m.height]).toEqual([node.width, node.height])
      let bad = 0
      for (let i = 0; i < node.pixels.length; i++) if (m.pixels[i] !== node.pixels[i]) bad++
      if (bad > 0) off.push(`${variantSuffix(m.name)} ${String(bad)}`)
    }
    expect(off).toEqual([])
  }, 120_000)

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

// ⚠️ **길의 도구 볼은 몬스터볼이어야 한다 — 이름이 아니라 색으로 잰다.** `ob02xx`
// 볼들은 메시·UV가 같아 번들을 잘못 골라도 모양·개수 시험은 다 통과한다.
// 첫째 번들(`ob0201`)을 집었을 때 길마다 마스터볼(보라·M)이 놓였다 (`POKEBALL` 머리말)
it('길에 놓이는 볼은 윗반구가 빨강인 몬스터볼이다', async () => {
  const dir = characters(POKEBALL.replace(/^Characters\//, ''))
  if (!dir || !existsSync(dir)) return
  const shots: { rgba: Uint8Array, w: number, h: number }[] = []
  const capture = (rgba: Uint8Array, w: number, h: number): Promise<Uint8Array> => {
    shots.push({ rgba: rgba.slice(), w, h })
    return encodePng(rgba, w, h)
  }
  const { glb, stat } = await exportModel(openEnvironment([bytes(dir)]), capture, {
    maxSize: 256, keepClips: false,
  })
  expect(verifyGlb(glb)).toEqual([])
  expect(stat.triangles).toBe(1026)
  expect(shots.length).toBe(1)

  // glb의 윗반구 메시 UV로 그림을 짚어 평균을 낸다
  const view = new DataView(glb.buffer, glb.byteOffset, glb.byteLength)
  const jsonLen = view.getUint32(12, true)
  const gltf = JSON.parse(new TextDecoder().decode(glb.subarray(20, 20 + jsonLen))) as {
    meshes: { name: string, primitives: { attributes: Record<string, number> }[] }[]
    accessors: { bufferView: number, byteOffset?: number, count: number }[]
    bufferViews: { byteOffset?: number, byteStride?: number }[]
  }
  const binAt = 20 + jsonLen + 8
  const upper = gltf.meshes.filter((m) => /_ballupperSkin$/.test(m.name))
  expect(upper.length).toBe(1)
  const { rgba, w, h } = shots[0]!
  const sum = [0, 0, 0]
  let n = 0
  for (const prim of upper[0]!.primitives) {
    const acc = gltf.accessors[prim.attributes['TEXCOORD_0']!]!
    const bv = gltf.bufferViews[acc.bufferView]!
    const stride = bv.byteStride ?? 8
    const base = binAt + (bv.byteOffset ?? 0) + (acc.byteOffset ?? 0)
    for (let i = 0; i < acc.count; i++) {
      const u = view.getFloat32(base + i * stride, true)
      const v = view.getFloat32(base + i * stride + 4, true)
      const x = Math.min(w - 1, Math.floor((u - Math.floor(u)) * w))
      const y = Math.min(h - 1, Math.floor((v - Math.floor(v)) * h))
      const o = (y * w + x) * 4
      for (let c = 0; c < 3; c++) sum[c]! += rgba[o + c]!
      n++
    }
  }
  const [r, g, b] = sum.map((s) => s / n) as [number, number, number]
  // 실측: 몬스터볼(ob0204) 114,57,59 · 마스터볼(ob0201) 69,60,85 · 슈퍼볼(ob0203) 50,78,95
  expect(r).toBeGreaterThan(b * 1.5)
  expect(r).toBeGreaterThan(g * 1.5)
}, 120_000)
