import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  ANIM_FRAMES, spearPillarMovieStart, spearPillarMovieTick, type MovieHost, type SpearPillarMovie,
} from './spearPillarMovie'

const FX = 4096

/** 원작 틀 — 페이드는 단계 × 틱 뒤에 끝나고, 글은 뜬 다음 틱에 A로 넘긴다 */
function run(heroine = false) {
  const log: string[] = []
  let fadeLeft = 0
  let text: number | null = null
  let textAge = 0
  const host: MovieHost = {
    text: (id) => { text = id; textAge = 0; log.push(`text ${String(id)}`) },
    textActive: () => text !== null && textAge < 1,
    textClose: () => { text = null },
    fade: (steps, per, out, white) => { fadeLeft = steps * per; log.push(`fade ${out ? 'out' : 'in'} ${white ? 'white' : 'black'} ${String(steps)}`) },
    fadeDone: () => fadeLeft === 0,
    se: (seq, pan = 0, pitch = 0) => { log.push(`se ${String(seq)} ${String(pan)} ${String(pitch)}`) },
    cry: (species, pan, volume) => { log.push(`cry ${String(species)} ${String(pan)} ${String(volume)}`) },
    bgm: (seq) => { log.push(`bgm ${String(seq)}`) },
    bgmFade: (volume, frames) => { log.push(`bgmFade ${String(volume)} ${String(frames)}`) },
  }
  const m = spearPillarMovieStart(host, heroine)
  const at = new Map<string, number>()
  const frames: SpearPillarMovie['shown'][] = []
  const live: { scene: number, app: number, bright: number, x: number }[] = []
  for (let tick = 1; tick < 20_000; tick++) {
    if (fadeLeft > 0) fadeLeft--
    if (text !== null) textAge++
    const before = log.length
    const alive = spearPillarMovieTick(m, host)
    for (const line of log.slice(before)) if (!at.has(line)) at.set(line, tick)
    frames.push(m.shown)
    live.push({ scene: m.scene, app: m.app, bright: m.bright, x: m.cam.target[0] })
    if (!alive) return { m, log, at, ticks: tick, frames, live }
  }
  throw new Error('영상이 안 끝난다')
}

describe('창기둥 영상 (overlay100)', () => {
  it('애니 프레임 수가 굽는 쪽 머리와 같다', () => {
    const path = 'public/data/demo/index.json'
    if (!existsSync(path)) return
    const index = JSON.parse(readFileSync(path, 'utf8')) as { models: Record<string, { anims: { frames: number }[] }> }
    for (const [model, frames] of Object.entries(ANIM_FRAMES)) {
      expect(index.models[model]?.anims.map((a) => a.frames), model).toEqual(frames)
    }
  })

  it('글 · 곡 · 페이드가 원작 차례대로 나온다', () => {
    const { log } = run()
    expect(log.filter((l) => l.startsWith('text')).map((l) => Number(l.split(' ')[1])))
      .toEqual([14, 16, 18, 19, 20, 21, 22, 23, 24, 25, 26])
    expect(log.filter((l) => l.startsWith('bgm ') || l.startsWith('bgmFade'))).toEqual([
      'bgmFade 0 10', 'bgm 1065', 'bgmFade 0 10', 'bgm 1214', 'bgm 1215', 'bgm stop',
    ])
    expect(log.filter((l) => l.startsWith('fade'))).toEqual([
      'fade in black 12', 'fade out black 6', 'fade in black 6', 'fade out white 1', 'fade in white 6', 'fade out black 1',
    ])
    expect(log.filter((l) => l.startsWith('cry'))).toEqual([
      'cry 483 -80 80', 'cry 484 80 80', 'cry 480 0 100', 'cry 481 0 100', 'cry 482 0 100',
      'cry 483 -80 40', 'cry 484 80 40', 'cry 487 0 127', 'cry 487 0 127',
    ])
  })

  it('장면 0 — 카메라는 59틱만 겨눔점을 민다 · 흔들림은 두 틱마다 폭/2씩 오가고 모드가 바뀌면 가운데가 밀린다', () => {
    const { frames, live } = run()
    const scene0 = frames.filter((f) => f.scene === 0 && f.cam.dist !== 0)
    // `-FX32_CONST(46) / 60` = −3140을 59번 (마지막 틱은 각만 맞춘다)
    expect(scene0.map((f) => f.cam.target[2]).at(-1)).toBe(34 * FX - 59 * 3140)
    // 모드 4는 0 ↔ −1, 5는 0 ↔ −2 (한 벌의 첫 쪽이 −다) — 7에서 네 틱에 0.5씩, 8에서 한 벌을 마치고 선다
    const xs = live.filter((l) => l.scene === 0).map((l) => l.x / FX)
    expect(Math.max(...xs.map(Math.abs))).toBeLessThanOrEqual(6)
    expect(xs.at(-1)).toBe(-1)
  })

  it('장면 0 — 디아루가가 0 · 0.6 · 1 · 1.2 · 1.1 · 1로 튀어나온다 (0.3은 원작도 건너뛴다)', () => {
    const { frames } = run()
    const seen: number[] = []
    for (const f of frames) {
      const d = f.objects.find((o) => o.key === 'dialga')
      if (!d) continue
      const s = Math.round((d.scale[0] / FX) * 10) / 10
      if (seen.at(-1) !== s) seen.push(s)
    }
    expect(seen.slice(0, 6)).toEqual([0, 0.6, 1, 1.2, 1.1, 1])
  })

  it('장면 1 — 셋째가 사라진 뒤 아래 화면 밝기는 15에 남는다', () => {
    const { live } = run()
    expect(live.filter((l) => l.scene === 1 && l.app === 1).at(-1)!.bright).toBe(15)
  })

  it('장면 2 — 기라티나가 −90에서 0.5씩 −50까지 솟고, 태홍이 한 틱 0.25씩 다가온다', () => {
    const { frames } = run()
    const ys = frames.flatMap((f) => f.objects.filter((o) => o.key === 'giratinaA').map((o) => o.pos[1] / FX))
    expect(ys[0]).toBe(-90)
    expect(Math.max(...ys)).toBe(-50)
    const zs = frames.flatMap((f) => f.scene === 2 ? f.objects.filter((o) => o.key === 'cyrus').map((o) => o.pos[2] / FX) : [])
    // 걸음(무늬 1 · 2번) — 첫 틱은 안 옮기고 네 칸 × 네 틱 두 벌 (`ov100_021D45A4`)
    expect(Math.max(...zs)).toBeGreaterThan(60)
  })

  it('길이 — 글을 곧바로 넘기면 끝까지 몇 틱인가', () => {
    const { ticks, at } = run()
    // 12단계 페이드가 끝난 틱(12)에 카메라가 60틱 옮기기를 시작한다 — 60번째 틱에 끝나며 첫 글
    expect(at.get('text 14')).toBe(71)
    expect(ticks).toBe(2661)
  })

  it('여자 주인공이면 heroine 모델을 그린다', () => {
    const { frames } = run(true)
    expect(frames.some((f) => f.objects.some((o) => o.model === 'heroine'))).toBe(true)
    expect(frames.some((f) => f.objects.some((o) => o.model === 'hero'))).toBe(false)
  })
})
