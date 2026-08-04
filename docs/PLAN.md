# pt-3d — 포켓몬스터 플래티넘 3D 리메이크 기획서

> 작성일: 2026-08-04 · v3 (선행 사례 / 기술 호환성 / 공백 영역 — 3갈래 외부 리서치 재검증 반영)
> 스택: React 19 + Vite 8 + TypeScript + vanilla-extract + react-router 7 + three.js(WebGPU/R3F)
>
> 성능·호환성 관련 수치는 전부 문서 하단 참고 링크에 출처를 명시했다.

---

## 0. 선행 사례 조사 결과

### 0.1 결론

**"플래티넘을 *게임으로서* React/three.js로 웹 리메이크한 사례"는 존재하지 않는다.** 검색 범위(GitHub topics, 디컴파일 커뮤니티, PokeCommunity, ProjectPokemon, three.js 포럼, itch.io)에서 확인한 결과, 4세대 DS 타이틀의 네이티브 웹 리메이크 완성 사례는 없다. 인접 사례와의 경계는 이렇다:

- **"브라우저에서 플래티넘을 플레이"는 이미 가능하다.** DeSmuME/melonDS의 WASM 포트(ds.44670.org, EmulatorJS의 NDS 코어)로 ROM만 있으면 지금도 브라우저에서 돌아간다. A15급 기기에서 거의 풀스피드다. 즉 *원본 재현*이 목표라면 이 프로젝트는 존재할 이유가 없다 — **우리의 존재 이유는 3D 리메이크**라는 점을 명확히 해 둔다.
- **PokéRegions**(Next.js + three.js 신오 3D 맵, 2026-02)가 스택·소재 면에서 최근접 선행이지만, 게임이 아니라 뷰어다 (아래 표).

다만 **필요한 조각은 전부 개별적으로 존재**한다. 이게 이 프로젝트의 가장 중요한 전제다 — 우리는 밑바닥부터 만드는 게 아니라, 검증된 조각들을 조립하고 그 사이의 접착제(엔진)를 만든다.

### 0.2 카테고리별 정리

#### A. 원본 게임 데이터 소스

| 프로젝트 | 내용 | 활용도 |
|---|---|---|
| **pret/pokeplatinum** | 플래티넘 디컴파일(C, WIP). US Rev0/Rev1 빌드 성공. `res/`에 battle, field, items, moves, pokemon, trainers, text, town_map 분류 | ★★★★★ **데이터의 정본**. 종족값·기술·트레이너·인카운터 테이블의 근거 |
| **JimB16/PokePlat** | 구버전 디스어셈블리 | ★★☆ pokeplatinum이 미커버한 영역 보완 |
| **DSPRE** | DS 포켓몬 ROM 에디터. 맵 NSBMD/BIN 및 DAE/GLB/NSBMD 내보내기 지원 | ★★★★ 맵 데이터 추출 |
| **Pokemon DS Map Studio / SDSME** | 4·5세대 맵 에디터. 매트릭스·헤더 편집, 3D 뷰어 내장 | ★★★★ 맵 매트릭스 구조 이해 |
| **PokeAPI** | Gen4 데이터 CSV/SQLite 덤프 | ★★★ 보조용. **플래티넘 배회 포켓몬 인카운터 데이터 누락** 등 구멍 있음 |
| **한국어판 ROM 《포켓몬스터Pt 기라티나》** | 2009-07-02 한국 정식 발매판 | ★★★★★ **한국어 텍스트의 정본.** 번역 작업이 추출 작업으로 바뀐다 (§4.2) |
| **일본어판 ROM** | 일본 발매판 | ★★★★ **일본어 텍스트의 정본.** 역할은 한국어판과 동일 — 텍스트 NARC 전용 |
| **BDSP (Brilliant Diamond/Shining Pearl)** | 공식 신오 3D 리메이크. Unity 엔진 — romfs `Data/StreamingAssets/AssetAssistant/` 하위 AssetBundle | ★★★★ 캐릭터(치비+등신)·맵·포켓몬 3D 모델 소스 (§4.3). Luminescent 팀이 모딩 워크플로 문서화 완료 |

#### B. 에셋 추출 툴체인

| 툴 | 내용 |
|---|---|
| **scurest/apicula** (Rust) | **핵심 툴.** `.nsbmd/.nsbtx/.nsbca/.nsbtp/.nsbta` → COLLADA(.dae) / **glTF(.glb)**. 조인트 애니메이션은 컨버터에서 동작, 패턴/머티리얼 애니메이션은 뷰어에서만 동작 |
| **Narctowl / Nds4j** | NARC(Nitro Archive) 언팩/팩. CARC는 LZ 압축된 NARC |
| **ndstool / Tinke** | NDS 파일시스템 언팩 |
| **msgenc / thenewpoketext / PPTXT** | 4세대 텍스트 코덱. `pl_msg.narc`는 **XOR 계열 난독화** — 평문이 아니다. 영어는 pret가 이미 복호화해 `res/text/*.json`으로 제공, 한국어판은 동일 파이프라인 적용 |
| **AssetStudio / AssetRipper** | Unity AssetBundle 추출 — BDSP romfs → FBX/DAE → Blender → glb |

```bash
apicula extract game.nds -o out/
apicula convert -f=glb out/*.nsbmd -o gltf/
```

#### C. 웹 이식 / 3D 선행 사례

| 프로젝트 | 스택 | 참고할 점 |
|---|---|---|
| **PokéRegions** (pokeregions.com) | Next.js + three.js, PWA, 2026-02 공개 | **지도 파트의 최근접 선행 사례.** 신오지방 3D 인터랙티브 맵. 그래픽 프리셋(Low/Med/High), 낮/밤 토글. 단 *뷰어*이고 게임이 아님 |
| **Pallet Town 3D** (PauliusOS) | three.js + TS + **Vite** | **아키텍처 레퍼런스 1순위.** 바이너리 아트 에셋 0개 — 텍스처는 캔버스에 절차적 베이크, 모델은 SDF+마칭큐브, 사운드는 WebAudio 합성. 1600×900 60fps / 드로우콜 ≤260 / 트라이앵글 ≤2.2M. 8회 이상 등장하면 무조건 InstancedMesh. **저작권 회피 모델로서도 참고 가치 높음** |
| **pokeemerald-wasm** | 디컴파일 → WASM | "디컴파일을 웹으로" 접근법의 증명. 단 3세대 GBA이고 *원본 재현*이지 3D 리메이크가 아님. 우리 방향과 다름 |
| **DS Player / desmume-wasm** (44670) | DeSmuME → WASM (ds.44670.org) | **브라우저 NDS 에뮬레이터.** A15급에서 3D 게임 거의 풀스피드. "원본 재현" 노선의 최단 경로가 이미 존재함을 증명 — 우리는 이 길이 아니다 |
| **melonDS-wasm / ds-anywhere / EmulatorJS** | melonDS → WASM. ds-anywhere는 TS+Preact+Vite 프런트 | 같은 카테고리. EmulatorJS는 임베드 가능한 NDS 코어(melonds/desmume2015) 제공 |
| **pokeplatinum-portable** | pret 디컴파일 → SDL3 네이티브 포팅 | 플래티넘 디컴파일의 타 플랫폼 이식이 시작됐다는 신호. WASM 타깃이 아직 없을 뿐 |
| **PokéRogue** (pagefaultgames) | TypeScript + **Phaser 3.70**, AGPL-3.0, 20k+ stars | **배틀 시스템 스코프/데이터 모델링 레퍼런스.** 오버월드 없이 배틀 엔진만으로 게임 성립시킨 사례 |
| **FullScreenPokemon** | HTML5 | 1세대 2D. 구조 참고용 |

#### D. 런타임 라이브러리

| 패키지 | 역할 |
|---|---|
| **@pkmn/sim** | Pokémon Showdown 시뮬레이터 모듈화. Gen 1~9 전 세대 배틀 로직. **⚠️ 배틀 전용** — 포획·경험치·진화·상대 AI는 범위 밖 (§7.6·§7.7) |
| **@pkmn/protocol** | Showdown 프로토콜 파서 |
| **@pkmn/data** | 세대별 종족값/기술/특성 데이터 레이어 |
| **@smogon/calc** | 공식 데미지 계산기. **배틀 AI 평가함수의 핵심** (§7.7). Gen 4 동작 실증 완료 — pkmn/dmg는 npm 미발행 WIP라 이쪽을 쓴다 |
| **@pkmn/engine** | Zig 구현. PS 대비 1000배 이상 빠름. 현재 Gen1~2 위주 → **초기에는 @pkmn/sim 사용** |
| **Pokemon-3D-api/assets** | 1300+ 최적화 `.glb` 포켓몬 모델. Draco 압축 + WebP 텍스처 + 1024² 리사이즈. 샤이니/메가/리전폼 포함 |

### 0.3 이 조사가 기획에 주는 함의

1. **배틀 로직은 직접 짜지 않는다.** `@pkmn/sim`이 4세대(물리/특수 분리 도입 세대)를 포함해 검증된 구현을 제공한다. 우리가 만들 것은 **연출 레이어**다.
2. **맵 지오메트리를 그대로 뽑아 쓰면 안 된다.** DS 시절 폴리곤을 웹에서 확대하면 처참하다. PokéRegions가 성립한 건 "지도 뷰"라서다. 우리는 *레이아웃 데이터*만 추출하고 아트는 새로 만든다 — 그래서 "이식"이 아니라 "리메이크"다.
3. **에셋은 저장소에 넣지 않는다.** pokeemerald-wasm, 모든 디컴프 프로젝트가 그렇듯, 저장소에는 *추출 스크립트*만 두고 사용자가 자기 ROM으로 로컬 생성한다.
4. **풀스케일은 1인 3~5년짜리다.** 후술할 스코프 재정의가 이 기획서에서 가장 중요한 부분이다.
5. **@pkmn/sim은 심판이지 게임이 아니다.** 포획 판정, 경험치/노력치, 레벨업 기술, 진화, 그리고 상대 AI까지 전부 우리 몫이다 (§7.6·§7.7).
6. **현지화는 번역이 아니라 추출이다.** 영어(pret)·한국어(한글판 ROM)·일본어(일본판 ROM) — 로케일 3개가 사실상 공짜다. 게임 데이터(맵·수치·음악)는 지역판 간 동일하므로 정본은 US 하나고, KO/JP 롬은 텍스트 NARC 전용이다.

---

## 1. 프로젝트 정의와 스코프

### 1.1 현실 점검

플래티넘 풀스케일의 물량:

- 맵: 약 200개 (마을/루트/던전/실내)
- NPC: 500명 이상
- 포켓몬: 493종 × (모델 + 최소 idle/attack/hit/faint 4개 애니메이션) ≈ **2,000개 애니메이션 클립**
- 기술: 467개 (각각 3D 연출 필요)
- 스토리 스크립트: 수천 개 이벤트

혼자서 이걸 다 하면 3~5년이고, 대부분의 팬 프로젝트가 **트윈리프타운을 못 벗어나고 죽는다**. 이유는 실력이 아니라 스코프 설계 실패다.

### 1.2 스코프 재정의 — v1.0의 정의

> **v1.0 = 트윈리프타운 ~ 크로스시티 첫 배지까지, 완결된 게임 루프**

포함:
- 맵 8개 (트윈리프타운, 201·202·203·204번 도로, 마사고타운, 크로스시티, 크로스시티 체육관, 진주호수)
- 포켓몬 약 30종 — 201~204번 도로 인카운터 테이블이 자연스럽게 정하는 수치다. 인위적 상한이 아니다 (§4.3)
- 기술 약 60개
- 이동 → 인카운터 → 배틀 → 포획 → 레벨업/진화 → 세이브의 **닫힌 루프**
- 트레이너 배틀 + 체육관전 + 배지 획득

제외(v2 이후):
- 나머지 신오지방, 배회 포켓몬, 지하대공동, 배틀타워, 통신교환/대전, 포켓몬 콘테스트

**근거:** 이 루프가 완성되면 나머지는 전부 *반복 가능한 콘텐츠 확장*이다. 새 시스템을 만드는 게 아니라 데이터를 채우는 일이 된다. 그 시점부터는 협업자를 받을 수도 있고, 중단해도 "완성된 무언가"가 남는다.

### 1.3 성공 기준

상세 근거는 §10.

| 지표 | 목표 | 비고 |
|---|---|---|
| 데스크톱 1080p | 60fps 안정 | |
| 모바일 | 30fps, 렌더 스케일 0.6 | |
| **VRAM 총량** | **모바일 ≤ 180MB** / 데스크톱 ≤ 600MB | ⚠️ iOS Safari WebGL 힙이 300~500MB. 넘으면 느려지는 게 아니라 **탭이 죽는다**. 가장 단단한 제약 (§10.3) |
| 첫 진입 → 타이틀 인터랙티브 | 3초 이내 | |
| 초기 청크 | **≤ 150KB gz** | 타이틀에 three.js를 싣지 않는다 |
| 게임 진입 시 추가 JS | ≤ 350KB gz | 베이스라인만 294KB gz (§10.4) |
| 첫 플레이 가능까지 | ≤ 8초 (4G) | 저해상도 선행 로드 |
| 2회차 이후 네트워크 | **0** | 에셋 IndexedDB + **앱 셸 SW precache** (§4.6) |
| 드로우콜 | Low ≤100 / Med ≤200 / High ≤300 | 단일 값이 아니라 프리셋별 (§10.1) |
| 가시 트라이앵글 | ≤ 1.5M | |
| 플레이 타임 (v1.0) | 60~90분 | |

---

## 2. 기술 스택과 결정 근거

### 2.1 확정 스택

```
React 19
Vite 8
TypeScript 6.x (strict)           # 7.0(네이티브 Go 컴파일러)은 툴체인 호환 확인 후 전환
react-router 7
three.js (r185+, `three/webgpu` 진입점)   # WebGPU 우선 · WebGL2 자동 폴백
@react-three/fiber 9              # React 19 대응. ⚠️ WebGPURenderer는 v9에서 수동 초기화 (§2.4)
@react-three/drei                 # ⚠️ 셰이더 주입형 일부(MeshReflectorMaterial 등) WebGPU 미호환 — 사용 전 개별 확인
@react-three/rapier 2             # R3F v9 / React 19 대응 (v1은 React 18용)
three-mesh-bvh                    # 레이캐스팅 가속
zustand 5
zod 4                             # 데이터 스키마 검증
@vanilla-extract/css              # 제로 런타임 스타일링
@vanilla-extract/vite-plugin
@vanilla-extract/dynamic          # 고빈도 값 → CSS 변수 주입
@pkmn/sim, @pkmn/protocol, @pkmn/data
@smogon/calc                      # 배틀 AI 평가함수 (§7.7). pkmn/dmg는 npm 미발행이라 대체
idb-keyval                        # IndexedDB 세이브
vite-plugin-pwa                   # SW precache, prompt 모드 (§4.6). 도입은 Phase 4
```

버전 커플링 주의: **R3F v9 ↔ React 19 ↔ rapier v2**는 세트다. React 18을 쓰면 R3F v8 + rapier v1이어야 한다. 섞으면 안 된다. R3F **v10**이 WebGPURenderer를 기본 지원할 예정이므로 릴리스 시 마이그레이션을 검토한다.

### 2.2 결정: R3F vs 순수 three.js → **하이브리드**

R3F를 전면 채택하면 씬 그래프 조작이 리컨실러를 타서 청크 스트리밍처럼 오브젝트를 대량 마운트/언마운트하는 작업에서 비용이 든다. 순수 three.js를 쓰면 React UI와의 통합이 수동 배선 지옥이 된다.

**채택안:**

