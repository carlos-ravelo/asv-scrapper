#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
RUNNER="$PROJECT_DIR/run-scrapers.sh"
LOG_FILE="$PROJECT_DIR/cron_execution.log"

[[ -f "$RUNNER" ]] || exit 1
command -v crontab >/dev/null
command -v flock >/dev/null

# Execute at 10:00 and 22:00, according to the system's time zone.
# flock prevents simultaneous executions.
printf -v CRON_COMMAND '0 10,22 * * * cd %q && %q -n %q %q %q >> %q 2>&1 # asv-scraper' \
    "$PROJECT_DIR" "$(command -v flock)" "$PROJECT_DIR/.scraper.lock" \
    /bin/bash "$RUNNER" "$LOG_FILE"
CRON_COMMAND="${CRON_COMMAND//%/\\%}"

TEMP_CRONTAB="$(mktemp)"
trap 'rm -f "$TEMP_CRONTAB"' EXIT

(crontab -l 2>/dev/null || true) |
    sed '/# asv-scraper$/d' > "$TEMP_CRONTAB"

printf 'SHELL=/bin/bash\n%s\n' "$CRON_COMMAND" >> "$TEMP_CRONTAB"
crontab "$TEMP_CRONTAB"
