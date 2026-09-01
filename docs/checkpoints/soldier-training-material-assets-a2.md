# Soldier Training Material Assets A2 — Source Census

상태: `PASS / COMPLETE / READY_FOR_A3_REPRESENTATIVE_BYTE_PROOF`

## 목적

A1에서 동결한 24개 `itemId -> ItemInfo.Icon FULL_PATH`를 변경하지 않고 Asset Intake Stage 5 승인 source 순서로 exact candidate만 조사한다. PNG bytes, SHA-256, WebP, frontend는 이 단계에서 다루지 않는다.

## authoritative predecessor

- `data/contracts/soldier-training-material-asset-intake.v1.json`
- A1 contract blob: `90ab214f1b775659cd570c1e750a50f0c8ee464f`
- `docs/checkpoints/asset-intake-stage5-operational-routing.md`

## source routing 결과

1. Bilibili Wiki public original: frozen basename exact public-search index candidate **0**. 이 값은 자산 부재 증명으로 사용하지 않는다.
2. 기존 한섭 asset Drive: `아이템 1`에서 **24/24 exact filename candidate**, `아이템 2~4`는 **0**, 따라서 Item folder 전체 기준 ambiguity **0**.

| Folder | Drive folder ID | Exact matches |
|---|---|---:|
| 아이템 1 | `1fVm9JVJlOiswiTezoRWFJQmUZWof8db8` | **24** |
| 아이템 2 | `11fcrLT_HME3baVSgQJUSQD7TnmH11pg2` | **0** |
| 아이템 3 | `1aHMOcGYMwWbeBvGbKIe6di0M-79m0sfj` | **0** |
| 아이템 4 | `1xbQ6N_ku7sgbRbObI9hMwyovIrE8Fz1y` | **0** |

## census

`target=24 / FOUND=24 / NOT_FOUND=0 / AMBIGUOUS=0 / unique Drive file IDs=24 / byteVerified=0`

각 record는 frozen itemId/FULL_PATH, exact basename, Drive folder/file ID와 PNG MIME만 보존한다. `byteProofStatus=DEFERRED_TO_A3`, `sha256=null`이며 Asset Intake를 RESOLVED로 승격하지 않는다.

## 하지 않은 것

- semantic/ConfigData 재계산
- name JOIN / ID arithmetic / fuzzy/visual matching
- asset bytes 다운로드 / SHA-256
- WebP/public asset/frontend 변경

## artifacts

- `data/generated/soldier-training-material-assets-a2-source-census.v1.json`
- `data/validation/soldier-training-material-assets-a2.v1.json`
- `scripts/freeze-soldier-training-material-assets-a2.mjs`
- `.github/workflows/soldier-training-material-assets-a2.yml`
- `docs/checkpoints/soldier-training-material-assets-a2.md`

## 다음 시작점

A3에서 filename family를 대표하는 소수 Drive 후보만 실제 다운로드해 PNG signature, non-zero bytes, SHA-256, exact file ID provenance, Asset Intake evidence shape를 먼저 검증한다. 대표 proof PASS 뒤에만 A4 bulk 24/24 acquisition으로 간다.

## 다시 열리는 조건

- A1 contract blob 또는 frozen itemId/FULL_PATH 변경
- Drive exact parity 24/24 파손 또는 duplicate candidate 발생
- source priority contract 변경
- A3 byte proof가 captured candidate identity와 충돌
