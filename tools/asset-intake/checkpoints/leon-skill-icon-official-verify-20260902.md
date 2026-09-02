# Asset Intake — Leon Skill Icon Official Verification (2026-09-02)

기준 main: `e2fe65e43e6ad2164c618281b80c049d52c13292`

진단 실행 predecessor: `c6fa80e01690d1365cf735b67749edf749435de3`

상태: `PASS_LEON_SKILL_ICON_OFFICIAL_VERIFY / COMPLETE`

## 목적

현재 Hero generated consumer가 확정한 레온(Hero ID 6)의 고유기/일반/직접/SP 스킬 아이콘 source path를 Zlongame 공식 설치본에서 exact-path로 검증한다.

이 checkpoint는 asset provenance 검증만 다루며 Hero skill/talent semantic, Job relation, SP semantic을 재계산하지 않는다.

## authoritative predecessor

- Hero consumer: `data/generated/hero-detail/by-id/6.json`
- Hero ID: `6`
- 현재 main `e2fe65e...`는 진단 predecessor `c6fa80e...` 이후 Soldier portrait batch-planner 경로만 변경했으며 Hero 6 consumer는 변경하지 않았다.

## source / resolver rule

- source kind: `OFFICIAL_INSTALLER`
- install version: `1.1.113`
- base: `http://mhmnzupdate.zlongame.com/MHMNZ/InstallVersion/InstallPage_1.1.113`
- Unity parser: `UnityPy==1.25.3`
- observed Unity container root: `assets/gameproject/runtimeassets/`
- official package count: `68`
- candidate skill bundle count: `2`

Resolver rule:

1. official installer ZIP central directory를 Range read한다.
2. `ui_icon_skill_abs.b` suffix 후보 bundle만 선택한다.
3. Unity container path의 slash/case를 normalize한다.
4. 실제 `assets/gameproject/runtimeassets/` prefix를 정확히 제거한다.
5. Hero consumer의 `UI/Icon/Skill_ABS/...` source path와 exact equality만 인정한다.
6. exact object는 `Sprite`여야 한다.
7. Sprite를 RGBA로 decode하고 non-empty alpha를 요구한다.

금지: name JOIN, ID arithmetic, filename similarity에 의한 semantic relation 생성, begin/current bundle명 기반 의미 추론.

## diagnostic execution

성공 run:

```text
runId = 33573620678
jobId = 100072692506
conclusion = success
artifactId = 9825841985
artifactDigest = sha256:25c1b2dfdec1887c38c56fa2d0ea7d98636effff2be62af9350fe1292cbb249d
```

첫 진단 run `33573332097`은 asset 실패가 아니라 UnityPy container value가 `PPtr`인데 ObjectReader로 dereference하지 않은 진단기 오류(`AttributeError: 'PPtr' object has no attribute 'get_raw_data'`)였다. 성공 run에서는 `PPtr.deref()` 후 동일 source/procedure를 재실행했다.

## coverage

```text
targetUniqueIconCount = 12
exactHitTargets = 12
decodedTargets = 12
Sprite = 12/12
nonEmptyAlpha = 12/12
blockers = []
reviews = []
```

모든 target은 exact hit가 1개였고 `PASS_EXACT_HIT_RAW_EQUIVALENT`였다.

## verified targets

