# 로컬 Import·설치·세이브 안내와 구현 계약

> 상태: **설계 확정, 구현 전** (2026-08-10).
> 현재 앱은 아직 `public/data/`·`public/models/`를 HTTP로 읽는다. 이 문서는 공개
> 배포판이 도달해야 할 계약이며, 완료 조건을 통과하기 전 현재 빌드를 공개판으로
> 간주하지 않는다. 정책 경계는 [COPYRIGHT.md](COPYRIGHT.md), 포맷은
> [DATA.md](DATA.md), 작업 순서는 [PLAN.md](PLAN.md)를 따른다.

---

## 1. 사용자가 준비할 것

Radiant Platinum은 원본 게임 파일이나 변환된 에셋 팩을 제공하지 않는다. 공개판을
처음 실행할 때 사용자가 이 기기에서 두 입력을 선택한다.

1. 자신이 적법하게 보유한 지원 지역판 Pokémon Platinum `.nds` 파일
2. 자신이 적법하게 보유한 Pokémon Brilliant Diamond에서 이미 추출해 둔
   `Data/StreamingAssets/AssetAssistant/` 폴더

BDSP 쪽은 정확히 `AssetAssistant`를 찾아 들어갈 필요가 없다. 브라우저가 폴더
선택을 지원하면 다음 중 하나를 골라도 Importer가 아래를 탐색한다.

```text
romfs/
  Data/
    StreamingAssets/
      AssetAssistant/
        Battle/
        Characters/
        Dpr/
        Environments/
        Pokemon Database/
```

지원 판정은 폴더 이름 하나가 아니라 필요한 하위 인덱스와 번들 조합으로 한다.
대소문자·공백은 알려진 정식 구조 안에서만 정규화한다. 이름이 비슷한 임의 폴더를
추측해 받아들이지 않는다.

웹사이트가 설명하는 범위는 다음까지다.

- 어떤 두 입력이 필요한가
- 어떤 폴더를 선택해야 하는가
- 앱이 입력을 어떻게 로컬에서 검증하는가
- 필요한 저장공간과 예상 변환 단계
- 실패했을 때 어느 폴더·파일 묶음이 부족한가
- 설치·에셋 캐시·리포트를 어떻게 백업하고 지우는가

ROM 다운로드, 콘솔 개조, 키 획득, NSP/NCA/XCI 복호화 또는 보호조치 우회 방법은
설명하지 않는다. `AssetAssistant`가 준비되지 않았다면 앱은 원천 컨테이너나 키를
요구하는 대신 **“이미 추출된 지원 폴더가 필요합니다”**라고 안내하고 멈춘다.

---

## 2. “선택”이지 “업로드”가 아니다

파일·폴더 선택기는 브라우저가 로컬 파일 읽기 권한을 받는 UI다. Importer는 다음
정보를 네트워크로 보내지 않는다.

- 원본 바이트
- 파일명과 전체 폴더 목록
- 로컬 경로
- 파일·폴더 해시 또는 지원 판정 지문
- 변환된 GLB·PNG·JSON·오디오
- 설치 진행률과 오류 상세

Import 화면의 문구는 “업로드” 대신 **“이 기기에서 Platinum 선택”**,
**“이 기기에서 BDSP 폴더 선택”**으로 쓴다. 개발자 도구의 Network 패널로도 Import
중 정적 앱 업데이트 확인 외 파일 전송이 없음을 검증한다. Import 라우트에는 분석
SDK와 원격 오류 수집기를 넣지 않고 CSP `connect-src 'self'`를 기본으로 둔다.

---

## 3. 지원 브라우저와 권한

첫 지원 목표는 데스크톱 Chromium 계열의 최신 안정판이다.

- HTTPS 또는 localhost가 필요하다.
- `showOpenFilePicker`·`showDirectoryPicker`가 있으면 명시적 핸들을 사용한다.
- 디렉터리 선택 API가 없으면 `<input type="file" webkitdirectory>` 폴백을 제공한다.
- 폴백은 브라우저를 닫은 뒤 원본 폴더 핸들을 다시 열 수 없으므로, 중단 재개 시
  같은 폴더를 다시 선택하게 할 수 있다. 이미 OPFS에 완성된 청크는 다시 만들지 않는다.
