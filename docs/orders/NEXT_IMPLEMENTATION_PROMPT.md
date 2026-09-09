Radiant Platinum 저장소의 docs/orders/NEXT_RENDER_PRESENTATION_TASK.md(2026-09-08 후속 지시)를 읽고 A~E를 구현·검증까지 실행하라. 기존 OVERNIGHT_REPAIR_PLAN보다 이번 후속 지시를 우선한다. 기존 변경·저장·설치 프로필을 보존하고 커밋·푸시·배포는 하지 마라.

먼저 실패 순간 VAR_FOLLOWER_RIVAL_STATE(16518)와 실제 실행 이벤트를 읽어라. 예진호수 미완료는 아직 가설이다. drive.mjs는 입구 arrived만으로 reached를 기록하고 stood/장면 완료를 반영하지 않는다. 원본 이벤트를 따라 호수 안쪽 장면과 정상 동쪽 통행까지 명시적으로 완료한 뒤 다음 단계로 가라. warped를 완료로 읽거나 플래그를 직접 쓰지 마라.

전체 journey 재실행 전에 오프닝의 타이틀 이동 원인을 추적하고, /intro를 벗어난 뒤 입력을 보내지 않도록 하라. restoreWorld의 load 동기 throw와 settle 동기/비동기 예외가 최신 세대 failed로 연결되도록 보완하라. story --only=door를 짧게 재현해 페이드/캔버스 원인을 분리하고 고쳐라.

경로 계획 수 초 가설은 철회됐다. 최적화나 worker 개발을 더 하지 마라. production 설치와 카메라 수정도 처음부터 재작업하지 마라. 필요한 회귀 검증은 유지하라.

짧은 재현을 닫은 다음 새 게임부터 정상 회복·관장 승리·첫 배지·저장·이어하기까지 완주하라. 독립 항목은 하나의 실패 때문에 멈추지 마라. 동일 실패의 전체 여정을 반복하지 마라.

최종 check/build와 render:first/gpu:loss/journey/story/e2e를 실제 최종 소스에서 실행하라. 현재 journey는 JSON상 9 PASS·8 FAIL이며 보고서의 12 PASS·5 FAIL은 잘못이다. 집계는 원시 JSON에서 생성하고 3,961 검사와 이전 검사 수의 차이도 명령/선택 범위로 설명하라. 공개 CSP는 다른 배포 신원이므로 로컬 통과로 닫지 마라.

실행 상태와 재개 명령을 .audit/overnight-20260908/progress.md에 이어 기록하고, 후속 결과는 별도 REPORT-next.md에 지시서 §7의 8항목으로 남겨라. 구현·검증을 마치기 전에 계획 보고만 하고 끝내지 마라.
