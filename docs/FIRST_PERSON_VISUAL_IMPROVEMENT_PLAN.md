# ROM 추출 자산의 1인칭 웹 렌더링 개선 — 수정 LLM 실행 명세

개정: 2026-09-17, v2. 대상 저장소: `radiant-platinum`. 실제 설치 Three.js: `0.185.1`.
이 문서는 이전 개괄 기획을 대체한다. 구현자는 대화 이력 없이 이 문서와 지시된 소스 파일을 읽고 작업한다.
범위는 구현 명세 작성까지다. 이번 조사에서 게임 코드는 수정하지 않았다.

## 0. 구현자에게 주는 작업 지시

**목표:** ROM에서 추출한 형태·그림·배치·상태를 최대한 활용하면서, 1인칭 접근과 회전에 견디는 일관된 저해상도 3D 필드를 만든다. ‘모든 판을 입체화’하거나 ‘구멍만 메우기’를 완료 기준으로 삼지 않는다.

다음 순서를 따른다.
1. §2의 현 구현을 확인하고 §11의 기준선/자산 목록부터 만든다.
2. §4의 자산별 정책과 원본 보존 규칙을 구현한다.
3. §5의 재질 기준을 유지하면서 §6~9의 사물별 변경을 작게 적용한다.
4. 각 변경의 실제 1인칭 전후 화면, 상태 전환, WebGPU/WebGL2 결과를 검증한다.
5. §12 티켓 순서와 §13 완료 조건에 따라 범위를 확장한다.

아래에서 **[확인]**은 소스/원재료를 직접 확인한 사실, **[설계]**는 이 프로젝트에 적용할 결정, **[검증 필요]**는 현재 빌드의 화면으로 확인해야 할 사항이다. 숫자에 ‘초기값’이라고 적힌 경우 ROM의 정답이나 웹 문헌의 권장 상수가 아니다.

금지할 우회:
- 화분·바위·덤불을 같은 구/다면체로 바꾸고 색만 다르게 칠하기.
- 완성된 나무 스프라이트를 둥근 수관 사방에 그대로 붙이기.
- 집 뒷면을 정면 텍스처 복사나 실루엣 투영만으로 완료 처리하기.
- 모든 재질에 `DoubleSide`, `transparent`, PBR, emissive, 노멀맵을 일괄 적용하기.
- 실제 V키 전환 없이 카메라만 이동한 화면으로 1인칭 검증을 대체하기.
- 미분류 자산·로딩 실패·미검수 맵을 조용히 성공으로 간주하기.
- 원본 geometry나 공유 material을 직접 변형해 다른 배치/맵에 변경을 전파하기.

## 1. 조사 결론과 웹 근거

### 1.1 원재료가 알려 주는 것과 알려 주지 않는 것

ROM에는 실제 입체 모델, 한쪽에서만 보도록 생략된 모델, 기울어진 그림 판, 바닥에 그린 식생/물, 위치·회전·충돌·동작 자료가 섞여 있다. **2D 그림 한 장에서 안 보이는 뒷면·깊이·가지 구조는 유일하게 복원되지 않는다.** 따라서 정확한 추출과 보수적인 새 설계를 구분한다.

[설계] 원본은 위치·실루엣·색·대표 문양·게임 의미의 기준으로 쓴다. 빠진 면은 같은 계열의 구조로 보완하고, 새로 정한 깊이·뒷면은 ‘원작 복원값’이라고 주장하지 않는다. 생성된 모든 부분은 레시피와 출처를 추적할 수 있어야 한다.

### 1.2 조사한 기술과 채택 결정

| 근거 | 문헌에서 확인한 원리 | 이 프로젝트의 결정 |
|---|---|---|
| Three.js r185 색 관리 [S1] | 색 텍스처와 선형 작업 색 공간은 구분해야 하며 정점색은 선형 값이다 | PNG의 sRGB 지정 유지. 원본 정점의 명암 계수와 PNG에서 추출한 색을 다른 경로로 처리 |
| Three.js Texture [S2] | 확대·축소 필터와 밉맵·비등방성은 별개 속성이다 | 이미 있는 nearest 확대 + mipmap 축소를 보존. 흐림을 막겠다며 밉맵을 전역 제거하지 않음 |
| Three.js 투명도 [S3] | 투명한 메시 내부 삼각형 정렬에는 한계가 있다 | 잎/풀의 잘린 윤곽은 alpha cutout, 물/연기는 blending. 식생을 반투명 수천 장으로 만들지 않음 |
| Three.js WebGPU r185 [S4] | TSL이 양 백엔드를 대상으로 하며 `onBeforeCompile`·기존 ShaderMaterial 방식은 지원되지 않음 | 첫 구현은 기하·기본 재질 위주. 필요 시 TSL 사용. GLSL 문자열 주입 방식 금지 |
| GPU Gems 식생 [S5] | 작은 잎/풀 군집을 다방향 카드로 표현할 수 있다 | 잎 조각만 카드로 사용. 완성된 부감 나무 그림을 카드로 세우는 방식은 채택하지 않음 |
| GPU Gems SpeedTree [S6] | 식생은 거리별 표현과 전환 품질을 함께 다뤄야 한다 | 근경 입체 실루엣, 중경 단순 메시. LOD 경계 히스테리시스와 동일 앵커 유지 |
| GPU Gems 수면 [S7] | 큰 형상과 미세 잔물결의 표현을 분리할 수 있다 | 해안 높이를 먼저 고정하고 큰 기하 파동을 줄임. FFT/유체 시뮬레이션은 범위 밖 |
| Khronos unlit [S8] | 조명이 그림에 포함된 스타일 자산에 unlit 표현을 명시적으로 사용할 수 있다 | 모두 PBR로 바꾸지 않음. 다만 필드 전체를 unlit으로 바꾸지도 않음 |
| Three.js InstancedMesh·LOD [S9/S10] | 반복 물체 배칭과 거리 전환을 제공한다 | 기존 인스턴싱 유지, 나무마다 독립 React Mesh/LOD 수천 개 생성 금지 |

문헌은 원리를 뒷받침한다. 아래 메시 형태, 제한값, 작업 순서는 현재 코드와 ROM 표본을 바탕으로 정한 설계다. 오래된 GPU Gems의 하드웨어 한계나 API를 현재 브라우저 사양으로 인용하지 않는다.

## 2. 현재 구현 지도 — 먼저 이 사실을 이해할 것

| 파일/함수 | 확인한 동작 | 수정에서 지킬 점 |
|---|---|---|
| `tools/extract/chunks.js`, `src/import/platinum/chunks.ts` | DS 명령을 PT3C로 변환. 16 원본 유닛=1타일, 저장 좌표는 1/256타일 | 새 메시에서 다시 16으로 나누지 않는다. CLI 추출과 브라우저 Importer 결과 일치 유지 |
| `scene/chunkMesh.ts:build` | PT3C 정점/UV/색을 읽고 법선을 geometry에서 재계산 | 원본 법선 복구를 전역 해결책으로 사용하지 않음 |
| `sliceTexture` | 아틀라스에서 개별 그림을 잘라 sRGB, nearest 확대, trilinear 축소, mipmap=true, anisotropy=4 설정 | 현재 아틀라스 전체를 직접 반복 샘플링하지 않음. 정상 필터를 이미 없는 것처럼 재구현하지 않음 |
| `makeMaterial` | Lambert, 정점색, 재질 알파와 softAlpha에 따른 cutout/blend, 원본 culling 고려 | 명시적 새 정책은 추가 인자로 전달하고 미지정은 기존 동작 유지 |
| `ChunkModels` | 원본 로딩 → cutout/lump 판정 → split → 나무/바위/꽃 배치 → 바닥·벽 보완 → 병합 | 중간 단계에서 의미/원본 인덱스를 잃지 않게 한다 |
| `plates:plateLumps` | 약 45도 판의 비율·알파 끝단으로 덩이를 추정 | 후보 탐색용으로 낮춘다. 의미 분류의 최종 판정으로 쓰지 않음 |
| `plates:splitFoliage` | 나무·그림자·바위·lump 원본 면을 제거하고 바닥 메움 자료 생성 | 대체 성공 전 제거 금지. 원본 보존/대체를 같은 결정에서 도출 |
| `cards:cardShells` | 실루엣 경계를 1텍셀 두께로 압출. 중앙의 원본 판은 그대로 | 완전한 입체가 아니므로 울타리/화분에 일반 적용하지 않음 |
| `Rocks:rockGeometry` | 변형 정이십면체, 높이/폭=0.414, 가로줄 평균색. 화분도 이 경로 | 화분·덤불 분리. 바위도 원본 문양과 각진 실루엣을 보존하도록 변경 |
| `Foliage:crownGeometry/treeAt` | 다면체 덩어리 수관, 합쳐진 잎 영역에서 배치·크기 결정 | 검수된 계열 메시로 교체하되 지면 조회/통행 회피/인스턴싱 재사용 |
| `shell:shellPlates`, `ChunkModels:cachedBack` | 누락 방향에 메시를 얇게 압축한 면 추가, 벽 띠 텍스처 생성 | 알려진 건물은 전용 보완. 미분류는 기존 폴백을 유지하되 미검수로 기록 |
| `roomWalls` | 바닥 끝의 빈 벽 높이를 메우고 가까운 벽 UV를 빌림 | 실제 문/방 경계 구간을 우선 적용하고 기존 추론은 폴백으로 유지 |
| `Water` | 원래 물 그림 위 투명면, 2개 CPU 파동, 합 진폭 0.087, 오프셋 0.045 | 바탕과 교차 가능한 조건. 해안·층·수면 소유권부터 고침 |
| `MapStreamer` | 사람/포켓몬/볼 모델, 원본 소품, 나머지 NpcSprites 병행 | ‘모델 목록에 없음’으로 평면 개수를 세지 않음 |
| `BerryPatchProps` | 흙 모델 + 성장 단계 식물 평면 | 성장 상태를 유지하면서 식물 부분만 교체 |
| `EngineDriver` | first 모드에서 플레이어 전체 숨김 | 도구/탈것이 같이 숨는지 검수하고 필요한 표시만 분리 |
| `PropFade`, `Foliage:nearScale` | 실제 first 모드에서 가림/축소 억제 | 눈높이 카메라만 흉내 낸 기존 도구와 결과가 다를 수 있음 |
| `terrainMark:terrainReady` | 최신 요청 커밋·프레임·복원·카메라 정착 판정이 이미 있음 | 새 준비 타이머를 만들지 말고 이 API와 교체 자산 상태를 조합 |
| `scene/fx/post.ts` | TSL RenderPipeline, 윤곽/블룸/기본 렌더 폴백 | 기존 EffectComposer/OutputPass를 가져다 끼우지 않음 |

기준 카메라: `FIELD_FOV=55`는 세로 화각, 눈높이 1.38, 전방 오프셋 0.12, near=0.1, far=200. 현재 플레이어 기준 높이 약 1.5. 비교 과정에서는 이 값들을 고정하고 사물을 교정한다.

## 3. 실제 원재료 표본과 분류 기준

이번 조사에서 `public/data/tex/0.png`를 열어 확대 확인했다. 그 안의 `imped/imped`는 x=128,y=0,w=64,h=64이고, **울타리·낮은 담·큰 바위·사각 화분·둥근 식생·작은 바위가 한 장에 들어 있다.** 텍스처 이름만으로 의미를 정할 수 없다.

아래 영역은 아틀라스 전체 좌표가 아니라 **imped 64×64 내부 좌표**, 좌상단 원점, `[x0,y0,x1,y1)`이다.

