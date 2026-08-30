# Soldier Training Material Assets A4 — Bulk Acquisition

상태: `PASS / COMPLETE / READY_FOR_A5_REPOSITORY_ADMISSION`

## 목적

A3에서 확정한 byte/provenance 검증 규칙을 A2의 frozen 24개 Drive exact candidate 전체에 적용한다. 이 단계는 source bytes의 24/24 검증과 Asset Intake evidence 24/24 승격까지만 소유하며 repository source PNG admission, WebP, frontend는 다루지 않는다.

## authoritative predecessor

- `data/generated/soldier-training-material-assets-a2-source-census.v1.json` — blob `415e6b7a5d8febbbb7f285577de149bd54bb09df`
- `data/evidence/soldier-training-material-assets-a3-representatives.v1.json` — blob `33976d38eef80b2e9e6e4d6a418d3bde330057fb`
- `data/contracts/soldier-training-material-asset-intake.v1.json`
- `tools/asset-intake/adapters/soldier-training-material-v1.mjs`

## 결과

`target=24 / byteVerified=24 / PNG=24 / SHA-256=24 / 172x172=24 / RESOLVED=24 / PENDING=0 / AMBIGUOUS=0 / errors=0`

A3 대표 4개는 frozen byte proof를 재사용했고 나머지 20개만 exact Drive file ID로 추가 획득했다. 전부 non-zero PNG, Drive metadata byte-size parity, 172x172 RGBA8 IHDR, SHA-256을 확인했다.

## boundaries

- semantic/ConfigData 재계산 없음
- name JOIN / ID arithmetic / fuzzy / visual match 없음
- A2 itemId -> FULL_PATH -> Drive file ID 관계 변경 없음
- repository source PNG admission 없음
- WebP 생성 없음
- frontend 변경 없음

## artifacts

- `data/evidence/soldier-training-material-assets-a4-bulk.v1.json`
- `data/contracts/soldier-training-material-asset-intake-a4.v1.json`
- `data/validation/soldier-training-material-assets-a4.v1.json`
- `scripts/freeze-soldier-training-material-assets-a4.mjs`
- `.github/workflows/soldier-training-material-assets-a4.yml`
- `docs/checkpoints/soldier-training-material-assets-a4.md`

## 다음 시작점

A5 repository admission. A4의 24/24 verified source proof를 predecessor로 사용해 원본 PNG의 repository-owned source 경로, provenance manifest, exact itemId mapping을 확정한다. 그 전에는 WebP/resolver/frontend로 넘어가지 않는다.

## 다시 열리는 조건

- A2 frozen candidate identity 또는 A1 FULL_PATH 변경
- A3 대표 hash/size와 A4 bulk proof 충돌
- 24개 중 byte-size/PNG/IHDR/SHA mismatch 발견
- Asset Intake 24 RESOLVED parity 파손
