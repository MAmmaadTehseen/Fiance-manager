"""
Doubles regex backslashes inside `$json$ ... $json$` blocks in a migration.

Dollar-quoting means Postgres passes the block through untouched, so the
content has to be valid JSON on its own -- and in JSON a regex backslash must
be written twice. Editors and shell heredocs routinely collapse them, which
produces a migration that fails only at apply time.

Usage: python scripts/fix-json-escapes.py <file.sql> [...]
"""

import json
import re
import sys
from pathlib import Path

BLOCK = re.compile(r"\$json\$(.*?)\$json\$", re.S)
BACKSLASH = chr(92)


def double_backslashes(body: str) -> str:
    return body.replace(BACKSLASH, BACKSLASH * 2)


def fix_file(path: Path) -> int:
    text = path.read_text(encoding="utf-8")
    changed = 0

    def repl(match: re.Match) -> str:
        nonlocal changed
        body = match.group(1)
        # Already-correct blocks contain a doubled backslash; leave them be.
        if BACKSLASH * 2 in body:
            return match.group(0)
        if BACKSLASH not in body:
            return match.group(0)
        changed += 1
        return "$json$" + double_backslashes(body) + "$json$"

    fixed = BLOCK.sub(repl, text)

    blocks = BLOCK.findall(fixed)
    for i, block in enumerate(blocks):
        try:
            json.loads(block)
        except json.JSONDecodeError as exc:
            print(f"  {path.name} block {i + 1}: STILL INVALID -- {exc}")
            return -1

    if changed:
        path.write_text(fixed, encoding="utf-8")
    print(f"  {path.name}: {len(blocks)} json blocks, {changed} repaired, all parse")
    return changed


if __name__ == "__main__":
    targets = sys.argv[1:]
    if not targets:
        targets = [str(p) for p in Path("supabase/migrations").glob("*.sql")]

    bad = False
    for target in targets:
        path = Path(target)
        if not path.exists():
            print(f"  {target}: missing")
            bad = True
            continue
        if BLOCK.search(path.read_text(encoding="utf-8")) is None:
            continue
        if fix_file(path) < 0:
            bad = True

    sys.exit(1 if bad else 0)
