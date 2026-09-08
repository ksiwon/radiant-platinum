# Radiant Platinum 야간 수정 실행서

작성 2026-09-08. 목적: 정상 입력으로 첫 배지까지 완주하고, 복원·첫 화면·장치 복구·설치된 배포 실행을 검증한다. 이 문서는 이전 NEXT_RENDER_PRESENTATION_TASK의 작업 순서보다 우선한다. 전체 제품 범위는 PLATINUM_3D_COMPLETION_PLAN을 유지한다. 게임 전체 완성과 이번 관문 완료를 구분한다.

## 1. 검토 기준선과 판단

현재 HEAD 계보는 8c5f79e ← f981d2e ← b8dd25c다. §41 카메라 수정은 커밋되어 있다. 현재 변경은 MapStreamer, worldState, keyboard, sceneMark, drive/journey/evidence 및 진단 도구다. 사용자 변경을 보존한다.

독립 실행: `pnpm exec vitest run src/engine/input/restoreGate.test.ts src/scene/fieldCamera.test.ts tools/e2e/canvasShot.test.mjs` — 3파일 31검사 PASS, 종료 0. 전체 840검사·build·실기 이동 기록은 이번 검토에서 다시 실행하지 않았다. Playwright는 로컬 1.62.1이다. 전체 GPU/여정 검증도 이 문서 작성 중 재실행하지 않았다.

- 201번도로 12초 무진행은 보고상 하네스 계획 비용과 원작 좌표 이벤트로 설명된다. FPS가 살아 있다는 사실은 모든 게임 기능의 정상 증명은 아니다. script=1은 실행 여부 표식일 수 있으므로 원본 스크립트 번호 14와 동일한 ID로 기록하지 않는다.
- 저장 414/128, 8.5/8.5 왕복은 정상 관측이다. 저장 단위 변환을 추가할 근거가 없다.
- 새 restoring 플래그는 키보드 입력을 막지만 비동기 복원 수명주기와 실패 처리는 아직 안전하지 않다. 아래 N1이 제품 수정 최우선이다.
- 첫 배지를 실제로 받은 판은 아직 없다. 관장 호출/회복 함수 수정은 완료 증거가 아니다.
- 증거가 무효이면 최종 검사를 다시 돌린다. 유효하게 실패한 기록과 오래되어 무효인 기록을 구분한다.

## 2. 밤샘 작업 운영 원칙

분석 → 최소 재현 → 수정 → 관련 검사 → 실제 UI 검증 → 다음 항목으로 계속 진행한다. 한 항목이 막혀도 독립 항목을 진행한다. 특히 설치/production 대조를 첫 배지 완주 뒤까지 미루지 않는다.

처음에 실행 상태 문서 `.audit/overnight-20260908/progress.md`를 만들고 각 작업의 TODO/RUNNING/PASS/FAIL/BLOCKED, 원인, 마지막 명령, 다음 명령, 증거 위치를 갱신한다. 재개 시 이 문서부터 읽는다. 진행 과정이 긴 경우 최소한 매 단계 완료와 새로운 결함 발견 때 사용자에게 알린다. 밤새라는 말은 반복 재시도만 하라는 뜻이 아니다.

동일한 전체 여정을 원인 기록 없이 반복하지 않는다. 같은 실패가 재발하면 실패 직전 정상 저장/입력 기록으로 짧은 재현을 만든다. 진단용 저장 주입은 격리된 시험에만 사용하고 최종 새 게임 완주 증거로 합산하지 않는다.

사용자 개인 브라우저 프로필·저장·원본 자료를 덮어쓰지 않는다. 기존 로컬 ROM/덤프를 설치 UI로 선택하는 것은 이번 검증 범위다. 외부 업로드나 원본 자료의 배포물 포함은 하지 않는다. commit/push/deploy는 이번 실행 범위에 포함하지 않는다. dirty 상태는 사실대로 남겨도 로컬 구현과 검증을 진행할 수 있다.

## 3. N1 — 복원 수명주기와 실패 처리를 닫는다

### 코드에서 확인한 문제

`src/scene/MapStreamer.tsx`의 초기 effect는 다음 순서다.

1. restoring=true, coverScreen().
2. 기본 spawn으로 enter().
3. gridFor(save.matrix).then에서 mapId가 같으면 저장 위치 enter().
4. 실패를 catch에서 삼키고 finally(reveal).
5. cleanup에서 전역 restoring=false.