| 영역 | 시각적으로 확인한 내용 | 기본 표현 정책 |
|---|---|---|
| `[0,0,64,16)` | 수직 기둥+가로대가 반복되는 울타리 | 구조 메시 + 원본 색/앞면 문양 |
| `[0,20,64,28)` | 낮은 가로 담/난간 띠 | 연결된 단면 메시, 울타리와 별도 레시피 |
| `[0,32,32,64)` | 큰 갈색 바위 | 비대칭 입체 바위 + 바위 부분의 그림 |
| `[32,32,48,48)` | 사각 테두리 안 초록 식물 | 화분 용기·흙·식물 분리 |
| `[48,32,64,48)` | 둥근 초록 식생과 어두운 밑부분 | `shrub` 후보. 용기인지 덤불인지는 확대+배치로 확정; 사각 화분으로 단정 금지 |
| `[32,48,48,64)` | 작은 갈색 바위 | 작은 바위 레시피 |
| `[48,48,64,64)` | 작은 회색 바위 | 작은 바위 레시피, 회색 재료 |

666개 청크 바이너리를 읽어 원본 인접 6-index/4-vertex 후보를 조사했다. `[32,32,48,48]`은 389개, `[48,32,64,48]`은 291개, `[0,32,32,64]`은 131개 후보였다. **이 숫자는 실제 월드 배치 수가 아니며**, 반복 청크·회전·현재 자동 분류를 반영한 수치도 아니다. 정확한 용도는 자산 테스트 표본을 고르는 것이다.

확인한 변형: UV 픽셀 경계가 `[32,49,48,65]`, `[31.125,31.313,48.75,48.438]`처럼 정수 영역에서 벗어나거나, 울타리 U가 `[-32,96]`으로 반복된다. 따라서 `u0===0.5` 같은 일치 비교, 임의 정수 반올림, UV를 무조건 0~1로 clamp하는 구현은 금지한다.

**새 분류 알고리즘:**
1. 원본 index/group를 보존한 상태에서 연결된 평면 조각을 찾는다. 인접한 삼각형 둘이라는 가정만으로 모든 자산을 잘라내지 않는다.
2. 법선/평면 오차/UV 연속성을 검사해 조각을 분리한다. UV seam 또는 다른 source group는 합치지 않는다.
3. `(source kind, assetId, texSet, tex, pal, rep, componentId)`로 식별한다. 이름만 쓰지 않는다.
4. 원본 `rep`의 repeat/mirror/clamp로 UV footprint를 해석한다. 원본 샘플러에서 실제 불투명하게 기여하는 부분의 의미 영역 겹침을 잰다.
5. 후보 대부분이 한 의미 영역에 속하더라도 자동 확정하지 않는다. 첫 릴리스는 검수된 정확한 조각/서명만 활성화한다. fractional UV와 여러 영역 혼합은 명시적 예외 레코드로 처리한다.
6. 각 지역의 같은 이름 그림이 실제 같은 픽셀인지 hash로 확인한다. tex set 0의 표를 다른 set에 이름만으로 복사하지 않는다.
7. 미분류는 기존 표현을 유지하고 `unclassified`로 보고한다. ‘일단 바위’로 보내지 않는다.

첫 회귀 표본 청크: 0(울타리), 133/144(사각 화분 영역), 565/566(둥근 식생 영역), 115/117(큰 바위·경계 밖 UV), 132/142(fractional UV). 이는 청크 자산 ID이며 맵 ID와 혼동하지 않는다.

## 4. 새 데이터/API 계약과 원본 보존

아래 이름은 **신규 제안**이다. 이미 존재하는 API라고 가정하지 말고 이 계약에 맞춰 만든다. 불필요한 프레임워크로 확장하지 않는다.

### 4.1 파일 구성

- `src/scene/visual/types.ts`: 정책 타입만. 런타임 부작용 없음.
- `src/scene/visual/sourceParts.ts`: 원본 조각 식별/UV footprint, 원본 offset 보존.
- `src/scene/visual/resolve.ts`: 정책 선택, 미분류/충돌 진단.
- `src/scene/visual/recipes.ts`: 검수된 일반 구조와 asset selector. 자산별 수치는 provenance 정책에 따라 분리.
- `src/scene/visual/geometry.ts`: 울타리·화분·바위·나무 계열 생성 순수 함수.
- `src/scene/visual/materials.ts`: 재질/텍스처 키와 소유권.
- `src/scene/visual/readiness.ts`: 현재 요청의 대체 자산 pending/ready/fallback/failed 진단.
- `tools/audit/firstPersonSources.mjs`: 실제 자산/배치/변환 경로 목록과 contact sheet 생성 도구.
- `tools/shot/firstPersonAudit.mjs`: 실제 시점 전환과 이동을 기록하는 캡처 도구.

임의의 새 이미지 모델 서비스나 외부 에셋 다운로드는 필요하지 않다. 구조 템플릿은 코드로 생성하고 필요한 원본 texture crop은 로컬 자산에서 생성한다. GLB는 검수된 기존 입체 자산이 있을 때 사용하며, 형식 통일을 위해 모든 PT3C를 GLB로 다시 굽지 않는다.

### 4.2 타입 골격

```ts
// 설계 골격: 각 union별 recipe parameter는 구현 시 분리한다.
type SourceKind = 'chunk' | 'prop' | 'fldeff' | 'npc-gfx';
type Semantic = 'tree' | 'rock' | 'planter' | 'shrub' | 'fence'
  | 'rail' | 'sign' | 'building' | 'wall' | 'ground' | 'grass'
  | 'flower' | 'water' | 'decal' | 'other';
type Outcome = 'keep' | 'augment' | 'replace';
interface SourceKey {
  kind: SourceKind;
  assetId: number;
  texSet: number | null;
  tex: string | null;
  pal: string | null;
  rep: number;
  sourceHash: string;
}
interface SourcePart {
  source: SourceKey;
  // 원본 geometry index 배열에서 삼각형이 시작하는 offset. 필터 후 번호가 아님.
  triangleOffsets: readonly number[];
  componentId: string;
  uvBounds: readonly [number, number, number, number];
  // local position/basis/bounds를 보유. world transform은 별도로 유지.
}
interface VisualRecipe {
  id: string;
  version: number;
  semantic: Semantic;
  outcome: Outcome;
  geometry: 'original' | 'fence' | 'rail' | 'planter'
    | 'rock' | 'tree' | 'building-patch' | 'room-patch';
  materialProfile: 'rom-lit' | 'cutout-lit' | 'decal-unlit' | 'water';
  anchor: 'ground-contact' | 'source-local';
  review: 'draft' | 'verified';
  // parameters, swatches, source selectors, provenance는 별도 타입으로 보유.
}
interface PartDecision {
  componentId: string;
  outcome: Outcome;
  recipeId: string | null;
  removeOffsets: readonly number[];
  status: 'ready' | 'fallback' | 'unclassified' | 'failed';
}
```

### 4.3 교체는 하나의 결정에서 생성한다

`resolveParts → prepareReplacement → commitDecision → filterOriginal + renderReplacement`

- `keep`: 제거 0, 추가 0.
- `augment`: 기존 면 제거 0, 부족한 부분만 추가.
- `replace`: 대체 geometry/material/texture를 사용할 수 있게 된 동일 commit에서 대상 offset을 제거.
- `draft`, hash 불일치, 알 수 없는 selector, 로딩 실패는 새 교체를 적용하지 않는다. 기존 렌더링 결과로 돌아가고 이유를 기록한다.
- 신규 교체 대상은 기존 `isRock`/`lumps`/`isFoliage`에 따른 제거와 기존 Rocks/Foliage 생성에서 동시에 제외한다. 원본 판+기존 대체+신규 대체가 동시에 표시되는 상태를 금지한다.
- 같은 triangle을 여러 recipe가 claim하면 설정 오류다. 처리 순서에 따른 승자를 만들지 않는다.
- triangle offset은 원본 index의 시작 위치로 3의 배수다. group 번호는 `ChunkMesh.materials`의 submesh 순서와 `mesh.groups` tuple의 원본 material ID를 혼동하지 않는다.
- 원본 attribute 배열이나 index를 변경하지 않고 새 geometry를 만든다. 법선·bounds를 갱신하고 material group은 출력 index 기준으로 재구성한다.

### 4.4 캐시·비동기·배포 경계

- 캐시 키: provider 세대 + sourceHash + recipeVersion + texSet/palette + variant + LOD. `cachedBack(id)`처럼 ID만 있던 경로에 다른 정책이 섞이지 않게 한다.
- `ChunkModels`의 `alive`/요청 번호/실패 시 정리 구조를 유지한다. 폐기된 맵 요청이 늦게 완료되어 새 맵의 대체물을 덮지 못하게 한다.
- geometry/material/texture의 owner를 구분한다. 공유 geometry는 인스턴스 unmount마다 dispose하지 않는다. 개별 소유 texture는 기존 `dropMaterial`/`retireTexture` 관례를 따른다.
- 새 provider 종속 캐시는 `onProviderSwap`에 등록한다. Blob URL은 발급한 provider에 반환한다.
- 자산 읽기는 `assets()`와 provider API를 사용한다. `/public/...` 직접 fetch를 새 런타임 경로에 만들지 않는다.
- ROM으로부터 생성한 crop/메시/확정 manifest는 기존 로컬 HTTP/OPFS 설치 경계를 따른다. 원본 바이트를 TS 상수/base64로 번들에 넣지 않는다. 이는 기존 `tools/distribution/check.mjs` 구조를 보존하기 위한 요구다.
- 첫 버전은 로딩한 원본으로 runtime 파생 결과를 캐시한다. 새 필수 설치 파일을 만들지 않아 기존 설치와 호환된다. 추후 영속 파생 manifest를 도입할 때만 `src/import/platinum/chunks.ts`의 `convertTextures/convertProps` 이후 단계와 설치 형식/검증을 함께 변경한다.

### 4.5 기존 함수에 연결하는 정확한 순서

`ChunkModels`의 현재 `loaded.map` 안에서 `plateLumps/cachedSplit`보다 먼저 원본 조각과 ready 결정들을 구한다. 함수마다 각자 다시 분류하지 않는다.

제안하는 중간 계약:

```ts
interface ResolvedVisualPlan {
  key: string; // source hash + recipe version + ready 결정의 해시
  // 모든 verified 결정의 원본 offset. 기존 변환에서 제외할 대상.
  suppressLegacyOffsets: ReadonlySet<number>;
  // ready replace만 들어감. keep/augment는 여기에 들어가지 않음.
  removeOffsets: ReadonlySet<number>;
  decisions: readonly PartDecision[];
  // 원본 조각에서 얻은 바닥 footprint/anchor와 준비된 대체 batch 정보도 보유.
}
```

