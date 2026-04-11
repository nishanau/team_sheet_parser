#!/usr/bin/env bash
# Claude Code status line: folder | git branch | model | context progress bar

input=$(cat)

# JSON extraction — prefer jq, fall back to Python 3
json_get() {
  local key="$1"
  local default="${2:-}"
  if command -v jq > /dev/null 2>&1; then
    echo "$input" | jq -r "$key // empty" 2>/dev/null
  elif command -v python3 > /dev/null 2>&1; then
    echo "$input" | python3 -c "
import sys, json
try:
    d = json.load(sys.stdin)
    keys = '$key'.lstrip('.').split('.')
    v = d
    for k in keys:
        if k:
            v = v.get(k) if isinstance(v, dict) else None
        if v is None:
            break
    print('' if v is None else v)
except Exception:
    print('')
" 2>/dev/null
  elif command -v python > /dev/null 2>&1; then
    echo "$input" | python -c "
import sys, json
try:
    d = json.load(sys.stdin)
    keys = '$key'.lstrip('.').split('.')
    v = d
    for k in keys:
        if k:
            v = v.get(k) if isinstance(v, dict) else None
        if v is None:
            break
    print('' if v is None else v)
except Exception:
    print('')
" 2>/dev/null
  else
    echo "$default"
  fi
}

# Current directory (basename only)
cwd=$(json_get '.workspace.current_dir')
[ -z "$cwd" ] && cwd=$(json_get '.cwd')
[ -z "$cwd" ] && cwd="$PWD"
folder=$(basename "$cwd")

# Git branch — skip optional locks to avoid race conditions
branch=""
if git -C "$cwd" rev-parse --git-dir > /dev/null 2>&1; then
  branch=$(git -C "$cwd" -c core.hooksPath=/dev/null symbolic-ref --short HEAD 2>/dev/null \
           || git -C "$cwd" rev-parse --short HEAD 2>/dev/null)
fi

# Model display name
model=$(json_get '.model.display_name')
[ -z "$model" ] && model=$(json_get '.model.id')
[ -z "$model" ] && model="Claude"

# Context percentage (pre-calculated fields)
used_pct=$(json_get '.context_window.used_percentage')
remaining_pct=$(json_get '.context_window.remaining_percentage')

# Build a 10-char progress bar from used percentage
build_bar() {
  local pct="$1"
  local width=10
  local filled=0
  local int_pct="${pct%.*}"
  filled=$(( int_pct * width / 100 ))
  [ "$filled" -gt "$width" ] && filled=$width
  local empty=$(( width - filled ))
  local bar="" i
  for (( i=0; i<filled; i++ )); do bar="${bar}#"; done
  for (( i=0; i<empty;  i++ )); do bar="${bar}-"; done
  echo "$bar"
}

# ---- Assemble output ----
SEP=$(printf '\033[0;37m|\033[0m')

# Folder
out=$(printf '\033[1;34m%s\033[0m' "$folder")

# Git branch
if [ -n "$branch" ]; then
  out="$out $SEP $(printf '\033[1;33m%s\033[0m' "$branch")"
fi

# Model
out="$out $SEP $(printf '\033[0;36m%s\033[0m' "$model")"

# Context bar
if [ -n "$used_pct" ] && [ "$used_pct" != "null" ]; then
  bar=$(build_bar "$used_pct")
  rem_label=""
  if [ -n "$remaining_pct" ] && [ "$remaining_pct" != "null" ]; then
    rem_int="${remaining_pct%.*}"
    rem_label=" ${rem_int}% left"
  fi
  ctx=$(printf '\033[0;32mctx [\033[0m%s\033[0;32m]%s\033[0m' "$bar" "$rem_label")
  out="$out $SEP $ctx"
fi

# Rate limits: 5-hour session and 7-day weekly usage
five_pct=$(json_get '.rate_limits.five_hour.used_percentage')
week_pct=$(json_get '.rate_limits.seven_day.used_percentage')
if [ -n "$five_pct" ] && [ "$five_pct" != "null" ]; then
  five_int=$(printf '%.0f' "$five_pct")
  rate_out=$(printf '\033[0;33m5h:%d%%\033[0m' "$five_int")
  if [ -n "$week_pct" ] && [ "$week_pct" != "null" ]; then
    week_int=$(printf '%.0f' "$week_pct")
    rate_out="$rate_out $(printf '\033[0;33m7d:%d%%\033[0m' "$week_int")"
  fi
  out="$out $SEP $rate_out"
fi

printf '%s\n' "$out"
