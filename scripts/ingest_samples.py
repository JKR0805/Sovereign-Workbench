"""Sample documents batch ingestion script.

Ingests sample documents from `samples/` into the Sovereign Workbench
knowledge base (SQLite + Qdrant vector index).

Usage:
    # From repository root:
    .\\apps\\api\\.venv\\Scripts\\python.exe scripts\\ingest_samples.py

    # Or from apps/api:
    .venv\\Scripts\\python.exe ..\\..\\scripts\\ingest_samples.py
"""

from __future__ import annotations

import asyncio
import sys
from pathlib import Path

# Ensure repo root and apps/api are in sys.path
REPO_ROOT = Path(__file__).resolve().parent.parent
API_DIR = REPO_ROOT / "apps" / "api"
if str(API_DIR) not in sys.path:
    sys.path.insert(0, str(API_DIR))

from vajra.core.config import get_settings
from vajra.core.dependencies import build_context, shutdown, startup


async def ingest_samples(samples_dir: Path | None = None) -> None:
    target_dir = samples_dir or (REPO_ROOT / "samples")
    if not target_dir.exists():
        print(f"[ERROR] Samples directory not found at: {target_dir}")
        sys.exit(1)

    print("=" * 65)
    print("Sovereign Workbench - Sample Document Ingestion")
    print("=" * 65)
    print(f"Target directory: {target_dir}")

    # Gather files
    supported_extensions = {".pdf", ".docx", ".csv", ".txt", ".md", ".json", ".py", ".log"}
    files = sorted(
        [
            f
            for f in target_dir.iterdir()
            if f.is_file() and f.suffix.lower() in supported_extensions and not f.name.startswith(".")
        ]
    )

    if not files:
        print("[WARN] No supported sample files found to ingest.")
        return

    print(f"Found {len(files)} sample file(s) to process.\n")

    print("Initializing Sovereign Workbench context (Database, Vector Index, FastEmbed)...")
    settings = get_settings()
    ctx = build_context(settings)
    await startup(ctx)

    try:
        for idx, file_path in enumerate(files, start=1):
            name = file_path.name
            size_kb = file_path.stat().st_size / 1024
            print(f"[{idx}/{len(files)}] Ingesting {name} ({size_kb:.1f} KB)...", end=" ", flush=True)

            content = file_path.read_bytes()
            result = await ctx.attachment_intake.intake(content, filename=name)

            disp = result.disposition.value.upper()
            if disp == "INDEXED":
                print(f"-> [INDEXED] {result.chunk_count} chunk(s) created and embedded into Qdrant.")
            elif disp == "DEDUPED":
                print("-> [DEDUPED] Already indexed with matching hash. Reused.")
            elif disp == "IMAGE":
                print("-> [IMAGE] Image registered for multimodal vision.")
            elif disp == "UNSUPPORTED":
                print(f"-> [UNSUPPORTED] {result.detail}")
            else:
                print(f"-> [{disp}] {result.detail}")

        print("\n" + "=" * 65)
        print("Ingestion complete! All documents are ready in the Knowledge Base.")
        print("=" * 65)
    finally:
        await shutdown(ctx)


if __name__ == "__main__":
    asyncio.run(ingest_samples())
