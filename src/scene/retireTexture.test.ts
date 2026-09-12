// 씬이 손을 뗀 뒤에 버린다 (REPAIR §48)
//
// 그 자리에서 버리면 아직 무는 메시가 죽은 그림을 제출한다 —
// `Destroyed texture [Texture "chunk-slice 32x32"] used in a submit`.
// 실측: 버리려는 순간 씬을 훑으니 한 판에 47건이 붙은 채였고, 안 버리고
// 기다린 판에서 드라이버 오류가 0건이 됐다.
import { describe, it, expect, afterEach } from 'vitest'
import { BoxGeometry, Mesh, MeshBasicMaterial, Scene, Texture } from 'three'
import { sceneRefs } from './sceneRefs'
import { retireTexture, tickRetiredTextures } from './retireTexture'

/** 버려졌는지 세는 그림 하나 */
function watched(): { tex: Texture; gone: () => number } {
  const tex = new Texture()
  let n = 0
  tex.addEventListener('dispose', () => { n += 1 })
  return { tex, gone: () => n }
}

/** 그 그림을 문 메시가 선 씬 */
function sceneWith(tex: Texture): Scene {
  const scene = new Scene()
  scene.add(new Mesh(new BoxGeometry(), new MeshBasicMaterial({ map: tex })))
  return scene
}

afterEach(() => {
  sceneRefs.stage.scene = null
  // 남은 것을 비운다 — 다음 시험이 앞 시험의 대기줄을 보면 안 된다
  for (let i = 0; i < 64; i++) tickRetiredTextures()
})

describe('버리기를 미룬다', () => {
  it('그 자리에서는 안 버린다 — 그 장에 이미 적혀 있을 수 있다', () => {
    const one = watched()
    retireTexture(one.tex)
    expect(one.gone()).toBe(0)
  })

  it('한 장으로는 모자라다 — 두 장이 나간 뒤에 버린다', () => {
    const one = watched()
    retireTexture(one.tex)
    tickRetiredTextures()
    expect(one.gone()).toBe(0)
    tickRetiredTextures()
    expect(one.gone()).toBe(1)
  })

  it('두 번 버리지 않는다', () => {
    const one = watched()
    retireTexture(one.tex)
    for (let i = 0; i < 8; i++) tickRetiredTextures()
    expect(one.gone()).toBe(1)
  })
})

describe('씬이 아직 무는 동안은 안 버린다', () => {
  it('⚠️ 붙어 있으면 두 장이 지나도 안 버린다', () => {
    const one = watched()
    sceneRefs.stage.scene = sceneWith(one.tex)
    retireTexture(one.tex)
    for (let i = 0; i < 8; i++) tickRetiredTextures()
    expect(one.gone()).toBe(0)
  })

  it('떨어지면 그때 버린다', () => {
    const one = watched()
    const scene = sceneWith(one.tex)
    sceneRefs.stage.scene = scene
    retireTexture(one.tex)
    tickRetiredTextures(); tickRetiredTextures()
    expect(one.gone()).toBe(0)
    scene.clear()
    // 다시 보는 것은 서른 장 뒤다 — 매 장 훑으면 그 값이 프레임마다 든다
    for (let i = 0; i < 29; i++) tickRetiredTextures()
    expect(one.gone()).toBe(0)
    tickRetiredTextures()
    expect(one.gone()).toBe(1)
  })

  it('같은 그림을 문 것이 여럿이어도 하나로 센다', () => {
    const one = watched()
    const scene = sceneWith(one.tex)
    scene.add(new Mesh(new BoxGeometry(), new MeshBasicMaterial({ map: one.tex })))
    sceneRefs.stage.scene = scene
    retireTexture(one.tex)
    for (let i = 0; i < 8; i++) tickRetiredTextures()
    expect(one.gone()).toBe(0)
  })
})