이 구조는 실패해도 저장 위치가 아닌 기본 스폰을 공개한다. 또한 이전 effect의 Promise가 늦게 끝나면 현재 복원의 전역 플래그를 풀 가능성이 있다. mapId 비교는 같은 맵으로 돌아온 세대를 구별하지 못한다. 실제 enter()에는 enterMap, arriveAt, journalChangedMap, roamersWarped 및 상태 초기화 등 부작용이 있으므로 화면만 덮는 것으로 임시 맵 진입을 무효화할 수 없다. enter() 내부의 resetFade/enterMap이 coverScreen을 해제하는지도 확인해야 한다.

### 권장 구현

- 복원 요청별 고유 세대/취소 토큰을 둔다. 최신 요청만 enter, ready, failed를 쓸 수 있다. cleanup은 자기 요청만 무효화한다. 이전 요청의 then/catch/finally가 새 요청을 건드리지 못하게 한다. mapId는 세대 토큰을 대신하지 않는다.
- 저장 대상의 격자와 필수 준비물을 먼저 준비하고, 실제 목적지에 한 번만 enter하는 구조를 우선한다. 기존 resume.current/devWarp/GPU 재마운트 동작은 각각 보존한다. 기본 spawn을 렌더 목적으로 준비하더라도 게임 상태에 정식 진입시키지 않는다.
- 상태는 적어도 loading/ready/failed를 구별한다. boolean은 입력 게이트의 파생값으로 둘 수 있다. 로딩 실패 시 저장을 유지하고 오류 UI의 재시도/타이틀 이동을 제공한다. 실패 화면 UI는 조작 가능하되 월드 이동·상호작용·저장 덮어쓰기는 막는다. 조용히 기본 스폰으로 풀어주는 fallback은 삭제한다.
- 로딩 화면은 스크립트 페이드가 초기화해도 사라지지 않도록 책임을 분리한다. 최신 목적지의 필수 지형·플레이어·카메라 준비와 공개 가능한 프레임 이후 해제한다. renderer=live 한 값으로 월드 준비 완료를 대신하지 않는다.
- 잠글 대상을 이동 키뿐 아니라 메뉴 저장, 마우스/패드 등 실제 입력 경로와 월드 이벤트까지 확인한다. 로딩 완료에 필요한 렌더·I/O·페이드까지 전체 정지시켜 교착시키지 않는다.
- keydown이 effect보다 먼저 들어오는 창이 있는지 확인한다. 새 세션의 loading 상태는 가능한 한 복원 시작 경계에서 확정한다. 성공 뒤 누르고 있던 이동 키를 유지할지는 기존 조작 계약을 따르되 중복 상호작용/자동 저장은 없어야 한다.

### 필수 검증

지연 Promise로 A 시작 → cleanup → B 시작 → A 성공/실패/종료를 각각 재현한다. B 잠금과 위치가 유지되어야 한다. 정상 성공, 로드 실패, 재시도 성공, 타이틀 이동, StrictMode 재실행, GPU 복구 재마운트에서 목적지와 잠금 소유권을 확인한다. 단순 boolean 설정 테스트만 늘리지 않는다.

실내/외부 저장 각각 UI 복원, 로딩 중 방향키·상호작용·저장 시도, 늦은 로드, 실패 후 재시도를 브라우저로 검증한다. 기본 맵 이벤트가 실행되지 않았고 저장이 바뀌지 않았음을 확인한다. 깨어진 세계는 높이 계약에 영향이 있는 경우 검사한다. 기존 first-frame 검사와 GPU loss도 최종 재실행한다.

## 4. N2 — 경로 탐색 비용과 무진행 판정을 분리한다

### 확인된 구조

`route.mjs`의 pathTo는 head 인덱스 BFS다. Array.shift 병목은 없다. 문제 후보는 문자열 좌표 Map, 반복 객체 생성, goal/avoid 반복 호출, zoneAt의 chunks.find다. 최대 250,000 노드를 방문할 수 있으며 제한 소진과 실제 길 없음 모두 null이다. gridOf는 캐시하지만 zoneAt 청크 조회와 sameMatrixNeighbours 그래프 계산은 반복한다.

