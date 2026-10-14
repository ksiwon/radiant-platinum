# 3D 화면 결함 후보 — cosmic-gold에서 넘어온 것 (2026-10-14)

다른 에이전트가 cosmic-gold(하트골드)에서 고친 결함 중 radiant에도 생길 만한 것을 **코드만 읽고** 추렸다.
재서 확인하기 전에는 결함으로 치지 않는다. 참고 구현 `../cosmic-gold`는 이 맥에 없다.

## 순서

1. **이번 판에는 안 넣는다.** 최종 연쇄 → 자동 저장·경고 → 배포 → 릴스가 먼저다. src를 고치면 연쇄를 다시 돌아야 한다.
2. **배포 뒤 1단계(재기만)** — 머신이 비면 기존 도구로 바로 잴 수 있는 것부터: A · B · C · D · H · I.
   판정(재현됨/안 됨/의도) · 캡처 · 수치를 `.audit/` HTML 표로. 3인칭 + 1인칭 4방향(피치 0/−30).
3. **다음 판 2단계(고치기)** — 재현된 것만, **GPU 수정(REPAIR §149)과 한 묶음**으로 넣고 최종 연쇄는 한 번만 다시.

## 항목

| | 후보 | 비고 |
|---|---|---|
| A | 원작 그림 실내(MISFIT_ROOMS 등) 1인칭에서 위가 허공 | **기존 결정과 충돌** — FIRST_PERSON_VISUAL_IMPROVEMENT_PLAN.md:391 「천장은 안 붙인다」(09-21). 재는 것은 하되 고칠지는 사용자 결정 |
| B | `isOutdoors`가 mapType 1·2만 본다 — 시원의 공간 하늘, 창기둥 뒤틀린 판·신월섬 배경, 하늘 돔 바닥 `#a8bf94`(src/scene/fx/sky.ts)가 눈 지역에서 초록, ROM 야외 맵 밖 바닥 | ②는 의도인지 사용자 결정 |
| C | `dsHidden`이 맵 단위 — BDSP 지역 상자 밖 칸에 아무것도 안 그려지는 곳 | 전수 |
| D | ROM 야외 1인칭에서 `VIEW_RADIUS=2` 청크 끝이 지평선에 보이는지 | BDSP 끈 상태 |
| E | 메모리 캐시(chunkMesh · ChunkModels · monModel GLB · NpcModels · gimmickModels) | 주범은 §149(three WebGLBackend)로 이미 쟀다 — GPU 판에서 같이 |
| F | 방 진입 멈칫(방 GLB 캐시 없음, 스킨 bounding sphere) | 도구 새로 — 다음 판 |
| G | 나무 많은 곳 calls/tri(지역 통째 InstancedMesh, Grass frustumCulled=false) | 도구 새로 — 다음 판 |
| H | 3인칭 카메라를 좁은 물길 절벽이 가림 · 실내 배틀 큰 종 머리 잘림 | |
| I | ROM 경로 검은 면 · 행렬 끝 틈 · 동굴 입구 1인칭 들쭉날쭉 | `holes.mjs --eyes --shots` |
| J | BDSP 가구 바닥 투영 ↔ ROM 충돌 칸 어긋남(ROOM_ALIAS 우선) | 도구 새로 — 다음 판 |

지목된 계측 도구 `.audit/probe/{memTour,warpProfile,drawSplit,blackWhat,blackFrac}.mjs`는 이 저장소에 없다(cosmic-gold 것).

## 사용자 결정 (1단계 보고서에 사진과 함께 묻는다)

- A 1인칭 천장 — 09-21 결정을 뒤집을지
- 두께만 준 판 78조각 · 십자 카드 · 물건 판때기 22개를 3D로 바꿀지
- 깃발 · 현수막을 휘날리는 천으로 할지
- 창기둥 뒤틀린 판 · 신월섬 배경이 의도인지
