// 시퀀스가 몸 하나에 거는 것 — 동작이 아직 도는가 · 몸 빛(재질 발광). `BattleStage`의 Slot이 프레임마다 읽는다
import type { Mesh, MeshStandardMaterial } from 'three'
import type { MonBody } from './monModel'
import type { SeqBodyPose } from './stageRefs'

/**
 * 시퀀스가 시킨 동작을 아직 트는가 (초) — **그 몸의 클립 길이를 못 잴 때** 쓰는 값.
 *
 * BDSP는 동작 하나가 끝나면 대기로 돌아간다. 클립이 있으면 그 길이가 곧 동작의 길이이고(`seqMotionLive`),
 * 이 표는 클립을 못 찾은 몸(도트 · 동작 번들이 없는 종 · 대신 트는 클립)의 안전망이다 — 공격 클립이 0.8~1.3초,
 * 피격이 0.5~0.8초, 울음이 1~1.5초라 한가운데쯤을 잡았다(우리 값). 쓰러짐(`down`)은 끝 자세로 멎고 시퀀스가
 * 몸을 지울 때까지 간다. 착지(`landC`)는 피카츄 0.667초 — 그 뒤 대기로 이어진다
 */
export const SEQ_MOTION_SECONDS = { attack: 1.1, damage: 0.7, cry: 1.3, wait: Infinity, down: Infinity, landB: Infinity, landC: 0.7 } as const

/** 시퀀스가 시키는 동작 이름 (`attack`은 물리 · 특수 중 그 기술의 것으로 풀린다 — 부르는 쪽이 안다) */
export type SeqMotionName = NonNullable<SeqBodyPose['motion']>['name']

/**
 * 시퀀스가 시킨 동작을 아직 트는가.
 *
 * @param clipSeconds 그 몸이 이 동작으로 트는 **클립의 길이**(초). 모르면 `null` → `SEQ_MOTION_SECONDS`.
 *   대기 · 쓰러짐 · 공중(`landB`)은 길이와 상관없이 시퀀스가 놓을 때까지 간다
 */
export function seqMotionLive(pose: SeqBodyPose, clipSeconds: (name: SeqMotionName) => number | null = () => null): boolean {
  const m = pose.motion
  if (m === null) return false
  const fallback = SEQ_MOTION_SECONDS[m.name]
  if (fallback === Infinity) return true
  const clip = clipSeconds(m.name)
  return (pose.frame - m.at) / 30 < (clip !== null && clip > 0 ? clip : fallback)
}

/**
 * 시퀀스의 몸 빛 (`PokemonShaderCol`)을 재질 발광으로 건다.
 *
 * 재질은 **몸이 설 때 한 번** 떼어 낸다(`ownMaterials` — 같은 종 두 마리가 재질을 나눠 쓰므로 한 마리만 빛나게) —
 * 그래서 빛날 때 새 재질이 생기지 않고 파이프라인도 등판 전에 굽힌다(`warmBeforeShow`). 끌 때는 그 재질의 원래 발광으로
 * 되돌린다. 떼어 낸 재질은 몸이 내려갈 때 놓는다(`releaseMaterials`)
 */
interface OwnedMaterial { mat: MeshStandardMaterial; emissive: [number, number, number]; intensity: number }
const owned = new WeakMap<object, OwnedMaterial[]>()
const glowing = new WeakMap<object, boolean>()

export function ownMaterials(model: MonBody): void {
  if (owned.has(model.root)) return
  const list: OwnedMaterial[] = []
  model.root.traverse((o) => {
    const mesh = o as Mesh
    if (!mesh.isMesh) return
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
    const next = mats.map((m) => {
      const std = m as MeshStandardMaterial
      if (!std.emissive) return m
      const own = std.clone()
      list.push({ mat: own, emissive: [std.emissive.r, std.emissive.g, std.emissive.b], intensity: std.emissiveIntensity })
      return own
    })
    mesh.material = Array.isArray(mesh.material) ? next : next[0]!
  })
  owned.set(model.root, list)
}

export function releaseMaterials(model: MonBody): void {
  for (const o of owned.get(model.root) ?? []) o.mat.dispose()
  owned.delete(model.root)
  glowing.delete(model.root)
}

export function glow(model: MonBody | null, g: { color: [number, number, number]; power: number } | null): void {
  if (!model) return
  const on = g !== null && g.power > 0.001 && (g.color[0] > 0 || g.color[1] > 0 || g.color[2] > 0)
  if (!on && !glowing.get(model.root)) return
  glowing.set(model.root, on)
  for (const o of owned.get(model.root) ?? []) {
    if (on) {
      o.mat.emissive.setRGB(g.color[0], g.color[1], g.color[2])
      o.mat.emissiveIntensity = g.power
    } else {
      o.mat.emissive.setRGB(o.emissive[0], o.emissive[1], o.emissive[2])
      o.mat.emissiveIntensity = o.intensity
    }
  }
}