`drive.mjs`는 같은 matrix 목적지에 먼저 큰 탐색을 하고 실패하면 mapRoute로 우회한다. 풀 회피/일반 길 두 번 탐색할 수 있다. 이동을 조금 한 뒤 같은 큰 탐색을 반복하는지 계측한다. 절벽으로 분리된 오버월드 두 구역은 같은 matrix여도 직통 경로가 없다.

### 구현 순서

1. planStarted/planFinished, elapsedMs, expandedNodes, goalTests, cacheHit, 종료 이유를 기록한다. 브라우저 frame 진행과 마지막 전송 키 시각을 별도로 기록한다. planning 동안 새 키가 없었던 것은 엔진 정지로 세지 않는다. 계획 전 held 키는 해제한다.
2. chunks의 zone 조회를 정수 인덱스 테이블로 한 번 만든다. 맵 정적 인접 그래프·워프 목록을 자료 버전에 묶어 캐시한다. 현재 avoid/shun/필수 플래그/NPC 등 동적 제약은 정적 캐시에 잘못 고정하지 않는다.
3. 필요한 경우 타일 ID=z*w+x, typed array 방문/부모/방향과 head 큐로 교체한다. 배열 메모리 상한과 범위 밖 목표 처리를 명시한다. 현재 문 타일의 목표 예외를 보존하되 실제 격자 바깥으로 무한 탐색하지 않는다.
4. 먼저 맵/문 수준 경로로 다음 통과 지점을 정하고 지역 경로를 계산한다. 정적 인접이 실제 진행 가능성을 보장하지 않으므로 이벤트/필드 능력/방향성 경계를 검증한다. A*는 명확한 목표 집합과 올바른 휴리스틱이 있을 때만 선택한다. 임의 goal 함수에 Manhattan을 무조건 적용하지 않는다.
5. 남은 경로는 예상 위치와 제약이 일치할 때 재사용한다. 워프, NPC 차단, 이벤트, 경로 이탈이면 무효화한다. 201번도로의 필수 트리거는 우회/삭제하지 말고 대화와 필요한 진행을 정상 입력으로 처리한다.
6. 여전히 CPU 계획 때문에 하네스 관측이 막히면 작업을 분할해 event loop에 양보하거나 Node worker pool로 옮긴다. 요청별 취소와 늦은 결과 무시를 지원한다. 매 탐색마다 새 worker를 만들지 않는다. worker 도입 자체를 필수 대공사로 만들지는 않는다.

### 판정 계약과 성능 기준

found / unreachable / search-budget-exceeded / cancelled / invalid-input을 구별한다. 상한 소진을 길 없음으로 단정하지 않는다. 진행도 감시는 planning/walking/dialogue/battle/loading 단계별로 한다. 좌표 왕복 두 칸처럼 반복되는 순환은 유의미한 진행이 아니다. 프레임 증가도 퀘스트 진행으로 세지 않는다. 전체 벽시계 상한은 유지한다.

기준 입력을 고정해 cold/warm 계획을 비교한다: 201 트리거 접근, 축복→무쇠게이트→무쇠, 실내 문, 도달 불가, 풀 회피 fallback. 목표는 동일 머신의 반복 경로가 수 초씩 하네스를 막지 않는 것. 잠정 목표 warm 계획 p95 100ms 이하, 단일 계획 1초 초과 시 원인/취소 가능 상태를 기록한다. 이 숫자는 측정 전 제안 예산이며 성능을 이미 달성했다는 뜻이 아니다. 우선 정확한 경로와 방문 수 감소를 입증한다.

작은 격자의 기존 BFS 결과/최단 길이 대조, 실제 절벽 우회, 문 목표 예외, 동적 avoid 변경, cap 구분을 검사한다. 성능 검사를 flaky CI 시간 문턱으로만 만들지 않는다.

## 5. N3 — 관장 승리와 첫 배지까지 실제 진행

관장 맵 47/script 1, 탄광 맵 198/script 7235 경로를 원본 이벤트와 대조한다. trainerType 표만 순회하지 않는다. 간호사 회복은 현재 max HP/status/PP와 빈 파티 실패로 개선되어 있으므로 같은 작업을 다시 하지 말고 호출 결과와 소비 예산을 검증한다.

