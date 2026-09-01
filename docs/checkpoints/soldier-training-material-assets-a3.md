# Soldier Training Material Assets A3 — Representative Byte/Provenance Proof

상태: `PASS / COMPLETE / READY_FOR_A4_BULK_ACQUISITION`

## 목적

A2에서 24/24로 고정한 Drive exact candidate 전체를 바로 ingest하지 않고, filename family를 대표하는 소수 후보만 실제 bytes로 검증해 acquisition 규칙과 Asset Intake evidence shape를 먼저 확정한다.

## authoritative predecessor

- `data/generated/soldier-training-material-assets-a2-source-census.v1.json`
- A2 blob: `415e6b7a5d8febbbb7f285577de149bd54bb09df`
- `data/contracts/soldier-training-material-asset-intake.v1.json`
- `tools/asset-intake/adapters/soldier-training-material-v1.mjs`
- `tools/asset-intake/core/engine-v1.mjs`

## 대표 샘플

| Family | Item ID | File | Drive file ID | Bytes | SHA-256 |
|---|---:|---|---|---:|---|
| TROOP_TIER03 | 6003 | `Training_Sword03.png` | `1qyNIfv3CuNEmUwDPJS_Lz95hKJ6GOmSB` | 30962 | `bf7a3aa5378cf0bab8ce659c6119ea129b1e4dce02eace3f54ddcfae658488f9` |
| TROOP_TIER04 | 6045 | `Training_Ride04.png` | `1DAdSxrWLH86SuzBeQ4x3ViwFXJVCOBRj` | 31854 | `1c07dd3bea24d4c737b9f91dea2f57a94c5435b36e71c0ae7f9073a092ffb200` |
| FACILITY | 6031 | `Training_Facility04.png` | `1RUAN3T11UE7W7H9NCpb-RYJ-MXIpYTql` | 25172 | `c6767023d171d009f593c27116d9983d5532134068c6ab482c682c0c04b96f6f` |
| ANIKI | 6039 | `Training_Aniki03.png` | `1w9IR8iyZopMMQZntfyNj8w-z9Uy5vkmv` | 36024 | `6b1ba5d200ed56369e116d44d49a5a9bb6543f3b2c5afe63ff921111dbed3696` |

대표 4개 모두 actual byte length가 Drive metadata와 일치하고, PNG signature `89504e470d0a1a0a`, IHDR `172x172 / bitDepth=8 / colorType=6(RGBA)`, SHA-256을 확인했다.

## Asset Intake 재투입

A1 frozen contract에 대표 4개만 inventory evidence로 재투입했다.

`RESOLVED=4 / PENDING=20 / AMBIGUOUS=0 / evidence=4`

대표 4개만 `RESOLVED`이며 나머지 20개는 계속 `PENDING`이다. A3 proof만으로 24개 전체를 해결한 것으로 확대하지 않는다.

## artifacts

- `data/evidence/soldier-training-material-assets-a3-representatives.v1.json`
- `data/contracts/soldier-training-material-asset-intake-a3.v1.json`
- `data/validation/soldier-training-material-assets-a3.v1.json`
- `scripts/freeze-soldier-training-material-assets-a3.mjs`
- `.github/workflows/soldier-training-material-assets-a3.yml`
- `docs/checkpoints/soldier-training-material-assets-a3.md`

## 완료 범위

- Drive exact file ID provenance representative 4/4 확인
- raw PNG bytes representative 4/4 확인
- non-zero / metadata byte size parity 4/4
- PNG signature / IHDR 4/4
- SHA-256 4/4
- Asset Intake evidence shape 및 representative RESOLVED 4/4

## 하지 않은 것

- A1/A2 semantic 또는 candidate relation 재계산
- 나머지 20개 byte download
- source PNG repository admission
- WebP 생성/public 배포
- resolver/frontend 변경

## 다음 시작점

A4에서 A2 frozen 24개 Drive file ID를 같은 exact-file-ID raw-download 규칙으로 전수 acquisition한다. 각 파일마다 byte size, PNG signature, dimensions, SHA-256을 생성하고 24/24를 Asset Intake에 재투입해 `RESOLVED=24 / PENDING=0 / AMBIGUOUS=0`을 완료 조건으로 둔다.

## 다시 열리는 조건

- A2 candidate file ID/FULL_PATH가 대표 proof와 불일치
- raw bytes 재다운로드 시 SHA-256 또는 PNG metadata 불일치
- Asset Intake evidence contract 변경
- representative family coverage 규칙 변경
