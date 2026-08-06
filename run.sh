#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if [[ -t 1 && -z "${NO_COLOR:-}" && "${TERM:-dumb}" != "dumb" ]]; then
  COLOR_BOLD=$'\033[1m'
  COLOR_BLUE=$'\033[34m'
  COLOR_CYAN=$'\033[36m'
  COLOR_GREEN=$'\033[32m'
  COLOR_RED=$'\033[31m'
  COLOR_YELLOW=$'\033[33m'
  COLOR_RESET=$'\033[0m'
else
  COLOR_BOLD=""
  COLOR_BLUE=""
  COLOR_CYAN=""
  COLOR_GREEN=""
  COLOR_RED=""
  COLOR_YELLOW=""
  COLOR_RESET=""
fi

print_help() {
  printf '%sGangwon Land Hold\x27em%s\n' "$COLOR_BOLD$COLOR_CYAN" "$COLOR_RESET"
  printf '\n'
  printf '%sUsage:%s\n' "$COLOR_BOLD" "$COLOR_RESET"
  printf '  ./run.sh [OPTION]\n'
  printf '\n'
  printf '%sOptions:%s\n' "$COLOR_BOLD" "$COLOR_RESET"
  printf '  -h, --help  Show this help message and exit.\n'
  printf '\n'
  printf '%sInteractive mode:%s\n' "$COLOR_BOLD" "$COLOR_RESET"
  printf '  Run ./run.sh without options to choose the host and port, build the\n'
  printf '  frontend, and start the application in the foreground.\n'
  printf '\n'
  printf '%sEnvironment:%s\n' "$COLOR_BOLD" "$COLOR_RESET"
  printf '  POKER_HOST  Default host shown by the interactive prompt.\n'
  printf '  POKER_PORT  Default port shown by the interactive prompt.\n'
  printf '  NO_COLOR    Disable colored output when set to any value.\n'
}

print_info() {
  printf '%s[INFO]%s %s\n' "$COLOR_BLUE" "$COLOR_RESET" "$1"
}

print_success() {
  printf '%s[READY]%s %s\n' "$COLOR_GREEN" "$COLOR_RESET" "$1"
}

print_warning() {
  printf '%s[WARNING]%s %s\n' "$COLOR_YELLOW" "$COLOR_RESET" "$1"
}

print_error() {
  printf '%s[ERROR]%s %s\n' "$COLOR_RED" "$COLOR_RESET" "$1" >&2
}

fail() {
  print_error "$1"
  exit 1
}

prompt_value() {
  local variable_name="$1"
  local label="$2"
  local default_value="$3"
  local entered_value

  printf '%s%s%s [%s]: ' "$COLOR_BOLD" "$label" "$COLOR_RESET" "$default_value"
  if ! IFS= read -r entered_value; then
    printf '\n'
    fail "Input ended before interactive setup was complete."
  fi

  printf -v "$variable_name" '%s' "${entered_value:-$default_value}"
}

confirm() {
  local prompt="$1"
  local answer

  printf '%s%s%s [Y/n]: ' "$COLOR_BOLD" "$prompt" "$COLOR_RESET"
  if ! IFS= read -r answer; then
    printf '\n'
    fail "Input ended before interactive setup was complete."
  fi

  case "$answer" in
    ""|y|Y|yes|YES|Yes)
      return 0
      ;;
    *)
      return 1
      ;;
  esac
}

validate_host() {
  [[ -n "$1" && "$1" != *[[:space:]]* ]]
}

validate_port() {
  local value="$1"

  [[ "$value" =~ ^[0-9]{1,5}$ ]] && ((10#$value >= 1 && 10#$value <= 65535))
}

case "${1:-}" in
  -h|--help)
    if (( $# != 1 )); then
      fail "The help option does not accept additional arguments."
    fi
    print_help
    exit 0
    ;;
  "")
    ;;
  *)
    print_error "Unknown option: $1"
    printf '\n' >&2
    print_help >&2
    exit 2
    ;;
esac

if (( $# > 0 )); then
  fail "Unexpected arguments were provided."
fi

command -v npm >/dev/null 2>&1 || fail "npm is required but was not found in PATH."
command -v go >/dev/null 2>&1 || fail "Go is required but was not found in PATH."

DEFAULT_HOST="${POKER_HOST:-0.0.0.0}"
DEFAULT_PORT="${POKER_PORT:-3000}"

printf '%s\n' "$COLOR_BOLD$COLOR_CYAN========================================$COLOR_RESET"
printf '%sGangwon Land Hold\x27em - Interactive Setup%s\n' "$COLOR_BOLD$COLOR_CYAN" "$COLOR_RESET"
printf '%s\n' "$COLOR_BOLD$COLOR_CYAN========================================$COLOR_RESET"
printf '\n'

prompt_value APP_HOST "Host" "$DEFAULT_HOST"
validate_host "$APP_HOST" || fail "Host must be a non-empty value without spaces."

prompt_value APP_PORT "Port" "$DEFAULT_PORT"
validate_port "$APP_PORT" || fail "Port must be a number from 1 to 65535."

cd "$SCRIPT_DIR"

if [[ ! -d node_modules ]]; then
  print_warning "The node_modules directory is missing."
  if confirm "Install dependencies with npm ci?"; then
    print_info "Installing dependencies..."
    npm ci
  else
    fail "Dependencies are required to start the application."
  fi
fi

printf '\n'
print_info "Building the frontend before starting the server..."
print_success "Local URL: http://localhost:${APP_PORT}"
print_success "Network URL: http://${APP_HOST}:${APP_PORT}"
print_info "Press Ctrl+C to stop the server."
printf '\n'

exec env \
  NODE_ENV="${NODE_ENV:-development}" \
  HOSTNAME="$APP_HOST" \
  PORT="$APP_PORT" \
  npm run dev
