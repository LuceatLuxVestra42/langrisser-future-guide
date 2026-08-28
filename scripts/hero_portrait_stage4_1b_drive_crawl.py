#!/usr/bin/env python3
import argparse
import json
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry
from gdown.download_folder import _GoogleDriveFile, _parse_embedded_folder_view

RARITY_FOLDER_IDS = {
    "LLR": "1_ohdOz7yowi98AE7MuyORMAFkxeGk5GV",
    "SSR": "1LZou2oXpeOwtt2uBHWpesKN4uyMUGoOe",
    "SR": "15Z_wf0wrfX3Bn56WU_Y7vqDvPcS_i8MN",
    "R": "1KIqnv-LEEO2RBYzdF1dr5oGUbfriUPgG",
    "N": "1ShOmvsheoRWl9yeneaMRoXXid6wIrGhX",
}
USER_AGENT = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/98.0.4758.102 Safari/537.36"
)


class TimedSession(requests.Session):
    def get(self, *args, **kwargs):
        kwargs.setdefault("timeout", 25)
        return super().get(*args, **kwargs)


def make_session() -> requests.Session:
    sess = TimedSession()
    sess.headers.update({"User-Agent": USER_AGENT})
    retry = Retry(
        total=2,
        connect=2,
        read=2,
        backoff_factor=0.5,
        status_forcelist=(429, 500, 502, 503, 504),
        allowed_methods=frozenset(["GET"]),
    )
    sess.mount("https://", HTTPAdapter(max_retries=retry))
    return sess


def list_folder(sess: requests.Session, folder_id: str):
    name, children = _parse_embedded_folder_view(sess=sess, folder_id=folder_id)
    return name, children


def folder_url(folder_id: str) -> str:
    return f"https://drive.google.com/drive/folders/{folder_id}"


def file_url(file_id: str) -> str:
    return f"https://drive.google.com/uc?id={file_id}"


def entry(url: str, path: str) -> dict:
    return {"url": url, "path": path}