1. source를 읽고 `resolve`한다. replacement가 비동기라면 같은 요청 내에서 준비 후 배치를 만들거나, 기존 표현을 먼저 commit하고 새 ready plan으로 원자적으로 교체한다. 어떤 경우든 준비 전 `removeOffsets`에 넣지 않는다.
2. `splitFoliage(..., plan?)`, `cachedSplit(..., plan?)`, `cardShells(..., plan?)`, `rockSites(..., plan?)`에 optional 마지막 인자를 추가한다. 미지정은 기존 호출/테스트와 동일한 동작을 유지한다. signature 변경 후 모든 호출처를 검색한다.
3. `standCutouts`에서 `suppressLegacyOffsets`에 해당하는 조각은 원본 자세 그대로 두고 새 recipe가 transform을 담당한다.
4. `splitFoliage`는 각 원본 triangle에 대해 `removeOffsets`면 제거, `suppressLegacyOffsets`에만 있으면 원본 유지, 그 밖이면 기존 알고리즘 적용 순으로 처리한다. 현재 group 전체를 먼저 건너뛰는 `isRock`/shadow 분기는 일부만 교체되는 group에서도 올바르게 동작하도록 바꾼다.
5. `cardShells`와 기존 `rockSites`는 suppress 대상의 shell/바위를 생성하지 않는다. 새 생성기가 그 부분을 책임진다.
6. `treeSites`용 coverage와 원본 나무 아래 floor repair용 coverage를 필요 시 분리한다. 새 나무를 만들려고 기존 `Split.cells` 생성을 모두 꺼서 숲 바닥 메움까지 사라지게 하지 않는다. `sourceFootprint`는 제거 전 원본에서 얻어 floor 단계에 넘긴다.
7. `cachedSplit`, `cachedShells`, floor 관련 cache는 plan.key를 포함한다. 정책이 달라졌는데 기존 key 결과를 재사용하지 않는다.
8. 첫 단계에서는 원본 vertex attribute 순서를 유지하고 index만 필터한다. `cards` 등 원본 index를 참조하는 후속 단계가 끝나기 전에 vertex 배열을 compact하지 않는다.
9. `next`/`batch`에 대체 batch와 readiness snapshot을 함께 담고 기존 effect commit 경계에서 교체한다. `setState` 직후를 ready로 적지 않는다.
10. 새 메시가 아닌 실제 원본을 유지하려는 verified `keep`도 suppress에 포함한다. 반면 `fallback/unclassified`는 plan override 없이 **현행 표현**을 유지한다. 두 경우를 보고서에서 구분한다.

### 4.6 적용 범위와 되돌리기

레시피별 활성화로 작은 범위를 검증한다. 새 옵션을 사용자 메뉴에 노출할 필요는 없다. 개발 비교는 `legacy / candidate` 모드로 하되 기본 게임에서 적용할 verified 레시피 집합을 명확히 한다.

어떤 레시피가 화면/기능 회귀를 만들면 그 레시피만 기존 경로로 되돌릴 수 있어야 한다. 전체 split 알고리즘을 한꺼번에 삭제하지 않는다. 다만 최종 목표 범위에 legacy가 남았으면 미완료로 기록한다. 검증 결과 없는 전역 자동 적용은 금지한다.

## 5. 재질·텍스처·법선 명세

### 5.1 기존 필터를 보존하고 문제를 분리한다

