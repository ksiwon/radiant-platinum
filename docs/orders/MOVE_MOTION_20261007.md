# 기술 연출 순서 · 품질 — PT · BDSP 대조 (2026-10-07)

사용자 지시(2026-10-07 새벽): 「기술 모션 PT랑 BDSP 대조해 보면서 기술 모션 순서 및 퀄리티 끌어올리기」 + 「BDSP에 없는 요소들을 PT에서
가져와 억지로 만든 요소들의 퀄리티가 충분한지 상세히 검토 후에 최선을 다해 개선」.

조사 두 벌이 근거다 — `.audit/reels/findings/move-motion-audit-20261007.md`(시퀀스 명령 129종 · 커버리지 · PT 순서) ·
`.audit/reels/findings/pt-standins-audit-20261007.md`(PT 대역 · 지은 것 목록).

## 한 것

| # | 무엇 | 근거 · 실측 |
|---|---|---|
| 1 | **빈 시퀀스 49벌은 DS로 간다** (`moveSeq.showsNothing`) | `DummyLabel` 한 줄뿐인 시퀀스를 BDSP로 쳐서 그 기술이 화면에 아무것도 안 나왔다 — 트레이너 기술 칸의 7.0%(속여때리기 · 진흙폭탄 · 유혹 …). 걸러지는 수 49 = 조사 값 |
| 2 | **3D로만 내는 소리도 소리 칸이다** (`planSequence`) | 같은 이름의 평면 소리가 없는 `Sound3DPostEvent`를 받는다. 소리 칸이 있는 기술 257 → 409 |
| 3 | **효과 줄 앞 15프레임** (`playback` `HOLD_FOLLOWUP`) | `subscript_move_followup_message.s`의 `WaitButtonABTime 15`. 급소 줄에는 없다 |
| 4 | **상태 이상 · 능력 변화가 BDSP `es0xx`** (`StatusVfx` → `BdspSequence`) | `BattleDataTable.BattleMiscEffectData`가 원작 부분 연출 자리에 거는 시퀀스. 잠듦 es001 · 독 002 · 화상 003 · 얼음 004 · 마비 005 · 혼란 006 · 오름 008 · 내림 009(프리팹 이름이 뜻) |
| 5 | **날씨가 BDSP `et` 이펙트** (`BattleAtmosphere` `Weather`) | `WeatherData.MainFileName` — `et004_sunny01` · `et001_rain01` · `et002_hail01` · `et003_sandstorm01`. 지은 상자 · 팔면체 · 해는 옛 설치본에서만 |
| 6 | **체력판을 시퀀스가 감춘다** (`seqStage.gauge` · `useSeqGaugeHide`) | BDSP 411기술이 0프레임 `GaugeDispAll 0` → 맞기 전 `GaugeDisp trg=1`. PT도 연출 동안 숨긴다(`BattleDisplay_GetAnimHideFlags`) |
| 7 | **색이 다른 포켓몬은 볼이 열릴 때 별이 한 번** (`ShinyBurst` · `ee003`) | 몸 둘레를 늘 돌던 팔면체 일곱은 원작 어디에도 없다. BDSP `BattleMiscEffectData` 2 「レア」. `GroupOption 29 = 231`이 자리를 고른다 |
| — | 설치 그룹 `battleFx` 3판 · 2판도 그대로 쓴다 | 상태 · 날씨 · 별이 없으면 그 연출만 DS로 선다 — 다시 롬을 묻지 않는다(`GROUP_ACCEPTS`) |

## 안 바꾼 것 — 근거가 반대였다

- **시퀀스 중 맞는 쪽 깜박임.** 조사는 「BDSP 시퀀스 동안 깜박임이 꺼진다」를 어긋남으로 적었는데, BDSP 시퀀스 507벌 어디에도 깜박임
  명령이 없다 — BDSP는 `HitBack` · 맞는 모션(16)으로만 반응한다. 지금 모양이 BDSP와 같다(DATA §2.18에 적었다).
- **공격 모션 13갈래가 클립 둘(`ba20` · `ba21`).** `BattleDataTable.MotionTimingData`가 종마다 `Buturi01~03 · Tokusyu01~03 · BodyBlow ·
  Punch · Kick · Tail · Bite · Peck · Radial · Cry · Dust · Shot · Guard`의 **타격 프레임**을 적고, `MotionReplaceData`(51줄)만 다른 클립으로
  갈아 낀다 — 대부분의 종은 BDSP에서도 `ba20`/`ba21` 둘이다. 갈아 끼는 51줄은 아래 「남은 것」.
- **프리팹 32벌 누락.** BDSP 덤프에도 없다(`fx.ts` 주석 · 원작 롬에도 없음). DS 그대로.

## 남은 것 (영향 순)

1. **빗나감에도 기술 연출이 통째로 돈다.** PT는 빗나가면 연출이 없다(`subscript_pursuit.s` → `subscript_missed.s`). BDSP가 빗나갈 때
   무엇을 하는지(연출을 돌리는지)는 못 찾았다 — **갈림길이라 사용자에게 묻는다**.
2. **카메라 판 입자 17기술**(`*_cam` — 째려보기 위아래 띠 · 집중선). `drawType`이 카메라 공간을 뜻하지 않는다(카메라 판이 아닌 113개도
   1이다) — 브라우저에서 `/fxlab`으로 맞춰야 한다.
3. **스텐실 231 · 후처리(방사형 블러 35 · 피드백 51 · DOF 76) 버림.** 웅크리기 흰 공(`ew111`)의 첫 후보. 큼.
4. **상태가 걸린 동안의 몸 표시**(`BattleStatusEffectObserverData` 효과 번호 744~752) — 번호 → 프리팹 표를 못 찾았다. 지금은 얼음 껍질 ·
   혼란 고리 · 씨뿌리기 고리 · 대타 인형을 지어 세운다.
5. **조우 이펙트 `ef_b_encount_*` 110벌 중 2벌, 무대 배경 효과 `ef_b_bg_*` 35벌 중 1벌만 굽는다.**
6. **UI 아이콘이 32px DS 도트**(도구 · 포켓몬) — BDSP `texturemass`에 `item` 380 · `pm` 542가 있다.
7. `MotionReplaceData` 51줄(피카츄 · 식스테일 …의 공격 클립 갈아 끼기), 짐작 상수(흔들림 세기 · 주기).

## 확인

브라우저 확인은 이 날 밤 journey 판이 끝난 뒤 한다(하네스는 한 번에 하나). 볼 것: 상태 여덟 · 날씨 넷 · 색다른 포켓몬 등판 ·
체력판 감춤(몸통박치기 · 울음소리 · 포획) · 빈 시퀀스였던 기술(속여때리기 · 진흙폭탄)이 DS로 서는가.