- **R3F가 선언하는 것**: Canvas, 조명, 포스트프로세싱, 카메라 리그, 정적 씬 구조, 배틀 스테이지
- **명령형 three.js가 담당하는 것**: 청크 스트리밍, InstancedMesh 풀(잔디/나무/바위), NPC 무리, 파티클, 매 프레임 변환

경계 규칙: **엔진 레이어(`src/engine/`)는 React를 import하지 않는다.** 순수 TypeScript. R3F 컴포넌트는 엔진 시스템의 얇은 마운트 포인트일 뿐이다. 이 규칙이 지켜지면 나중에 R3F를 걷어내도 게임이 살아남는다.

### 2.3 결정: 스타일링 → **vanilla-extract** (styled-components 대체)

**핵심 논거: 게임 UI는 60fps 캔버스 위에 얹힌다.** 런타임 CSS-in-JS는 스타일 객체 생성 → 직렬화 → 해시 → 스타일시트 삽입을 **메인 스레드에서** 한다. 그 메인 스레드는 게임 루프가 프레임당 16.6ms를 놓고 다투는 곳이다. 빌드 타임에 CSS를 추출해버리면 이 비용이 **0**이 된다. 일반 웹앱에서는 취향 문제지만 게임에서는 아니다.

부차적으로 styled-components는 2025년 3월부터 메인테넌스 모드다. v6.4.0이 React 19 대응과 `createTheme`를 내놔서 죽은 건 아니지만, 굳이 선택할 이유가 없어졌다.

#### 후보 비교

| 후보 | 런타임 | 판정 |
|---|---|---|
| styled-components | 있음 | 런타임 비용 + 메인테넌스 모드. **탈락** |
| Tailwind v4 | 없음 | 이터레이션은 최고. 다만 게임 UI는 9-slice 대화창·커스텀 HP바·픽셀 프레임처럼 고도로 커스텀이라 유틸리티가 오히려 방해. **탈락** |
| CSS Modules | 없음 | 제로 의존성, Vite 내장. 나쁘지 않음. 단 디자인 토큰 타입 안전성 없음. **폴백 후보** |
| Panda CSS | 없음 | 훌륭하지만 빌드 셋업이 무겁고 이 규모엔 오버킬 |
| **vanilla-extract** | **없음** | ✅ **채택** |

#### vanilla-extract를 고른 결정적 이유

1. **`createTheme`가 CSS 변수를 네이티브로 생성한다.** 프레임당 갱신되는 UI(HP바 등)가 요구하는 "CSS 변수 직접 조작"이 예외 규칙이 아니라 **정식 경로**다. 테마 토큰 = CSS 변수이므로 낮/밤 전환도 클래스 토글 하나다.

   ```ts
   // ui/theme/theme.css.ts
   export const [darkTheme, vars] = createTheme({
     hud: { hpFill: '#3ddc84', hpBg: '#1a1a1a' },
     panel: { bg: '#0f1420', border: '#2a3550' },
   })
   ```
   ```ts
   // 배틀 HP바 — 프레임당 갱신. React 리렌더 0회.
   import { assignInlineVars } from '@vanilla-extract/dynamic'
   el.style.setProperty(hpRatioVar, String(current / max))
   ```

2. **완전한 TypeScript.** 토큰 자동완성, 오타 시 컴파일 에러. 493종 포켓몬 타입 컬러 팔레트(§7.3)처럼 토큰이 수백 개가 되면 이게 실제로 중요해진다.

3. **Vite 플러그인 1급 지원.** `@vanilla-extract/vite-plugin`은 2026년 3월 기준 유지보수 중.

4. **SSR/RSC 이슈 무관.** 이 프로젝트는 SPA 게임이라 styled-components의 최대 약점(RSC 비호환)이 애초에 해당사항 없었다 — 즉 그건 탈락 사유가 아니었다. 진짜 사유는 1번 런타임 비용이다.

유틸리티 스타일이 필요해지면 `@vanilla-extract/sprinkles`를 나중에 추가한다. 지금은 넣지 않는다.

#### 유지되는 제약

- **프레임당 갱신 UI(HP바, 데미지 숫자, 게이지)는 CSS 변수 경로.** 어떤 스타일링 라이브러리를 쓰든 변하지 않는 규칙이다.
- 스타일은 `*.css.ts`에 분리. 컴포넌트 파일에 인라인 스타일 로직 금지.

### 2.4 결정: 렌더러 → **WebGPU 우선, WebGL2 자동 폴백**

**현황:**
- `WebGPURenderer`는 three.js r171부터 프로덕션 옵션, 현재 r185에서 실사용 다수
- Safari 26(2025년 9월)이 마지막으로 합류, Firefox도 141+(Win)/145+(macOS) 지원 → **커버리지 약 95%**. 나머지 5%는 `three/webgpu` 진입점이 **WebGL2로 자동 폴백**한다 (별도 코드 경로 불필요). `three`와 `three/webgpu`를 동시에 import하면 tree-shaking이 깨져 중복 번들이 생기니 주의

**우리 케이스에 대한 판정:**

| 항목 | 수치 | 우리에게 |
|---|---|---|
| 번들 비용 | WebGPU 188 KB gz vs WebGL 121 KB gz → **+67 KB** | 부담이지만 감수 가능 |
| 드로우콜 헤비 씬 | **2~10배** | ✅ 오버월드가 정확히 이 케이스 |
| 파티클 | WebGL 5만 → WebGPU 100만+ | ✅ 기술 이펙트(§7.3)에 직결 |
| 물리 바디 | ~1,000 → ~100,000 | 우리 규모엔 과잉 |

**결정: 처음부터 `three/webgpu`로 간다. 단 Phase 0 스파이크로 검증한다.**

가장 중요한 이유는 성능이 아니라 **셰이더 언어 선택이 되돌리기 비싼 결정이기 때문**이다:

- 커스텀 GLSL은 WebGPU에서 **그대로 안 먹는다**. TSL로 써야 WGSL/GLSL 양쪽으로 컴파일된다
- 우리는 잔디 흔들림, 물, 화면 전환, 기술 VFX에 커스텀 셰이더를 쓸 예정이다
- **지금 TSL로 쓰면 추가 비용 0. 나중에 마이그레이션하면 커스텀 셰이더가 있는 프로젝트 기준 1~2일**
- 즉 이건 "나중에 결정" 하면 안 되는 항목이다

**포스트프로세싱:** `@react-three/postprocessing`은 쓰지 않는다 — 기반인 pmndrs postprocessing v6가 **WebGL 전용**이고 WebGPU 대응(v7)은 아직 작업 중이다. 대신 **three 내장 TSL 기반 `PostProcessing`(`three/tsl`의 `pass`, `bloom` 등)을 채택한다.** WebGPURenderer + WebGL2 폴백 양쪽에서 동작하는 공식 예제가 이미 다수다. Phase 0 스파이크의 검증 질문은 "내장 노드로 원하는 룩이 나오는가"다.

**R3F v9 수동 초기화:** v9는 WebGPURenderer를 기본 지원하지 않는다. `gl` prop에 async 초기화 함수를 넘긴다 (v10에서 기본화 예정):

```tsx
<Canvas gl={async (props) => {
  const renderer = new WebGPURenderer(props as any)
  await renderer.init()
  return renderer
}}>
```

**렌더러는 추상화 뒤에 둔다.** `engine/render/`에 진입점을 한 곳으로 모아 교체 가능하게.

### 2.5 3D UI vs DOM UI 경계

| 요소 | 구현 |
|---|---|
| 메인 메뉴, 설정, 도감, 가방, 파티 관리, 세이브 | **DOM** (vanilla-extract) |
| 다이얼로그 박스, 선택지 | **DOM** — 텍스트 렌더링 품질·접근성·i18n 때문 |
| 배틀 HUD (HP바, 기술 선택) | **DOM** — 단 CSS 변수 경로 |
| 이름표, 데미지 팝업, 상호작용 프롬프트 | **3D** (Sprite / drei `Html` 최소 사용) |
| 화면 전환 이펙트 | **셰이더** (포스트프로세싱 패스) |

DOM UI는 Canvas 위에 절대 위치로 오버레이. `pointer-events` 관리 주의.

---

## 3. 아키텍처

### 3.1 레이어

```
┌─────────────────────────────────────────────┐
│  app/     라우터 · 프로바이더 · 레이아웃      │  React
├─────────────────────────────────────────────┤
│  ui/      DOM UI (vanilla-extract)          │  React
├─────────────────────────────────────────────┤
│  scene/   R3F 선언 (Canvas · 라이트 · 리그)  │  React ↔ three
├═════════════════════════════════════════════┤  ← React 경계
│  engine/  순수 TS: 루프 · 월드 · 액터 ·      │
│           스크립트 · 배틀 · VFX · 오디오      │  no React
├─────────────────────────────────────────────┤
│  state/   zustand 스토어 3종                 │  bridge
├─────────────────────────────────────────────┤
│  data/    zod 스키마 · 로더 · 캐시           │
└─────────────────────────────────────────────┘
```

### 3.2 상태 3분할 — 가장 중요한 규칙

이 프로젝트에서 사람들이 제일 많이 망치는 지점이다. 상태를 **성격에 따라 3개로 완전히 분리**한다.

#### ① 세이브 상태 — `useSaveStore` (영속)

```ts
interface SaveState {
  version: number            // 마이그레이션용
  trainer: { name, gender, id, secretId, playtimeMs }
  party: PokemonInstance[]   // 최대 6
  boxes: PokemonInstance[][]
  bag: Record<ItemId, number>
  badges: number             // 비트마스크
  pokedex: { seen: Uint8Array, caught: Uint8Array }
  flags: Record<string, boolean | number>   // 스크립트 이벤트 플래그
  position: { mapId, x, y, z, facing }
  money: number
}
```

- zustand + `persist` 미들웨어 → **IndexedDB**(`idb-keyval`). localStorage는 5MB 한계 + 동기 블로킹이라 부적합
- **⚠️ `createJSONStorage`를 쓰지 않는다.** persist의 기본 JSON 직렬화는 `Uint8Array`(도감)·`Map`을 파괴한다. `PersistStorage<T>` 인터페이스를 직접 구현해 idb-keyval `get/set/del`에 값을 그대로 전달한다 — IndexedDB의 structured clone이 TypedArray를 보존한다. 비동기 스토리지이므로 `onRehydrateStorage`로 hydration 완료 시점을 처리
- **JSON 경로의 실패 양상이 특히 고약하다** (테스트로 고정: `saveStore.test.ts`). 복원 직후 `Uint8Array`는 숫자 키를 가진 평범한 객체로 뭉개지는데, **읽기는 우연히 계속 동작한다** — 인덱스 접근이 그대로 먹히기 때문이다. 파손은 다음 *쓰기*에서 터진다. `new Uint8Array(평범한객체)`는 `length`가 없어 빈 배열을 만들고, 그 순간 도감 기록 전체가 조용히 사라진다. 즉 버그가 저장 시점이 아니라 한참 뒤 "포켓몬 한 마리 더 잡았을 때" 드러난다
- 도감 필드 타입은 `Uint8Array<ArrayBuffer>`로 좁힌다(`DexField`). 기본 인자인 `ArrayBufferLike`는 SharedArrayBuffer 뷰까지 허용하는데, structured clone으로 오가는 값에는 맞지 않는 의도다
- `version` 필드 필수. 마이그레이션 함수 체인을 처음부터 만들어 둔다 — 나중에 붙이면 이미 늦다
- 저장 시점: 세이브 메뉴 / 맵 전환 / 배틀 종료 (자동저장 옵션)

#### ② 세션 상태 — `useSessionStore` (React 리렌더 OK)

```ts
interface SessionState {
  phase: 'title' | 'overworld' | 'battle' | 'menu' | 'transition'
  dialogue: { speaker, lines, index, choices } | null
  battleUI: { turn, menu, selectedMove, targets } | null
  loadedChunks: Set<ChunkId>
  graphicsPreset: 'low' | 'medium' | 'high'
}
```

빈도가 낮은(초당 몇 번 이하) 상태만. 셀렉터로 슬라이스 구독.

#### ③ 프레임 상태 — `worldState` (React를 절대 건드리지 않음)

```ts
// 평범한 mutable 싱글톤. 스토어 아님.
export const worldState = {
  player: { position: new Vector3(), velocity: new Vector3(), facing: 0, grounded: true },
  camera: { target: new Vector3(), yaw: 0, pitch: 0, distance: 8 },
  time: { elapsed: 0, delta: 0, gameHour: 12 },
  input: { move: new Vector2(), run: false, interact: false },
}
```

**금지 사항:** 플레이어 좌표를 zustand에 넣는 것. 초당 60회 `setState`가 발생해 React 트리 전체가 리렌더된다. 이게 R3F 프로젝트가 죽는 1번 원인이다.

프레임 상태를 UI에 노출해야 할 때(예: 미니맵 좌표)는 **스로틀링**(200ms)해서 세션 스토어에 밀어 넣는다.

### 3.3 라우팅 + 영속 Canvas

react-router를 게임에 쓸 때의 함정: 라우트 전환 시 `<Canvas>`가 언마운트되면 **WebGL 컨텍스트가 날아가고 모든 GPU 리소스를 재업로드**해야 한다. 로딩이 3초씩 걸린다.

**해법: Canvas를 라우트 트리 *위*에 둔다.**

```tsx
// app/GameLayout.tsx
function GameLayout() {
  return (
    <Shell>
      <Stage />          {/* <Canvas> — 절대 언마운트되지 않음 */}
      <UILayer>
        <Outlet />       {/* 라우트는 DOM 오버레이만 렌더 */}
      </UILayer>
    </Shell>
  )
}
```

라우트 설계:

| 경로 | 렌더 |
|---|---|
| `/` | 타이틀 (3D 배경 씬 + DOM 메뉴) |
| `/new` | 새 게임 — 이름/성별 선택 |
| `/load` | 세이브 슬롯 선택 |
| `/play` | 오버월드 (오버레이 없음, HUD만) |
| `/play/menu` | 메인 메뉴 오버레이 |
| `/play/menu/party` · `/bag` · `/pokedex` · `/save` | 서브 메뉴 |
| `/play/battle` | 배틀 HUD 오버레이 |
| `/settings` | 설정 |

**오버월드 ↔ 배틀 전환은 라우트가 아니라 상태 머신이 주도**하고, 라우터는 그 결과를 URL에 *반영*할 뿐이다. 라우트 변경이 씬 전환을 트리거하는 게 아니다. 방향이 반대면 뒤로가기로 배틀 도중에 탈출하는 버그가 생긴다.

### 3.4 게임 루프

```ts
// engine/loop/GameLoop.ts
const FIXED_DT = 1 / 60
let accumulator = 0

function tick(delta: number) {
  accumulator += Math.min(delta, 0.25)      // 스파이럴 방지 클램프
  while (accumulator >= FIXED_DT) {
    fixedUpdate(FIXED_DT)                    // 물리·충돌·스크립트
    accumulator -= FIXED_DT
  }
  update(delta)                              // 애니메이션·카메라·VFX
  render(accumulator / FIXED_DT)             // 보간 알파
}
```

R3F의 `useFrame`을 진입점으로 쓰되, 실제 로직은 엔진의 시스템 리스트를 순회한다.

```tsx
function EngineDriver() {
  useFrame((_, delta) => gameLoop.tick(delta))
  return null
}
```

시스템 실행 순서(고정):
`Input → Script → AI → Movement → Physics → Collision → Trigger → Camera → Animation → VFX → Audio`

---

## 4. 에셋 파이프라인

