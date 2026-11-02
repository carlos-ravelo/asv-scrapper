#!/usr/bin/env bash
set -uo pipefail
PROJECT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
PYTHON_BIN="$PROJECT_DIR/.venv/bin/python"
[[ -x "$PYTHON_BIN" ]] || PYTHON_BIN="/usr/bin/python3"
cd "$PROJECT_DIR" || exit 1
status=0
"$PYTHON_BIN" "$PROJECT_DIR/scrapper.py" || status=1
"$PYTHON_BIN" "$PROJECT_DIR/knsb_scraper.py" || status=1
exit "$status"