def crawl_hero(rarity: str, hero_folder_id: str, hero_label: str) -> dict:
    sess = make_session()
    base_path = f"{rarity}/{hero_label}"
    out = []
    errors = []
    request_count = 0
    try:
        _, hero_children = list_folder(sess, hero_folder_id)
        request_count += 1
    except Exception as exc:
        return {
            "rarity": rarity,
            "heroFolderId": hero_folder_id,
            "heroLabel": hero_label,
            "entries": [entry(folder_url(hero_folder_id), f"{base_path}/__STRUCTURED_HERO_FOLDER__")],
            "requestCount": request_count,
            "errors": [f"hero-folder-read: {type(exc).__name__}: {exc}"],
        }

    skin_folders = [
        child for child in hero_children
        if child[2] == _GoogleDriveFile.TYPE_FOLDER and child[1] == "스킨"
    ]
    if len(skin_folders) != 1:
        out.append(entry(folder_url(hero_folder_id), f"{base_path}/__STRUCTURED_HERO_FOLDER__"))
        errors.append(f"skin-container-count={len(skin_folders)}")
        return {
            "rarity": rarity,
            "heroFolderId": hero_folder_id,
            "heroLabel": hero_label,
            "entries": out,
            "requestCount": request_count,
            "errors": errors,
        }

    skin_folder_id, _, _ = skin_folders[0]
    out.append(entry(folder_url(skin_folder_id), f"{base_path}/스킨"))

    try:
        _, skin_children = list_folder(sess, skin_folder_id)
        request_count += 1
    except Exception as exc:
        errors.append(f"skin-container-read: {type(exc).__name__}: {exc}")
        return {
            "rarity": rarity,
            "heroFolderId": hero_folder_id,
            "heroLabel": hero_label,
            "entries": out,
            "requestCount": request_count,
            "errors": errors,
        }

    # Direct files under 스킨 are valid non-base ownership evidence too.
    for child_id, child_name, child_type in skin_children:
        if child_type != _GoogleDriveFile.TYPE_FOLDER:
            out.append(entry(file_url(child_id), f"{base_path}/스킨/{child_name}"))

    child_folders = [c for c in skin_children if c[2] == _GoogleDriveFile.TYPE_FOLDER]
    child_folders.sort(key=lambda x: (x[1], x[0]))

    for child_id, child_name, _ in child_folders:
        out.append(entry(folder_url(child_id), f"{base_path}/스킨/{child_name}"))
        try:
            _, grandchildren = list_folder(sess, child_id)
            request_count += 1
        except Exception as exc:
            errors.append(f"child-folder-read:{child_name}: {type(exc).__name__}: {exc}")
            continue
        # Deliberately do not recurse into SD/TIC SD/NPC/Event/etc. Only direct files matter.
        for file_id, file_name, file_type in grandchildren:
            if file_type == _GoogleDriveFile.TYPE_FOLDER:
                continue
            out.append(entry(file_url(file_id), f"{base_path}/스킨/{child_name}/{file_name}"))

    return {
        "rarity": rarity,
        "heroFolderId": hero_folder_id,
        "heroLabel": hero_label,
        "entries": out,
        "requestCount": request_count,
        "errors": errors,
    }


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--out-dir", required=True)
    ap.add_argument("--workers", type=int, default=12)
    args = ap.parse_args()

    out_dir = Path(args.out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    roots = []
    root_counts = {}
    root_errors = []
    root_session = make_session()
    for rarity, folder_id in RARITY_FOLDER_IDS.items():
        try:
            _, children = list_folder(root_session, folder_id)
        except Exception as exc:
            root_errors.append(f"{rarity}: {type(exc).__name__}: {exc}")
            children = []
        hero_folders = [c for c in children if c[2] == _GoogleDriveFile.TYPE_FOLDER]
        root_counts[rarity] = len(hero_folders)
        for hero_id, hero_label, _ in hero_folders:
            roots.append((rarity, hero_id, hero_label))

    results = []
    with ThreadPoolExecutor(max_workers=max(1, args.workers)) as pool:
        futures = {
            pool.submit(crawl_hero, rarity, hero_id, hero_label): (rarity, hero_id, hero_label)
            for rarity, hero_id, hero_label in roots
        }
        for future in as_completed(futures):
            rarity, hero_id, hero_label = futures[future]
            try:
                results.append(future.result())
            except Exception as exc:
                results.append({
                    "rarity": rarity,
                    "heroFolderId": hero_id,
                    "heroLabel": hero_label,
                    "entries": [entry(folder_url(hero_id), f"{rarity}/{hero_label}/__STRUCTURED_HERO_FOLDER__")],
                    "requestCount": 0,
                    "errors": [f"worker-failure: {type(exc).__name__}: {exc}"],
                })

    results.sort(key=lambda r: (r["rarity"], r["heroLabel"], r["heroFolderId"]))
    by_rarity = {r: [] for r in RARITY_FOLDER_IDS}
    total_requests = 5
    error_rows = []
    for rec in results:
        by_rarity[rec["rarity"]].extend(rec["entries"])
        total_requests += rec["requestCount"]
        if rec["errors"]:
            error_rows.append({
                "rarity": rec["rarity"],
                "heroFolderId": rec["heroFolderId"],
                "heroLabel": rec["heroLabel"],
                "errors": rec["errors"],
            })

    for rarity, entries in by_rarity.items():
        (out_dir / f"{rarity}.json").write_text(
            json.dumps(entries, ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )

    summary = {
        "version": 1,
        "mode": "GDOWN_6_1_0_NONRECURSIVE_SELECTED_PATH_CRAWL",
        "rarityFolderCounts": root_counts,
        "structuredHeroFolderCount": len(roots),
        "heroWorkerResultCount": len(results),
        "approxHttpRequestCount": total_requests,
        "heroRowsWithReadErrors": len(error_rows),
        "rootErrors": root_errors,
        "errorRows": error_rows,
        "excludedTraversal": ["각성기", "SD", "TIC SD", "NPC & Event SD", "any nested folder below each skin/base folder"],
    }
    (out_dir / "crawl-summary.json").write_text(
        json.dumps(summary, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    print(json.dumps(summary, ensure_ascii=False, indent=2))

    if root_errors:
        return 2
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