- OPFS와 Worker가 없거나 저장공간 추정에 실패하면 게임 설치를 시작하지 않고
  지원 환경을 설명한다.
- 권한 거부는 오류가 아니라 취소다. 이미 설치된 에셋과 리포트를 지우지 않는다.

모바일은 수 GB 폴더 선택, 변환 시간, 메모리, 발열 때문에 첫 공개 목표가 아니다.
모바일에서 앱 셸이 열리더라도 Import 지원을 약속하지 않는다.

---

## 4. 첫 실행 흐름

```mermaid
stateDiagram-v2
  [*] --> capability_check
  capability_check --> choose_platinum: 지원됨
  capability_check --> unsupported_browser: 필수 API 없음
  choose_platinum --> validate_platinum: 파일 선택
  validate_platinum --> choose_bdsp: 지원 판정 통과
  validate_platinum --> choose_platinum: 취소·미지원
  choose_bdsp --> validate_bdsp: 폴더 선택
  validate_bdsp --> estimate_storage: 필수 묶음 확인
  validate_bdsp --> choose_bdsp: 취소·누락
  estimate_storage --> importing: 공간 확보·동의
  estimate_storage --> storage_blocked: 여유 부족
  importing --> verifying: 변환 완료
  importing --> interrupted: 취소·탭 종료·할당량 초과
  interrupted --> importing: 입력 재선택 후 저널 재개
  verifying --> ready: 스키마·지문·표본 대조 통과
  verifying --> importing: 손상 청크만 재생성
  ready --> [*]
```

화면은 각 단계에서 다음을 보여 준다.

| 단계 | 사용자에게 보여 줄 것 |
|---|---|
| 환경 확인 | 브라우저 지원 여부, 보안 컨텍스트, OPFS, 폴더 선택 폴백 |
| Platinum 검증 | 감지 지역판, 지원 여부, 필요한 경우 “다른 파일 선택” |
| BDSP 검증 | 찾은 `AssetAssistant` 상대 경로, 필수 그룹별 있음/없음 |
| 공간 확인 | 원본 크기가 아닌 예상 **변환 결과 + 임시 여유**, 현재 quota·usage |
| 변환 | 전체 퍼센트뿐 아니라 현재 그룹, 처리 수/전체, 쓴 용량, 남은 단계 |
| 검증 | 스키마, 인덱스, 청크 체크섬, 개발 기준 산출물과의 계약 버전 |
| 완료 | 설치된 지역판·언어, 에셋 용량, 리포트 불러오기, 시작 버튼 |

시간 예측은 충분한 실측이 쌓이기 전 표시하지 않는다. 부정확한 “3분 남음”보다
단계·처리량·완료 그룹을 보여 주는 편이 낫다.

---

## 5. 입력 검증

### Platinum

검증 순서:

1. 확장자와 최소 헤더 길이
2. NDS 헤더·FNT·FAT 범위가 파일 안에 있는지
3. 필수 NARC·SDAT·오버레이 엔트리 존재
4. 지원 지역판과 리비전의 로컬 지문
5. 표본 NARC의 엔트리 수와 구조
6. 선택한 지역판에서 만들 수 있는 언어 선언

전체 파일을 한 번에 메모리로 읽지 않는다. `File.slice()`로 필요한 범위를 읽고,
순차 해시가 필요하면 Worker에서 스트리밍한다.

공개판은 설치한 Platinum 언어만 제공한다. 다른 언어를 추가하려면 그 지역판의
호환 ROM을 별도로 선택한다. 현재 개발 모드가 KO·EN·JA 세 벌을 모두 갖는다는
이유로 공개판이 세 언어를 기본 제공해서는 안 된다.

### BDSP

Importer는 선택 폴더 아래에서 알려진 `AssetAssistant` 루트를 찾은 뒤, 최소한 다음
논리 그룹을 검증한다.

| 그룹 | 용도 |
|---|---|
| `Dpr` | 맵·게임 설정·모델 연결 표 |
| `Battle` | 배틀 표와 모션 타이밍 |
| `Characters` | 주인공·NPC·자전거 |
| `Environments` | 배틀 무대와 하늘 |
| `Pokemon Database` | 포켓몬 배틀 프리팹·메시·텍스처 |

