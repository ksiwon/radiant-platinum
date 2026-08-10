# Git 히스토리 정리 계획

지금 나무에서 지운 것이 히스토리에는 그대로 있다. 이 문서는 **무엇을 지워야
하는지, 어떻게 지우는지, 지운 뒤에 무엇을 확인하는지**를 적는다.

> ⚠️ **아직 아무것도 실행하지 않았다.** `git filter-repo`·rebase·ref 삭제·
> reflog 만료·gc·force-push 중 어느 것도 돌리지 않았다. 이 문서는 계획이고,
> 실행은 사용자가 별도 메시지에서 `HISTORY_REWRITE_APPROVED`라고 명시한 뒤에만
> 한다. 승인이 없는 동안 `git-history` blocker는 열려 있다 (DEPLOY.md §1).

숫자는 전부 `pnpm audit:history`의 실측이다. 다시 돌리면 갱신된다.

---

## 1. 지워야 할 것

### 경로로 찾은 것

| 경로 | 커밋 | 블롭 | 크기 | 무엇인가 |
|---|---:|---:|---:|---|
| `public/data/**` | 33 | 2,572 | 14.1MB | 롬에서 뽑은 자료 — 대사·종족·기술·맵·스프라이트 |
| `assets-manifest.json` | 12 | 11 | 3.6MB | 원본 유래 산출물 7,086개의 경로·크기·짧은 해시 |
| `src/data/textBanks.json` | 4 | 3 | 0.1MB | 롬 뱅크 헤더 +2에서 읽은 u16 키 724개 |
| **합계** | **46** | **2,586** | **17.8MB** | |

`public/models`·`raw`·`dist`·`dist-assets`는 **히스토리에 한 번도 없다** — 처음부터
ignore였다. 확인했다.

### 내용으로 찾은 것

경로 목록은 *우리가 기억하는 자리*만 본다. 이름을 바꿔 옮겼거나 잊은 것은 못
찾는다. 그래서 블롭 **4,374개를 전부 열어** 머리 바이트로 가렸다:

| 종류 | 블롭 | 크기 | 비고 |
|---|---:|---:|---|
| JSON표 (64kB 이상) | 35 | 8.9MB | 경로 16개. `src/data/textBanks.json`이 여기서 처음 보였다 |
| PNG | 1,149 | 1.4MB | 스프라이트 덤프. 우리가 그린 앱 셸 이미지는 뺐다 |
| NARC·SDAT·NCLR·NCGR·NSBMD | 0 | — | 롬 컨테이너 자체는 히스토리에 없다 |

내용 훑기가 찾은 것은 **전부 위 경로 셋 안에 든다.** 경로 밖에 숨은 원본 유래
블롭은 0개다.

### 히스토리에 남기는 것

| 경로 | 크기 | 왜 남기나 |
|---|---:|---|
| `public/assets/radiant-platinum-intro.png` | 2.3MB | 우리가 만든 그림 |
| `public/assets/radiant-platinum-icon.png` | 1.2MB | 같음 |

⚠️ 이 둘은 **저작권 문제로 남기는 것이지 안전해서 남기는 것이 아니다.** 그림
안에 워드마크가 있고 원작 캐릭터로 보이는 형상이 있다 — 그건 `brand-art`
blocker가 따로 다룬다 (COPYRIGHT.md §11). 히스토리 정리와 별개의 판단이다.

---

## 2. 백업과 복구

**먼저 한다.** 다시 쓰기는 되돌릴 수 없고, 잘못되면 167개 커밋이 사라진다.

```sh
# ① 번들 하나로 전부 (브랜치·태그·객체)
git bundle create ../radiant-platinum-backup.bundle --all

# ② 폴더째 한 벌 더. `.git`을 포함해야 한다
cp -r radiant-platinum ../radiant-platinum-before-rewrite

# ③ 번들이 실제로 읽히는지 확인한다 — 안 열리는 백업은 백업이 아니다
git bundle verify ../radiant-platinum-backup.bundle
```

복구:

```sh
git clone ../radiant-platinum-backup.bundle radiant-platinum-restored
```

백업 둘은 **리포 밖**에 둔다. 안에 두면 다시 쓰기가 그것까지 건드리거나,
다음 커밋에 딸려 들어간다.

---

## 3. 실행 계획

`git filter-repo`를 쓴다. `git filter-branch`는 느리고 함정이 많아 git 자신이
쓰지 말라고 한다.

```sh
pip install git-filter-repo        # 또는 배포판 패키지

git status --short                 # 깨끗해야 한다
git worktree list                  # 지금 하나뿐인 것을 확인했다
git stash list                     # 비어 있어야 한다

git filter-repo \
  --invert-paths \
  --path public/data \
  --path assets-manifest.json \
  --path src/data/textBanks.json
```