> 롬 내부 포맷의 실측 스펙과 추출 파이프라인 설계는 **[DATA.md](DATA.md)** 에 분리해 두었다. 이 장은 "무엇을 어디서 조달하는가"를 다루고, DATA.md는 "원본이 어떻게 생겼는가"를 다룬다.
>
> **Phase 1 데이터 추출은 대부분 끝났다.** 맵 헤더 표 593개, 행렬 270개 충돌 격자, 워프 1213개, NPC 3555명, 야생 인카운터 183표, 종족 508종, 기술 471개가 전부 실측 확정 + 원작 대조를 통과했다. 압축 후 신오 전체가 160KB 남짓이다. 남은 최대 미지는 `scr_seq`(1124개 이벤트 스크립트) 하나다.

### 4.1 원칙

**에셋은 빌드 산출물로 취급한다 — git이 아니라 아티팩트 스토리지로.**

이건 저작권이 아니라 **git이 바이너리를 못 다루기 때문**이다. git의 델타 압축은 텍스트를 전제하므로 바이너리에서 무력하다. 수 GB의 glb/텍스처를 커밋하면 히스토리가 영구적으로 부풀고 clone이 수십 분짜리가 된다. 한 번 들어가면 되돌리기도 어렵다.

```
ROM (최초 1회, 로컬)
  ↓  tools/extract   (ndstool → NARC 언팩 → apicula / sdat)
raw/                                    ← gitignore. 중간 산출물
  ↓  tools/optimize  (gltf-transform)
dist-assets/                            ← gitignore
  ↓  업로드 (R2 / S3 / GitHub Releases)
CDN  +  assets-manifest.json            ← 이 매니페스트만 커밋
  ↓  런타임 fetch + IndexedDB 캐시
게임
```

- **`assets-manifest.json`만 저장소에 들어간다** — 경로·해시·크기·버전. 재현성과 무결성 검증은 이걸로 확보
- 기기/협업자 간에는 `pnpm assets:pull`이 매니페스트를 보고 CDN에서 받는다. ROM 재추출 불필요
- **최종 사용자는 ROM이 필요 없다.** URL 열면 바로 플레이
- 첫 로딩은 필수 에셋만. 나머지는 청크 단위 지연 로드 + IndexedDB 영속 캐시 → **2회차부터 네트워크 요청 0** (에셋은 IndexedDB가, JS/CSS 앱 셸은 Service Worker가 담당 — §4.6)

### 4.2 추출 대상과 전략

| 대상 | 전략 | 근거 |
|---|---|---|
| **맵 지오메트리** | ⚠️ 최종 렌더 ❌ / **블록아웃 레퍼런스 ✅** | DS 원본 지오메트리는 웹 품질 미달. 단 Blender에 임포트해 **리모델링 기준선**으로 쓰면 타일 데이터만 보고 재구축하는 것보다 훨씬 빠르고 정확 |
| **맵 매트릭스 · 타일 충돌** | ✅ **완료** (DATA.md §2.1~2.2, §4.1) | 행렬 270개를 격자로 폈다. 오버월드는 960×960 한 장 — 걸어서 11개 존 도달 확인. 높이(BDHC)는 미파싱, 평면 취급 |
| **맵 헤더 · 워프 · NPC · 인카운터** | ✅ **완료** (DATA.md §2.3~2.4, §2.8) | arm9 헤더 표를 역산으로 특정. 문으로 실내 출입, 풀숲에서 야생 조우가 동작한다 |
| **포켓몬 모델** | ✅ **전량 활용** (§4.3) | 제약 해제로 최대 병목 소멸 |
| **인간 캐릭터 모델·애니메이션** | ✅ **BDSP 덤프 자가 추출** (§4.3.1) | 풀비율 배틀 모델 + 클립 23종 + 트레이너 96종 |
| **종족값 · 기술 · 특성 · 진화** | ✅ **완료** (DATA.md §2.5~2.7) | 508종 + 471기술 + 진화 246분기 + 레벨업 6753항목. 모부기·이브이·전광석화 등으로 원작 대조 |
| **트레이너 테이블** | ⬜ 미착수 (`trdata`/`trpoke` 각 928) | 전투 시스템과 함께 다룬다 |
| **텍스트/대사** | ✅ JSON 추출 — **영어·한국어·일본어. 스파이크 검증 완료** | 자체 구현 디코더(`tools/spike/gen4text.js`, pret msgenc 알고리즘 이식)로 3개 로케일 전 뱅크 **2,147개 복호화 성공, 실패 0**. 4세대는 통합 문자 테이블이라 pret charmap 하나로 한글까지 커버되지만 **결함 2개를 고쳐야 했다** — 아래 참조. 뱅크 매핑 테이블 완성(§4.2.1). US는 종족명을 대문자(TURTWIG)로 저장 — 표기 정책 결정 필요 |
| **BGM/SE** | ✅ **SSEQ 시퀀스 추출** (§4.5) | 원본 시퀀스 재생. 크기·표현력 동시 확보 |
| **UI 스프라이트** | ⚠️ 참고용 | 3D UI에 그대로는 안 맞음. 단 폰트·타입 아이콘·아이템 아이콘은 그대로 활용 |

#### 4.2.1 텍스트 뱅크 매핑 — 완료

**뱅크 순서는 지역판마다 다르다** (us 724 / ko 714 / ja 709개). 같은 인덱스에서 엔트리 수가 일치하는 비율은 us↔ko 10%, ko↔ja 63%에 불과하다. **인덱스로 텍스트를 참조하면 로케일을 바꾸는 순간 엉뚱한 데이터가 나온다.** 게임 코드는 반드시 의미 이름으로 참조하고, `src/data/textBanks.ts`가 로케일별 인덱스로 옮긴다.

