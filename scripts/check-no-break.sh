#!/usr/bin/env bash
#
# check-no-break.sh — proves the logo-upload work has not touched live code.
#
#   bash scripts/check-no-break.sh
#
# Run this before every commit and before every review. It is the mechanical answer to
# "are you sure nothing currently running is broken?".
#
# Three checks:
#   1. FROZEN   — files that run the live store must hash-match docs/logo-upload/baseline.sha256
#   2. MARKERS  — files we DO edit must keep the other uploaders' markers intact
#                 (docs/logo-upload/baseline.counts)
#   3. BUILD    — `npm run build` must pass, because a broken build blocks live hotfixes
#
# Exit 0 = safe. Non-zero = STOP and investigate.
#
# See docs/logo-upload/TASKS.md §0.4 (uploader inventory) and §5 (files we do touch).

set -uo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
THEME_DIR="${THEME_DIR:-$APP_DIR/../../logo-mat}"

HASHES="$APP_DIR/docs/logo-upload/baseline.sha256"
COUNTS="$APP_DIR/docs/logo-upload/baseline.counts"

RED=$'\033[31m'; GREEN=$'\033[32m'; YELLOW=$'\033[33m'; DIM=$'\033[2m'; OFF=$'\033[0m'
fail=0
skipped_theme=0

say()  { printf '%s\n' "$*"; }
ok()   { printf "  ${GREEN}ok${OFF}    %s\n" "$*"; }
bad()  { printf "  ${RED}BROKEN${OFF} %s\n" "$*"; fail=1; }
warn() { printf "  ${YELLOW}skip${OFF}  %s\n" "$*"; }

if [ ! -d "$THEME_DIR" ]; then
  skipped_theme=1
fi

# ---------------------------------------------------------------- 1. frozen files
say ""
say "1. FROZEN FILES ${DIM}(must be byte-identical)${OFF}"
say ""

while read -r expected path; do
  case "$expected" in ''|'#'*) continue;; esac

  repo="${path%%:*}"
  rel="${path#*:}"

  case "$repo" in
    APP)   full="$APP_DIR/$rel" ;;
    THEME) full="$THEME_DIR/$rel"
           if [ "$skipped_theme" = 1 ]; then warn "$rel ${DIM}(theme repo not found)${OFF}"; continue; fi ;;
    *)     bad "unknown repo prefix in baseline: $path"; continue ;;
  esac

  if [ ! -f "$full" ]; then
    bad "$repo:$rel ${DIM}— FILE IS MISSING${OFF}"
    continue
  fi

  actual="$(sha256sum "$full" | cut -d' ' -f1)"
  if [ "$actual" = "$expected" ]; then
    ok "$repo:$rel"
  else
    bad "$repo:$rel"
    printf "        expected %s\n" "$expected"
    printf "        actual   %s\n" "$actual"
  fi
done < "$HASHES"

# ---------------------------------------------------------------- 2. markers
say ""
say "2. MARKERS IN EDITED FILES ${DIM}(other uploaders must survive)${OFF}"
say ""

if [ "$skipped_theme" = 1 ]; then
  warn "theme repo not found at $THEME_DIR — set THEME_DIR to check"
else
  count_of() {
    grep -rho --include=*.liquid -- "$1" "$THEME_DIR" 2>/dev/null | wc -l | tr -d ' '
  }

  marker_pattern() {
    case "$1" in
      fileInput_exact)               printf 'id="fileInput"' ;;
      custom_logo_form_renders)      printf 'render "custom-logo-form"' ;;
      quote_request_form_js_renders) printf "render 'quote-request-form-js'" ;;
      mo_upload_image_js_renders)    printf "render 'mo-upload-image-js'" ;;
      app_proxy_file_upload)         printf '/apps/file-upload' ;;
      save_shipping_calls)           printf 'api/save-shipping' ;;
      *) return 1 ;;
    esac
  }

  while read -r name op expected; do
    case "$name" in ''|'#'*) continue;; esac
    [ "$op" = "=" ] || continue

    pattern="$(marker_pattern "$name")" || { bad "no pattern defined for marker '$name'"; continue; }
    actual="$(count_of "$pattern")"

    if [ "$actual" = "$expected" ]; then
      ok "$name = $actual"
    else
      bad "$name — expected $expected, found $actual  ${DIM}($pattern)${OFF}"
    fi
  done < "$COUNTS"
fi

# ---------------------------------------------------------------- 3. build
say ""
say "3. BUILD ${DIM}(a broken build blocks live hotfixes)${OFF}"
say ""

BUILD_LOG="$(mktemp -t logo-upload-build.XXXXXX)"

if [ "${SKIP_BUILD:-0}" = "1" ]; then
  warn "skipped (SKIP_BUILD=1)"
  rm -f "$BUILD_LOG"
elif ( cd "$APP_DIR" && npm run build >"$BUILD_LOG" 2>&1 ); then
  ok "npm run build"
  # Clean up on success. The log only has value when the build FAILED, so it is
  # kept in that one case and removed otherwise -- no stray files left behind.
  rm -f "$BUILD_LOG"
else
  bad "npm run build — full log kept at $BUILD_LOG"
  tail -20 "$BUILD_LOG" | sed 's/^/        /'
fi

# ---------------------------------------------------------------- verdict
say ""
if [ "$fail" = 0 ]; then
  printf "${GREEN}PASS${OFF} — no live code touched.\n"
  [ "$skipped_theme" = 1 ] && printf "${YELLOW}note${OFF} — theme checks were skipped.\n"
  say ""
  exit 0
else
  printf "${RED}FAIL${OFF} — live code changed. STOP and investigate before committing.\n"
  say ""
  say "If the change was deliberate, it must be added to TASKS.md §5 and the baseline"
  say "re-captured in the same commit, so the diff is visible at review."
  say ""
  exit 1
fi