[확인] `sliceTexture`는 이미 `magFilter=NearestFilter`, `minFilter=LinearMipmapLinearFilter`, `generateMipmaps=true`, `anisotropy=4`다. 벽 보완용 `cachedBack`의 띠는 별도로 nearest/no-mipmap이다. 따라서 가까운 도트가 크다는 이유로 원본 텍스처 전체를 AI 확대하거나, 먼 거리 반짝임을 해결한다며 그림을 일괄 흐리게 하지 않는다. [Texture 공식 문서 S2](https://threejs.org/docs/pages/Texture.html)

[설계]
- 원본 색 texture는 현재 확대/축소 필터를 유지한다. 새 crop도 같은 설정으로 시작한다.
- 벽 띠가 이동 시 반짝일 때에만 해당 파생 texture에 mipmap을 추가해 비교한다. 모든 재질을 한 번에 변경하지 않는다.
- anisotropy는 현재 4를 상한 초기값으로 유지하고 백엔드가 제공하는 한도를 초과하지 않게 한다. 임의의 renderer 내부 필드를 사용하지 않는다.
- 아틀라스 내부 작은 영역을 반복 사용하려면 **그 영역을 별도 texture로 crop**한다. 전체 아틀라스에 `RepeatWrapping`을 걸지 않는다. 원본 repeat와 mirror는 원본 해석 단계에서 보존한다.
- 0-alpha 경계 RGB를 인접한 유효 RGB로 확장하되 alpha는 그대로 두는 edge dilation을 파생 cutout에 적용한다. 이는 색 번짐 방지이고 실루엣을 두껍게 만드는 처리가 아니다.
- 원본이 soft-alpha인 빛/연기/물은 alphaTest 0.5로 강제 변경하지 않는다. 새 잎 crop의 중간 alpha가 생겼다고 자동으로 blend로 분류하지 않도록 의미 정책을 명시한다.

### 5.2 재질 프로필

| 프로필 | 기본 구현 | alpha/depth | 면·그림자 |
|---|---|---|---|
| `rom-lit` | 기존 `MeshLambertMaterial`, sRGB map, 흰 material color와 필요한 vertex tint | transparent=false, depthTest/write=true | 닫힌 새 메시 FrontSide, cast/receive는 의미별 |
| `cutout-lit` | Lambert + 잎/풀 전용 crop | alphaTest=0.5 초기값, transparent=false, depthWrite=true | 실제 얇은 잎만 DoubleSide. alpha를 반영한 그림자 확인 |
| `decal-unlit` | MeshBasicMaterial 또는 대응 node material | hard cutout/soft blend는 소스대로 분리 | 지면 무늬·기호만. 공간 오브젝트 전체에 기본 적용 금지 |
| `water` | 1차는 기존 Lambert, §8 경계/높이 수정 | 기존 blend/depth 정책 유지 후 전후 비교 | 물 아래 윤곽은 `markSeeThrough` 계약 유지 |
| 기존 BDSP 인물 | 기존 Standard 재질 경로 | 원본 상태 유지 | roughness=0.85, metalness=0 현재 정규화 유지 |

`DoubleSide`는 빠진 벽을 생성하지 않으며 깊이도 만들지 않는다. 투명 교차 면을 전부 blend로 바꿔도 정렬 문제가 해결되지 않는다. [투명도 S3](https://raw.githubusercontent.com/mrdoob/three.js/r185/manual/en/transparency.html)

재질이 바뀌어도 밤/날씨가 반영되어야 한다. unlit을 쓴 작은 장식은 기존 환경색과의 차이를 검수하고 필요한 명시적 tint를 적용한다. 장면 전체를 밝게 만들기 위해 emissive를 올리지 않는다. 조명이 포함된 스타일 그림에 unlit을 적용하는 것은 정당한 선택이지만 PBR로 자동 승격할 이유는 없다. [Khronos S8](https://raw.githubusercontent.com/KhronosGroup/glTF/main/extensions/2.0/Khronos/KHR_materials_unlit/README.md)

### 5.3 색 공간 — 확정하지 않은 것을 전역 수정하지 않는다

- PNG에서 읽어 만든 baseColor는 sRGB 데이터다. 정점색에 넣을 때 sRGB→linear 변환을 한 번 한다. `new Color(hex)`의 변환과 수동 변환을 겹치지 않는다.
- PT3C 원본 `color`는 현재 byte/255로 읽는다. DS 명령의 정점색은 조색/명암 계수 의미도 있으므로 PNG 색과 같다고 가정해 전부 sRGB 변환하지 않는다. 이 작업의 기본값은 현 동작 유지다.
- 텍스처 없는 재질의 `d`와 원본 vertex color, 새 메시에서 PNG로부터 만든 color를 구분한 테스트를 둔다.
- 진단용 unlit 패치에서 원본 PNG색과 `texture`/생성 vertex color 경로를 비교한다. 출력 톤매핑을 끈 진단은 진단용일 뿐 제품 Stage 설정을 영구 변경하지 않는다.
- 법선·roughness·mask는 색 texture가 아니므로 `NoColorSpace`. [색 관리 S1](https://raw.githubusercontent.com/mrdoob/three.js/r185/manual/en/color-management.html)

### 5.4 법선과 구운 명암

[설계] 새 바위·건물은 기하 면의 hard edge를 보존하고, 줄기·식물의 완만한 면만 제한적으로 smoothing한다. 모든 메시에서 `ballNormals`를 재사용하지 않는다.

- 정점 위치만 같다고 UV seam/hard edge를 무조건 weld하지 않는다.
- 위치 변경 뒤 정상적인 winding과 normal을 재계산한다. nonuniform scale 시 normal matrix를 적용하거나 최종 geometry에서 재계산한다.
- 그림에 그려진 하이라이트를 자동 height/normal map으로 변환하지 않는다. 밝은 색이 돌출이라는 보장이 없다.
- 그림자 중복을 줄이기 위해 해당 원본의 baked-shadow가 대체 대상과 연결된 경우에만 제거한다. 새 식생을 만든다는 이유로 근처의 모든 어두운 재질을 지우지 않는다.
- 원본 질감은 유지하고 새 면은 같은 재료의 작은 swatch로 마감한다. 원본 그림의 위아래 평균색만 바르면 그 구조의 문양이 사라진다.

### 5.5 셰이더 선택

첫 구현은 CPU geometry 생성과 기존 지원 재질로 완료한다. 잔물결/바람이 필요할 때만 `three/tsl`과 node material로 추가한다. `ShaderMaterial`, GLSL 문자열 `onBeforeCompile`, 기존 EffectComposer를 가져오지 않는다. 현재 WebGPURenderer는 WebGL2 fallback까지 같은 시스템에서 담당한다. [r185 WebGPU S4](https://raw.githubusercontent.com/mrdoob/three.js/r185/manual/en/webgpurenderer.html)

alphaToCoverage는 렌더 타깃이 실제 MSAA인지 확인한 경우에만 선택적으로 시험한다. alphaHash는 TAA가 없는 현재 화면에서 노이즈가 생길 수 있어 기본값으로 채택하지 않는다. [Material S11](https://threejs.org/docs/pages/Material.html)

## 6. 사물별 geometry 명세

모든 기본 생성 함수는 React/useFrame을 모르도록 만들고 `BufferGeometry + material slots + local bounds + anchor`를 반환한다. 단위는 타일. 원본 placement transform은 마지막에 한 번 적용한다. 반복 객체는 기존 instancing 흐름에 연결한다.

### 6.1 화분 — 첫 번째 확정 수정 대상

수정: `plates.ts:plateLumps/splitFoliage/rockSites`, `ChunkModels`의 byRock 루프, 신규 `visual/geometry.ts`와 정책.

[설계] §3의 사각 화분 영역은 Rocks 경로에서 제외하고 아래 구조로 만든다.

1. 원본 판의 수평 폭 `W`를 local basis에서 구한다. 기울어진 world AABB의 깊이를 용기 깊이로 쓰지 않는다.
2. footprint는 사각형 `W×W`로 시작한다. 깊이는 원본 단일 뷰로 확정되지 않으므로 레시피의 명시적 설계값이다.
3. 용기 본체: 아래 폭 `0.80W`, 위 폭 `0.94W`, 높이 `0.42W`의 사각 절두체. rim 바깥 폭 W, 두께 `0.06W`, 높이 `0.05W`. 흙은 rim 상단보다 `0.04W` 아래. 모두 **시제품 초기값**.
4. 용기·rim은 닫힌 불투명 메시, 흙은 위를 보는 면. 용기 hard edge를 유지한다.
5. 식물은 흙 안쪽 폭 `0.72W` 내에서 시작하며 높이 `0.40W`의 작은 구조를 기본으로 한다. 완성된 화분 스프라이트를 식물 사방에 붙이지 않는다.
6. 원본 crop에서 용기 회색, rim의 밝은 회색, 흙의 갈색, 잎의 초록 영역을 레시피로 지정한다. alpha나 평균 RGB만으로 자동 역할을 정하지 않는다.
7. 직립 foliage card를 쓸 경우 용기/흙 픽셀이 없는 잎-only crop이 확보된 경우에 한한다. 없으면 짧은 잎 형상/수관 메시를 쓰고 palette와 작은 질감 swatch만 재사용한다.
8. anchor는 지면과 만나는 용기 밑면. `groundYAt`/현재 층에 맞는 기존 지면 조회를 사용한다. 같은 좌표의 다른 층 바닥에 놓지 않는다.

검증: 0.5/1/2타일 측면·뒷면·위에서 용기의 림과 흙이 구분됨, 원본 판과 Rocks 대체가 남지 않음, 보행로/벽과 겹치지 않음, tex set/palette 변형에서 같은 구조가 유지됨.

### 6.2 울타리·낮은 담·간판

수정: `cards:cardShells`, `plates:standCutouts`, `ChunkModels:cachedShells`, 신규 구조 생성기.

- 울타리의 가로 방향은 판의 horizontal tangent로 구한다. UV U의 월드 길이/픽셀 길이로 원본 반복 피치를 구한다. 원본 그림의 기둥 간격을 그 피치로 반복한다.
- 기둥의 중심·폭·윗선과 가로대 y 구간은 해당 8/16픽셀 반복 셀에서 검수된 마스크 값으로 둔다. §3에서 보이는 울타리처럼 명암 줄을 가로대로 오인하지 않는다.
- 각 기둥은 상부/측면/뒷면을 가진 prism. 앞면의 밝기 문양은 원본 crop, 옆/뒤는 같은 재료 swatch와 실제 조명으로 구성한다.
- 두께 초기값은 기둥 폭의 0.6배. 원본 한 텍셀을 모든 물건의 두께로 강제하지 않는다. 얇은 가로대는 기둥보다 얕게 한다.
- 낮은 담은 별도의 단면을 길이 방향으로 extrude한다. 구간 끝에 cap을 만들고, 꺾이는 자리에서 두 개의 두꺼운 cap이 겹치지 않게 endpoint 키로 연결한다.
- endpoint 키는 world position을 원본 정밀도(1/256타일)에 맞춰 양자화하고 layer/recipe를 포함한다. 평행하지만 높이가 다른 울타리를 연결하지 않는다.
- 원본 collision 의미를 유지한다. 생성 두께 때문에 길을 침범하면 두께/앵커를 조정하고 collision을 몰래 넓히지 않는다.
- 간판은 앞면 그림, 등판, 지지 기둥을 분리한다. 뒤에서 글자가 비치거나 반전되어 보이는 것을 금지한다.
- `cardShells`는 실제 얇은 오려낸 장식이고 검수된 자산에만 남긴다. 울타리의 새 구조가 준비되면 원본 판과 shell을 함께 제외한다.

검증: 울타리를 따라 좌우 이동할 때 단면 소실/톱니 윤곽/기둥 간격 점프 없음. 코너·끝단·경사·청크 경계에서 이음 검수. gate처럼 열리는 물체는 정적 울타리 병합에서 제외.

### 6.3 바위

수정: `Rocks.tsx`, `plates:rockSites`, 정책.

- 작은 바위/큰 바위/해안 바위/상호작용 바위를 구분한다. 모양을 공유해도 상태와 actor ID는 공유하지 않는다.
- 원본 실루엣을 기준으로 3~4개 비대칭 높이 ring과 6~8개 둘레 점을 둔 저폴리 메시를 사용한다. 각 ring의 중심/반지름은 레시피로 명시한다. 모든 꼭짓점에 독립 난수를 주어 울퉁불퉁한 공을 만들지 않는다.
- 주요 능선은 hard edge, 작은 면 사이만 제한적으로 smoothing. `ballNormals`는 새 바위에 적용하지 않는다.
- 원본 전면 문양은 기준 방향 UV로 보존하고 측·후면은 같은 rock crop의 문양 swatch로 마감한다. 그림의 검은 바닥 그림자를 모든 옆면에 늘리지 않는다.
- 높이/폭=0.414는 현재 원형 가정에서 나온 값이다. 모든 바위의 고정 비율로 계속 사용하지 않는다. 계열별로 reference silhouette와 지면 앵커를 맞춘다.
- 랜덤 변형은 2~3개의 검수된 variant 선택과 수평 회전 중심. 배치별 독립 geometry 생성 금지.
- 해안 바위 밑은 기준 지면/수면 관계를 보고 일부 묻되, `ROCK_SINK` 변경만으로 떠 있는 배치를 덮지 않는다.

### 6.4 나무와 숲

수정: `Foliage.tsx:crownGeometry/trunkGeometry/treeAt`, `plates:treeSites`, `ChunkModels`의 byTexture 그룹.

**채택 형태:** 근경은 줄기+닫힌 수관 실루엣이 기본이고 작은 잎 조각을 선택적으로 보강한다. 완성된 부감 나무 스프라이트 billboard와 구체 덩어리 반복은 주 표현에서 제외한다. 잎 카드의 원리는 유효하지만 카드에 쓰는 것이 잎 조각이어야 한다. [식생 S5](https://developer.nvidia.com/gpugems/gpugems/part-i-natural-effects/chapter-7-rendering-countless-blades-waving-grass)

1. tree 텍스처마다 수관·줄기·그루터기·바닥 그림자의 영역을 source sheet에서 기록한다. 전체 평균색으로 모든 영역을 섞지 않는다.
2. 활엽/침엽/설목 등 실제 자료로 구분되는 계열을 만든다. 구별할 근거가 없는 텍스처는 같은 검수 계열+팔레트로 둔다.
3. 기본 활엽 수관은 5개 수평 ring, ring당 8~12개 점의 닫힌 crown으로 시작한다. 정규화 y/radius 초기 표는 `(0,0.35), (0.18,0.85), (0.50,1.0), (0.82,0.70), (1,0.12)`이고 아래 cap을 포함한다. 이 값은 시제품이며 원본 실루엣 비교로 확정한다.
4. 실루엣이 단순한 회전체로 보이지 않게 2~3개 검수 variant에 ring 중심 오프셋과 방사 변화를 저장한다. 프레임 난수 금지. 잎 덩어리 수만 늘려 디테일을 대신하지 않는다.
5. 줄기는 6~8각 taper, 뿌리 접점은 약간 넓고 위로 좁아지도록 한다. 수관 아래 작은 가지 연결을 포함하여 잎이 공중에 뜨지 않게 한다. 밑동 폭은 계열별이고 나무 크기 변화와 무관하게 고정하지 않는다.
6. 원본 수관의 잎-only swatch를 upper/side/lower 재료로 선택한다. 내려다본 나무 전체 그림을 UV로 둘러 붙이면 밑동 그림이 수관에 생기므로 금지한다.
7. 잎-only 투명 crop이 없으면 카드 사용을 강제하지 않는다. 새 그림을 자동 생성하는 대신 원본 palette/문양 swatch를 적용한 crown으로 우선 완성한다.
8. 원본의 개별 밑동/그림자 앵커가 있으면 그 위치를 우선한다. 연속 숲 벽처럼 개별 나무가 정의되지 않은 경우에만 수관 영역을 합친 polygon 내부에서 배치한다.
9. 숲 경계와 내부를 나눈다. 경계는 플레이 동선에서 줄기와 수관 하단을 읽을 수 있게 하고, 내부는 crown coverage를 유지한다. 규칙 격자 그대로 세우지 않는다.
10. 배치 seed는 sourceHash/청크/앵커 키로 고정한다. 최소 간격 검사는 이웃 청크까지 고려하고 동일 앵커 중복을 없앤다. 청크 로딩 순서가 위치를 바꾸지 못한다.
11. `trunkNudge`/기존 clearance는 보존하되 후보를 제한된 범위에서 이동 → 소형 검수 variant → 제외 순으로 처리한다. 매 프레임 크기를 줄여 건물 관통을 숨기지 않는다.
12. 키/반지름은 인접 판 더미의 높이만으로 결정하지 않고 계열의 검수 척도와 원본 화면 실루엣을 같이 사용한다. 지면은 기존 층을 포함하는 ground 조회로 맞춘다.

LOD: 근경은 3D crown, 중경은 ring/분기 수를 줄인 동일 실루엣 메시. 첫 버전의 원경도 작은 3D 메시를 유지한다. 새 다방향 impostor는 필수 사항이 아니며 검수된 3D로부터 구운 경우에만 추후 도입한다. 기존 원본 그림 한 장을 원경 impostor라고 부르지 않는다.

### 6.5 풀·꽃·열매·변장

- 풀: `grassSpots`의 encounter behavior를 위치 정본으로 유지한다. 2~3개 잎 군집 variant, 타일 중심 고정 대신 deterministic jitter. 단순히 TUFTS를 크게 올리지 않는다.
- 근경 풀은 현재 잎 메시를 곡선 2~3구간으로 개선할 수 있다. 잎-only 카드 사용 시 base를 땅에 고정하고 위쪽만 움직인다. 상호작용 영역 밖 장식풀과 encounter 풀을 혼동하지 않는다.
- 꽃: 원본 바닥 꽃 패턴을 그대로 둔다면 위에 꽃을 4개씩 추가하는 현재 밀도를 낮춘다. 바닥의 꽃 픽셀 위치와 겹치는 검수 앵커를 사용한다. 해당 바닥 영역을 덜 꽃무늬인 재료로 바꿀 수 있을 때만 전체 입체 꽃밭으로 확장한다.
- 열매: 흙 모델 유지. 싹/성장/개화/결실에 대응하는 공용 plant 구조를 만들고 품종별 열매/꽃 색과 원본 상호작용 상태를 연결한다. 새 geometry가 준비되기 전 기존 sprite를 유지한다.
- 변장: 눈·모래는 ground decal/낮은 둔덕, 바위·풀은 해당 계열의 상태용 모델을 사용한다. 등장 애니메이션에서 더미와 NPC의 visibility가 한 프레임도 중복되거나 비지 않게 한다.

## 7. 건물·실내·지면 보완

### 7.1 건물 외피

수정: `shell.ts:openDirections/shellPlates`, `ChunkModels:cachedBack/cachedMergedProp`, 관련 `AnimatedProp`/`FeatureProps` 경로.

1. `openDirections`는 누락 방향 후보만 제공한다. 외부에서 보이는지, 원래 열린 통로/처마인지 정책으로 판정한다.
2. 일반 주택·센터·상점부터 자산별 `building-patch`를 만든다. 모양이 다른 건물에 동일 AABB 박스를 씌우지 않는다.
3. 레시피에 wall footprint, wallTop, roof edge/ridge, eaveDepth, open portal, 재료 swatch를 명시한다. 값은 해당 모델의 정점을 측정해 기록한다.
4. 지붕은 능선/경사면을 따라 이어지고 벽은 벽 높이까지만 만든다. 처마 밑은 별도 underside로 닫는다. 누락된 옆면에 지붕 그림을 수직 투영하지 않는다.
5. 벽 swatch는 창·문·간판을 제외한 면에서 얻는다. 뒷벽에 정면의 창/문이 자동 복제되지 않게 한다.
6. UV는 벽의 local tangent 길이와 높이에 기반해 동일 texel density로 만든다. 긴 벽 전체에 작은 그림 한 장을 stretch하지 않는다.
7. 기존 앞면을 겹쳐 덮지 않는다. 경계 정점은 원본 정밀도에 맞춰 공유되도록 배치하고 면 winding을 검사한다.
8. 열린 아치/문/계단은 명시적 구멍으로 보존한다. 바닥이나 모든 실루엣 구멍을 일괄 cap하지 않는다.
9. verified patch가 있으면 해당 방향의 `shellPlates` 생성만 비활성화한다. 미지원 건물의 현 폴백은 남기고 진단에서 구분한다.

검증: 네 방향뿐 아니라 모서리 대각선과 처마 아래를 본다. 단순 광선 누락 0만으로 통과하지 않고 반복 창·늘어진 문양·납작한 실루엣을 확인한다.

### 7.2 실내 벽

수정: `roomWalls.ts`, `ChunkModels`의 indoor/doors/room 생성부.

- 새 `RoomBoundarySegment` 제안: `mapId, layer, startXZ, endXZ, floorY, topY, materialSource, openings[]`.
- `openings`는 local 구간 `[s0,s1]`와 높이 `[y0,y1]`로 문/계단 통로를 정의한다. 워프 양옆을 일괄 비우는 기존 폴백 대신 확인된 실제 폭을 사용한다.
- segment를 opening 경계에서 분할해 남은 벽 직사각형을 생성한다. 문 위 lintel과 벽 모서리는 실제 구조가 있을 때만 만든다.
- 원본 floor region과 기존 vertical coverage를 참고하되 가구/카운터의 외곽을 방 끝으로 채택하지 않는다.
- 벽 재료는 같은 방/층/높이 구간의 검수 소스에 고정한다. ‘가장 가까운 삼각형’이 벽화/창문/검은 메움일 수 있는 문제를 차단한다.
- 얇은 면을 방 안쪽으로 옮겨 겹침을 감추는 것은 임시 수단이다. verified 경계에서는 원본 중복 구간을 제외하거나 정확한 인접 접합을 만든다.
- 천장은 **안 붙인다.** 3인칭 눈이 주인공 위에서 50~68도로 내려다보므로 천장 판은 곧 카메라와 방 사이에 선다 — 붙이면 방마다 「3인칭일 때는 지운다」가 따라오고 V로 시점을 오갈 때 천장이 생겼다 없어졌다 한다. 1인칭에서 위가 검은 것보다 그쪽이 더 부자연스럽다는 것이 판단이다 (2026-09-21). 주인공 방·게이트에 천장이 있는 것은 **작고 낮아 3인칭 눈이 방 안에 들어와 서는** 방이라서고, 센터·마트·도서관에는 그 조건이 없다.
  ⚠️ `firstPersonAudit`은 그 방들을 계속 `FAILED_VISUAL`(한 색 화면)로 적는다. 그것은 받아들인 값이지 열린 결함이 아니다.
- 깨어진 세계는 현재 제외 규칙 유지. 이를 일반 방으로 판정해 상자를 씌우지 않는다.

### 7.3 바닥 메움·절벽·점프 턱

수정: `plates:floorSource/floorPatch/standLevel`, `ChunkModels`의 floor borrowing, `Ledges.tsx`.

- 교체 정책이 제거한 나무 판의 footprint와 실제 바닥 coverage를 분리한다. 위에 있던 잎 그림을 없앴다는 이유만으로 이미 있는 길을 덮지 않는다.
- 바닥 donor는 같은 지역/층/의미 지면에서 선택한다. 후보가 없으면 기존 폴백을 유지하고 `missing-ground-source`로 기록한다. 평균 초록/밝기만으로 최종 확정하지 않는다.
- 바닥 높이는 기존 BDHC/ground 조회 정본을 따른다. 절벽 측면은 위·아래 높이를 잇되 다른 층의 수평 바닥을 끌어다 붙이지 않는다.
- 절벽 측면 UV는 수평 거리/높이로 구성하며 위쪽 잔디 texture를 수직으로 늘리지 않는다.
- `Ledges`의 0.18 높이는 게임플레이 고도가 아닌 시각 덧면이다. 이 변경에서는 점프 규칙을 유지하고 얇은 테두리/끝단 마감으로 읽히게 한다. 실제 큰 단차로 바꾸는 일은 별도 작업이다.

### 7.4 한 방향 갈색 점프 턱 — 전용 실행 명세

사용자가 말한 ‘한쪽 방향으로 이동하는 갈색 방지턱’은 일반 도로 방지턱이 아니라 **한 방향으로만 뛰어넘는 지형 경계**다. §7.3의 일반 마감 지침보다 이 절을 우선 적용한다. 단순 갈색 직육면체 교체만으로 완료 처리하지 않는다.

#### 7.4.1 현재 구현과 보존할 계약

[확인] `src/scene/Ledges.tsx:collect/Ledges`는 behavior로 턱 타일을 모아 중앙 높이를 조회한다. 각 타일에 `0.96 × 0.18 × 0.96` 갈색 상자와, 점프 방향으로 `0.43` 이동한 `0.9 × 0.26 × 0.12` 짙은 상자를 배치한다. 재질은 각각 단색 `#7c5b36`, `#4d3825` Standard다. 두 번째 상자는 중심 높이가 `ground + 0.09`이므로 바닥 아래 `0.04`부터 위 `0.22`까지 걸친다. 상단 상자는 회전하지 않고 앞면만 회전한다. 이는 현재 코드에서 확인한 구조이며, 모든 배치에서 실제 틈·관통이 보인다는 시각 검증 결과는 아니다.

[기존 조사 기록] 소스 주석은 원본 갈색 그림을 `allpeak`로 지칭하고 턱 양쪽의 원본 높이가 같다고 기록한다. 주석의 720개 집계와 다른 파일의 과거 부분 집계는 현재 전수 개수로 인용하지 않는다. 구현 시 현재 ROM/provider의 behavior·높이·UV를 다시 조사한다. `allpeak` 이름만으로 전체 texture를 턱으로 분류하지 않는다.

방향 정본은 `src/engine/actor/ledge.ts:ledgeJump`이며 `src/scene/ledgeVisual.ts:ledgeFacing`이 이를 재사용한다.

| behavior | 점프 벡터 d=(dx,dz) | 접근 가능한 출발 쪽 | 짙은 앞면이 향할 착지 쪽 | yaw |
|---|---|---|---|---|
| LEDGE_SOUTH | (0,+1) | 북쪽 | 남쪽 | 0 |
| LEDGE_WEST | (-1,0) | 동쪽 | 서쪽 | -π/2 |
| LEDGE_EAST | (+1,0) | 서쪽 | 동쪽 | +π/2 |

북쪽 턱을 임의 생성하지 않는다. 일반 턱의 출발 칸 중심에서 착지 칸 중심까지는 d 방향 두 타일이며, `ledgeHop`은 착지 칸이 막히면 점프하지 않는다. 역방향·옆방향 진입은 점프를 허용하지 않는다. 현재 `HOP_TIME=0.4`, `HOP_RISE=0.55`와 입력·착지 처리를 유지한다. 값은 실제 상수를 참조하고 새 렌더러에 복제하지 않는다. 깨어진 세계의 `JUMP_TWICE_*` 및 영원시티 체육관 시침의 `ledgeBridge`는 이 갈색 턱 recipe에 포함하지 않는다.

#### 7.4.2 원본 자산 조사와 등록

수정 대상: `Ledges.tsx`, `ledgeVisual.ts`, 새 `visual` 정책/recipe 및 §11 inventory. 이동 엔진은 회귀 검증 대상으로 두며 시각 개선을 이유로 변경하지 않는다.

1. behavior로 찾은 각 타일의 map/request·chunk·좌표·층·d·원본 높이와 겹치는 원본 submesh/triangle/UV를 연결한다. texture 이름이 아니라 실제 공간 중첩, UV 범위, palette, 방향을 함께 기록한다.
2. `allpeak` 후보의 contact sheet에서 갈색 앞면, 윗면 경계, 양 끝, 주변 풀/흙 및 baked shadow를 구분한다. 정확한 sourceKey·부분 UV·repeat/mirror를 기록한다. 이 문서는 확인하지 않은 atlas 좌표를 지정하지 않는다.
3. 실제 그림의 경계 위치와 폭을 tile-local 좌표로 측정한다. geometry가 타일 전체를 갈색으로 덮어 잔디/길을 지우지 않게 한다. 어느 영역이 턱인지 확정하지 못한 배치는 legacy 유지와 미분류 사유를 보고한다.
4. 원본 면 하나가 턱과 주변 바닥을 같이 담으면 면 전체를 삭제하지 않는다. 확인한 UV 부분을 분리하거나 원본 바닥을 보존한 augment를 사용한다. 기존 갈색 그림이 새 앞면 밑에서 이중 띠로 남는 경우에는 해당 부분만 검수된 지면으로 복구한다. 새로운 geometry·재질·바닥 복구가 모두 준비된 뒤 §4의 동일 commit으로 전환한다.

#### 7.4.3 방향이 읽히는 단면과 UV

[설계] 기본 형태는 **접근 쪽에서 완만하게 올라가는 얕은 윗면과 착지 쪽의 짧고 가파른 갈색 앞면**이다. 양쪽 지면의 실제 높이가 같다는 제약 아래 사용하는 시각 보완이며, 넓은 언덕이나 실제 절벽을 새로 만드는 방식이 아니다.

- 턱 중심 C에 대해 진행 축 d, 접선 축 t=(dz,-dx)를 사용한다. 점은 `C + t*u + d*v + (0,h,0)`로 구성한다. `+v`가 착지 쪽이고 앞면 바깥 normal은 d다. 전체 단면과 UV를 같은 좌표계로 회전시켜 동·서 방향의 texture 뒤집힘을 막는다.
- source recipe에 `backV`, `frontV`, `lipHeight`, `bevelWidth`, `frontSwatch`, `topSwatch`, `endSwatch`를 기록한다. back/front 위치는 원본 그림에서 측정한다. 미측정 자산에 일괄 적용하지 않는다.
- 첫 검수용 단면은 ground에서 시작해 backV부터 frontV 직전까지 `0.18` 높이로 올라가고, frontV에서 ground로 닫는다. `0.18`은 기존 장식 높이를 유지하는 초기값이다. bevel은 타일 `0.02`를 초기값으로 쓰되 해당 폭 안에 들어가도록 제한한다. 해당 값들은 ROM 실측값이 아니다. 앞면 높이를 과장해 실제 점프 궤적을 가리거나 통과 중 몸/카메라가 관통하면 단면을 낮추거나 경계 위치를 조정한다.
- 앞면·윗면·끝단을 가진 닫힌 wedge를 만들고, 각 면의 winding과 hard normal을 명시한다. `DoubleSide`로 뒤집힌 면을 감추지 않는다. 단면을 삼각형/사다리꼴로 구분하되 별도 짙은 상자를 겹쳐 앞면을 만들지 않는다.
- 원본에 윗면 swatch가 없으면 앞면 그림을 늘려 쓰지 않는다. 검수된 주변 지면과 경계 swatch를 사용하거나 승인된 recipe 색을 사용하고 합성 근거를 기록한다. 앞면 세로 UV에 주변 잔디가 늘어지거나 baked shadow가 두 번 들어가지 않게 한다.
- UV의 u는 접선 방향 누적 실거리, v는 해당 면의 단면 거리로 잡고 원본의 픽셀/타일 밀도를 유지한다. 긴 줄 하나에 원본 한 장을 늘리지 않는다. 부분 atlas를 반복할 때는 §5의 독립 swatch/padding 규칙을 따른다. 색 공간·알파·조명은 §5 프로필을 적용하며 갈색 단색 Standard 재질만으로 최종 대체하지 않는다.
- 추가 물리 collider나 보이지 않는 벽을 만들지 않는다. 시각 mesh의 bounds는 턱 타일 내에 두고 출발/착지 보행 공간을 침범하지 않는다. 얕은 bevel은 이미 정한 footprint 안에서 만든다.

#### 7.4.4 연속 구간·끝단·층·스트리밍

- 같은 map/request·층·recipe·d를 가진 타일만 접선 축으로 묶는다. 서로 실제로 맞닿는 원본 경계인지 확인하고 높이가 다른 구간은 분리한다. geometry merge 또는 instancing 모두 가능하지만 타일마다 `0.96` 폭 상자가 반복되는 틈은 제거한다.
- 이웃과 공유하는 단면에는 내부 end cap을 만들지 않는다. 노출된 끝에만 cap을 만들고 인접 풀·흙 경계와 맞춘다. endpoint 위치는 세계 좌표 기준으로 일관되게 산출한다. UV 위상은 chunk-local 0에서 재시작하지 않는다.
- 서로 다른 d가 만나는 곳은 자동으로 둥근 코너를 만들지 않는다. 실제 behavior 배치와 원본 그림으로 코너/종단인지 판정하고 전용 join recipe를 등록한다. 원본이 끊어진 통로를 연결해서 막지 않는다. T자·교차·애매한 연결은 inventory 예외로 남긴다.
- 청크 경계에서는 이웃 한 타일 정보를 확인해 연결과 끝단을 결정한다. 이웃이 아직 준비되지 않은 경우 임시 cap의 소유자를 결정하고 이웃 준비 시 같은 commit으로 정리한다. 양쪽 청크가 같은 join을 중복 생성하지 않도록 세계 좌표와 층으로 owner key를 정한다.
- 현재 `collect`는 플레이어 y를 높이 선택 힌트로 사용하지만 memo 의존성은 grid/chunkIndex/radius뿐이다. 같은 청크 안에서 층이 바뀌는 상황을 확인하고, 새 수집 결과는 안정적인 지형 층 ID/높이 해석에 결합한다. 매 프레임 player.y 변화로 전체 mesh를 재생성하지 않는다. 높이 미조회 시 임의 y=0 생성 대신 준비 대기/명시적 fallback으로 처리한다.
- instance matrix 갱신 시 bounds와 count를 갱신한다. 턱이 없는 맵은 현재처럼 null을 반환하여 빈 draw를 만들지 않는다. provider 교체/맵 이동/비동기 stale 결과 처리와 dispose는 §4 계약을 따른다.

#### 7.4.5 구현 순서와 완료 증거

이 작업은 §12의 지형 구현 작업에 포함된 필수 하위 항목 `FP-LEDGE`로 추적한다. 순서는 **현재 전수 목록 및 세 방향 baseline → source recipe 확정 → 순수 단면/연결 geometry → 준비된 원본 교체 통합 → 실제 점프/역방향/스트리밍 검증**이다. 먼저 남쪽 한 배치에서 모양을 검수한 뒤 서·동쪽과 모든 고유 source/연결 조합으로 확대한다. 첫 배치 성공만으로 완료 처리하지 않는다.

필수 자동 검증:

- `ledgeVisual.test.ts`에 세 방향의 앞면 normal·단면 회전·UV 방향을 검증한다. 새 순수 geometry 함수는 유한 좌표, 올바른 winding, 바닥 이하 돌출 여부, 공유 경계의 위치/UV 연속성, 노출 끝단만 생성되는지를 검증한다.
- 단일 타일, 긴 줄, 끊어진 줄, 서로 다른 방향의 인접 턱, 높이가 다른 인접 턱, 청크 경계, 턱 없는 맵을 fixture로 둔다. source 로딩 실패 시 원본 유지, 준비 후 중복 제거도 확인한다.
- 기존 `src/engine/actor/ledge.test.ts`와 `src/scene/ledgeVisual.test.ts`를 실행한다. ROM 데이터가 필요한 검증은 프로젝트의 `tools/requireData.mjs` 실행 방식을 따른다. 실제 런타임에서는 허용 방향 두 타일 이동, 역방향 차단, 옆방향 무점프, 막힌 착지 무점프를 확인한다. 깨어진 세계/체육관의 별도 점프도 변경되지 않았는지 확인한다.

필수 화면·동작 증거:

- 남·서·동 각각 접근 쪽/착지 쪽/끝단에서 0.5·1·2·4타일 거리로 관찰한다. 실제 first 모드에서 정면·비스듬한 각도·아래보기, 줄을 따라 걷기를 촬영한다. world 좌표와 behavior를 결과에 저장하여 같은 배치에서 재현할 수 있게 한다.
- 허용 방향 점프의 출발·상승·정점·하강·착지 전 구간을 영상 또는 연속 프레임으로 확인한다. 카메라를 수동으로 옮긴 스틸 컷만으로 점프 검증을 대신하지 않는다. 얼굴/몸 숨김, 카메라 높이, 앞면 clipping, 착지 후 떨림도 확인한다.
- 양쪽 접근에서 비대칭 단면과 원본 무늬로 허용 방향을 읽을 수 있어야 한다. 이를 위해 화살표 UI나 새로운 안내 표지판을 추가하지 않는다. 턱이 낮아도 방향이 불분명하면 swatch 배치·윗면 경계·앞면 명암을 먼저 조정한다.
- 원본 갈색 줄과 새 턱의 이중 표시, 직육면체 반복, 검은 이음, 빈 끝단, 지면 부유, 계단식 높이 튐, 길을 막는 코너, 청크 진입 시 cap 깜빡임이 없어야 한다. 3인칭 전환에서도 원본 지형 경계가 유지되어야 한다.
- §11의 실제 WebGPU/WebGL backend 확인 및 readiness 조건을 동일 적용한다. 현재는 코드 구조만 확인했으며 이 절의 새 geometry나 최신 플레이 화면 검증은 아직 구현/실행하지 않았다. 완료 보고에는 전수 배치 수, source/방향/연결별 처리 수, 예외 목록과 실제 캡처 경로를 남긴다.

## 8. 수면 구현 명세

수정: `Water.tsx:WaterField/waterField/waveAt`, `ChunkModels` 물 색 선택/원본 물 영역 소유권, `water.test.ts`.

### 8.1 먼저 고칠 문제

현 식은 `Y=base+0.045+wave`, 두 wave의 진폭 합은 0.087이다. 따라서 두 골이 겹칠 수 있는 조건에서 base보다 낮은 값이 가능하다. 이것은 원본 물 면과 교차할 가능성의 수학적 근거이며, 모든 장소에서 교차가 관측되었다는 뜻은 아니다.

**1차 결정:** 원본 물 그림은 유지하고 새 overlay의 기하 변위는 0으로 시작한다. 색·법선의 작은 변화만 남긴다. 거대한 부풀음보다 원본 물 문양과 해안 접점을 우선한다. 이후 실제 바다 프로필에만 작은 변위를 켠다. 물 표현에서 기하 파형과 미세 표면 변화의 분리는 [수면 S7](https://developer.nvidia.com/gpugems/gpugems/part-i-natural-effects/chapter-1-effective-water-simulation-physical-models)의 원리를 참고한 프로젝트 선택이다.

### 8.2 높이·층·해안

- 물 타일의 연결 성분을 구하되 waterfall/고도가 다른 물 면은 같은 surface로 합치지 않는다.
- 현재 모서리 키 `x*4096+z`만으로 여러 높이를 병합하지 않도록 surface/layer ID를 포함한다.
- 기준 수면은 실제 원본 수면/검수된 해당 층에서 구한다. 해안 경계의 `heightAtWorld`가 육지 높이를 돌려주는 경우 수면을 언덕처럼 끌어올리지 않는다.
- 물/육지 경계 segment에서 수면 vertex까지의 거리 d를 계산한다. 탐색 시 이웃 청크 한 겹을 포함해 스트리밍 창의 끝을 해안으로 오인하지 않는다.
- 후속 작은 변위에는 `a(d)=smoothstep(0, shoreWidth, d)`를 사용한다. shoreWidth 초기값 1타일. 연못은 displacement=0, 바다의 총 진폭 상한은 초기 0.015타일.
- 원본과 overlay를 모두 유지할 때 `LIFT >= maxAmplitude + depthEpsilon` 조건을 보장한다. depthEpsilon은 현재 카메라로 검수할 수치이지 machine epsilon이 아니다. offset을 과도하게 키워 떠 있는 막을 만들지 않는다.
- 새 수면이 준비됐다고 원본 물 주변의 거품·해안 장식·폭포면을 함께 제거하지 않는다.

### 8.3 법선과 비용

해안 감쇠를 쓰는 높이 `H=base + a*S`의 미분은 `dH/dx = da/dx*S + a*dS/dx`이다. 파동 미분에 a만 곱하면 해안에서 normal이 틀린다. 구현을 단순화하려면 실제 높이를 중앙차분해 `N=normalize(-dH/dx,1,-dH/dz)`로 구한다. base가 비평면이면 그 기울기도 포함한다.

- 현재 CPU 경로를 우선 유지한다. `useFrame`에서 Color/배열을 매 정점 생성하지 않도록 상수와 작업 버퍼를 재사용한다.
- world XZ와 하나의 시간으로 phase를 정한다. 청크마다 시간을 재시작하지 않는다.
- GPU 이동은 프로파일에서 병목일 때만 TSL로 한다. 같은 파형 함수의 CPU 수치 시험과 두 백엔드 이미지 비교를 남긴다.
- 색을 가짜 깊이라고 이름 붙이지 않는다. 실제 수심 자료가 없으면 shallow/deep를 ‘밝은색/어두운색’으로 취급한다.
- 대규모 반사/굴절/SSR는 필수 범위 밖. 환경과 어울리지 않는 번쩍이는 PBR 바다로 교체하지 않는다.

## 9. NPC·상호작용 물건·필드 행동·효과

### 9.1 잔여 스프라이트

`NpcSprites`에서 실제로 그리는 actor를 기준으로 목록화한다. `standingPeople`, `standingMons`, `standingBalls`, `ObjectProps`, 숨김/변장/열매 경로를 적용한 뒤의 결과를 센다. 기존 문서의 ‘1,118개 판때기’ 수치를 사용하지 않는다.

순서: 바위깨기/괴력바위 → 베기 나무 → 환풍구/말뚝 → 특수 문 → 고유 물건. 각 gfx의 구조와 상호작용을 기록하고 검수 모델을 연결한다. 보이는 물건이 벽화라면 입체로 튀어나오게 만들지 말고 벽 부착 decal로 둔다.

- NpcSprites가 actor를 건너뛰는 시점은 실제 모델이 씬에 준비된 뒤다.
- 모델 로딩 실패는 기존 sprite를 유지한다. 로더 오류를 숨기거나 사라진 물건을 완료로 세지 않는다.
- NPC를 환경과 맞춘다는 이유로 사람 키를 전부 똑같이 만들지 않는다. 기존 `npcScale`/접지/모델 정규화를 보존하고 가까운 대화 화면의 비율을 검수한다.
- 대역 인물은 별도 목록으로 남긴다. 색만 바꿨다는 이유로 원본 고유 외형을 완성했다고 기록하지 않는다.

### 9.2 1인칭 몸/도구/탈것

- `sceneRefs.player.visible=false`의 자식 관계를 확인해 낚싯대·물뿌리개·자전거·surf mount가 같이 숨는지 실제 상태별로 검증한다.
- 보여야 하는 도구/탈것만 별도 visibility 그룹으로 분리한다. 자기 얼굴·머리가 다시 화면에 들어오게 전체 player를 켜지 않는다.
- 손 모델 신작 제작은 필수 범위가 아니다. 도구 끝, 낚시찌, 이동 중 타고 있는 물체 등 동작을 이해하는 데 필요한 표시를 먼저 보존한다.
- 물/계단/점프에서 카메라 높이가 변할 때 모델 접점과 clipping을 확인한다. near를 무조건 0.001로 줄이지 않는다.

### 9.3 특수 장치·입자·날씨

문·체육관 장치·움직이는 발판은 정적 청크 대체 정책과 같은 material/보완 규칙을 참조하되 원본 애니메이션·부모 transform을 유지한다. 정적 batch에 합쳐 상태 변경을 잃지 않는다.

비/눈/모래/연기/빛기둥은 별도 효과로 유지한다. 1인칭 눈앞 입자 크기, near-plane 잘림, 물과 투명도 순서, 윤곽선의 뒤쪽 비침을 검사한다. 아름답게 보이게 한다며 불투명 소품을 반투명으로 만들거나 안개로 근접 결함을 감추지 않는다.

## 10. 배치·LOD·성능·리소스 계약

### 10.1 반복 자산의 비용

같은 recipe/variant/material/LOD의 물체는 하나의 instanced batch에 담는다. 여러 material group는 각각 draw를 발생시킬 수 있으므로 ‘메시 하나=draw 하나’라고 계산하지 않는다. 기존 `setInstances`를 사용해 count=0일 때 visible=false를 유지한다. [InstancedMesh S9](https://threejs.org/docs/pages/InstancedMesh.html)

초기 예산은 아래와 같이 두고 실제 비용으로 조정한다. 보이는 instance 수×LOD별 삼각형 수, alpha overdraw, 그림자 패스, CPU update를 모두 센다.

| 계열 | 근경 geometry 초기 상한/개 | material 슬롯 초기 상한 | 비고 |
|---|---:|---:|---|
| 나무 | 800 triangles | 2 | 수관+줄기, 접지 효과는 별도 집계 |
| 화분 | 240 triangles | 2 | 용기/흙 공유 가능, 식물 분리 |
| 바위 | 160 triangles | 1 | 원경용 동일 계열 단순 메시 |
| 울타리 반복 단위 | 96 triangles | 1 | 실제 반복 길이에 따라 산정 |
| 풀 군집 | 30 triangles | 1 | 밀도×면적이 비용의 핵심 |

이 예산을 맞추려고 근경 실루엣을 8면체로 돌려놓지 않는다. 초과가 필요한 자산은 이유/측정값을 적는다.

### 10.2 LOD 전환

- 기본 screen height 근사: `pixels = objectHeight * viewportHeight / (2 * positiveViewDepth * tan(verticalFov/2))`. 카메라 뒤/near 내부는 별도 처리한다. world 거리와 view depth를 혼동하지 않는다.
- 초기 경계: 120px 이상 근경, 32~120px 중경, 32px 미만 원경. 유형별로 조정 가능하되 설정에 남긴다.
- 경계에 ±15% 히스테리시스를 적용한다. 같은 자리에서 고개를 약간 흔들 때 LOD가 매 프레임 왕복하지 않아야 한다. [LOD S10](https://threejs.org/docs/pages/LOD.html)
- LOD 사이 anchor, 총높이, 주요 폭, 재료색을 일치시킨다. 투명 blend로 전환 문제를 감추지 않는다.
- 첫 버전은 동일 실루엣을 유지한 메시 전환을 사용한다. 실제 팝핑이 남을 때만 두 백엔드에서 검증한 dither 전환을 별도 도입한다.
- 새 나무를 기존 고정 `TREE_SPHERE`/`CROWN_Y`로 컬링하지 않는다. recipe geometry의 bounds와 실제 변환으로 sphere/box를 계산하고 바람 변위가 있으면 여유를 포함한다.
- 인스턴스 행렬이 바뀌면 bounds/needsUpdate를 갱신한다. 기존처럼 per-instance frustum culling을 하면 큰 batch에 무조건 기본 culling을 다시 켜지 않는다.

### 10.3 측정

같은 하드웨어·해상도·DPR·시점·날씨에서 로딩 후 5초 안정화, 30초 동선, 3회 측정한다. 프레임 시간 p50/p95, draw calls, triangles, CPU 지형 생성 시간, 메모리/리소스 수를 남긴다. 소프트웨어 렌더러는 화면 검사에만 사용한다.

임시 회귀 한도: frame p95와 draw calls가 기준 대비 10% 넘게 나빠지면 분석 없이 완료하지 않는다. 10%는 제품 성능 보장값이 아닌 비교 gate다. 기준선 자체가 느리면 동일하게 느린 결과를 성능 성공으로 부르지 않는다.

맵 왕복 10회 후 자산 캐시가 안정화되는지 확인한다. 매번 geometry/material/texture가 증가하면 공유 소유권과 provider swap 정리를 수정한다.

## 11. 전수 조사·화면 검증 도구 명세

### 11.1 자산 목록과 contact sheet

새 `tools/audit/firstPersonSources.mjs`는 Vite 게임 전체 부팅 없이 PT3C/index/texture/gfx 매핑을 읽을 수 있는 offline 부분부터 구현한다. 기존 테스트의 binary 해독 방식을 재사용하고 별도의 잘못된 포맷 해석기를 만들지 않는다.

출력 제안:
- `.audit/first-person/sources.json`: 모든 고유 원재료/조각/정책/변환 목록.
- `.audit/first-person/placements.json`: 실제 맵·청크·event 배치와 적용된 표현.
- `.audit/first-person/coverage.json`: verified/keep/legacy/unclassified/failed/미검수 구분.
- `shots/first-person/source-atlas.html`: source crop, 원본 각도, 새 모델 turntable, recipe ID가 함께 있는 대지.

행 필수값:
`source key/hash, mapId, matrixId, chunk assetId, placementId, layer, source group, triangle offsets, raw UV, wrapped footprint, original transform, semantic, recipe/version, outcome, renderer path, replacement readiness, review evidence`.

전수 범위는 두 축이다.
1. **자산/규칙 전수:** 모든 고유 자산 + palette + 변환 규칙 조합을 등록한다. 의도적 keep도 이유를 남긴다.
2. **배치 전수:** 같은 자산도 지면/층/회전/건물 교차가 다르므로 전체 배치의 bounds·통행로 교차를 검사한다. 자동 flag는 화면으로 판정하고 허용 예외에 근거를 남긴다.

이번 조사용 `.audit/probe/fp-source-inventory.mjs/json`은 666개 청크의 imped UV 표본을 찾은 한정 도구다. 게임 전체 inventory 구현을 대신하지 않는다. 구현자는 해당 파일이 없어도 §3 표와 위 계약으로 정식 도구를 만들 수 있어야 한다.

### 11.2 두 종류의 뷰어

**원재료/geometry 뷰어:** 자산 단위의 원본과 새 geometry를 동일 배율로 회전 관찰한다. 서버의 게임 초기화가 실패해도 원본 texture·UV·형태를 조사할 수 있다. 여기서 통과해도 게임 통합 검증을 생략하지 않는다.

**실제 게임 뷰어:** 정상 게임 루프·cameraSystem·옵션으로 first 모드에 진입한다. 기존 `look.mjs`처럼 cameraSystem을 배열에서 제거하지 않는다.

새 `firstPersonAudit.mjs`가 제공할 옵션(현재 존재하는 CLI라고 가정하지 말 것):

```text
--sites=twinleaf,forest,jubilife,sunyshore,center
--gpu=webgpu|gl
--out=shots/first-person/<run-id>
--mode=baseline|candidate
--capture=static|walk|all
```

실제 구현은 `gpuArgs`, `wantBackend`, `probeGpu`, `freePort`, `startVite`를 재사용한다. 브라우저·자체 서버는 try/finally로 종료한다. 다른 작업의 서버/브라우저 프로세스를 일괄 종료하지 않는다.

### 11.3 준비 조건과 실제 모드

기존 dev API가 등록된 상황에서는 `pt.view(1)`과 `pt.look(yaw,pitch)`를 재사용할 수 있다. 별도로 V키 0→1→0 토글 시나리오도 수행한다. dev API가 없는 경우 `useOptionsStore.getState().set('view',1)`을 쓰고 결과를 확인한다.

Playwright 흐름의 핵심 예시:

```js
// /play 진입과 데이터 복원은 기존 checkpoint 도구를 재사용한다.
await page.evaluate(async () => {
  const { useOptionsStore } = await import('/src/state/optionsStore.ts');
  useOptionsStore.getState().set('view', 1);
});
await page.waitForFunction(async () => {
  const { worldState } = await import('/src/state/worldState.ts');
  const { terrainReady } = await import('/src/scene/terrainMark.ts');
  return worldState.camera.mode === 'first' && terrainReady().ok;
}, null, { timeout: 60000 });
// 구현자가 새 readiness API의 같은 req에 대한 pending=0도 이어서 확인한다.
// fallback/failed가 있으면 촬영은 가능하되 성공 결과로 기록하지 않는다.
```

- readiness는 source 요청 ID/교체 준비/씬 commit/표시 프레임을 기록한다. map ID만 같다고 최신 지형이라 판단하지 않는다.
- `data-backend` 값이 기대하는 `WebGPUBackend` 또는 `WebGLBackend`인지 확인한다. 실행 옵션 이름만 믿지 않는다.
- 화면 자체가 검은지/단색인지 검사한다. 수치가 준비됐어도 잘못 그려지면 렌더 결함으로 분류한다.
- 최신 camera FOV/눈높이를 import하거나 snapshot으로 받는다. 검사 도구에 상수를 복사해 시간이 지나 서로 달라지게 하지 않는다.
- 실제 yaw=0은 북(-Z)이다. 기존 `lookFrom`의 cos 방향을 그대로 복사하지 않는다.

### 11.4 실패 처리

지난 조사에서 기존 `look.mjs`는 서버 준비 282초 후 첫 `page.goto` 30초 timeout으로 실패했다. 단일 장소 재시도도 서버 준비가 지연되어 중단했다. 이 상태를 ‘아무 문제 없음’으로 보고하면 안 된다.

서버 문제는 HTTP 접속, Vite 변환 로그, 첫 모듈 요청, console/pageerror, renderer init, asset response 단계로 나눠 기록한다. 무조건 timeout만 늘리거나 고정 sleep 60초를 추가하지 않는다. 초기 변환이 정상 진행되는 근거가 있으면 준비 대기 시간을 따로 설정하되 오류와 총 상한을 둔다. 인프라 실패는 `BLOCKED_INFRA`, 자산 실패는 `FAILED_ASSET`, 준비 뒤 화면 결함은 `FAILED_VISUAL`로 구분한다.

### 11.5 장면·방향·동작 검사

대표 세트:

| 장소/유형 | 필수 확인 |
|---|---|
| 떡잎마을 | 집 네 방향, 나무 밑, 연못 가장자리, 1/3인칭 전환 |
| 영원의 숲 | 숲 가장자리/내부, 줄기 접지, 지면 메움, LOD |
| 축복시티 | 사각 화분, 둥근 식생, 울타리, 낮은 담 |
| 양지시티·운하시티 | 해안 바위, 물/육지 접점, 다리와 층 |
| 217번도로 | 설목, 눈 지면, 절벽 옆면 |
| 주인공 방·센터·상점·도서관 | 네 벽, 문, 계단, 카운터 접근, 천장 여부 |
| 열매밭·동굴 | 단계별 식물, 바위·볼·베기 등의 상태 변화 |
| 체육관·깨어진 세계 | 움직이는 장치, 개폐, 특수 카메라/중력 예외 |

정적: 기본 1280×720 CSS, DPR=1, 같은 시간/날씨. yaw 0~315도 45도 간격, pitch -25/0/+25도. 대상을 0.5/1/2/4타일에서 본다. 충돌상 접근 불가능한 위치는 ‘기하 진단’으로 따로 분류하고 플레이 결함이라고 자동 단정하지 않는다.

동적: 울타리 옆 10초 걷기, 집 뒤로 돌아가기, 문 왕복, 계단, 물가, 풀숲 진입, NPC 대화, 도구 사용, 시점 토글. LOD/알파 깜빡임은 정지 화면만으로 통과시키지 않는다.

색/기하 진단은 후처리 OFF도 비교하지만 최종 판정은 정상 후처리 ON으로 한다. 기존 설정을 바꿔서 화면을 좋게 보이게 한 경우 그 설정까지 변경사항으로 기록한다.

## 12. 수정 티켓 — 입력·파일·완료 조건

각 티켓은 내부 검증 후 다음으로 진행한다. 여기서 ‘검수됨’은 증거를 확인했다는 뜻이며 매번 사용자 승인을 다시 요청하라는 뜻이 아니다. 관련 없는 기존 미커밋 변경은 유지한다.

| ID | 선행 | 구체 작업 | 주요 파일 | 완료 조건 |
|---|---|---|---|---|
| FP-00 | 없음 | 자산/표현 목록, 원재료 대지, 실제 first 기준선/환경 실패 진단 | 새 audit/shot 도구, 기존 terrainMark 재사용 | 현행 자산 목록과 재현 가능한 baseline. 화면 검증이 막히면 미완료 표시 |
| FP-01 | 00 | source parts, recipe, 한 번의 교체 결정, readiness/cache ownership | 신규 visual 모듈, ChunkModels, plates | keep/augment/replace·중복claim·실패폴백·취소요청 테스트 |
| FP-02 | 01 | 사각 화분 분리, 둥근 식생 별도 정책, 작은 바위와 혼동 제거 | Rocks, rockSites, byRock 루프 | §3 표본 모두 올바른 클래스, 현재보다 읽기 쉬운 근경 화면 |
| FP-03 | 01 | 울타리/담 구조, 코너·끝단·간판 뒤 | cards, standCutouts, cachedShells | 원본과 shell 중복 0, 이동 중 판 소실 0 |
| FP-04 | 01 | 공간 P0: 문 막힘/잘못된 벽/지면·건물 틈의 verified patch | shell, roomWalls, floorPatch, ChunkModels | 실제 통행·워프 보존, 구멍/잘못된 막힘 해결 |
| FP-05 | 01,02 | 나무 계열+원본 잎 swatch+배치+LOD | Foliage, treeSites, visual geometry | 줄기/수관 접합, 도로·건물 비침범, 변형/로드 순서 안정 |
| FP-06 | 01,04 | 수면 높이/층/해안, 작은 변위, 풀·꽃 중복 조정 | Water, Grass, Flowers, floorPatch | 수면 교차/청크 seam 없음, 식생 역할 유지 |
| FP-07 | 01 | 잔여 이벤트 물건·열매·변장·도구 visibility | MapStreamer, NpcSprites, BerryPatchProps, DisguisePlates, FieldActionEffects | 상태별 원본/신규 전환, actor ID/상호작용 보존 |
| FP-08 | 02~07 | 전체 자산/배치 확장, 양 백엔드/야간·날씨/성능/회귀 | 위 변경 전체 | §13 최종 gate와 예외 목록 충족 |

FP-04는 기준선에서 P0가 발견되는 즉시 FP-02/03/05보다 먼저 처리한다. FP-02~05의 일부 시제품이 성공했다고 전체 개선을 완료로 보고하지 않는다.

### 티켓별 제출 형식

각 티켓 완료 시 기록:
1. 대상 source/recipe ID와 실제 적용 배치 범위.
2. 바뀐 파일과 핵심 함수.
3. 원본/후보 동일 시점 이미지, 움직임 영상 경로.
4. 실행한 테스트·backend·누락 검수.
5. 성능 비교와 아직 남은 예외.

새 source 정책은 확대 원본, 원본 판/모델, 대체 모델을 나란히 보아 의미가 맞는지 확인한 뒤 `verified`로 바꾼다. 자동 geometry 생성 성공만으로 바꾸지 않는다.

## 13. 테스트·완료 판정

### 13.1 반드시 필요한 자동 테스트

- **분류:** 같은 `imped` 내 fence/rail/planter/shrub/rock 분리. fractional UV, repeated/mirrored UV, 같은 이름 다른 tex set, 다른 layer fixture.
- **조각:** 공면이지만 UV seam인 두 조각, 삼각형 순서가 다른 quad, quad가 아닌 메시를 잘못 묶지 않음.
- **교체:** ready일 때만 정확한 원본 triangle 제거, keep은 byte-equivalent source geometry 보존, 하나의 triangle 중복claim은 오류, 일부 실패가 다른 자산 제거로 번지지 않음.
- **안전한 갱신:** 맵 이동 중 stale request 완료 무시, sourceHash/recipe/provider 변경 시 파생 캐시 교체, 공유 자원 이중 dispose 없음.
- **기하:** finite position/normal/UV, 유효 index와 material group, 올바른 winding, 바운드에 모든 vertex 포함. 닫힌 구조로 지정한 부품은 예상하지 않은 열린 edge 없음.
- **높이/배치:** 서로 다른 층을 합치지 않음, 청크 경계의 seed/배치 불변, 허용하지 않은 보행 영역 침범 없음.
- **물:** shore distance=0이면 변위0, overlay/기반 높이 조건, phase 연속, 다른 수면층 분리, 감쇠 미분 또는 중앙차분 법선 일치.
- **게임 의미:** 도구볼 획득·바위깨기·괴력·베기·열매 수확·문/워프 이후 원본 fallback이 다시 나타나지 않음.
- **LOD:** 왕복 경계에서 히스테리시스, 카메라 뒤/near에서 수치 발산 없음, variant seed 고정, bounds 기반 culling.

기존 `plates.test.ts`는 Foliage 상수/함수도 import한다. 기존 표현에 종속된 숫자 테스트는 새 의도에 맞게 수정하되, 데이터 보존·통행·층 구분의 회귀 시험을 삭제하거나 스킵 처리하지 않는다.

### 13.2 실행 명령

아래는 구현 후 실행한다. 이 문서 작성 중 테스트가 통과했다는 뜻이 아니다.

```powershell
# 새 visual 모듈이 생성된 뒤, 빠른 단위 검증
pnpm exec vitest run src/scene/visual

# 수정된 기존 경로 (변경한 파일에 맞춰 필요 목록을 조정)
pnpm exec node tools/requireData.mjs vitest run src/scene/plates.test.ts src/scene/cards.test.ts src/scene/shell.test.ts src/scene/roomWalls.test.ts src/scene/water.test.ts src/scene/grass.test.ts src/scene/flowers.test.ts

# 기존 캡처 경로의 smoke 확인: 실제 backend와 모드까지 검사해야 성공
node tools/shot/shot.mjs twinleaf --keys=v --gpu=webgpu
node tools/shot/shot.mjs twinleaf --keys=v --gpu=gl

# 통합 후 프로젝트 체크. 데이터 누락을 통과로 처리하지 않는다.
pnpm check
pnpm build
```

`firstPersonSources.mjs`와 `firstPersonAudit.mjs`는 신규 구현 후 실행한다. 아직 없는데 해당 명령이 이미 실행됐다고 기록하지 않는다. 서버 실패 시 테스트 전체를 계속 재실행하기보다 실패 단계를 먼저 해결한다.

### 13.3 최종 gate

- 고유 원재료/정책 조합 전체가 inventory에 있으며 미분류·실패 개수가 명시됨.
- 목표 개선 범위의 unclassified/legacy 대체가 0. 유지하는 평면은 의도/근접 관찰 근거가 있음.
- 배치별 통행/층/교차 flag는 해결되었거나 근거 있는 허용 예외가 있음.
- 1인칭에서 옆면 소실, 잘못된 거울 글자, 원본+새 메시 겹침, 지면 부유, 잘못된 벽 막힘이 대표 동선에 없음.
- 청크/맵 이동·시점 전환·성장·개폐·획득 뒤 상태가 맞음.
- WebGPU와 실제 WebGLBackend에서 동일한 의미/형태로 표시됨. 백엔드 하나를 못 돌렸으면 그 검증은 미완료.
- 3인칭 회귀, 밤/비/눈·안개, 성능/리소스 왕복 검증 완료.
- 수치 시험만으로 ‘자연스럽다’를 선언하지 않음. 전후 화면의 실루엣·재질·척도·접지를 직접 확인함.

## 14. 완료 보고의 예시와 남은 불확실성

좋은 보고: ‘imped 사각 화분 3개 UV 변형에 새 레시피를 적용했고 원본 판/Rocks 중복이 없다. 축복시티 8방향과 이동 영상을 양 백엔드에서 확인했다. 다른 palette 2종은 아직 미검수다.’

나쁜 보고: ‘전체를 PBR로 바꿨고 테스트가 통과했으므로 자연스러운 3D가 완성됐다.’

이번 조사에서 확인한 것: 현 렌더 코드, CLI/브라우저 추출 구조, 실제 원본 아틀라스와 확대 사물 영역, 666개 청크의 imped UV 후보, 공식 문서/개발사 기술 자료.

아직 확인하지 못한 것: 최신 빌드의 전 맵 실제 1인칭 화면, 최종 레시피들의 자연스러움, 실제 GPU 성능 개선. 기존 캡처 도구의 인프라 실패는 §11.4에 기록했다. 따라서 이 명세는 **구현 방향과 검증 방법을 고정한 실행 지시서**이며 시각 검수가 끝났다는 보고가 아니다.

## 15. 웹 출처 — 확인일 2026-09-17

현재 설치 버전에 맞는 r185 문서를 우선했다. 공식 웹 문서가 최신 API로 바뀌면 로컬 `node_modules/three`와 타입을 최종 확인한다.

- **S1** [Three.js r185 Color Management](https://raw.githubusercontent.com/mrdoob/three.js/r185/manual/en/color-management.html): 입력 texture/정점색/작업 색 공간 구분.
- **S2** [Three.js Texture](https://threejs.org/docs/pages/Texture.html): 필터·밉맵·비등방성·색 공간·wrap.
- **S3** [Three.js r185 Transparency](https://raw.githubusercontent.com/mrdoob/three.js/r185/manual/en/transparency.html): 투명 오브젝트/삼각형 정렬의 한계와 alphaTest.
- **S4** [Three.js r185 WebGPURenderer](https://raw.githubusercontent.com/mrdoob/three.js/r185/manual/en/webgpurenderer.html): TSL, WebGL2 fallback, 기존 shader/post-processing 제약.
- **S5** [NVIDIA GPU Gems — Rendering Countless Blades of Waving Grass](https://developer.nvidia.com/gpugems/gpugems/part-i-natural-effects/chapter-7-rendering-countless-blades-waving-grass): 잎 군집 texture/card와 배치·움직임.
- **S6** [NVIDIA GPU Gems 3 — Next-Generation SpeedTree Rendering](https://developer.nvidia.com/gpugems/gpugems3/part-i-geometry/chapter-4-next-generation-speedtree-rendering): 식생의 계층 표현과 LOD.
- **S7** [NVIDIA GPU Gems — Effective Water Simulation from Physical Models](https://developer.nvidia.com/gpugems/gpugems/part-i-natural-effects/chapter-1-effective-water-simulation-physical-models): 기하 파형·세부 파형·법선 분리.
- **S8** [Khronos KHR_materials_unlit](https://raw.githubusercontent.com/KhronosGroup/glTF/main/extensions/2.0/Khronos/KHR_materials_unlit/README.md): 스타일/이미 조명된 그림의 unlit 표현.
- **S9** [Three.js InstancedMesh](https://threejs.org/docs/pages/InstancedMesh.html): 배칭과 instance/bounds 갱신.
- **S10** [Three.js LOD](https://threejs.org/docs/pages/LOD.html): 거리별 표현과 hysteresis.
- **S11** [Three.js Material](https://threejs.org/docs/pages/Material.html): alphaTest/alphaHash/alphaToCoverage 특성.
- **S12** [Three.js BufferGeometry](https://threejs.org/docs/pages/BufferGeometry.html): 속성·index·material group·bounds 계약. 새 geometry 생성 검증에 참고.



## 16. 다음 수정 LLM에게 그대로 전달할 시작 프롬프트

> 이 문서의 FP-00부터 FP-08까지 실행하라. 먼저 현 코드와 자산을 확인하고, 문서의 신규 API를 기존 API로 착각하지 마라. 원본 보존·교체 준비·캐시 소유권을 선행 구현한 뒤 사물별 레시피를 연결하라. 웹 자료의 일반 원리와 프로젝트의 설계 초기값을 구분하고, 실제 화면 비교로 값을 확정하라. 원본에 없는 뒷면을 정확한 복원이라고 주장하지 마라. 미분류/legacy/failed/미검수는 목록에 남기고 완료로 숨기지 마라. 최종적으로 실제 1인칭 전환·이동·상호작용과 양 백엔드를 검증하고, 변경 파일·전후 이미지·테스트·성능·남은 범위를 보고하라. 관련 없는 기존 변경은 보존하라.