포켓몬은 프리팹·공용 메시·폼별 텍스처가 여러 번들에 나뉘므로 파일 하나의 존재만
보고 통과시키지 않는다. 필요한 세트가 모두 해석되는 표본 종을 먼저 열어 본다.

지원되지 않는 BDSP 버전은 “잘못된 소유권”으로 단정하지 않고, 감지한 구조와 지원
계약 버전만 로컬 화면에 표시한다. 원본 파일명이나 지문을 오류 서버로 보내지 않는다.

---

## 6. 변환 아키텍처

```mermaid
flowchart TB
  PF["PlatinumFileSource<br/>File.slice"]
  BF["BdspDirectorySource<br/>DirectoryHandle/FileList"]
  PI["Platinum Import Worker"]
  BI["BDSP Bundle Worker<br/>TS/WASM"]
  C["공통 논리 에셋 계약"]
  J["설치 저널"]
  O["OPFS Pack + Index"]
  A["OpfsAssetProvider"]
  G["게임"]

  PF --> PI --> C
  BF --> BI --> C
  C --> J
  C --> O
  J --> O
  O --> A --> G
```

현재 Node 추출기의 NDS·NARC·Nitro 포맷 코드는 브라우저 TypeScript로 옮길 수 있지만,
`fs`·`Buffer`·Node zlib 의존은 제거해야 한다. 현재 BDSP 모델 변환기는
Python의 UnityPy·NumPy·Pillow에 의존하므로 그대로 브라우저에서 돌지 않는다.
Unity AssetBundle, Mesh, Texture2D, AnimationClip, 재질 채색, GLB 작성에 동등한
TypeScript/WASM 경로가 필요하다.

Pyodide로 UnityPy 전체를 싣는 방식은 초기 다운로드·메모리·호환성 비용을 먼저
측정하기 전 기본안으로 채택하지 않는다. 어떤 구현을 택하든 현재 Python 산출물과
파일 수·스키마·메시 바운드·애니메이션 클립·대표 픽셀을 비교하는 parity test를
통과해야 한다.

Worker 메시지는 큰 ArrayBuffer를 복사하지 않고 transferable로 넘긴다. 원본 전체를
메인 스레드에 올리지 않으며, 한 그룹을 끝낼 때마다 OPFS에 기록하고 메모리를
해제한다. UI는 취소 신호와 진행 이벤트만 주고받는다.

---

## 7. 런타임 에셋 계약

현재 게임은 약 20개 모듈에서 `dataUrl()`·`modelUrl()`을 만들고 `fetch`,
CSS 이미지, Three.js `GLTFLoader`에 직접 넘긴다. OPFS는 공개 HTTP URL이 아니므로
주소의 뿌리만 바꾸는 것으로는 동작하지 않는다.

목표 인터페이스:

```ts
interface AssetProvider {
  exists(path: string): Promise<boolean>
  bytes(path: string): Promise<ArrayBuffer>
  text(path: string): Promise<string>
  blob(path: string): Promise<Blob>
  objectUrl(path: string): Promise<string>
  releaseObjectUrl(path: string): void
}
```

구현은 둘이다.

- `DevAssetProvider`: 개발 전용 로컬 변환 결과를 읽는다. 처음에는 현재
  `public/data`·`public/models` 호환 모드를 제공하되, 최종적으로는
  `public/` 밖 `raw/dev-assets` 또는 별도 로컬 캐시를 Vite dev middleware로만
  노출한다.
- `OpfsAssetProvider`: 공개판 설치 팩과 인덱스를 읽고 이미지·GLB에는 캐시된 Blob
  URL을 제공한다. 화면·맵이 언마운트될 때 참조 수를 줄이고 안전할 때 revoke한다.

JSON·바이너리 로더는 URL로 재-fetch하지 말고 Provider에서 직접 읽는다. CSS 배경,
`Image`, `GLTFLoader`처럼 URL이 필요한 소비자만 Blob URL을 사용한다. GLB는
외부 상대 경로를 갖지 않는 self-contained 결과로 고정한다.

---

## 8. OPFS 설치 구조와 복구

논리 구조:

```text
/radiant-platinum/
  install.json               # 계약 버전·설치 상태·지역판·그룹 지문
  journal.json               # 진행 중 그룹·완료 청크·재시작 정보
  assets/
    data.pack
    data.index.json
    models.pack
    models.index.json
    textures.pack
    textures.index.json
    audio.pack
    audio.index.json
  saves/                     # 에셋 삭제와 분리된 로컬 리포트 사본
```

수천 개 소파일을 그대로 만들지 않고 종류별 pack과 index로 묶는다. 단, 첫 구현은
정확성을 위해 파일 단위로 시작해도 되며 pack 전환은 `AssetProvider` 뒤에서 한다.

설치 규칙:

- 시작 전 `navigator.storage.estimate()` 결과와 변환 임시 여유를 확인한다.
- 사용자 제스처 안에서 `navigator.storage.persist()`를 요청하되 승인으로 간주하지
  않는다.
- `install.json`은 모든 검증이 끝날 때까지 `ready`가 되지 않는다.
- 각 출력은 임시 이름에 쓴 뒤 체크섬을 확인하고 rename/commit한다.
- 중단 후에는 journal과 실제 파일을 대조해 완성된 청크만 재사용한다.
- 계약 버전이 바뀌면 재사용 가능한 그룹과 재생성 그룹을 구분한다.
- “에셋 다시 설치”는 `assets/`와 설치 저널만 지우며 `saves/`와 IndexedDB
  리포트를 건드리지 않는다.
- “모든 로컬 데이터 지우기”는 리포트 백업 다운로드와 별도 확인 없이는 실행하지 않는다.

Service Worker는 앱 셸만 precache한다. 변환 에셋은 Cache Storage와 OPFS에 이중으로
저장하지 않는다.

---

## 9. 개발용 `raw/` 경로

현재 파일은 이동하지 않고 다음 레거시 계약으로 먼저 연결한다.

| 현재 경로 | 역할 | 공개 사용자의 입력과 같은가 |
|---|---|---|
| `raw/roms/` | 개발 Platinum 원본 | 개념상 같지만 파일명에 의존하면 안 됨 |
| `raw/extracted/{us,ko,ja}/` | 언어별 선추출 캐시 | 아니오. 공개판은 선택 ROM에서 생성 |
| `raw/decomp/` | 구조·상수 대조 참조 | 아니오. Import 입력이 아님 |
| `raw/decomp-derived/` | 개발 검증 중간표 | 아니오 |
| `raw/bdsp/Characters`, `dpr`, `pokemon*`, `arenas` | 이미 골라 둔 BDSP 하위 집합 | 공개 `AssetAssistant`의 논리 그룹에 매핑 |
| `raw/bdsp/nca`, `out` 등 | 기존 준비 과정의 보관·중간물 | 아니오. 정상 빌드·Importer가 읽지 않음 |
| `raw/models/` | 모델 실험·중간물 | 아니오 |