⚠️ **매핑은 전단사가 아니다.** 영어는 대문자 변형 뱅크를 따로 갖는데(`move_names` us#647·#648) CJK는 대소문자가 없어 하나뿐이다. 전체를 1:1로 자동 정렬하려는 시도는 여기서 반드시 깨진다.

`tools/spike/bank-map.js`가 표를 생성한다. 4단계 판별:

1. 알려진 영어 문자열로 us 뱅크를 특정 (`"BULBASAUR"`, `"Twinleaf Town"` …)
2. 엔트리 수가 같은 ko/ja 후보를 추림 — **이것만으로는 부족하다.** 엔트리 수가 고유한 뱅크는 8%뿐
3. 후보 종류 필터: 빈 뱅크 제외, **고유 엔트리 비율 >0.8**(자리표시자 뱅크는 `－`가 반복돼 걸러진다), 이름형/설명형 구분(이름은 어느 언어에서든 <20코드, 설명은 >20)
4. 전체 LCS 정렬로 예측한 위치에 가장 가까운 후보 선택 — 뱅크 순서는 보존되고 **드리프트는 단조 증가**한다

시도했다가 버린 것: 엔트리 길이의 **상관계수**(r=0.05~0.48로 신호가 약해 한쪽을 고치면 다른 쪽이 깨졌다)와 **길이 비율**(언어마다 흔들려 이름/설명 구분에 실패). 절대 기준이 안정적이다.

검증 결과 — 7개 뱅크 전부 3로케일 실제 텍스트 대조 완료. 드리프트 단조성도 확인:

| 뱅크 | 엔트리 | us | ko | ja | ko 드리프트 |
|---|---|---|---|---|---|
| `nature_names` | 25 | 202 | 201 | 201 | +1 |
| `item_names` | 468 | 392 | 390 | 390 | +2 |
| `species_names` | 496 | 412 | 408 | 408 | +4 |
| `location_names` | 126 | 433 | 428 | 427 | +5 |
| `ability_names` | 124 | 610 | 605 | 604 | +5 |
| `type_names` | 18 | 624 | 617 | 616 | +7 |
| `move_names` | 468 | 647 | 637 | 636 | +10 |

값은 `src/data/textBanks.test.ts`가 고정한다. 판별 휴리스틱을 개선하다 이 값이 흔들리면 그건 개선이 아니라 회귀다.

**⚠️ charmap 결함 2개 — 수정 완료.** 초기 스파이크가 보고한 "미매핑 0"은 **커버리지를 잰 것이지 정확성을 잰 것이 아니었다.** 모든 코드에 매핑이 있었지만 일부가 틀린 글자였다:

1. **한글 표 0x401~0x40F 구간이 한 칸 밀려 있었다.** `가`가 표 전체에서 누락된 상태였다(가장 흔한 음절인데). 증상: `가지고`→`각지고`, `올라간다`→`올라갇다`, `용감`→`용갑`. 0x410 이후는 원래 정확했다 — 성격명 8개가 쓰는 20여 코드로 교차 확인
2. **`// Function codes` 구역이 문자 매핑을 덮어쓰고 있었다.** 명령 코드는 0xFFFE 뒤에서만 의미가 있는데 같은 맵에 병합되면서 0x600/0x602/0x603의 한글 `됨`/`됩`/`됫`이 `{STRVAR_6}`/`{UNK_*}`에 가려졌다. `loadCharmap`이 두 구역을 분리하도록 수정

교훈: **디코더 검증은 "모든 코드가 매핑되는가"가 아니라 "결과가 뜻이 통하는가"로 해야 한다.** 3로케일을 나란히 놓고 번역쌍인지 눈으로 대조하는 것이 유일하게 믿을 만한 검증이었다.

### 4.3 포켓몬·캐릭터 모델

**포켓몬: [Pokemon-3D-api/assets](https://github.com/Pokemon-3D-api/assets) 전량 활용.**

- 1300+ `.glb`. Draco 압축 + WebP 텍스처 + 1024² 리사이즈 — 다만 **우리 기준으로는 재처리 필요**(Meshopt + KTX2). 사유는 §4.4
- 샤이니 / 메가 / 리전폼 / 거다이맥스 포함. 저장소는 활동 중이나 라이선스 파일은 없다(립 모델 재배포 저장소) — 미러 백업을 떠 둔다
- 종수 상한은 두지 않는다 — 어차피 201~204번 도로 인카운터 테이블이 자연스럽게 30종 안팎으로 제한한다

**단, 어댑터 인터페이스를 둔다.** 사유는 **품질 일관성**이다:

- 해당 모델들은 본가 3D 게임(SM/SwSh 등) 기준이라 **애니메이션 세트가 종마다 제각각**일 수 있다. 없는 클립은 폴백 처리가 필요하다
- 스케일·축 방향·원점이 통일되어 있지 않을 가능성이 높다 → 로드 시 정규화 레이어 필수
- 나중에 아트 방향을 통일하려면 교체 경로가 있어야 한다

```ts
type ClipRole = 'idle' | 'attack' | 'hit' | 'faint'

interface PokemonModel {
  scene: Group
  clips: Partial<Record<ClipRole, AnimationClip>>   // 없을 수 있음 → 폴백
  bounds: Box3
  anchors: { mouth: Vector3, center: Vector3, feet: Vector3 }  // VFX 부착점
}

interface PokemonModelSource {
  load(species: SpeciesId, form?: FormId): Promise<PokemonModel>
}
```

로더 뒤에 **정규화 단계**를 반드시 둔다: 바운딩박스 기준 스케일 통일 → 발밑을 원점으로 → +Z 정면 정렬 → 누락 클립을 절차적 폴백(idle은 부유/호흡, hit은 백스텝+플래시)으로 채움. 이걸 안 하면 배틀 씬에서 종마다 크기와 방향이 제각각이 된다.

`anchors`가 핵심이다. 기술 이펙트가 모델 구조를 몰라도 되게 만든다 — 나중에 모델을 통째로 갈아도 연출 코드는 그대로다. 앵커가 없는 모델은 바운딩박스에서 추정한다.

#### 플레이어·NPC 모델

**4세대 오버월드 캐릭터는 2D 스프라이트다. 3D 모델이 원작에 존재하지 않는다.**

**아트 방향 결정: 풀 프로포션(등신)으로 통일하고 치비는 쓰지 않는다.** BDSP 혹평의 대상은 오버월드 치비 모델이고, 포켓몬 모델(Pokemon-3D-api, 본가 SM/SwSh 계열)·3인칭 추적 카메라(§6.2)와 정합하는 건 등신이다. BDSP에는 배틀(VS)용 풀 프로포션 모델이 전 트레이너 클래스에 별도로 존재한다 — DS 스프라이트를 충실히 3D화한 디자인이라 플래티넘 리메이크에 가장 정통성 있는 소스다.

트레이너판 Pokemon-3D-api(웹용 glb 일괄 팩)는 존재하지 않는다 — 변환 파이프라인은 직접 만들되, 소스는 기성 립으로 대부분 충당된다. v1.0 약 20명 기준 조달 계획:

**조달은 BDSP 덤프 자가 추출로 일원화한다** (§4.3.1에서 경로 확보). 수동 다운로드 사이트를 뒤질 필요가 없어졌다:

| 캐릭터 | 소스 | 상태 |
|---|---|---|
| 주인공 빛나 | `persons/battle/pc0002_00` (+ `_10`~`_22` 의상 변형) | ✅ 추출 완료 |
| 주인공 광휘(Lucas) | `persons/battle/pc0001_*` | ✅ 확인됨 |
| 트레이너 클래스·주요 인물 | `persons/battle/tr####_00` — **96종** | ✅ 확인됨 |
| 일반 주민 | `persons/field/fc####_00` (치비) — 풀비율 대응 필요 | ⚠️ 대조 필요 |
| 로우 박사·엄마 | 위 96종에 포함되는지 미확인 | ⚠️ 확인 후 판단 |

`tr####` 96종이 어떤 인물·직업군에 대응하는지는 아직 매핑하지 않았다. 필요한 시점에 렌더를 떠서 대조한다.

변환 파이프라인 주의사항:

- **Blender는 4.2 LTS** — 5.0에서 Collada(.dae) 임포트가 제거됐다
- 후처리는 포켓몬 모델과 동일한 gltf-transform 파이프라인(§4.4) — 스타일·최적화 일관성 확보
- 어차피 리깅·정규화·클립 폴백은 위 어댑터 인터페이스가 흡수한다

**스파이크 검증 완료 — "Dawn (Platinum Style)" dae → glb → 씬 배치.** 실측 결과:

- **지오메트리·리그는 그대로 쓸 수 있다.** 6메시 18,544 트라이앵글, 166본 풀리그(손가락 3관절·눈알·눈썹·귀·머리카락 물리본 포함). 원본이 Z-up이라 glTF 변환 시 **모델 전방이 +Z가 되어 `facing = atan2(vx, vz)` 규약과 그대로 일치**한다 — 회전 보정 불필요
- ⚠️ **스케일은 Blender에서 만지면 안 된다.** 아머처 오브젝트에 스케일을 걸고 내보내면 **역바인드 행렬과 노드 스케일에 이중으로 실려** 결과가 제곱으로 줄어든다(1.50m 의도 → 실측 0.88m). **정규화는 전적으로 로드 시점 `normalizeModel()`이 담당**하고 glb는 네이티브 크기로 내보낸다. 어차피 Pokemon-3D-api 1300종의 제각각인 스케일도 같은 코드로 흡수해야 하므로, 이게 원래 맞는 구조다
- **대체 복장 메시가 겹쳐 들어있다.** `hair1Skin`(비니 착용)/`hair2Skin`, `shoes1Skin`/`shoes2Skin`이 동일 위치에 중복 존재해 그대로 두면 z-fighting이 난다. 노드명으로 `.visible` 토글해 처리 — glb 하나로 복장 변형을 커버할 수 있는 이점이기도 하다
- **Models Resource 립에는 애니메이션 클립이 0개다.** T포즈 메시+본만 담고 있다. 아래 자가 추출로 해결됐다

**용량 실측:** 무압축 glb 5.0MB (텍스처 embed PNG가 대부분). §10.4 예산 대비 캐릭터 1인분으로는 과대 — §4.4의 KTX2(ETC1S) + Meshopt 적용이 선택이 아니라 필수임을 확인.

#### 4.3.1 BDSP 자가 추출 — 완료

**Switch 덤프에서 캐릭터 에셋을 전량 추출하는 경로가 뚫렸다. Models Resource 수동 다운로드는 더 이상 필요 없다.**

```
NSP → (nstool + prod.keys) → NCA → romfs
  → /Data/StreamingAssets/AssetAssistant/Characters/persons/{battle,field}/
```

- `battle/`은 **풀비율**, `field/`는 치비 오버월드다. 우리가 쓰는 `pc0002`(빛나)가 battle 쪽이라는 것이 원본에서 확인됐다 — §4.3의 아트 방향 결정이 소스 구조와 일치한다
- 번들 하나가 자급자족이다. `pc0002_00` 기준 **Mesh 6 + Transform 180(스켈레톤) + Material 12 + Texture2D 36 + AnimationClip 23 + AvatarMask + Animator**
- **애니메이션 확보.** `stand_b` `wait_b` `wait02_b` `walk_b` `run_b` `pose_b` `win01_b` `order_b` + 표정·눈 깜빡임. 접미사 `_b`는 배틀용이다
- **`tr####` 트레이너 클래스 96종** — 기존에 "덤프 없으면 불가"로 표시했던 항목이 전부 열렸다. `pc0002_10`~`_22`는 의상 변형 세트다
- 도구: [nstool](https://github.com/jakcron/nstool)(NSP/NCA/romfs) + **UnityPy**(에셋번들 파싱). Unity 2019.4.27f1
- ⚠️ 타이틀 업데이트(v1.3.0)는 불필요하다. 캐릭터 에셋은 전부 베이스에 있다

#### 4.3.2 BDSP 채색 구조 — 해독 완료

`_col`은 알베도가 아니라 **그레이스케일 음영 맵**이다. 실제 색은 텍스처가 아니라 머티리얼·컴포넌트에 있다:

```
albedo = _MainTex(음영) × 레이어색[_MaskTex 채널]
  🔴 R → _SkinColor   🟢 G → _PrimaryColor   🔵 B → _SecondaryColor   ⬛ 검정 → 틴트 없음
```

⚠️ **채널 매핑이 두 개다. 하나로 묶으면 안 된다.** `_MaskTex`의 RGB 채널 순서와 `ColorVariation`의 `channel` 인덱스 순서가 다르다:

| 매핑 | 0 | 1 | 2 |
|---|---|---|---|
| `_MaskTex` RGB | `_SkinColor` | `_PrimaryColor` | `_SecondaryColor` |
| `ColorVariation.channel` | `_PrimaryColor` | `_SecondaryColor` | `_SkinColor` |

같은 상수로 처리하면 **의상을 맞추는 순간 머리·눈·얼굴이 깨진다.** 실제로 한 번 그렇게 만들었다가 "채널 순서는 프로퍼티 선언 순서가 맞다"는 잘못된 결론에 도달했다. 게임 화면과 대조해서야 분리해야 한다는 것이 드러났다.

- **마스크는 한 장이다.** `_MaskTex` 하나의 RGB 채널이 세 색을 고른다. Models Resource 립의 `_msk`/`_msk2`/`_msk3`는 그 채널을 분리해 저장한 것이었다
- **`_SkinColor`는 피부 전용이 아니라 세 번째 범용 레이어 색이다.** 가방엔 노랑(#eedfa7), 모자엔 분홍이 들어간다
- **`ColorVariation` 컴포넌트가 머티리얼 기본값을 이긴다.** `Property00`~`03`이 게임 시작 시 고르는 외형 프리셋이고 `ColorIndex`가 기본값을 가리킨다. **다루는 범위는 피부·머리·눈 색뿐이고 의상은 건드리지 않는다** — 프리셋 4개를 전부 덤프해 확인했다. 이걸 반영하기 전엔 머리가 회백색, 눈이 무채색으로 나왔다
- 검증은 **실제 게임 스크린샷과 대조**해야 한다. 머티리얼 값만 보고는 어느 채널이 어느 색인지 알 수 없고, 기억에 의존한 배색 판단은 두 번 틀렸다

`tools/extract/bdsp_bake_albedo.py`가 위 식을 오프라인에서 계산해 **평범한 알베도 PNG로 굽는다.** 런타임에서 BDSP 셰이더를 재현할 필요가 없어지고, KTX2(§4.4)에도 그대로 태울 수 있다. 선형↔sRGB 변환과 마스크 NEAREST 업스케일(영역 경계 번짐 방지)을 포함한다.

**검증 결과 (게임 스크린샷 대조):** 흰 비니 + 분홍 엠블럼, 노란 머리장식, 빨간 목도리, 노란 가방, 남색 머리 — 전부 일치한다.

⚠️ **남은 차이는 명도다.** 조끼가 원작은 검정인데 우리 결과는 진회색으로 나온다. `wear` 머티리얼의 가장 어두운 값이 #7c7676이라 **어떤 곱셈 방식으로도 검정이 나오지 않는다** — 선형/sRGB 어느 공간에서 곱해도 결과는 회색이다. 치마·부츠도 원작보다 옅다. 톤 커브가 따로 있거나 해당 영역이 다른 경로로 칠해진다는 뜻인데, 미해결로 남긴다. 시각적으로 치명적이지 않고 애니메이션 작업을 막지 않는다.

또한 베이크는 알베도만 다룬다. 셰이더의 림 라이트·서브서피스·스펙큘러(`_ComplexTex`가 채널에 패킹)는 재현 대상이 아니다 — 우리는 자체 툰 셰이더(§2.4)를 쓴다.

- **맵은 별개 판단** — BDSP 맵 립은 "블록아웃 레퍼런스 + 자작 아트 킷"(§4.2)의 대안이지만, Unity 씬 조각이라 추출 후 재조립 비용이 있고 아트 스타일 통일 문제가 있다. **v1.0은 자작 아트 킷을 유지**하고, BDSP 맵은 비율·소품 배치 레퍼런스로 쓴다. 맵 자작이 병목이 되면 그때 전환을 재검토(ADR로 기록)

### 4.4 최적화 규격

```bash
gltf-transform prune    in.glb  out.glb                       # 미사용 노드/머티리얼 제거
gltf-transform resize   out.glb out.glb --width 512 --height 512
gltf-transform etc1s    out.glb out.glb --slots "baseColorTexture,emissiveTexture"
gltf-transform uastc    out.glb out.glb --slots "normalTexture" --zstd 18
gltf-transform meshopt  out.glb out.glb --level high           # ★ 반드시 마지막
```

| 자산 | 텍스처 | 트라이앵글 |
|---|---|---|
| 포켓몬 | 512² KTX2/ETC1S | ≤ 4,000 |
| 플레이어/NPC | 512² KTX2/ETC1S | ≤ 3,000 |
| 맵 청크 | 1024² KTX2 아틀라스 | ≤ 20,000 |
| 소품(instanced) | 256² 공유 아틀라스 | ≤ 300 |
| 노멀맵 전반 | KTX2/**UASTC** | — |
| 환경맵/IBL | **KTX2 사용 안 함** (HDR) | — |

#### WebP·PNG를 텍스처로 쓰면 안 되는 이유

WebP/PNG/JPEG는 파일이 작을 뿐 **VRAM에서 완전히 압축 해제된다.** 파일 크기만 보고 고르면 GPU 메모리에서 그대로 터진다.

```
uncompressedSize = width × height × 4 × 1.333   (밉맵 포함)

512²  →  1.4 MB   (포맷 무관. WebP든 PNG든 동일)
1024² →  5.6 MB
4096² →  90 MB
```

KTX2/Basis Universal은 GPU 네이티브 포맷(데스크톱 BC, 모바일 ASTC/ETC2)으로 **트랜스코딩되어 압축 상태로 VRAM에 상주**한다. 텍스처 메모리 **4~8배 절감**, 업로드도 같은 배수만큼 빠르다.

| 코덱 | 품질 | 파일 크기 | 용도 |
|---|---|---|---|
| **ETC1S** (BasisLZ) | 저·중 | JPEG급 | **색상 텍스처 기본값.** 노멀맵 등 데이터 텍스처엔 부적합 |
| **UASTC** | BC7급 | ETC1S보다 큼 (Zstd 슈퍼압축으로 완화) | **노멀맵·데이터 텍스처** |

트레이드오프: KTX2 파일은 JPEG 대비 **1~2배 크다.** 즉 다운로드는 손해, GPU 메모리는 큰 이득이다. 이 게임은 "한 번 들어와서 오래 머무는" 유형이고 텍스처를 계속 스트리밍하므로 **GPU 메모리 쪽이 압도적으로 중요하다.**

**KTX2를 쓰지 않는 경우:** HDR 환경맵/IBL. Basis Universal은 HDR을 지원하지 않는다. 환경맵은 저해상도 유지 + RGBE/HalfFloat로 처리한다.

#### ⚠️ 실무 함정: Pokemon-3D-api 에셋 재처리 필요

[Pokemon-3D-api/assets](https://github.com/Pokemon-3D-api/assets)는 **Draco + WebP**로 최적화되어 있다. 웹 배포용으로는 합리적인 선택이지만 **우리 기준으로는 둘 다 바꿔야 한다.** 그대로 30종을 동시 로드하면 모바일에서 VRAM이 터진다.

```bash
# 지오메트리: Draco → Meshopt / 텍스처: WebP → KTX2
gltf-transform meshopt        in.glb out.glb --level high
gltf-transform uastc          out.glb out.glb --slots "normalTexture" --zstd 18
gltf-transform etc1s          out.glb out.glb --slots "baseColorTexture,emissiveTexture"
```

#### Draco → Meshopt 교체

**Meshopt 디코드는 WASM SIMD로 약 1 GB/s**, Draco보다 상당히 빠르다. gzip/brotli와 결합하면 압축률은 Draco와 대등하다. 파일 크기가 아니라 **디코드 시간이 프레임 스톨로 나타나는** 우리 상황(청크 스트리밍 중 포켓몬 모델 동시 로드)에서는 Meshopt가 명확히 낫다.

주의: Meshopt는 **손실 압축**이다. 반복 압축하면 정밀도가 깎이므로 파이프라인의 **마지막 단계**에만 둔다.

#### 런타임 디코더 메모

- **KTX2는 런타임 트랜스코더가 필요하다.** `KTX2Loader.setTranscoderPath()`로 `basis_transcoder.js/.wasm` 경로 지정 + `detectSupport(renderer)` 호출. 트랜스코더 파일은 자체 호스팅한다 (§4.6)
- **무거운 디코드는 이미 오프스레드다.** KTX2Loader·DRACOLoader는 자체 워커풀을 쓰고, Meshopt는 `MeshoptDecoder.useWorkers(n)`으로 워커 디코드를 켠다. SharedArrayBuffer는 쓰지 않으므로 COOP/COEP 헤더 불필요 (§4.6)
- glTF 씬그래프 조립 자체는 메인 스레드 몫이다(three 객체는 transferable이 아님) — 프레임 스파이크는 에셋 단위 분할 로드로 흡수한다

### 4.5 오디오 파이프라인 — SSEQ 시퀀서

원작 음원을 쓸 수 있게 된 것 자체보다, *DS가 음악을 저장하는 방식* 때문에 얻는 이득이 크다.

#### DS 오디오 구조 (SDAT)

DS 음악은 오디오 파일이 아니라 **시퀀스 데이터**다.

| 청크 | 내용 |
|---|---|
| `SSEQ` | 곡 하나. MIDI 유사 이벤트 리스트 + SBNK 참조 |
| `SBNK` | 악기 뱅크. 최대 4개 SWAR 참조. 노트별 피치/엔벨로프/샘플 매핑 |
| `SWAR` | 샘플 아카이브. 내부에 `SWAV`(모노 클립)들 |
| `SSAR` | 효과음 아카이브. 이벤트 풀 공유, 시작 오프셋으로 구분 |
| `STRM` | 스트리밍 오디오 (통짜). 일부 특수 트랙만 |

**핵심: 시퀀스라서 압도적으로 작다.** 곡 하나가 수 KB 수준이고 샘플 뱅크는 전 곡이 공유한다. mp3로 렌더링하면 플래티넘 전곡이 100MB를 훌쩍 넘지만, SSEQ + 공유 SWAR이면 **수 MB로 전곡**이 들어간다. 웹 게임에서 이 차이는 결정적이다.

#### 참조 구현이 이미 존재한다

[Powerlated/OptimePlayer](https://github.com/Powerlated/OptimePlayer) — "닌텐도 DS/GBA 공식 사운드 엔진을 사용하는 음악 플레이어 및 리퍼". **JavaScript 구현**이다. 웹 데모: [nectarboy.github.io/OptimePlayer](https://nectarboy.github.io/OptimePlayer/). SSEQ/SSAR 재생 정확도를 목표로 개선한 포크도 있다. 포맷 명세는 [ndspy 문서](https://ndspy.readthedocs.io/en/latest/appendices/sdat-structure.html)가 가장 정확하다.

즉 **사운드 엔진을 처음부터 리버싱할 필요가 없다.** 참조 구현을 읽고 필요한 부분만 이식하면 된다.

#### 파이프라인

```
sound_data.sdat
  ↓ tools/audio/sdat.ts        (ndspy 명세 기준 파서)
sseq/*.json    이벤트 리스트 정규화
sbnk/*.json    악기 정의
swar/*.bin     SWAV → 16bit PCM (필요시 opus 인코딩)
  ↓ 런타임
engine/audio/NitroSynth        Web Audio API 기반 시퀀서
```

`NitroSynth` 구현 범위:

1. 이벤트 파서 — note on/off, tempo, pan, volume, LFO, 루프 마커, 트랙 분기
2. 샘플러 풀 — SWAV를 `AudioBuffer`로, 피치 시프트는 `playbackRate`
3. ADSR 엔벨로프 — `GainNode` automation
4. 16채널 폴리포니 관리 + 보이스 스틸링
5. **루프 포인트 정확 처리** — 게임 BGM은 무한 루프가 기본이다. 여기가 틀어지면 즉시 티가 난다. 최우선 검증 항목

#### 시퀀스라서 공짜로 따라오는 것들

mp3를 썼으면 하나도 못 했을 것들이다:

- **동적 템포** — 체력 위험 시 배틀 BGM 가속 (원작 기능)
- **레이어 믹싱** — 트랙별 볼륨 조절로 낮/밤, 실내/실외 변주를 같은 곡에서
- **심리스 전환** — 마디 경계에서 크로스페이드. 맵 이동이 뚝 끊기지 않는다
- **3D 위치 오디오** — SE를 `PannerNode`에 연결
- **배틀 연출 동기화** — 타임라인 큐(§7.2)를 곡의 비트에 맞출 수 있다

파일 크기와 표현력을 **동시에** 얻는다. 이런 경우는 드물다.

#### 폴백

`NitroSynth`가 예상보다 오래 걸리면 SSEQ → MIDI → opus 렌더링으로 임시 대체하고 Phase 5에서 교체. 단 위 5가지 기능은 그동안 포기해야 한다. **우선순위상 Phase 4에 배치**하되, 루프 처리만 먼저 검증한다.

### 4.6 전송·캐싱·오프라인

#### 호스팅

**결정: Cloudflare Pages(앱 셸) + R2(대용량 에셋).**

| 후보 | 판정 |
|---|---|
| **Cloudflare Pages + R2** | ✅ R2는 **egress 완전 무료**, 무료 티어 10GB + 월 1,000만 읽기 — 수백 MB 팬게임에 최적. R2에 커스텀 도메인을 붙이면 CDN 캐시도 적용 |
| itch.io HTML5 | 총 500MB / 단일 200MB / 1,000파일 제한 — CDN 스트리밍 구조와 충돌. 홍보용 보조 채널로만 |
| GitHub Pages | 커스텀 헤더 불가, 대역폭 소프트 리밋 — 부적합 |

- **R2 CORS 설정 필수**: `AllowedOrigins` + `AllowedHeaders: Range` + `ExposeHeaders: Content-Range, Accept-Ranges, ETag`. 오디오 부분 다운로드(Range 요청)와 아래 opaque 패딩 문제를 동시에 해결한다
- Brotli 사전 압축은 JS/CSS/JSON(도감·대사 데이터)에만 — KTX2/meshopt glb는 이미 자체 압축이라 이득이 없다
- **COOP/COEP는 켜지 않는다.** three 로더들은 SharedArrayBuffer를 쓰지 않는다. 켜면 외부 리소스 임베드만 깨진다

#### Service Worker (vite-plugin-pwa)

"2회차 네트워크 0"에서 IndexedDB가 담당하는 건 에셋뿐이다. **JS/CSS/HTML 앱 셸은 Service Worker precache가 담당한다:**

- `vite-plugin-pwa` + `strategies: 'generateSW'`. Vite의 콘텐츠 해시 파일명과 궁합이 좋다
- precache 대상: 앱 셸 + 활성 로케일의 상용 폰트 청크(§10.4) + Basis 트랜스코더
- **CDN 에셋은 SW runtime cache에서 제외한다** — 이미 IndexedDB로 직접 관리하므로 이중 캐시가 된다. `urlPattern`을 앱 셸로 한정
- **업데이트는 `registerType: 'prompt'`.** autoUpdate는 플레이 도중 리로드 사고를 낸다. "새 버전 있음" 토스트는 세이브 직후에만 노출

#### 스토리지 견고성

- 첫 대량 다운로드 전에 `navigator.storage.persist()` 요청 + `estimate()`로 여유 확인 + `QuotaExceededError` 핸들링
- 브라우저 에빅션은 **origin 단위 전체 삭제**로 온다. Safari는 7일 미사용 시 삭제 가능(홈 화면 PWA 설치 시 면제) — 세이브 내보내기(§9)가 보험이다
- opaque response(no-cors fetch)를 Cache Storage에 넣으면 Chrome이 항목당 ~7MB로 패딩한다 — 반드시 `mode: 'cors'`로 fetch (위 CORS 설정이 전제)
- 에셋 캐시는 LRU + 상한 200MB + 세이브와 별도 저장소 (§10.4)

---

## 5. 월드 / 맵 시스템

### 5.1 청크 모델

DS 4세대 맵은 **매트릭스**(청크 그리드) 구조다. 각 청크는 32×32 타일. 이 구조를 그대로 스트리밍 단위로 쓴다.

```ts
interface Chunk {
  id: ChunkId                   // "sinnoh:12,7"
  origin: [number, number]      // 월드 좌표
  collision: Uint8Array         // 32×32, 통과 유형
  height: Float32Array          // 32×32, 높이
  tiles: Uint16Array            // 32×32, 타일 종류 (인카운터 판정용)
  encounters: EncounterTableRef
  triggers: TriggerDef[]        // 워프, 스크립트, 사인
  props: PropPlacement[]        // 인스턴싱 대상
  meshUrl: string               // 자작 지오메트리 .glb
}
```

### 5.2 스트리밍

- 플레이어 중심 **3×3 청크 상주**, 5×5까지 프리페치
- 이동 방향 예측 프리페치 (속도 벡터 기준)
- 언로드는 지연(2초 그레이스) — 경계 왕복 시 스래싱 방지
- 로드는 Web Worker에서 파싱, 메인 스레드는 GPU 업로드만
- 청크 간 심(seam)은 높이 데이터를 공유 엣지로 강제 일치

### 5.3 지오메트리 생성 전략

타일 데이터 → 자작 아트 킷으로 조립.

1. **지형 메시**: 높이맵 → 그리드 메시. 청크당 1 드로우콜
2. **절벽/계단**: 높이 불연속 지점 자동 감지 → 프리팹 배치
3. **잔디**: `InstancedMesh` + 정점 셰이더 흔들림. 청크당 1 드로우콜
4. **나무/바위/건물**: 종류별 `InstancedMesh` 풀
5. **물**: 커스텀 셰이더 (반사 없음 — 성능)

**드로우콜 예산 배분(오버월드 300):** 지형 9 · 잔디 9 · 소품 인스턴스 40 · 건물 30 · NPC 20 · 플레이어 5 · 파티클 20 · 그림자 패스 60 · 여유 107

### 5.4 충돌

Rapier 물리 엔진을 전부 쓰지 않는다. 오버월드는 **높이맵 + 그리드 충돌**로 충분하고 훨씬 빠르다.

- 수평: 32×32 충돌 그리드 대상 캡슐 스윕
- 수직: 높이맵 샘플링(바이리니어 보간)
- Rapier는 **배틀 씬의 물리 기반 연출**(밀려남, 파편)에만 사용

---

## 6. 캐릭터 / 이동

### 6.1 이동 모델 결정

원작은 타일 락 그리드 이동이다. 3D에서 그대로 하면 몰입감 목표와 충돌한다.

**채택: 그리드 앵커드 자유 이동**

- 이동 자체는 아날로그 자유 (WASD / 스틱 / 가상 조이스틱)
- **인카운터·상호작용·스크립트 트리거는 타일 그리드에서 판정**
- 즉 물리적으로는 연속, 논리적으로는 이산

이유: 자유 이동은 몰입감을 주고, 그리드 판정은 원작 데이터(인카운터 테이블, 이벤트 위치)를 그대로 재사용하게 해준다. 둘 다 얻는다.

옵션으로 "클래식 그리드 이동" 토글 제공 — 원작 팬 배려 + 구현 난이도 낮음.

### 6.2 카메라

3인칭 추적 카메라. 상황별 프리셋을 데이터로 정의.

```ts
type CameraPreset = {
  distance: number, height: number, pitch: number,
  fov: number, damping: number, collisionRadius: number
}
```

| 상황 | 프리셋 |
|---|---|
| 필드 기본 | dist 8, height 4, pitch -25°, fov 55 |
| 실내 | dist 5, height 3.5, pitch -35° (천장 회피) |
| 동굴 | dist 6, pitch -20°, fov 65 (폐소감) |
| 대화 | dist 4, 대상 방향 살짝 회전 |
| 시네마틱 | 스크립트가 직접 제어 |

프리셋 간 전환은 크리티컬 댐프드 스프링 보간. 카메라 충돌은 스피어캐스트 → 벽 뚫림 방지.

### 6.3 NPC

- 행동은 데이터 정의: `static` / `patrol(path)` / `wander(radius)` / `lookAt(player)`
- 시야 콘 → 트레이너 조우 판정
- 30m 밖 NPC는 애니메이션 정지, 60m 밖은 언로드
- 군중 NPC(도시)는 `InstancedMesh` + 스켈레톤 텍스처 애니메이션

### 6.4 입력 시스템

**액션 매핑 레이어를 사이에 둔다.** 엔진은 `Action`(move / confirm / cancel / menu / run)만 알고 디바이스를 모른다. 매 tick에 키보드 상태 + 게임패드 폴링 + 터치 상태를 하나의 `InputState`로 합성해 `worldState.input`에 쓴다.

- **키보드**: `KeyboardEvent.code`(물리 키) 기준 — 한/영 전환·키보드 레이아웃 무관
- **게임패드는 폴링이다.** `navigator.getGamepads()`를 fixedUpdate에서 읽는다. `gamepadconnected/disconnected`는 연결 감지에만 사용. 이벤트 기반 API 제안(rawgamepadchange)은 아직 origin-trial 단계 — 무시한다. Firefox의 비표준 매핑 케이스는 `mapping === 'standard'` 확인으로 방어
- **키 리맵**: "키 입력 대기" 캡처 → `event.code` 저장. 표시 라벨은 `navigator.keyboard.getLayoutMap()`(Chromium 전용 — 폴백 필수). 기본값 복원 버튼 제공, Escape는 취소로 예약
- **터치**: 자유 이동은 가상 스틱(nipplejs `mode: 'static'`), 클래식 그리드 모드는 고정 D-pad + A/B 버튼 직접 구현(pointer events + `touch-action: none`). 스틱 입력 → 8방향 양자화 로직은 클래식 토글(§6.1)과 공유
- 접근성 연결 고리: 액션 매핑이 있으면 키 리맵은 공짜다 (§12.1)

---

## 7. 배틀 시스템

### 7.1 3계층 분리

이 분리가 배틀의 전부다.

```
┌──────────────────────────────────────────┐
│  Simulation   @pkmn/sim                  │  즉시 해결. 0ms.
│  입력: 명령 → 출력: 프로토콜 스트림       │
├──────────────────────────────────────────┤
│  Timeline     프로토콜 → 연출 큐 컴파일   │  결정론적 변환
├──────────────────────────────────────────┤
│  Director     큐를 시간축에 재생          │  수 초에 걸쳐 상영
└──────────────────────────────────────────┘
```

시뮬레이션은 즉시 끝나고, 연출은 천천히 상영된다. 이 둘을 섞으면 애니메이션이 게임 로직을 막게 되고 그 시점에서 코드가 지옥이 된다.

### 7.2 구현

```ts
// 1) 시뮬
const battle = new BattleStream()
battle.write(`>p1 move thunderbolt`)

// 2) 프로토콜 파싱
for (const line of protocol) {
  const { args, kwArgs } = Protocol.parseBattleLine(line)
  events.push(toDomainEvent(args, kwArgs))
}
// |move|p1a: Luxray|Thunderbolt|p2a: Roserade
// |-damage|p2a: Roserade|142/210
// |-supereffective|p2a: Roserade

// 3) 타임라인 컴파일
const cues: Cue[] = compile(events)
// [
//   { at: 0.0,  kind: 'camera',  shot: 'attacker-over-shoulder', dur: 0.4 },
//   { at: 0.4,  kind: 'anim',    actor: 'p1a', clip: 'attack' },
//   { at: 0.5,  kind: 'vfx',     archetype: 'beam', element: 'electric',
//               from: 'p1a.mouth', to: 'p2a.center', dur: 0.7 },
//   { at: 1.1,  kind: 'camera',  shot: 'impact-close', dur: 0.3 },
//   { at: 1.2,  kind: 'impact',  target: 'p2a', shake: 0.8 },
//   { at: 1.2,  kind: 'hpbar',   target: 'p2a', from: 210, to: 142, dur: 0.6 },
//   { at: 1.3,  kind: 'text',    key: 'supereffective' },
// ]

// 4) 재생 — useFrame에서 시간 커서 전진
director.update(delta)
```

**부가 이득:** 타임라인이 데이터라서 배속(1×/2×/스킵)이 공짜다. 커서 전진 속도만 바꾸면 된다.

### 7.3 기술 연출 DSL

467개 기술을 손으로 만들 수 없다. **아키타입 × 타입 팔레트** 조합으로 생성한다.

**아키타입 15종:**

| 아키타입 | 예시 기술 |
|---|---|
| `contact-melee` | 몸통박치기, 할퀴기, 인파이트 |
| `projectile` | 불꽃세례, 물대포, 에너지볼 |
| `beam` | 하이드로펌프, 파괴광선, 냉동빔 |
| `multi-hit` | 연속자르기, 고드름침 |
| `charge` | 솔라빔, 하늘의은총, 구멍파기 |
| `aoe-ground` | 지진, 매그니튜드 |
| `aoe-weather` | 모래바람, 비바라기, 쾌청 |
| `self-buff` | 칼춤, 나쁜음모, 방어 |
| `debuff-ranged` | 전기자석파, 최면술, 이상한빛 |
| `status-dot` | 독, 화상, 씨뿌리기 |
| `field-hazard` | 스텔스록, 압정뿌리기 |
| `heal` | 자기재생, 아침햇살 |
| `summon` | 도우미, 대타출동 |
| `burrow` | 구멍파기, 다이빙 |
| `explosion` | 자폭, 대폭발 |

**타입 팔레트 18종:** 각 타입마다 `{ 주색, 보조색, 파티클 텍스처, 트레일 셰이더, 임팩트 링, 사운드 프리셋 }`

```json
{ "id": "thunderbolt", "archetype": "beam", "type": "electric",
  "intensity": 0.8, "duration": 0.7, "shake": 0.6,
  "overrides": { "trail": "forked" } }
```

15 × 18 = 270 조합 + 개별 오버라이드로 467개 전부 커버. **간판 기술 20개 정도만 수제작**(고오라파, 파괴광선, 시간의포효 등).

### 7.4 카메라 연출

배틀이 "3D답게" 느껴지는 건 대부분 카메라 덕이다. 샷 프리셋:

| 샷 | 용도 |
|---|---|
| `establish` | 턴 시작 와이드. 양쪽 다 보임 |
| `attacker-oncoming` | 공격자 뒤 → 대상 방향 |
| `travel` | 투사체 추적 |
| `impact-close` | 명중 순간 클로즈업 + 셰이크 |
| `reaction` | 피격자 표정/리액션 |
| `faint` | 로우앵글 슬로우 |
| `switch-in` | 등장 시 회전 |
| `finisher` | 마지막 일격 시네마틱 |

6세대 이후 본가의 문법을 그대로 따르면 된다. 샷 전환은 컷(즉시), 샷 내 이동은 이징.

### 7.5 4세대 정합성 주의

`@pkmn/sim`의 Gen 4 데이터는 Showdown 기준이라 **플래티넘 특유의 값과 일부 다를 수 있다**(DP↔Pt 기술 위력 조정 등). 또한 DS의 RNG/데미지 롤을 비트 단위로 재현하지는 않는다.

대응:
- v1.0은 @pkmn/sim 그대로 (플레이 감각에 문제 없음)
- pokeplatinum `res/moves`, `res/pokemon`에서 추출한 값과 **자동 diff 리포트**를 만들어 차이를 문서화
- 정확도가 필요해지면 데이터 오버라이드 레이어로 패치

### 7.6 메타게임 레이어 — @pkmn/sim이 안 해주는 것들

**@pkmn/sim은 대전 심판이다.** 배틀 판정 밖의 모든 것은 우리가 만든다. 다행히 로직 공식은 잘 문서화되어 있고(Bulbapedia + 디컴파일), 데이터는 pokeplatinum `res/`에 있다:

| 시스템 | 내용 | 데이터 소스 |
|---|---|---|
| **포획 판정** | 4세대 포획 공식 — HP·상태이상·볼 종류 보정, 흔들림 판정 | 공식 문서화 완료 (Bulbapedia / pokeplatinum) |
| **경험치·노력치** | 전투 후 획득, 경험치 그룹 6종 곡선 | `res/pokemon` |
| **레벨업 기술 습득** | 습득 테이블 + 4개 초과 시 교체 UI | `res/pokemon` learnsets |
| **진화** | 레벨/친밀도/아이템/장소 조건 → 진화 씬 트리거 | `res/pokemon` |
| **야생 개체 생성** | 레벨 범위, IV, 성격, 특성, 성별 비율 | 인카운터 테이블 + 종족 데이터 |
| **상금·아이템** | 트레이너 상금, 배틀 내 아이템 사용(상처약·볼) | `res/trainers`, `res/items` |

구현 위치는 `engine/battle/meta/`. 배틀 시작 시 `PokemonInstance`(세이브 상태) → sim 포맷 직렬화, 종료 시 결과(HP·상태이상·경험치)를 역방향으로 반영한다. **이 왕복 변환이 세이브 손상의 최다 발생 지점이므로 프로퍼티 기반 테스트를 붙인다** (임의 파티 → 배틀 왕복 → 불변식 검증).

포획은 sim 밖에서 처리한다: 볼 던지기는 "우리 쪽 턴을 소비하는 특수 행동"으로 모델링 — 그 턴은 sim에 상대 행동만 흘리고, 포획 성공 시 배틀 스트림을 종료한다.

### 7.7 배틀 AI

@pkmn/sim은 심판이지 플레이어가 아니다 — 야생전이든 트레이너전이든 **상대 행동은 우리가 결정한다.** `BattleStream`의 p2를 앱이 구동하는 것은 공식 지원 패턴이다(예제의 `RandomPlayerAI`가 그 증거).

**채택: 점수 기반 1-ply 평가** (PokéRogue의 공개 문서화된 방식 — 본가 세대 AI와 유사 구조):

1. 각 기술을 `@smogon/calc`(Gen 4 지원)로 실데미지 평가 → **KO 가능한 기술 최우선**
2. 버프/회복/상태이상은 상황 가중치 — 첫 턴엔 셋업 선호, 상대 HP 낮으면 공격 선호
3. **무효 기술 배제** (타입 면역·특성 면역) — "AI가 똑똑해 보인다"는 체감의 80%가 이것이다
4. 상성 점수 기반 교체 판단 — 관장급 이상에서만 활성화

| 등급 | 정책 |
|---|---|
| 야생 | 랜덤 (원작 동일) |
| 일반 트레이너 | 점수 + 노이즈(소프트맥스) — 가끔 차선 수를 둔다 |
| 관장·중요 배틀 | argmax + 교체 활성 + 상대 최선 응수를 가정한 depth-2 (여유 있으면) |

원작 재현의 상한선: Gen 4 트레이너 AI 플래그 시스템의 디스어셈블 분석이 공개되어 있다(참고 링크). v1.0은 위 방식으로 충분하고, 원작 AI 플래그 재현은 이후 선택지로 남긴다.

---

## 8. 스크립트 / 이벤트 시스템

원작 스토리는 수천 개 이벤트다. 하드코딩하면 끝장이다. **데이터 주도 인터프리터**를 만든다.

```json
{
  "id": "rowan_lake_intro",
  "trigger": { "type": "tile", "map": "route201", "x": 12, "y": 8 },
  "condition": { "flag": "met_rowan", "eq": false },
  "steps": [
    { "op": "lockPlayer" },
    { "op": "camera", "preset": "cinematic", "target": "npc:rowan", "dur": 1.0 },
    { "op": "say", "speaker": "rowan", "text": "@text.rowan.intro1" },
    { "op": "walk", "actor": "npc:rowan", "path": [[12,6],[12,7]] },
    { "op": "choice", "options": ["@yes", "@no"], "store": "answer" },
    { "op": "branch", "on": "answer", "cases": { "0": "accept", "1": "decline" } },
    { "op": "label", "name": "accept" },
    { "op": "giveItem", "item": "pokedex" },
    { "op": "setFlag", "flag": "met_rowan", "value": true },
    { "op": "camera", "preset": "field" },
    { "op": "unlockPlayer" }
  ]
}
```

인터프리터는 **제너레이터 코루틴**으로 구현한다. `yield`로 프레임을 넘기면 비동기 대기(대사 진행, 이동 완료, 페이드)를 자연스럽게 표현할 수 있다.

```ts
function* run(script: Script): Generator<Wait, void> {
  for (const step of script.steps) {
    yield* ops[step.op](step, ctx)
  }
}
```

오퍼레이션 세트(v1.0): `lockPlayer` `unlockPlayer` `say` `choice` `branch` `label` `jump` `walk` `face` `wait` `camera` `fade` `playBgm` `playSe` `giveItem` `takeItem` `setFlag` `checkFlag` `battle` `heal` `shop` `warp` `spawn` `despawn` `shake`

`shop`이 빠지기 쉬운데 v1.0 범위 안이다 — 마사고타운 프렌들리숍(구매/판매 UI + 소지금)이 첫 배지 루프에 필요하다.

에디터는 나중에. v1.0은 JSON 직접 작성 + zod 검증 + 타입 생성.

---

## 9. 세이브 시스템

```ts
const SAVE_VERSION = 3

const migrations: Record<number, (s: any) => any> = {
  1: (s) => ({ ...s, pokedex: { seen: new Uint8Array(493), caught: new Uint8Array(493) } }),
  2: (s) => ({ ...s, money: s.money ?? 3000 }),
}

function migrate(save: any) {
  let s = save
  while (s.version < SAVE_VERSION) {
    s = migrations[s.version](s)
    s.version++
  }
  return SaveSchema.parse(s)   // zod 최종 검증
}
```

- 슬롯 3개 + 자동저장 슬롯 1개
- 저장 전 이전 세이브를 `slot_N.bak`으로 복사 (손상 복구)
- 내보내기/가져오기: base64 JSON 파일 — 기기 이동용이자 **에빅션 보험**(§4.6). 브라우저 스토리지 삭제는 origin 단위 전체로 오기 때문에 백업 수단이 없으면 세이브가 통째로 사라진다
- 직렬화는 structured clone 경로 — persist 기본 JSON 직렬화 금지 (§3.2). `Uint8Array` 보존 확인 테스트 포함
- 첫 세이브 시 `navigator.storage.persist()` 요청 (§4.6)
- 저장 시점 스크린샷 썸네일(캔버스 128×72 캡처)을 슬롯 목록에 표시

---

## 10. 성능 예산과 그래픽 프리셋

### 10.1 프리셋

| 항목 | Low (모바일) | Medium | High |
|---|---|---|---|
| **드로우콜 상한** | **≤ 100** | ≤ 200 | ≤ 300 |
| 렌더 스케일 | 0.6 | 0.85 | 1.0 |
| 그림자 | 없음 | 1024 PCF | 2048 PCSS |
| 안티에일리어싱 | 없음 | FXAA | SMAA |
| 포스트프로세싱 | 없음 | 블룸 | 블룸+GTAO+DOF |
| 잔디 밀도 | 0.3 | 0.7 | 1.0 |
| 청크 반경 | 1 | 2 | 2 |
| 파티클 상한 | 200 | 800 | 2000 |
| 텍스처 최대 변 | 1024 | 1024 | 2048 |
| 애니메이션 LOD | 15m | 30m | 60m |

#### 드로우콜 예산 근거

커뮤니티 실측 가이드라인: **모바일에서 60fps를 내려면 100 미만**, 데스크톱은 500대도 감당하지만 여유가 없다. 그래서 단일 값이 아니라 프리셋별로 잡는다. §5.3의 배분(지형 9 · 잔디 9 · 소품 40 · 건물 30 · NPC 20 · 플레이어 5 · 파티클 20 · 그림자 60)은 High 기준이며, Low에서는 그림자 0 + 소품 인스턴싱 통합으로 100 이하로 떨어뜨린다.

WebGPU로 가면 드로우콜 헤비 씬에서 2~10배 여유가 생기지만(§2.4), **폴백 경로(WebGL2, 사용자 5%)가 기준선**이므로 예산은 WebGL2 기준으로 잡는다.

기기 감지: `MAX_TEXTURE_SIZE` + WebGPU 어댑터 유무 + 초기 3초 프레임 타임 샘플링 → 자동 프리셋 제안. **적응형 다운스케일**: 프레임 타임이 3초간 목표를 넘으면 렌더 스케일부터 낮춘다(Pallet Town 3D의 접근).

### 10.2 상시 규칙

- 8회 이상 등장하는 메시는 무조건 `InstancedMesh` — 1,000개 메시를 1 드로우콜로
- 지오메트리/머티리얼은 `useMemo` 또는 모듈 스코프 싱글톤 — 절대 렌더마다 생성 금지
- 프레임 단위 변경은 ref 뮤테이션, `setState` 금지
- **텍스처는 KTX2 고정** (색상 ETC1S / 노멀 UASTC). WebP·PNG는 VRAM에서 압축이 풀린다(§4.4)
- **활성 라이트 3개 이하.** 그 이상은 베이킹 또는 환경맵으로. `PointLight` 그림자는 **1개당 렌더 패스 6회**(큐브 6면)이므로 오버월드에서 금지
- 그림자 캐스팅 오브젝트는 화이트리스트 (플레이어, NPC, 주요 소품만)
- 모바일 셰이더는 varying 3개 이하
- 배틀 진입 시 오버월드 씬 `visible = false` + 애니메이션 정지 (언로드 아님)
- 레이캐스팅은 `three-mesh-bvh` — 8만 폴리곤 대상 60fps 유지

### 10.3 VRAM 예산 — 실질적으로 가장 단단한 제약

프레임레이트보다 **먼저** 오는 제약이다. 넘으면 느려지는 게 아니라 **탭이 죽는다.**

**iOS Safari의 WebGL 힙은 약 300~500MB**로 데스크톱보다 훨씬 작다. 게다가 이론적 한계까지 할당하면 실제로는 그 전에 크래시한다. WKWebView는 고정값도 아니고 기기 RAM·시스템 부하에 따라 변한다.

| 항목 | 모바일 | 데스크톱 |
|---|---|---|
| **총 VRAM 예산** | **≤ 180 MB** (실측 한계의 약 40%) | ≤ 600 MB |
| 텍스처 최대 변 | **1024** | 2048 |
| 상주 청크 | 1 (3×3) | 2 (5×5) |
| 동시 로드 포켓몬 모델 | 4 | 12 |

KTX2 기준 실제 계산:

```
포켓몬 512² ETC1S + 밉맵  ≈ 0.2 MB   (WebP였다면 1.4 MB — 7배)
맵 청크 1024² 아틀라스     ≈ 0.7 MB   (WebP였다면 5.6 MB)
9개 청크 + 12체 모델       ≈ 8.7 MB   (WebP였다면 67 MB)
```

**모바일 대응은 KTX2 없이는 성립하지 않는다.**

### 10.4 로딩 예산

| 지표 | 목표 | 실측 | 근거 |
|---|---|---|---|
| 초기 청크 (타이틀 인터랙티브) | **≤ 150 KB gz** | **78 KB** ✅ | three.js를 타이틀에 싣지 않는다. 라우트 분할 |
| 게임 진입 시 추가 JS | **≤ 450 KB gz** | **431 KB** ✅ | three/webgpu 실측치 반영해 상향 조정 — 아래 참조 |
| 배틀 진입 시 추가 | ≤ 120 KB gz | 미측정 | `@pkmn/sim`은 `React.lazy` 지연 로드 |
| 첫 플레이 가능까지 | ≤ 8초 (4G 기준) | 미측정 | 저해상도 선행 로드 후 교체 |
| **2회차 이후 네트워크** | **0** | 미구현 | 에셋 IndexedDB + 앱 셸 SW precache (§4.6) |
| CJK 폰트 | 다이나믹 서브셋 | 미구현 | 전량 로드 금지 — 아래 참조 |

**분할 실측** (Phase 0, `vite build`):

```
초기 (타이틀)                                    게임 청크 (/play 진입 시)
  react (React+DOM+router)  75.38 KB gz           three (webgpu + R3F + 애드온)  427.32 KB gz
  index (앱 셸)              1.69                 Stage                            2.46
  css                        0.51                 keyboard                         0.59
  rolldown-runtime           0.42                 PlayRoute                        0.33
  index.html                 0.45              ────────────────────────────────────────
────────────────────────────────────                합계                         430.70 KB gz
  합계                      78.45 KB gz
```

⚠️ **`three/webgpu`는 188 KB가 아니라 427 KB gz다.** 초기 추정이 2.3배 빗나갔다. WebGPU 엔트리는 TSL 노드 시스템과 전체 NodeMaterial 라이브러리를 통째로 끌고 오며, 이건 트리셰이킹으로 줄지 않는다 — `three/webgpu`를 쓰기로 한 §2.4 결정에 딸려오는 고정 비용이다. **게임 청크 예산을 450 KB로 상향한다.**

이걸 감수하는 근거: **체감 로딩을 지배하는 건 초기 청크(78 KB)지 게임 청크가 아니다.** 게임 청크는 ① 지연 로드라 타이틀 표시를 막지 않고, ② 타이틀 화면에서 유휴 시점에 프리페치되며(`requestIdleCallback`, 버튼 hover 시에도), ③ SW precache 대상이라 2회차부터 0이다. 사용자가 타이틀을 읽는 동안 받아지므로 클릭 시점엔 이미 따뜻하다.

**프로그레시브 로딩:** 저해상도 LOD를 먼저 보여주고 고해상도를 비동기로 교체한다. 참조 사례로 56MB 자산을 **초기 300KB + 8MB 스트리밍**으로 낮춘 케이스가 있다. 청크 메시와 포켓몬 모델 양쪽에 적용한다.

**IndexedDB 캐시 주의:** 캐시한 항목이 전부 메모리에 상주하는 구조를 만들면 역효과다(Unity WebGL이 이 문제로 유명하다). **명시적 evict 정책**을 둔다 — LRU, 상한 200MB, 세이브 데이터와는 별도 저장소.

**CJK 폰트:** 한글 11,172자·한자 수만 자를 통짜 woff2로 실으면 그것만으로 초기 예산이 깨진다. 로케일별 전략:

- 한국어 UI: **Pretendard 다이나믹 서브셋** (woff2 + `unicode-range` 청크 분할 공식 제공 — 화면에 나온 청크만 다운로드, 전량 814KB → 실사용 ~270KB)
- 한국어 대화창: **Galmuri** (한글 픽셀 폰트, woff2) — 플래티넘 감성에 부합
- 일본어: 가나는 작지만 **한자 때문에 서브셋이 한글보다 더 중요하다.** 픽셀 감성은 **PixelMplus** 계열, UI는 Pretendard JP 또는 Noto Sans JP 서브셋. 빌드 시 `subset-font`/`glyphhanger`로 **추출된 대사 텍스트에 실제 등장하는 글자만** 서브셋하면 최소가 된다 — 대사가 고정 텍스트라서 가능한 최적화
- 자주 쓰는 범위(KS X 1001 2,350자, JIS 제1수준) 청크는 SW precache에 포함 (§4.6) + `font-display: swap`
- 폰트 로딩은 로케일 선택 후에만 — 미사용 언어 폰트를 받지 않는다

### 10.5 계측

개발 빌드에 상시 오버레이: FPS, 프레임 타임 p50/p99, 드로우콜, 트라이앵글, 텍스처 메모리, 활성 청크 수, GC 힌트. **성능 회귀는 CI에서 잡는다** — Playwright로 고정 경로를 걷는 벤치를 돌려 프레임 타임 p99를 기록.

---

## 11. 웹 플랫폼 함정

게임 로직과 무관하게 "웹이라서" 터지는 것들. 전부 Phase 0~2 사이에 한 번씩 밟게 되므로 체크리스트로 고정한다.

### 11.1 오디오 언락

- `AudioContext`는 사용자 제스처 전 `suspended` 상태다 (전 브라우저 공통 정책). 부팅 시 미리 생성해 두고, **타이틀 화면 첫 입력**(`pointerdown`/`keydown`, `{once: true}`)에서 `resume()` — 타이틀이 어차피 있으므로 UX 비용 0
- iOS 추가 처리: 탭 전환/화면 꺼짐 시 state가 `interrupted`로 바뀐다 → `visibilitychange` + `statechange`에서 resume 재시도. 무음 스위치 ON이면 Web Audio만 음소거된다 → Safari의 `navigator.audioSession.type = 'playback'` 지정(존재 체크 후), 필요시 무음 루프 `<audio>` 트릭(unmute-ios-audio)

### 11.2 탭 비활성

`visibilitychange` → 게임 루프 정지 + `audioContext.suspend()` + 복귀 시 delta 클램프. §3.4의 0.25s 클램프가 최악은 막아주지만 명시적 pause가 정석이다. rAF는 백그라운드에서 멈추지만 **타이머와 오디오는 계속 돈다.**

### 11.3 브라우저 기본 동작 차단

- **게임 활성 시에만**: Arrow/Space/Tab `preventDefault()` — 전역 차단은 금지(설정 메뉴 접근성)
- `contextmenu` 차단, 캔버스 `touch-action: none`, `html { overscroll-behavior: none }`(pull-to-refresh·스와이프 내비), `user-select: none`, viewport `maximum-scale=1`

### 11.4 해상도·주사율

- **DPR 캡**: `<Canvas dpr={[1, 2]}>` — 모바일 3x 패널에서 픽셀 수 2.25배 절약
- **120Hz**: rAF가 120fps로 들어온다. §3.4의 고정 스텝 + 렌더 보간이 전제라 이미 안전 — 보간을 생략하면 120Hz에서 미세 스터터가 생긴다
- 프레임 타임 악화 시 렌더 스케일부터 강등 (§10.1의 적응형 다운스케일)

### 11.5 전체화면

톱다운 RPG라 pointer lock은 불필요. 전체화면은 설정 메뉴 + F11 안내로 충분하다. iOS Safari는 canvas `requestFullscreen` 미지원 → 홈 화면 PWA 설치(`display: fullscreen`) 유도가 실용 해법이고, 이건 §4.6의 Safari 7일 에빅션 면제와도 겹치는 이득이다. 전체화면 진입은 제스처가 필요하므로 게임패드 버튼만으로는 못 들어간다.

### 11.6 명시적 비채택

| 항목 | 사유 |
|---|---|
| **OffscreenCanvas 렌더링** | DOM UI(대화창·메뉴)와 3D의 동기화가 많은 구조에서 워커 경계는 상태 동기화 지옥. WebGPU + OffscreenCanvas 조합은 검증 사례도 적다. 드로우콜이 적은 게임이라 이득 자체가 작다. 워커의 역할은 에셋 디코딩까지 (§4.4) |
| **COOP/COEP** | SharedArrayBuffer 불사용. 켜면 외부 리소스 임베드만 깨진다 (§4.6) |
| **이벤트 기반 게임패드 API** | 아직 origin-trial. 폴링으로 충분 (§6.4) |

## 12. 접근성과 현지화

### 12.1 접근성 최소 세트 (솔로 개발 기준, 우선순위순)

1. **키 리맵** — §6.4 액션 매핑 레이어가 있으면 공짜
2. **대화창 폰트 크기 2단계** — CSS 변수 하나 (§2.3 테마 토큰)
3. **`prefers-reduced-motion` + 셰이크/플래시 강도 토글** — 배틀 연출의 `shake` 값에 계수 하나 곱하면 끝
4. **HP바 색맹 대응** — 초록→노랑→빨강에 색상 외 신호 추가(수치 상시 표시 옵션). 별도 색맹 모드보다 싸고 정석
5. **텍스트 속도·자동 진행 옵션** — 원작에도 있는 기능
6. UI가 DOM이라는 것(§2.5) 자체가 최대 접근성 자산 — 스크린리더·브라우저 확대가 공짜로 따라온다. 캔버스에 UI를 그리지 않는 원칙의 부수 이득

### 12.2 i18n 구조

- **UI 문자열(수백 개)과 대사 스크립트(수천 줄)를 분리한다.** UI는 key-value JSON(ko/en/ja). **대사는 i18n 라이브러리에 넣지 않는다** — 화자·분기·연출이 붙은 이벤트 스크립트 데이터의 일부로 `dialogue/{locale}/{map}.json`에 두고, 맵 단위 lazy-load(에셋 스트리밍 파이프라인에 편승)
- 텍스트 소스: 영어 = pret `res/text`, 한국어 = 한글판 ROM, 일본어 = 일본판 ROM (§4.2) — 로케일 3개가 사실상 공짜. 로케일 간 정렬은 **뱅크 매핑 테이블 경유** — 지역판마다 뱅크 순서가 다르다는 것이 스파이크에서 확인됨(§4.2). pret의 뱅크 이름 목록을 앵커로 구간별 오프셋을 산출한다
- 치환은 `{name}` 수준이면 충분. ICU 풀스펙은 과함. 한국어 조사(은/는·이/가·을/를)는 마지막 글자 받침 판정으로 자동화: `(code - 0xAC00) % 28 > 0`. 일본어는 조사 문제가 없어 추가 처리 불요
- 폰트 로딩 전략은 §10.4 — 로케일 선택 후 해당 언어 폰트만

---

## 13. 로드맵

각 페이즈는 **수직 슬라이스**다. "먼저 맵 다 만들고 그다음 배틀" 같은 수평 접근은 금지 — 통합 리스크가 마지막에 몰린다.

### Phase 0 — 기반 (2주)

- Vite + TS strict + ESLint/Prettier + vitest
- React 19 / R3F v9 / rapier v2 / zustand / react-router 배선
- vanilla-extract 플러그인 + 테마 컨트랙트 골격 (`createThemeContract`로 토큰 먼저 고정)
- **★ WebGPU 스파이크** — `three/webgpu`(R3F v9 수동 초기화) + TSL 셰이더 1개 + three 내장 TSL 블룸 패스 1개 (§2.4). 실패 시 즉시 WebGL2 회귀
- **★ VRAM/드로우콜 오버레이를 첫날부터** — 예산은 나중에 재면 이미 늦다 (§10.3)
- **영속 Canvas 레이아웃** 구축 및 라우트 전환 시 컨텍스트 유지 검증
- 상태 3분할 스캐폴딩 + 규칙을 ESLint 커스텀 룰로 강제
- 고정 타임스텝 게임 루프 + 시스템 레지스트리
- 입력 액션 매핑 스캐폴딩 — 키보드부터, 인터페이스는 §6.4대로
- §11 체크리스트 적용 — 기본 동작 차단, `visibilitychange` 일시정지, DPR 캡, 오디오 언락 게이트 골격
- 성능 오버레이

**완료 조건:** 회색 박스 월드에서 캡슐이 60fps로 걸어다니고, 라우트를 왕복해도 FPS 드롭이 없다.

### Phase 1 — 데이터 파이프라인 (3주)

- `tools/extract`: NDS 언팩 → NARC 파서 → apicula 래핑
- 맵 매트릭스/충돌/높이 → `Chunk` JSON
- 종족값·기술·트레이너·인카운터 → JSON + **zod 스키마 + 타입 생성**
- **텍스트 코덱** — 영어(pret `res/text`) + 한국어·일본어(각 지역판 ROM `pl_msg.narc` 복호화) → `dialogue/{en,ko,ja}/` (§4.2·§12.2). 지역판별 문자 테이블 대응 포함
- **SDAT 파서** — SSEQ/SBNK/SWAR 추출 (재생은 Phase 4, 여기선 추출만)
- **★ 캐릭터 모델 스파이크** — "Dawn (Platinum Style)" dae→glb 변환을 끝까지 통과시켜 §4.3 파이프라인·스타일 검증
- `tools/optimize`: gltf-transform 파이프라인
- **에셋 매니페스트 생성 + `assets:pull`** (§4.1)
- 데이터 로더 + IndexedDB 캐시 (+ `storage.persist()` 요청, §4.6)

**완료 조건:** `pnpm extract --rom=...` 한 번으로 타입 안전한 JSON 세트 + 트윈리프타운 청크 1개 + SSEQ 덤프가 나오고, `pnpm assets:pull`로 다른 기기에서 ROM 없이 재현된다.

### Phase 2 — 오버월드 수직 슬라이스 (6주)

- 청크 스트리밍 + 심 처리
- 지형/잔디/소품 인스턴싱 렌더러
- 플레이어 컨트롤러 (자유 + 클래식 토글), 카메라 프리셋 시스템
- NPC + 시야 콘
- 스크립트 인터프리터 (오퍼레이션 15종) + 다이얼로그 UI
- 인카운터 판정 (잔디 타일 → 확률 테이블)
- 세이브/로드 + 마이그레이션
- **콘텐츠: 트윈리프타운 + 201·202번 도로**

**완료 조건:** 집에서 나와 로웬 박사 이벤트를 보고 202번 도로에서 잔디를 밟아 인카운터가 트리거된다. 저장하고 껐다 켜도 그 자리다.

### Phase 3 — 배틀 수직 슬라이스 (6주)

- `@pkmn/sim` 통합 + 4세대 데이터 diff 리포트
- 프로토콜 → 도메인 이벤트 → 타임라인 컴파일러
- 배틀 씬 (스테이지, 2체 배치, 조명)
- 카메라 샷 시스템 8종
- VFX 아키타입 5종 (`contact-melee`, `projectile`, `beam`, `self-buff`, `status-dot`) + 타입 팔레트 18종
- 배틀 HUD (CSS 변수 경로), 기술 선택, 배속/스킵
- **메타게임 레이어 (§7.6)** — 포획 공식, 경험치/노력치, 레벨업 기술, 진화 판정. sim↔세이브 왕복 변환 + 프로퍼티 테스트
- **야생·일반 트레이너 AI (§7.7)** — 랜덤 + 점수 기반
- 포획 시퀀스 연출, 기절, 레벨업/진화 씬
- 오버월드↔배틀 전환 셰이더

**완료 조건:** 야생 포켓몬과 조우 → 3D 배틀 → 기술 사용 → 포획 → 파티 합류 → 오버월드 복귀. 전 과정 60fps.

### Phase 4 — 시스템 완성 (8주)

- 파티/박스/가방/도감 UI
- 트레이너 배틀 (시야 조우 → 대사 → 배틀 → 상금)
- 체육관 + 배지 — **관장 AI 활성화 (§7.7 argmax + 교체)**
- 기술머신, 기술 배우기/잊기
- 비전기술 필드 사용 (거합베기, 괴력)
- 낮/밤 사이클 + 시간대별 인카운터
- **`NitroSynth` 오디오 엔진** (§4.5) — 루프 정확도 검증 우선 → 동적 템포 → 레이어 믹싱 → 3D 위치 SE
- 나머지 VFX 아키타입 10종
- 모바일 터치 컨트롤 (§6.4) + 키 리맵 UI
- **vite-plugin-pwa** — SW precache + 업데이트 프롬프트 (§4.6)
- 접근성 최소 세트 (§12.1)

### Phase 5 — 콘텐츠 확장 (지속)

- 나머지 신오지방 (맵 단위 이터레이션)
- 포켓몬 종 추가 (에셋 파이프라인 반복)
- 스토리 스크립트
- 도구화: 맵 에디터, 스크립트 에디터

**누적: v1.0까지 약 25주 (풀타임 기준). 사이드 프로젝트면 6~10개월.**

---

## 14. 리스크

| 리스크 | 영향 | 대응 |
|---|---|---|
| **스코프 폭주** | 미완성으로 사망 | **최대 리스크.** Phase 2·3 완료 전 신규 기능 금지. v1.0 범위를 문서로 고정하고 변경 시 ADR 작성 |
| **성능 붕괴** | 몰입감 목표 실패 | Phase 0부터 예산 계측. CI 벤치로 회귀 차단 |
| **React 리렌더 지옥** | 원인 추적 난이도 높음 | 상태 3분할을 ESLint 룰로 기계적 강제. `worldState` import를 React 컴포넌트에서 금지 |
| **모델 품질 불균일** | 배틀 씬 일관성 붕괴 | 종마다 스케일·축·클립 세트가 다름. 로더 뒤 정규화 단계 필수(§4.3). 누락 클립은 절차적 폴백 |
| **모바일 VRAM 초과 → 탭 크래시** | **치명적** | iOS Safari WebGL 힙 300~500MB(가변). 프레임 저하가 아니라 크래시다. KTX2 필수 + 예산 180MB + 상시 계측 (§10.3) |
| **에셋 총량 / 초기 로딩** | 이탈률 | 청크 지연 로드 + IndexedDB 영속 캐시 + 프로그레시브 LOD (§10.4) |
| **sim↔세이브 왕복 변환 버그** | 세이브 손상 | 메타게임 레이어(§7.6)의 직렬화 경계에 프로퍼티 테스트. 세이브 백업(`.bak`) + 내보내기 |
| **브라우저 스토리지 에빅션** | 세이브·캐시 소실 | origin 단위 전체 삭제로 온다. `storage.persist()` + 내보내기 + Safari 7일 규칙은 PWA 설치로 면제 (§4.6·§9) |
| **테이크다운 / 배포 채널 소멸** | 프로젝트 지속성 | 닌텐도의 팬게임 DMCA는 상습적 — Uranium('16), Essentials('18), Game Jolt 550+건('21), Relic Castle('24). 트리거는 인지도 급상승 + 완성형 + 수익화. 대응: 코드/에셋 저장소 분리(§14.1), 로컬+원격 이중 백업, 수익화 금지 유지, 조용한 배포 |
| **NitroSynth 루프 정확도** | 즉시 체감되는 품질 저하 | Phase 4 착수 시 루프 처리부터 검증. 실패 시 opus 폴백(§4.5) |
| **4세대 로직 불일치** | 원작 팬 이탈 | diff 리포트 자동화 + 오버라이드 레이어 |
| **@pkmn/sim 번들 크기** | 초기 로딩 | 배틀 씬을 `React.lazy` + 동적 import. 오버월드에는 안 실림 |
| **TSL 내장 포스트프로세싱 표현력 부족** | 룩 목표 미달 | Phase 0 스파이크로 조기 판정 (§2.4). pmndrs v7의 WebGPU 대응이 나오면 재평가 |

### 14.1 에셋 정책

**결정: 비영리 팬 프로젝트로서 원본 에셋을 사용한다.** 프로젝트 오너 판단이며 이 문서에 기록해둔다. §4.1(즉시 플레이 배포)·§4.3(모델 립 활용)·§4.5(원본 SSEQ)가 그 결과다.

수익화하지 않는다는 전제는 유지된다 — 광고·후원·유료화를 붙이면 위 판단의 근거가 달라지므로, 도입 시 이 절을 재검토한다. 위 리스크 표의 테이크다운 항목이 보여주듯 **수익화는 법적 문제 이전에 프로젝트 생존의 문제**다.

#### 저작권과 무관하게 유지되는 제약

| 항목 | 사유 |
|---|---|
| 에셋을 git에 커밋하지 않음 | **git이 바이너리를 못 다룬다.** 히스토리 영구 오염, clone 시간 폭증. CDN + 매니페스트(§4.1) |
| DS 맵 지오메트리를 최종 렌더에 미사용 | **품질.** 웹 해상도에서 DS 폴리곤은 견딜 수 없다. 블록아웃 레퍼런스로는 적극 활용(§4.2) |
| 포켓몬 모델 어댑터 인터페이스 | **정규화 필요.** 종마다 스케일·축·클립 세트가 다르다(§4.3) |

`.gitignore`: `raw/`, `dist-assets/`, `*.nds`, `*.sdat`

#### 실무 메모

- 백업을 로컬 + 별도 원격 두 곳에 둔다. 호스팅 플랫폼 의존을 낮추는 건 어떤 프로젝트든 기본이다
- README에 비공식·비영리 및 상표권 귀속 표기 — 관례이고 비용이 0이다
- 코드(엔진·파이프라인·툴)와 에셋을 저장소 수준에서 분리해두면, 나중에 어떤 이유로든 에셋 정책을 바꿔야 할 때 코드는 그대로 살아남는다. §15 구조가 이미 그렇게 되어 있다

---

## 15. 디렉토리 구조

```
pt-3d/
├─ docs/
│  ├─ PLAN.md                 # 이 문서
│  ├─ adr/                    # 아키텍처 결정 기록
│  ├─ data-schema.md
│  └─ perf-budget.md
├─ tools/                     # Node CLI — 앱과 완전 분리
│  ├─ extract/
│  │  ├─ rom.ts               # NDS 파일시스템
│  │  ├─ narc.ts              # NARC/CARC 파서
│  │  ├─ models.ts            # apicula 래핑
│  │  ├─ mapdata.ts           # 매트릭스/충돌/높이 → JSON
│  │  ├─ text.ts              # pl_msg.narc 복호화 → dialogue/{en,ko,ja}/ (지역판별 문자 테이블)
│  │  ├─ sdat.ts              # SSEQ/SBNK/SWAR 추출
│  │  └─ tables.ts            # 종족값/기술/트레이너/인카운터
│  ├─ optimize/               # gltf-transform 파이프라인
│  ├─ manifest/               # assets-manifest.json 생성 · pull
│  └─ verify/                 # 스키마 검증 + 4세대 diff 리포트
├─ raw/                       # .gitignore  중간 산출물
├─ dist-assets/               # .gitignore  업로드 대상
├─ assets-manifest.json       # ★ 커밋됨 — 경로/해시/크기/버전
├─ public/
│  └─ basis/                  # KTX2 트랜스코더 자체 호스팅 (§4.4) — SW precache 대상
├─ src/
│  ├─ app/                    # 라우터, 프로바이더, 레이아웃, 에러 바운더리
│  ├─ ui/                     # DOM UI (vanilla-extract)
│  │  ├─ theme/
│  │  │  ├─ contract.css.ts   # createThemeContract — 토큰 정의
│  │  │  ├─ day.css.ts
│  │  │  └─ night.css.ts
│  │  ├─ primitives/          # Button, Panel, TextBox…  (*.tsx + *.css.ts)
│  │  ├─ hud/
│  │  └─ screens/             # Title, Party, Bag, Pokedex, Battle…
│  ├─ scene/                  # R3F 선언
│  │  ├─ Stage.tsx            # 영속 Canvas
│  │  ├─ EngineDriver.tsx     # useFrame → gameLoop
│  │  ├─ overworld/
│  │  ├─ battle/
│  │  └─ fx/                  # 포스트프로세싱, 전환 셰이더
│  ├─ engine/                 # ★ React import 금지
│  │  ├─ loop/
│  │  ├─ world/               # 청크, 충돌, 높이맵, 스트리밍
│  │  ├─ actor/               # 플레이어, NPC, 카메라
│  │  ├─ script/              # 인터프리터 + 오퍼레이션
│  │  ├─ battle/              # 시뮬 어댑터, 타임라인, 디렉터, meta/(§7.6), ai/(§7.7)
│  │  ├─ vfx/                 # 아키타입, 타입 팔레트, 파티클
│  │  ├─ audio/               # NitroSynth — SSEQ 시퀀서, 샘플러, 엔벨로프
│  │  └─ input/
│  ├─ state/
│  │  ├─ saveStore.ts         # 영속
│  │  ├─ sessionStore.ts      # UI
│  │  └─ worldState.ts        # 프레임 (mutable 싱글톤)
│  ├─ data/                   # 로더 + zod 스키마 + 생성 타입
│  └─ types/
├─ tests/
│  ├─ unit/
│  └─ bench/                  # Playwright 성능 회귀
├─ .gitignore
└─ vite.config.ts
```

---

## 16. 바로 착수할 것

1. `pnpm create vite pt-3d --template react-ts` → 스택 배선 (+ vanilla-extract 플러그인)
2. **영속 Canvas 레이아웃 프로토타입** — 라우트 왕복 시 WebGL 컨텍스트 유지 검증. 이게 안 되면 라우팅 설계를 다시 해야 하므로 최우선
3. 고정 타임스텝 루프 + 성능 오버레이
4. 상태 3분할 스캐폴딩 + ESLint 룰
5. 회색 박스 월드에서 캡슐 이동 (Phase 0 완료 조건)

이 5개가 끝나면 Phase 1 데이터 파이프라인으로 넘어간다.

**병행 가능한 스파이크:** 나머지와 의존성이 없고 리스크가 큰 항목들 — 일찍 찔러볼수록 후반 불확실성이 줄어든다.

- ✅ **텍스트 — 완료.** `tools/spike/`의 자체 NDS/NARC/텍스트 디코더로 3개 로케일 전 뱅크 복호화 성공(실패 0). **뱅크 매핑 테이블까지 완료**(§4.2.1) — 7개 데이터 뱅크를 3로케일 내용 대조로 검증하고 테스트로 고정했다. 그 과정에서 charmap 결함 2개(한글 표 오프바이원 구간, 제어코드 구역이 문자 매핑을 덮어씀)를 발견·수정. 이 스파이크 코드가 Phase 1 `tools/extract`의 기반이 된다
- ✅ **배틀 시뮬 — 완료.** `@pkmn/sim` gen4customgame에서 양측 구동·프로토콜 수신, `@smogon/calc` Gen 4 데미지 계산 동작 확인
- **오디오**: ROM에서 추출해 둔 `raw/extracted/us/pl_sound_data.sdat`(7.7MB — 전곡이 이 크기다)를 OptimePlayer 웹 데모에 올려 곡이 나오는지 확인 — §4.5의 성패 판단
- ✅ **캐릭터 모델 — 완료.** 빛나를 glb로 변환해 게임 씬에 배치, 60fps 유지 확인. 정규화 레이어(§4.3)와 BDSP 채색 구조 해독(§4.3.2)까지 마쳤다. 이어서 **BDSP 덤프 자가 추출 경로를 확보**(§4.3.1)해 애니메이션 23종과 트레이너 96종이 열렸다
- ✅ **필드 데이터 — 완료.** `tools/extract/` 정식 파이프라인이 헤더 표·행렬 격자·워프·NPC·인카운터·종족·기술을 뽑는다(`pnpm extract`). 전부 크기 합 또는 독립 자료 교차검증으로 확정했고, 원작 대조값을 테스트로 고정했다(58개). 걸어서 이어진 신오 + 건물 출입 + 야생 조우가 실제로 동작한다 — DATA.md §4
- ⚠️ **애니메이션 — 절차적 대체물로 진행 중.** BDSP 번들의 `AnimationClip`(`walk_b`/`run_b`/`wait_b`)을 glTF로 옮기는 경로는 여전히 미검증이고, 지금 로컬에 nstool·Blender·UnityPy가 모두 없다. romfs도 지워진 상태라 NSP(4.6GB) 재추출부터 해야 한다.
  그래서 **절차적 보행**을 먼저 넣었다(`src/engine/actor/gait.ts` + `locomotion.ts`). dawn.glb의 166조인트 스켈레톤을 그대로 쓰므로 실제 클립이 들어오면 이 계층만 걷어내면 된다. 위상 속도를 보폭에서 유도해 발이 미끄러지지 않고, 걷기↔달리기는 진폭으로 섞는다.
  본 로컬 축을 하드코딩하지 않는다 — 월드 축 회전을 만들어 본의 로컬로 켤레변환한다. dawn.glb는 본이 로컬 +X로 뻗고 Hips가 180° 돌아 있어서 축을 박으면 곧바로 깨진다

---

## 참고 링크

- [pret/pokeplatinum](https://github.com/pret/pokeplatinum) — 플래티넘 디컴파일
- [nstool](https://github.com/jakcron/nstool) — NSP/NCA/romfs 추출 (BDSP 덤프, §4.3.1)
- [UnityPy](https://github.com/K0lb3/UnityPy) — Unity 에셋번들 파싱. 머티리얼 색·컴포넌트를 스크립트로 직접 읽는다
- [scurest/apicula](https://github.com/scurest/apicula) — NSBMD → glTF
- [DSPRE](https://github.com/DS-Pokemon-Rom-Editor/DSPRE) — DS 포켓몬 ROM 에디터
- [Trifindo/Pokemon-DS-Map-Studio](https://github.com/Trifindo/Pokemon-DS-Map-Studio) — 4·5세대 맵 에디터
- [PauliusOS/pallet-town-3d](https://github.com/PauliusOS/pallet-town-3d) — three.js 절차 생성 레퍼런스
- [pagefaultgames/pokerogue](https://github.com/pagefaultgames/pokerogue) — TS 포켓몬 배틀 게임
- [pkmn/ps](https://github.com/pkmn/ps) — 모듈화된 Pokémon Showdown
- [Pokemon-3D-api/assets](https://github.com/Pokemon-3D-api/assets) — 최적화 .glb 모델
- [PokéRegions](https://pokeregions.com/sinnoh) — Next.js + three.js 신오 3D 맵
- [tripplyons/pokeemerald-wasm](https://github.com/tripplyons/pokeemerald-wasm) — 디컴프 → WASM

**선행 사례 — 브라우저 NDS 에뮬레이터**
- [DS Player](https://ds.44670.org/) · [desmume-wasm](https://github.com/44670/desmume-wasm) · [melonDS-wasm](https://github.com/44670/melonDS-wasm) · [ds-anywhere](https://github.com/brxxn/ds-anywhere) · [EmulatorJS NDS](https://emulatorjs.org/docs/systems/nintendo-ds/)
- [pokeplatinum-portable](https://github.com/arcanite24/pokeplatinum-portable) — 플래티넘 디컴파일 SDL3 포팅

**캐릭터 모델 (§4.3)**
- [The Models Resource — BDSP](https://www.models-resource.com/nintendo_switch/pokemonbrilliantdiamondshiningpearl/) — Dawn(Platinum Style)·Barry·관장·사천왕 등 배틀 모델 립 (.dae)
- [New3DsSuchti — BDSP Battle Trainer PMX 팩](https://www.deviantart.com/new3dssuchti/art/MMD-BDSP-Battle-Trainer-v-0-7-DL-897408164) — Lucas 포함
- [pikapika-2000 — Masters EX MMD 팩](https://www.deviantart.com/pikapika-2000/art/MMD-Pkm-Masters-EX-Models-DL-Version-2-16-0-874909161) — 현역 유지보수, 신오 전원
- [Pokemon MMD Masterlist](https://www.deviantart.com/dunsparmy/journal/Pokemon-MMD-Masterlist-874142969) — 캐릭터별 제작자 총정리
- [MMD Tools (Blender 공식 익스텐션)](https://extensions.blender.org/add-ons/mmd-tools/) — pmx → Blender → glb 경로
- [BDSPedia Visuals](https://bdsp-modding.wiki/index.php/Visuals) · [Luminescent 팀 문서](https://luminescent.team/rom-hacking/art/animations) — romfs 추출 워크플로
- [GBAtemp BDSP 모델 추출 스레드](https://gbatemp.net/threads/brilliant-diamond-and-shining-pearl-pokemon-models-and-textures.603132/) — AssetStudio/AssetRipper 사용법

**텍스트/현지화**
- [포켓몬스터Pt 기라티나](https://ko.wikipedia.org/wiki/%ED%8F%AC%EC%BC%93%EB%AA%AC%EC%8A%A4%ED%84%B0Pt_%EA%B8%B0%EB%9D%BC%ED%8B%B0%EB%82%98) — 2009-07-02 한국 정발
- [thenewpoketext](https://projectpokemon.org/wiki/Thenewpoketext) · [PPTXT](https://www.gamebrew.org/wiki/PPTXT) — 4세대 텍스트 코덱
- [Pretendard](https://github.com/orioncactus/pretendard) (다이나믹 서브셋, JP 변형 있음) · [Galmuri](https://github.com/quiple/galmuri) (한글 픽셀 폰트) · [PixelMplus](https://github.com/itouhiro/PixelMplus) (일본어 픽셀 폰트)

**배틀 AI**
- [PokéRogue enemy-ai.md](https://github.com/pagefaultgames/pokerogue/blob/beta/docs/enemy-ai.md) — 채택한 점수 평가 방식의 원형
- [pkmn.ai/projects](https://pkmn.ai/projects/) — 포켓몬 배틀 AI 연구 지형도
- [Gen 4 트레이너 AI 디스어셈블 분석](https://gist.github.com/lhearachel/ff61af1f58c84c96592b0b8184dba096) — 원작 재현 시 상한선
- [@smogon/calc](https://www.npmjs.com/package/@smogon/calc) — 데미지 계산기 (pkmn/dmg는 npm 미발행)

**오디오**
- [Powerlated/OptimePlayer](https://github.com/Powerlated/OptimePlayer) — JS DS/GBA 사운드 엔진. **NitroSynth의 참조 구현**
- [OptimePlayer 웹 데모](https://nectarboy.github.io/OptimePlayer/) — SSEQ 재생 정확도 개선 포크
- [ndspy — SDAT 구조 명세](https://ndspy.readthedocs.io/en/latest/appendices/sdat-structure.html) — 포맷 정본
- [Gota7/NitroTools](https://github.com/Gota7/NitroTools) — SDAT 편집 도구

**프론트엔드**
- [R3F 문서](https://r3f.docs.pmnd.rs/getting-started/introduction) · [v9 마이그레이션 가이드](https://r3f.docs.pmnd.rs/tutorials/v9-migration-guide)
- [R3F WebGPU 지원 논의 #3352](https://github.com/pmndrs/react-three-fiber/issues/3352) — v9 수동 초기화 패턴의 근거
- [pmndrs/postprocessing](https://github.com/pmndrs/postprocessing) — WebGL 전용(v6). 비채택 사유
- [three.js WebGPU 포스트프로세싱 예제](https://threejs.org/examples/webgpu_postprocessing_bloom.html) — 채택한 내장 TSL 경로
- [vanilla-extract](https://vanilla-extract.style/) · [Vite 플러그인](https://www.npmjs.com/package/@vanilla-extract/vite-plugin)

**웹 플랫폼**
- [vite-plugin-pwa](https://vite-pwa-org.netlify.app/) — SW precache
- [MDN — Storage quotas and eviction](https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria) · [web.dev — Persistent storage](https://web.dev/articles/persistent-storage)
- [Cloudflare R2](https://developers.cloudflare.com/r2/) — egress 무료
- [unmute-ios-audio](https://github.com/feross/unmute-ios-audio) — iOS 무음 스위치 대응
- [nipplejs](https://github.com/yoannmoinet/nipplejs) — 터치 가상 스틱
- [Fix Your Timestep (Gaffer On Games)](https://gafferongames.com/post/fix_your_timestep/) — §3.4 루프의 원전

**성능 — 예산 근거 소스**
- [Don McCurdy, "Choosing texture formats for WebGL and WebGPU"](https://www.donmccurdy.com/2024/02/11/web-texture-formats/) — **KTX2 판단의 정본.** VRAM 공식, ETC1S vs UASTC, KTX2를 쓰지 말아야 할 경우
- [100 Three.js Tips That Actually Improve Performance (2026)](https://www.utsubo.com/blog/threejs-best-practices-100-tips) — 드로우콜/라이트/섀도우맵/파티클 수치
- [Migrate Three.js to WebGPU (2026)](https://www.utsubo.com/blog/webgpu-threejs-migration-guide) — TSL 요구사항, 폴백 동작, 마이그레이션 비용
- [glTF-Transform — EXTMeshoptCompression](https://gltf-transform.dev/modules/extensions/classes/EXTMeshoptCompression) · [KHRDracoMeshCompression](https://gltf-transform.dev/modules/extensions/classes/KHRDracoMeshCompression)
- [Basis Universal](https://github.com/BinomialLLC/basis_universal)
- [three-mesh-bvh](https://github.com/gkjohnson/three-mesh-bvh) — 레이캐스팅 가속
- [Unity WebGL Memory Optimization](https://blog.kongregate.com/unity-webgl-memory-optimization-part-deux/) — IndexedDB 캐시가 메모리를 잡아먹는 패턴 (엔진은 달라도 함정은 동일)