- 회복 실패 시 관장에게 계속 진행하지 않는다. 현재 도시에서 닿을 수 있는 회복 경로를 택한다. 이동+대화+settle 전체가 받은 예산을 공유해야 한다.
- 관장 대화 → 해당 trainer ID 배틀 시작 → 승패 → 배지 지급 스크립트 → 정확한 첫 배지 비트까지 기록한다. 대화 성공이나 trainer 전투 횟수로 승리를 대신하지 않는다.
- 패배 시 전멸 귀환을 감지하고 파티 레벨/기술/HP로 원인을 남긴다. 정상 회복·상성 기술·교체·정상 육성으로 재도전한다. 동일 상태의 무한 재도전은 하지 않는다. 배지/HP/플래그 직접 쓰기와 승리 강제는 금지한다.
- after-gym 컷은 실제 관장 결과, 페이드/배틀 종료, 월드 ready 뒤 촬영한다. 체육관에 못 갔는데 after-gym이라는 이름으로 다른 마을 컷을 성공 증거로 쓰지 않는다.
- 첫 성공 뒤 정상 UI 저장 → 새로고침 → 이어하기에서 위치, 방향, 파티, 첫 배지, 중요 이벤트를 확인한다. 검사 허용 오차는 저장/복원 계약으로 정하고 임의 반 칸 여유를 없애거나 근거를 제시한다.

짧은 체크포인트 재현으로 먼저 닫은 뒤 새 게임 전체 여정을 실행한다. 첫 성공 이후 추가 새 게임 1판으로 반복 가능성을 확인하고, 확률적 실패가 발생하면 성공 판만 고르지 않는다. 최종 정본 증거는 완전한 단일 실행 결과로 만들고 보조 반복 결과를 함께 보존한다.

## 6. N4 — 실제 설치된 production 대조를 일찍 시작

`_perf42.mjs`의 production 경로는 실제 ROM/BDSP 설치가 필요하다. 이는 제품의 DEV 분기 때문이며 `/data`를 dist에 복사해서 대체할 수 없다. 십수 분 설치는 실행해야 할 비용이다.

1. 기존 로컬 ROM/덤프 경로와 설치 helper를 확인한다. 없는 외부 자료는 내려받지 않고 BLOCKED와 정확한 누락 항목을 남긴다. 사용자의 실제 데이터는 외부로 보내지 않는다.
2. 로컬 전용 origin과 전용 persistent browser profile을 사용한다. protocol/host/port가 바뀌면 origin이 달라지므로 설치 재사용이 안 될 수 있다. 프로필은 동시에 한 프로세스만 사용한다.
3. 정상 UI 설치 완료와 manifest/설치 상태를 확인하고 게임을 실제 실행한다. 정상 종료 후 같은 origin/profile 재실행에서 설치와 저장 유지 여부를 확인한다. fresh install 검증과 warm installed 검증을 구분한다.
4. 최신 Playwright 문서는 OPFS storageState 옵션도 설명할 수 있다. 설치된 1.62.1의 실제 타입/API를 먼저 확인한다. cookies/localStorage만 저장하고 OPFS까지 보존됐다고 가정하지 않는다. 안정적인 기본안은 전용 persistent profile이며 프로필 파일을 git에 넣지 않는다.
5. 동일 화면 전환/문제 동작을 dev와 production에서 실행한다. production은 `/src/...` 동적 import 기반 관측을 사용할 수 없으므로 기존 e2e의 제품 UI/공개 진단 표식 경로를 재사용한다. 검증 때문에 dev backdoor를 production에 추가하지 않는다.
6. Performance.measure 래퍼는 측정 이름과 제한된 prop 타입 요약만 기록하고 원래 예외를 유지한다. 문제가 나는 prop을 식별한 진단 실행과 래퍼 없이 재현한 실행을 구별한다. 무제한 Object.entries 순회/거대 detail 재직렬화로 새 오류를 만들지 않는다.
7. production에서 해당 동작이 실제 실행됐고 오류가 없을 때만 배포 영향 없음으로 분류한다. dev FAIL을 PASS로 고치지 않는다. 앱 결함인지 React/R3F 의존성 결함인지 좁힌 뒤 공식 수정 이력이 있으면 최소 호환 업데이트/패치를 선택한다. 버전 최신화 자체를 목적으로 하지 않는다.

GPU 여정/설치/영상 검사를 한꺼번에 여러 브라우저로 돌려 머신 부하를 키우지 않는다. 실제 설치와 GPU 검사는 직렬로 수행하고 CPU 코드 작업만 필요한 범위에서 병행한다.

