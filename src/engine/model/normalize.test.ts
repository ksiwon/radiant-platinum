// 모델 정규화 — **무대가 월드 원점에 없을 때도** 발이 바닥에 서는가.
//
// ⚠️ **오프닝에서 박사가 하늘 855m에 서 있었다.** 무대(`CINEMATIC_ORIGIN`)가
// 월드 y −1000이라 `Box3.setFromObject`가 돌려준 **월드 상자**의 `min.y`가
// −1000쯤이었고, 그것을 그대로 `wrapper.position.y = -min.y * scale`에 넣어서
// 사람이 통째로 위로 날아갔다. 화면에는 발밑 고리만 남았다 — 씬을 훑어서
// 「고리만 있고 사람은 없다」를 보고서야 알았다.
//
// 그래서 여기서는 **월드 원점이 아닌 무대**와 **배율이 걸린 무대**를 세우고
// 잰다. 원점에서만 재면 그때도 통과했다.
import { Box3, BoxGeometry, Group, Mesh, Vector3 } from 'three'
import { describe, expect, it } from 'vitest'
import { normalizeModel, PLAYER_HEIGHT } from './normalize'

/** 키 `tall`짜리 몸 하나를 `y`만큼 내려간 무대 위에 세운다 */
function stand(y: number, stageScale = 1, tall = 1.7553) {
  const stage = new Group()
  stage.position.y = y
  stage.scale.setScalar(stageScale)
  const wrapper = new Group()
  stage.add(wrapper)
  const model = new Group()
  const mesh = new Mesh(new BoxGeometry(0.4, tall, 0.4))
  // 발밑이 모델 원점에 오도록 — 번들 모델도 그렇게 구워져 있다
  mesh.position.y = tall / 2
  model.add(mesh)
  wrapper.add(model)
  stage.updateMatrixWorld(true)
  return { stage, wrapper, model }
}

/** 무대 바닥을 0으로 본 상자 */
function boxOn(stage: Group, model: Group): Box3 {
  stage.updateMatrixWorld(true)
  const box = new Box3().setFromObject(model, true)
  const floor = stage.getWorldPosition(new Vector3()).y
  box.min.y -= floor
  box.max.y -= floor
  return box
}

describe('normalizeModel', () => {
  it('월드 원점 무대에서 목표 키로 서고 발이 바닥이다', () => {
    const { stage, wrapper, model } = stand(0)
    normalizeModel(wrapper, model, PLAYER_HEIGHT)
    const box = boxOn(stage, model)
    expect(box.min.y).toBeCloseTo(0, 3)
    expect(box.max.y - box.min.y).toBeCloseTo(PLAYER_HEIGHT, 3)
  })

  it('⚠️ 무대가 월드 y −1000이어도 발이 바닥이다 (오프닝 무대)', () => {
    const { stage, wrapper, model } = stand(-1000)
    normalizeModel(wrapper, model, PLAYER_HEIGHT)
    const box = boxOn(stage, model)
    expect(box.min.y).toBeCloseTo(0, 3)
    expect(box.max.y - box.min.y).toBeCloseTo(PLAYER_HEIGHT, 3)
  })

  it('⚠️ 배틀 무대(월드 y −500)에서도 마찬가지다', () => {
    const { stage, wrapper, model } = stand(-500)
    normalizeModel(wrapper, model, PLAYER_HEIGHT)
    const box = boxOn(stage, model)
    expect(box.min.y).toBeCloseTo(0, 3)
  })

  it('⚠️ 무대에 배율이 걸려 있으면 그 배율만큼 작게 선다 — 목표 키는 제 자리 기준이다', () => {
    // 남녀 고르는 창은 안 고른 쪽을 0.88로 줄여 세운다. 정규화가 그것을 도로
    // 키워 버리면 고른 쪽과 크기가 같아진다
    const { stage, wrapper, model } = stand(-1000, 0.88)
    normalizeModel(wrapper, model, PLAYER_HEIGHT)
    const box = boxOn(stage, model)
    expect(box.min.y).toBeCloseTo(0, 3)
    expect(box.max.y - box.min.y).toBeCloseTo(PLAYER_HEIGHT * 0.88, 3)
  })

  it('돌려주는 값이 실제로 적용된 것과 같다', () => {
    const { wrapper, model } = stand(-1000)
    const got = normalizeModel(wrapper, model, PLAYER_HEIGHT)
    expect(got.nativeHeight).toBeCloseTo(1.7553, 3)
    expect(got.scale).toBeCloseTo(PLAYER_HEIGHT / 1.7553, 4)
    expect(wrapper.position.y).toBeCloseTo(got.feetOffset, 6)
  })

  it('두 번 불러도 같은 값이다 — 앞 결과가 쌓이지 않는다', () => {
    const { stage, wrapper, model } = stand(-1000)
    normalizeModel(wrapper, model, PLAYER_HEIGHT)
    const first = wrapper.position.y
    normalizeModel(wrapper, model, PLAYER_HEIGHT)
    expect(wrapper.position.y).toBeCloseTo(first, 6)
    expect(boxOn(stage, model).min.y).toBeCloseTo(0, 3)
  })
})
