import json
from pathlib import Path

ROOT = Path.cwd()
PROBE_PATH = ROOT / "artifacts/equipment-ssr-frame-asset-provenance.v1.json"
TRACE_PATH = ROOT / "artifacts/equipment-ssr-frame-provenance-v2.json"
OUTPUT_PATH = ROOT / "artifacts/equipment-ssr-frame-asset-resolution.v2.json"

TARGET_RUNTIME_PATH = "UI/Common_New_ABS/Border_Icon_Colour.png"
TARGET_SERIALIZED_CONTAINER = (
    "assets/gameproject/runtimeassets/" + TARGET_RUNTIME_PATH.lower()
)
TARGET_OBJECT_NAME = "Border_Icon_Colour"
REQUIRED_RANK4_SSR_CONSTANT = (
    'HeroListRank4FrameNoArmy = "UI/HeadFrame_ABS/NoCircle_Thumbnail_SSR.png"'
)
REQUIRED_RANK5_EXTENDED_CONSTANT = "SPHeroRankValue = 5"
REQUIRED_ITEM_RANK4_CONSTANT = (
    'ItemIconRank4Frame = "UI/Common_New_ABS/Border_Icon_Colour.png"'
)


def main():
    probe = json.loads(PROBE_PATH.read_text(encoding="utf-8"))
    trace = json.loads(TRACE_PATH.read_text(encoding="utf-8"))

    config = probe["configDataProof"]
    if config.get("publicPopulation") != 373:
        raise RuntimeError(f"unexpected public Equipment population: {config.get('publicPopulation')}")
    if config.get("publicRankCounts") != {"4": 373}:
        raise RuntimeError(f"public Equipment rank distribution is not exact Rank=4: {config.get('publicRankCounts')}")
    if config.get("rank4PublicCount") != 373 or config.get("rank5PublicCount") != 0:
        raise RuntimeError("public Equipment Rank 4/5 boundary drifted")

    rank4 = probe["semanticProof"]["rank4Fallback"]
    literals = [record.get("literal") for record in rank4.get("literalCandidates", [])]
    if TARGET_RUNTIME_PATH not in literals:
        raise RuntimeError(f"rank 4 runtime path drifted: {literals}")

    context_text = "\n".join(record.get("text", "") for record in trace.get("rankFrameContexts", []))
    missing_constants = [
        constant
        for constant in (
            REQUIRED_ITEM_RANK4_CONSTANT,
            REQUIRED_RANK4_SSR_CONSTANT,
            REQUIRED_RANK5_EXTENDED_CONSTANT,
        )
        if constant not in context_text
    ]
    if missing_constants:
        raise RuntimeError(f"required explicit rank constants missing from official dump: {missing_constants}")

    bindings = []
    for bundle in probe.get("bundleEvidence", []):
        for obj in bundle.get("exactObjectMatches", []):
            if obj.get("name") != TARGET_OBJECT_NAME or not obj.get("decoded"):
                continue
            if TARGET_SERIALIZED_CONTAINER not in obj.get("containerKeys", []):
                continue
            bindings.append({
                "apkEntry": bundle["apkEntry"],
                "sourceBundleSha256": bundle["sourceBundleSha256"],
                "zipCrc32": bundle["zipCrc32"],
                "unityPayloadOffset": bundle["unityPayloadOffset"],
                "unitySignature": bundle["unitySignature"],
                "serializedContainerKey": TARGET_SERIALIZED_CONTAINER,
                "pathId": obj.get("pathId"),
                "type": obj.get("type"),
                "name": obj.get("name"),
                "width": obj.get("width"),
                "height": obj.get("height"),
                "hasAlpha": obj.get("hasAlpha"),
                "pixelSha256": obj.get("pixelSha256"),
                "pngSha256": obj.get("pngSha256"),
                "pngBytes": obj.get("pngBytes"),
                "previewPath": obj.get("previewPath"),
            })

    if not bindings:
        raise RuntimeError(
            "no decoded exact object is bound to the exact serialized runtime container path"
        )

    pixel_hashes = {record["pixelSha256"] for record in bindings}
    if len(pixel_hashes) != 1:
        raise RuntimeError(f"exact serialized container resolves to divergent pixels: {bindings}")

    object_types = {record["type"] for record in bindings}
    if object_types != {"Sprite"}:
        raise RuntimeError(f"expected exact runtime container to resolve to Sprite only: {object_types}")

    report = {
        "schemaId": "equipment-ssr-frame-asset-resolution/v2",
        "status": "PASS_EQUIPMENT_SSR_FRAME_EXACT_ASSET",
        "semanticConclusion": {
            "currentPublicEquipmentPopulation": 373,
            "currentPublicEquipmentRank": 4,
            "currentPublicEquipmentRankDistribution": {"4": 373},
            "rank4PresentationMeaning": "SSR",
            "rank5IsSeparateExtendedRankEvidence": "SPHeroRankValue = 5",
            "rank4RuntimeFramePath": TARGET_RUNTIME_PATH,
        },
        "runtimeToSerializedPath": {
            "runtimeLocator": TARGET_RUNTIME_PATH,
            "serializedContainerKey": TARGET_SERIALIZED_CONTAINER,
            "normalization": "exact prefix assets/gameproject/runtimeassets/ plus lowercase runtime locator",
            "caseFoldedFuzzyMatchUsed": False,
            "basenameOnlyResolutionUsed": False,
        },
        "assetBindings": bindings,
        "selectedBinding": bindings[0],
        "boundaries": {
            "productionEquipmentAssetsMutated": False,
            "canonicalEquipmentMutated": False,
            "frontendMutated": False,
            "exactNumericIdJoinUsedForConfig": True,
            "nameJoinUsed": False,
            "idArithmeticUsed": False,
            "filenameSimilarityUsedForSemanticMapping": False,
            "sourcePathComesFromOfficialRuntimeRelocation": True,
            "serializedContainerBindingIsExact": True,
            "exactSpriteObjectNameRequired": True,
        },
        "reopenConditions": [
            "official APK/source snapshot changes",
            "ConfigDataEquipmentInfo public Rank distribution changes",
            "GetGoodsFrameNameByRank relocation target changes",
            "serialized container key or decoded Sprite hash changes",
        ],
    }

    OUTPUT_PATH.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