## 7. N5 — 최종 검증과 증거 연결

수정 중에는 관련 검사만 실행한다. 구현이 안정되면 `pnpm check`, `pnpm build`를 수행하고 개별 명령의 실제 종료 코드를 남긴다. `build`와 `boundary --release`는 다른 판정이다. 현재 check.mjs는 일반 빌드와 release blocker를 구분하므로 dirty/evidence blocker 때문에 빌드를 원천 포기하지 않는다. 경계를 꺼서 배포하지도 않는다.

최종 소스에서 render:first WebGPU 5판, 강제 WebGL 5판, 설치 Chrome headed 3판; gpu:loss; journey; e2e; story를 실행한다. 각 도구의 실제 package script와 지원 인수를 먼저 확인한다. 실제 backend/브라우저/인수/view/DPR/source/artifact/harness/contract를 보존한다. source 변화 뒤 이전 PASS를 새 증거로 재포장하지 않는다.

모든 하네스 의미 변경을 먼저 마무리하고 최종 봉투를 만든다. 공통 evidence 파일 변경이 다른 suite를 무효화하면 정직하게 다시 실행한다. 변경이 없는데 비용 절약 목적으로 digest를 수동 조정하지 않는다. 공개 호스트 CSP와 로컬 dist는 동일 배포 신원이 확인되어야 연결한다. 외부 배포 권한이 없는 항목은 자료를 준비하고 BLOCKED로 남기되 나머지를 끝낸다.

## 8. 완료/중단 기준 및 납품물

이번 완료는 복원 성공/실패/취소 안전성, 계획 병목 개선, 정상 첫 배지와 저장 왕복, 실제 설치 production 대조, 실행 가능한 최종 검사 완료다. 전체 게임 완료와는 별개다.

도구 장애/원본 자료 부재/외부 배포 권한이 필요하면 그 항목만 BLOCKED로 적고 독립 항목을 계속한다. 사용자가 답하지 않아도 일반적인 구현 선택은 이 문서대로 결정한다. 성공을 꾸미지 않는다. 시스템 실행 한계로 멈출 경우 progress.md에 정확한 재개 명령과 남은 상태를 적는다.

납품:
- `.audit/overnight-20260908/progress.md`와 최종 `REPORT.md`.
- 복원 세대별 사건 로그, 실패/재시도 회귀 결과, 전후 PNG.
- 경로 benchmark JSON: 자료 신원·노드 수·시간·종료 이유·기존 결과 대비.
- 첫 배지 지급/저장/복원 증거와 실제 설치 production 오류 대조.
- 각 검사의 종료 코드/FAIL/BLOCKED/미실행, 최종 신원, 변경 파일 요약.
- REPAIR/STATUS/관련 안내 문서의 사실 갱신. 이 실행서의 예상 수치를 실측처럼 옮기지 않는다.

## 9. 검색 자료와 적용 범위

2026-09-08 공식 문서 확인. 외부 문서가 이 앱의 원인 자체를 증명하는 것은 아니다.

- [React useEffect](https://react.dev/reference/react/useEffect): effect cleanup과 비동기 응답 경쟁 처리. N1의 요청 소유권/취소 검증에 적용.
- [React StrictMode](https://react.dev/reference/react/StrictMode): 개발 환경 setup/cleanup 추가 실행. 수명주기 검사를 production에서만 통과시키지 않는 이유.
- [Node worker_threads](https://nodejs.org/api/worker_threads.html): CPU 집약 JS 작업에 worker를 사용할 수 있다. N2에서 자료 구조 최적화 후에도 관측을 막을 때 선택한다.
- [Playwright persistent context](https://playwright.dev/docs/api/class-browsertype#browser-type-launch-persistent-context): userDataDir를 둔 브라우저 상태 재사용. 개인 프로필 대신 전용 경로 사용.
- [OPFS](https://developer.mozilla.org/en-US/docs/Web/API/File_System_API/Origin_private_file_system): origin에 속하는 저장소. N4의 origin 유지와 실제 저장 검증에 적용.
- [React Performance tracks](https://react.dev/reference/dev-tools/react-performance-tracks): development/profiling에 제공되며 기본 production에서는 비활성화된다. 이 문서만으로 앱의 production 무오류를 판정하지 않는다.
