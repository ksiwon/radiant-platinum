// 스크립트 전수 점검이 잡은 「건너뛴 명령」의 판정표 (지시서 GAPS_20261011 H2).
//
// 값은 디컴프 본체를 읽고 우리 VM과 맞댄 결론이다. 판정:
//   done      만들었다 (핸들러가 있다)
//   noop      원작도 하는 일이 없다 · 읽는 쪽이 없다 · 닿을 수 없는 방 — 건너뛰는 것이 원작과 같다
//   out       범위 밖(통신 · 콘테스트 · 지하통로 · 프런티어 타워 계열) — 그쪽 선행 조건이 없어 닿지 않거나, 닫는 답으로 둔다
//   visual    연출·높이 문제 — 화면으로 확인한 뒤 정한다
//   todo      아직 안 만들었다
// 근거는 `raw/decomp`의 `파일:줄`이다.
export const TRIAGE = {
  TrySetUnusedCollectedOrbFlag: ['noop', '`scrcmd.c:6403` — 지하통로 구슬 깃발이고 `underground.c`가 「Set but never read」라 적었다'],
  MoveHearthomeGymDPLift: ['noop', '다이아·펄 체육관의 남은 방(맵 93·95) — 문이 막혀 걸어서 닿지 않는다 (REPAIR 연고 관장 방)'],
  ScrCmd_27C: ['noop', '`scrcmd_tv_broadcast.c:188` TV 방송 기록 — TV는 안 만들기로 했다 (PARITY §7.5)'],
  ScrCmd_2B8: ['noop', '`scrcmd_tv_broadcast.c:116` TV 이름 평가 코너 기록'],
  GetBattleFrontierReporterPosition: ['noop', '앞의 `CheckTVInterviewEligible`이 늘 0이라 이 갈래에 못 닿는다'],
  MessageFromBank: ['out', 'TV 방송 · 미스터리기프트 배달원 갈래에서만 부른다'],
  ScrCmd_205: ['out', 'Geonet(통신 지구본) 화면'],
  ScrCmd_30E: ['out', '유니온룸 소개 편집기 — 부르는 라벨이 진입점 표에 없다'],
  DoGroupConnectionAction: ['out', '레코드믹싱 그룹(통신)'],
  SetClearInCatchingShowFlag: ['out', '파르크 포획쇼 — 선행인 GBA 이송이 통신이라 접수원이 늘 「모자란다」로 간다'],
  MoveCatchingShowMonsToPCBoxes: ['out', '파르크 포획쇼 — 위와 같다'],
  ScrCmd_1D7: ['out', '포핀 굽기 앱(콘테스트 계통)'],
  ScrCmd_2B6: ['noop', '`map_object.c` `STATUS_18`(충돌 건너뜀)을 끄는 명령 — 기본이 꺼짐이라 켜는 곳이 없으면 할 일이 없다'],
  AddCameraOverrideObject: ['noop', '`scrcmd.c:2410` 카메라가 안 따라가는 투명 사람을 세운다 — 보이는 변화가 없고 걸음 시간만 있다'],
  RemoveCameraOverrideObject: ['noop', '위 짝'],
  SetPlayerVolume: ['todo', '`ov5_021F6454.c:1081` 필드 곡 볼륨 — 224번도로 쉐이미 장면의 소리 샘 가능성'],
  ScrCmd_131: ['visual', '`ov5_021DDAE4.c` 포켓치 부팅 연출 — 기능은 `RegisterPoketchApp`이 이미 한다'],
  SetPlayerHeightCalculationEnabled: ['visual', '`player_avatar.c:819` 습초원 트램 승차 중 지형 높이 추종 끄기 — 화면으로 확인'],
  ScrCmd_32D: ['visual', '`ov5_021F6454.c:914` 사람 전원의 「층 다른 것도 그린다」 표식'],
  ScrCmd_32E: ['visual', '위 짝'],
  ScrCmd_331: ['visual', '영원시티 동상 장면의 사람 높이'],
  ScrCmd_332: ['visual', '위 짝'],
  ScrCmd_338: ['visual', '안농길 워프 연출의 따라오는 마리 높이'],
  ScrCmd_339: ['visual', '위 짝'],
  ScrCmd_2CD: ['noop', '날씨 26을 세운다 — 우리 날씨 표에 26이 없어 어차피 안 그린다'],
  SetFavoriteMon: ['noop', '읽는 쪽이 없다'],
  ScrCmd_2E2: ['out', '긁기 카드 앱(프런티어 부속)'],
  ScrCmd_2E3: ['out', '위 짝'],
  DressUpPhotoHasData: ['todo', '쉬운 길 — 묵은 변수로 갈리는 값을 닫는 답으로'],
  ShowDressUpPhoto: ['todo', '쉬운 길'],
  SetDressUpPhotoTitle: ['todo', '쉬운 길'],
  ScrCmd_0A6: ['todo', '쉬운 길'],
  Dummy316: ['noop', '`ov5_021F6454.c:828` 본체가 `return TRUE` 한 줄이다'],
  PokeMartSeal: ['todo', '쉬운 길 — 해님시티 실 가게'],
  GiveOrTakeSeal: ['todo', '쉬운 길'],
  BufferBallSealName: ['todo', '쉬운 길 — 뱅크 12 · 13이 안 구워졌다'],
  BufferBallSealNamePlural: ['todo', '쉬운 길'],
  AddContestBackdrop: ['todo', '배경 19종 비트 — 뱅크 388이 안 구워졌다'],
  BufferContestBackdropName: ['todo', '뱅크 388'],
  CheckHasRoomForGoodsInPC: ['out', '지하통로 굿즈 — 연고시티 동상 갈래만 범위 안에서 닿는다'],
  SendGoodToPC: ['out', '지하통로 굿즈'],
  GiveSphere: ['out', '지하통로'],
  GiveTrap: ['out', '지하통로'],
  BufferUndergroundGoodsName: ['out', '지하통로 — 뱅크 626~631'],
  BufferUndergroundGoodsNameWithArticle: ['out', '지하통로'],
  BufferUndergroundItemName: ['out', '지하통로'],
  BufferUndergroundTrapName: ['out', '지하통로'],
}