목표 구조는 [COPYRIGHT.md §5](COPYRIGHT.md#5-개발용-raw-정책)의
`sources/references/work/dev-assets/legacy` 분리다. 자동 재배치는 하지 않는다.
먼저 `raw.sources.local.json` 같은 Git 무시 설정으로 현재 실제 경로를 논리 그룹에
매핑하고, 추출기는 하드코딩된 특정 파일명 대신 그 설정을 읽는다.

개발 검증은 두 번 돈다.

1. 현재 raw → 기존 Node/Python 추출기 → DevAssetProvider
2. 같은 원천의 지원 입력 → 브라우저 Worker → 임시 OPFS → OpfsAssetProvider

대표 맵·대사·소리·NPC·무대·포켓몬을 두 경로에서 비교한다. 두 결과가 동등해질
때까지 raw 경로를 제거하거나 덮어쓰지 않는다.

---

## 10. 리포트 저장과 휴대용 백업

현재 구현은 `radiant-platinum/save/report` 한 슬롯을 IndexedDB structured clone으로
저장한다. `Uint8Array`가 보존되고 기존 `pt-3d` DB에서 한 번 이전되는 것은
테스트됐다. 그러나 현재는 정확히 같은 `SAVE_VERSION`만 읽고, 다른 버전은 없는
리포트처럼 처리한다. 파일 내보내기·가져오기·스키마 검증도 없다.

목표 리포트 흐름:

```mermaid
sequenceDiagram
  participant U as 사용자
  participant G as 게임
  participant S as 로컬 세이브 저장소
  participant F as rpsave 다운로드

  U->>G: 리포트 작성
  G->>S: 임시 슬롯에 snapshot 기록
  S->>S: 다시 읽어 스키마·체크섬 검증
  S-->>G: 원자적 현재 슬롯 교체
  G->>F: 휴대용 .rpsave 생성·다운로드 시도
  alt 다운로드 허용
    F-->>U: 백업 파일
    G-->>U: 리포트와 백업 완료
  else 브라우저가 차단
    G-->>U: 리포트 완료 + “백업 파일 받기” 버튼
  end
```

**매번 리포트할 때 다운로드를 시도**한다. 브라우저가 반복 다운로드를 차단할 수
있으므로 내부 저장 성공과 파일 다운로드 성공을 별도 상태로 보여 준다. 타이틀과
설정에도 “리포트 백업 받기”를 항상 둔다.

권장 파일명:

```text
radiant-platinum_<trainer>_<YYYY-MM-DD_HH-mm-ss>.rpsave
```

파일 봉투 예시:

```ts
interface PortableSave {
  magic: 'RADIANT_PLATINUM_SAVE'
  formatVersion: number
  saveVersion: number
  createdAt: string
  buildCompatibility: { min: string; max?: string }
  contentContract: { platinumLocale: string; schema: number }
  summary: { trainer: string; playtimeMs: number }
  codec: 'json+base64-typed-arrays'
  checksum: string
  payload: string
}
```

checksum은 우발적 손상을 찾는 장치이지 보안 서명이 아니다. 원본 파일명·경로·ROM
전체 해시·에셋 바이트는 넣지 않는다.

---

## 11. 리포트 불러오기

타이틀 화면에 **“리포트 파일 불러오기”**를 항상 둔다. 현재 로컬 리포트가 없어도
보여야 한다.

1. 사용자가 `.rpsave`를 선택한다.
2. magic·파일 크기 상한·봉투 스키마를 검사한다.
3. checksum을 확인한다.
4. TypedArray를 복원하고 SaveSchema로 범위까지 검증한다.
5. `saveVersion`을 순차 migration한다.
6. 필요한 콘텐츠 계약이 설치돼 있는지 확인한다.
7. 주인공·플레이 시간·저장 시각·호환 결과를 미리 보여 준다.
8. 현재 리포트가 있으면 먼저 그 리포트를 다운로드한다.
9. 사용자가 확인한 뒤 임시 슬롯에 쓰고 다시 읽어 검증한다.
10. 검증 성공 후에만 현재 슬롯을 교체한다.

실패한 가져오기는 현재 리포트를 전혀 바꾸지 않는다. 더 최신 앱에서 만든 파일,
손상 파일, 너무 큰 파일, 알 수 없는 codec을 구분해 안내한다. 지원하지 못하는 옛
버전도 버리지 않고 원본 파일을 그대로 보관하라고 안내한다.

새 게임·설정의 “처음부터”처럼 리포트를 지우는 동작도 삭제 전에 현재 `.rpsave`
다운로드를 시도한다. 개발 콘솔의 reset은 개발 모드 예외지만 명시적 경고를 남긴다.

---

## 12. 알려진 전환 문제

| 문제 | 현재 사실 | 해결 게이트 |
|---|---|---|
| Vite 공개 폴더 혼입 | `public/data` 약 50MB, `public/models` 약 580MB가 기존 `dist`로 복사됨 | 프로덕션 사전 검사 + 로컬 산출물 위치 이전 |
| URL 직접 의존 | fetch·CSS·GLTFLoader 호출부 약 20개 | AssetProvider 전환과 import graph 테스트 |
| Python BDSP 변환 | UnityPy·NumPy·Pillow·일부 Blender 의존 | 브라우저 TS/WASM 동등 변환과 parity test |
| decomp 의존 추출 | 상점·스크립트 폭·스폰 등 일부 도구가 `raw/decomp`를 읽음 | ROM 자체 파싱 또는 배포 가능한 최소 호환성 메타데이터의 법적·기술적 분리 |
| 3개 언어 가정 | 개발 데이터는 KO·EN·JA가 모두 있고 UI가 고정 배열을 사용 | 설치 manifest 기반 availableLocales |
| 세이브 버전 | 버전 불일치는 조용히 null | SaveSchema + migration + 원본 반환 |
| 단일 삭제 경로 | 새 게임·설정 reset이 IndexedDB 리포트를 즉시 삭제 | 삭제 전 portable backup |
| SW 캐시 모델 | 현재 `/data`·`/models`를 HTTP runtime cache | 앱 셸 전용 SW로 교체 |
| 대용량 메모리 | 기존 Node 도구는 파일 전체 Buffer 읽기가 많음 | File.slice·stream·Worker·그룹별 해제 |
| 중단 복구 | 현재 설치 개념이 없음 | journal·임시 파일·원자적 commit |

---

## 13. 구현 순서

1. **경계 게이트부터**: 프로덕션 빌드가 `public/data`, `public/models`, ROM,
   런타임 팩을 포함하면 실패하게 한다.
2. **리포트 휴대성**: SaveSchema, codec, migration, 매 리포트 다운로드, 가져오기,
   삭제 전 백업을 먼저 완성한다. 에셋 전환 중에도 진행을 잃지 않게 하기 위해서다.
3. **AssetProvider**: 현재 URL 소비자를 bytes/blob/objectUrl 계약으로 옮기고
   DevAssetProvider로 기존 게임의 동작을 보존한다.
4. **raw source adapter**: 현재 경로를 설정으로 매핑하고 출력은 `public/` 밖으로
   옮긴다. 기존 raw 파일은 보존한다.
5. **Platinum Worker**: NDS/NARC/텍스트/맵/스크립트/오디오를 브라우저로 포팅하고
   단일 설치 언어를 지원한다.
6. **BDSP 디렉터리 스캐너**: 상위 폴더 자동 탐색, 그룹 검증, 누락 진단을 만든다.
7. **BDSP 브라우저 변환**: 캐릭터 → 대표 포켓몬 → 무대 → 전량 순으로 TS/WASM
   변환기를 늘리고 Python 결과와 비교한다.
8. **OPFS installer**: quota, persist, journal, 원자적 commit, 재개, 삭제 분리를 붙인다.
9. **Import Wizard**: 위 기능을 단계 UI와 접근성 있는 오류 안내로 묶는다.
10. **PWA·개인정보 검증**: 앱 셸만 offline, 네트워크 무전송, 지원 브라우저 E2E,
    새 설치·중단 재개·업데이트·세이브 왕복을 검증한다.

2~4가 끝나기 전에 브라우저 추출 UI부터 만들지 않는다. 저장·로더 경계가 없으면
Importer가 만든 결과를 기존 게임이 소비할 수 없고, 실패 중 리포트를 잃을 수 있다.

---

## 14. 공개판 완료 조건

- 깨끗한 clone의 프로덕션 빌드에 원본 유래 파일이 0개다.
- 서버 요청 로그와 브라우저 Network 검사에서 사용자 입력 전송이 0이다.
- 지원 Platinum 한 지역판과 지원 BDSP `AssetAssistant`로 새 설치가 완료된다.
- 취소·탭 종료·quota 부족 뒤에 완성 청크를 보존하고 재개한다.
- DevAssetProvider와 OpfsAssetProvider가 같은 계약 테스트를 통과한다.
- 대표 데이터·맵·대사·음악·NPC·포켓몬·무대가 현재 raw 개발판과 동등하다.
- 에셋 캐시 삭제 후 리포트가 남고, 재설치 뒤 이어진다.
- 리포트할 때마다 내부 저장과 `.rpsave` 다운로드 상태가 표시된다.
- `.rpsave` 내보내기 → 새 브라우저 프로필 가져오기 → 같은 위치·파티·박스·가방·
  플래그·변수로 이어하기 E2E가 통과한다.
- 앱 업데이트로 saveVersion이 바뀌어도 migration 또는 원본 백업 반환이 된다.
- 공개 도움말에 취득·복호화·키·우회 안내가 없고 로컬 선택·검증·복구는 충분히
  설명돼 있다.

이 조건 중 하나라도 빠지면 “웹에서 편리하게 설치하고 안전하게 이어하는 공개판”은
완료가 아니다.