`--invert-paths`는 "이 경로들만 빼고 나머지를 남긴다"다. 한 번에 셋을 넘기는
이유는 **패스마다 따로 돌리면 그때마다 모든 커밋 해시가 다시 바뀌기** 때문이다.

`filter-repo`가 하는 일:

- 대상 경로를 건드린 커밋 46개에서 그 파일들을 뺀다
- 그 결과 빈 커밋이 되면 지운다 (`--prune-empty=auto`가 기본)
- **모든 커밋 해시가 바뀐다** — 46개만이 아니라 그 뒤 전부
- `origin`을 지운다 (실수로 push 하지 못하게 하는 filter-repo의 안전장치)

### 지금 커밋 해시를 참조하는 곳

문서와 커밋 메시지에 짧은 해시가 여럿 적혀 있다. 다시 쓰기 뒤에는 **전부
가리키는 것이 없어진다.** 지금 이 계획서에 적힌 것도 마찬가지다. 다시 쓴 뒤에
문서를 한 번 훑어 옛 해시를 지우거나 "다시 쓰기 이전"이라고 표시한다.

`.audit/build.json`의 `buildId`도 옛 해시다 — 다시 빌드하면 갱신된다.

---

## 4. 다시 쓴 뒤 확인

```sh
# ① 브랜치와 태그
git branch -a                      # master 하나
git tag                            # 0개 (지금 태그가 없다)
git log --oneline | wc -l          # 커밋 수. 빈 커밋이 지워져 167보다 줄 수 있다

# ② 옛 객체가 ref에 안 붙어 있는지
git for-each-ref --format='%(refname)'   # refs/heads/master 만 남아야 한다
ls .git/refs/original 2>/dev/null        # filter-repo는 안 만든다. 있으면 지운다

# ③ reflog와 느슨한 객체를 실제로 버린다
#    ⚠️ 이걸 안 하면 로컬에는 옛 블롭이 그대로 남는다
git reflog expire --expire=now --all
git gc --prune=now --aggressive

# ④ 내용으로 다시 감사한다 — 경로만 보면 이름 바꾼 것을 놓친다
pnpm audit:history                 # 대상 전부 ✓ · 내용 훑기에서 JSON표·PNG 0

# ⑤ 배포 경계도 다시
pnpm build && pnpm release:check
```

④가 **판정이다.** 스크립트가 블롭을 다시 전부 열어 머리 바이트를 보므로,
경로를 놓쳤거나 이름이 다른 사본이 남아 있으면 거기서 걸린다.

---

## 5. 리모트와 협업자

지금 **리모트가 하나도 없다.** 이것이 이 정리를 지금 하는 이유다.

- 한 번 push된 객체는 GitHub의 캐시와 남의 클론에 남는다. 나중에 지워도
  `https://github.com/<owner>/<repo>/commit/<옛해시>`로 한동안 열린다
- 포크가 하나라도 생기면 그 포크에 그대로 남고, 우리가 지울 수 없다
- 그래서 순서가 **다시 쓰기 → 리모트 생성 → 첫 push**여야 한다.
  반대로 하면 이 정리는 의미가 없어진다

협업자가 생긴 뒤에 다시 써야 한다면:

1. 다시 쓸 시각을 미리 알린다. 그 사이 push를 멈춘다
2. 각자 **다시 클론한다.** `git pull`로는 못 따라온다 — 히스토리가 다른 나무다
3. 안 하면 다음 push가 옛 객체를 통째로 되살린다

---

## 6. force-push가 필요할 때

리모트가 이미 있는 상태에서 다시 썼다면 그때만 필요하다.

```sh
# ① 지금 리모트 상태를 먼저 백업한다
git bundle create ../remote-backup.bundle --all

# ② 브랜치 보호를 잠시 푼다 (GitHub: Settings → Branches)

# ③ --force-with-lease를 쓴다. 그냥 --force는 남의 push를 말없이 덮는다
git push --force-with-lease origin master

# ④ 보호를 되돌린다
```

`--force-with-lease`도 **남의 클론에 있는 사본은 못 지운다.** GitHub에서 옛
객체를 실제로 없애려면 GitHub Support에 gc를 요청해야 하고, 포크가 있으면
그것도 각각 처리해야 한다.

---

## 7. 이 정리가 하지 않는 일

- **저작권 문제를 끝내지 않는다.** 히스토리에서 원본 유래 바이트가 없어지는
  것이고, 상표·2차적 저작물·프로젝트 이름의 문제는 그대로다 (COPYRIGHT.md §11)
- **다른 사람이 이미 받아 간 것을 되돌리지 않는다.** 지금은 받아 간 사람이
  없다는 것이 유일한 방어다
- **`raw/`를 건드리지 않는다.** 그것은 애초에 히스토리에 없다
