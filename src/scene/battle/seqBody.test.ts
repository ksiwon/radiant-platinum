// 시퀀스가 시킨 동작이 언제까지 도는가 · 몸 빛이 재질을 제대로 갈아 끼우고 되돌리는가
import { describe, expect, it } from 'vitest'
import { AnimationClip, Group, Mesh, MeshStandardMaterial, BoxGeometry, AnimationMixer } from 'three'
import { SEQ_MOTION_SECONDS, glow, ownMaterials, releaseMaterials, seqMotionLive } from './seqBody'
import { motionClipSeconds, type MonBody } from './monModel'
import type { SeqBodyPose } from './stageRefs'

const pose = (name: NonNullable<SeqBodyPose['motion']>['name'] | null, at: number, frame: number): SeqBodyPose => ({
  offset: [0, 0, 0], scale: [1, 1, 1], visible: true, glow: null, turn: 0, shake: [0, 0, 0],
  motion: name ? { name, at } : null, motionSpeed: 1, intro: false, frame,
})

describe('seqMotionLive', () => {
  it('클립 길이를 모르면 표의 값으로 간다', () => {
    expect(seqMotionLive(pose('attack', 0, 32))).toBe(true) // 1.067초 < 1.1
    expect(seqMotionLive(pose('attack', 0, 34))).toBe(false) // 1.133초
    expect(seqMotionLive(pose('damage', 10, 30))).toBe(true) // 0.667 < 0.7
    expect(seqMotionLive(pose('damage', 10, 32))).toBe(false)
  })
  it('클립 길이를 알면 그 길이가 이긴다', () => {
    const clip = (): number => 0.5
    expect(seqMotionLive(pose('attack', 0, 14), clip)).toBe(true)
    expect(seqMotionLive(pose('attack', 0, 16), clip)).toBe(false)
    const long = (): number => 2
    expect(seqMotionLive(pose('attack', 0, 50), long)).toBe(true) // 표라면 진작 끝났다
  })
  it('0 이하 길이는 믿지 않고 표로 간다', () => {
    expect(seqMotionLive(pose('attack', 0, 40), () => 0)).toBe(false)
    expect(seqMotionLive(pose('attack', 0, 20), () => 0)).toBe(true)
  })
  it('대기 · 쓰러짐 · 공중은 클립 길이와 상관없이 시퀀스가 놓을 때까지 간다', () => {
    for (const n of ['wait', 'down', 'landB'] as const) {
      expect(SEQ_MOTION_SECONDS[n]).toBe(Infinity)
      expect(seqMotionLive(pose(n, 0, 9999), () => 0.1)).toBe(true)
    }
  })
  it('동작이 없으면 거짓', () => {
    expect(seqMotionLive(pose(null, 0, 0))).toBe(false)
  })
  it('요청한 이름 그대로 클립 길이를 묻는다', () => {
    const asked: string[] = []
    seqMotionLive(pose('landC', 0, 1), (n) => { asked.push(n); return null })
    expect(asked).toEqual(['landC'])
  })
})

describe('motionClipSeconds', () => {
  const clips = [new AnimationClip('pm0025_00_00_ba10_waitA01', 2.5, []), new AnimationClip('pm0025_00_00_ba20_buturi01', 0.9, [])]
  it('그 동작의 클립 길이를 낸다', () => {
    expect(motionClipSeconds({ clips }, 'physical')).toBeCloseTo(0.9, 9)
  })
  it('그 동작의 클립이 없으면 대신 트는 클립의 길이를 내지 않는다', () => {
    expect(motionClipSeconds({ clips }, 'special')).toBeNull()
    expect(motionClipSeconds({ clips }, 'landC')).toBeNull()
  })
})

describe('몸 빛', () => {
  const body = (): { b: MonBody; mat: MeshStandardMaterial } => {
    const root = new Group()
    const mat = new MeshStandardMaterial({ emissive: 0x112233, emissiveIntensity: 0.4 })
    root.add(new Mesh(new BoxGeometry(), mat))
    return { b: { root, tall: 1, mixer: new AnimationMixer(root), clips: [], action: null }, mat }
  }
  it('재질을 떼어 낸 뒤 켜고 끄면 원래 발광으로 돌아오고 원본은 안 건드린다', () => {
    const { b, mat } = body()
    ownMaterials(b)
    const own = (b.root.children[0] as Mesh).material as MeshStandardMaterial
    expect(own).not.toBe(mat)
    glow(b, { color: [1, 0.5, 0], power: 2 })
    expect(own.emissive.r).toBe(1); expect(own.emissiveIntensity).toBe(2)
    expect(mat.emissiveIntensity).toBe(0.4)
    glow(b, null)
    expect(own.emissive.getHex()).toBe(0x112233); expect(own.emissiveIntensity).toBeCloseTo(0.4, 9)
    releaseMaterials(b)
  })
  it('검은 색 · 0 세기는 켜지 않는다', () => {
    const { b } = body()
    ownMaterials(b)
    const own = (b.root.children[0] as Mesh).material as MeshStandardMaterial
    glow(b, { color: [0, 0, 0], power: 5 })
    glow(b, { color: [1, 1, 1], power: 0 })
    expect(own.emissiveIntensity).toBeCloseTo(0.4, 9)
  })
})