| 역할 | Skill ID | 중국명 | source path | package | bundle | size | raw object SHA-256 |
| --- | --- | --- | --- | ---: | --- | ---: | --- |
| talent | 3067/3072/3077/3082 | 传说的骑士 | `UI/Icon/Skill_ABS/Gift_Knight.png` | 27 | `begin_ui_icon_skill_abs.b` | 175×158 | `2dd27910f983fc8da35a1b21fbd492babbba105b724913f4bf378365a64e3d77` |
| normal | 5020 | 整军 | `UI/Icon/Skill_ABS/Passive_BothBuf1.png` | 62 | `ui_icon_skill_abs.b` | 170×170 | `013986675fc800f75ad57f6ddbbd1bf3ff4776e4b848b20259a80c47a554a17e` |
| normal | 10324 | 猛撞 | `UI/Icon/Skill_ABS/Skill_SpeedUp1.png` | 62 | `ui_icon_skill_abs.b` | 170×170 | `4190d48120b768e60f9eac79b522bae112ae643798801466cc4f8612337d7c09` |
| normal | 5003 | 破攻 | `UI/Icon/Skill_ABS/Passive_BreakAtk.png` | 62 | `ui_icon_skill_abs.b` | 170×170 | `c26456ac6df22cc4eff33f2f4b9ad3f2f347d7119a4b7c0cfb543d1aa794d370` |
| normal | 5007 | 压制 | `UI/Icon/Skill_ABS/Passive_AtkBuf1.png` | 62 | `ui_icon_skill_abs.b` | 170×170 | `d9be2df432aa6fe2b900039b2e7216dfdbb9e401b104e2d87782e412b2c87f4c` |
| normal | 10314 | 气浪 | `UI/Icon/Skill_ABS/Passive_KnightWave.png` | 27 | `begin_ui_icon_skill_abs.b` | 170×170 | `2a5e1fc4f862f37035ba441396dd58781003e6ffc94743d997ec69711bb68cc5` |
| normal | 10328 | 骑士精神 | `UI/Icon/Skill_ABS/Skill_KnightSoul.png` | 27 | `begin_ui_icon_skill_abs.b` | 170×170 | `ecccc08c924dd57383dae37c71958f733140ab8f7eef41fc73621565255a23e8` |
| normal | 11807 | 帝国冲锋 | `UI/Icon/Skill_ABS/SuperBuff_Empire1.png` | 62 | `ui_icon_skill_abs.b` | 170×170 | `8f8c4d36f9a7bef3a176a44ae1529d0a3761fb478440e6a919973b77030016fd` |
| normal | 10302 | 千骑 | `UI/Icon/Skill_ABS/Passive_Assault.png` | 27 | `begin_ui_icon_skill_abs.b` | 170×170 | `bb9da0f50b1698e1cb4fd9bdef28f7346182420833073cc6746f1e7f9e716b40` |
| direct | 10301 | 突击 | `UI/Icon/Skill_ABS/Skill_KnightCrash.png` | 27 | `begin_ui_icon_skill_abs.b` | 170×170 | `c5cf77092c21f2272d68aa9b4860373f8f138d8540d3a0bc8a673238324b6ba7` |
| SP | 12527 | 冥火碎踏 | `UI/Icon/Skill_ABS/Skill_SPLeon1.png` | 62 | `ui_icon_skill_abs.b` | 172×172 | `c9d8155df7099f97128895e1967ae5a13b2053ae878c10423171b980f8e0f491` |
| SP | 12528 | 青龙的真魂 | `UI/Icon/Skill_ABS/Skill_SPLeon2.png` | 62 | `ui_icon_skill_abs.b` | 172×172 | `154fb93aa05f63c9fd9209f6c9d656d0741fdaa2d86d2ce44613a2169d7bbcd5` |

고유기 4개 성급 Skill ID는 동일한 `Gift_Knight.png` 한 장을 공유하는 것이 official asset exact hit로 확인됐다.

## visual sanity check

12개 decoded RGBA를 contact sheet로 내부 점검했다. 빈 이미지/잘못 잘린 Sprite/아이콘이 아닌 리소스는 관찰되지 않았다. 이 점검은 exact-path/Sprite/hash proof의 보조 확인이며 semantic authority로 사용하지 않는다.

## non-scope

- Hero canonical/skill/talent relation 재계산
- SP relation 재계산
- 중앙율정 Skill ID `90085` / `Skill_CastMetal.png`
- 전체 Hero skill icon population census
- production web asset materialization
- WebP 변환
- Hero detail frontend 연결
- Hosted / Browser UI QA
- Soldier 범위

## BLOCKER

```text
none
```

## REVIEW

```text
none
```

## 다음 owner / 시작점

다음 owner: `Asset Intake / Hero skill-icon asset delivery`

다음 시작점:

1. 이 12개 exact source path와 raw-object hash를 입력으로 production delivery path/manifest contract를 정한다.
2. 현재 Project Check에는 `public/images/skills/**` 전용 owner rule이 없다. 해당 새 경로를 선택한다면 추측하지 말고 `MANUAL_REVIEW`로 두거나, owner가 명확히 확정된 뒤 최소 explicit rule을 추가한다.
3. materialize 시 official exact Sprite를 원본 PNG로 export하고 manifest에 source path/package/bundle/hash를 묶는다.
4. 그 다음 Hero detail consumer가 manifest만 사용하도록 연결하고 Build → 필요한 Hosted/Browser gate를 수행한다.

## reopen 조건

- `data/generated/hero-detail/by-id/6.json`의 해당 Skill ID 또는 `iconPath` 변경
- official installer baseline 변경
- exact package/bundle/object hash가 달라지는 fresh source evidence
- Sprite decode/alpha parity 손상
- production manifest가 이 checkpoint의 source path/hash와 불일치

## 최종 판정

```text
LEON_SKILL_ICON_OFFICIAL_VERIFY = COMPLETE
SOURCE = OFFICIAL_INSTALLER_1.1.113
TARGET = 12
EXACT_HIT = 12/12
SPRITE = 12/12
DECODE = 12/12
NONEMPTY_ALPHA = 12/12
BLOCKER = none
REVIEW = none
SEMANTIC_REOPEN = false
NEXT = ASSET_DELIVERY_CONTRACT_AND_MATERIALIZATION
```
