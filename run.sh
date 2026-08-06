#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

IMAGE_NAME="${POKER_IMAGE:-poker-gangwonland:latest}"
CONTAINER_NAME="${POKER_CONTAINER:-poker-gangwonland}"
DEFAULT_HOST="${POKER_HOST:-0.0.0.0}"
DEFAULT_PORT="${POKER_PORT:-3000}"
DEFAULT_LOG_TAIL="${POKER_LOG_TAIL:-100}"

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
  exit "${2:-1}"
}

print_banner() {
  printf '%s\n' "${COLOR_BOLD}${COLOR_CYAN}==================================================${COLOR_RESET}"
  printf '%sGangwon Land Hold\x27em - Application Manager%s\n' \
    "${COLOR_BOLD}${COLOR_CYAN}" "$COLOR_RESET"
  printf '%s\n' "${COLOR_BOLD}${COLOR_CYAN}==================================================${COLOR_RESET}"
}

print_help() {
  print_banner
  printf '\n'
  printf '%sUsage:%s\n' "$COLOR_BOLD" "$COLOR_RESET"
  printf '  ./run.sh                         Open the interactive menu.\n'
  printf '  ./run.sh COMMAND [OPTIONS]\n'
  printf '\n'
  printf '%sDocker commands:%s\n' "$COLOR_BOLD" "$COLOR_RESET"
  printf '  start     Build the image when needed and start the container.\n'
  printf '  stop      Stop the container.\n'
  printf '  restart   Restart the container, or create it when missing.\n'
  printf '  status    Show image, container, restart policy, and port details.\n'
  printf '  logs      Show recent container logs. Use --follow to stream them.\n'
  printf '  build     Build the Docker image using the existing cache.\n'
  printf '  rebuild   Pull base images and rebuild without cache.\n'
  printf '  remove    Stop and remove the container after confirmation.\n'
  printf '\n'
  printf '%sOther commands:%s\n' "$COLOR_BOLD" "$COLOR_RESET"
  printf '  dev       Build and run the local development server in the foreground.\n'
  printf '  doctor    Check Docker and local development prerequisites.\n'
  printf '  menu      Open the interactive menu explicitly.\n'
  printf '  help      Show this help message.\n'
  printf '\n'
  printf '%sRuntime options for start, restart, and dev:%s\n' "$COLOR_BOLD" "$COLOR_RESET"
  printf '  --host HOST       Host interface to publish. Default: %s\n' "$DEFAULT_HOST"
  printf '  --port PORT       Host port to publish. Default: %s\n' "$DEFAULT_PORT"
  printf '\n'
  printf '%sLog options:%s\n' "$COLOR_BOLD" "$COLOR_RESET"
  printf '  -f, --follow      Continue streaming new log entries.\n'
  printf '  --tail LINES      Number of recent lines, or "all". Default: %s\n' "$DEFAULT_LOG_TAIL"
  printf '\n'
  printf '%sRemove options:%s\n' "$COLOR_BOLD" "$COLOR_RESET"
  printf '  -f, --force       Skip the removal confirmation.\n'
  printf '\n'
  printf '%sEnvironment:%s\n' "$COLOR_BOLD" "$COLOR_RESET"
  printf '  POKER_IMAGE       Docker image name. Default: poker-gangwonland:latest\n'
  printf '  POKER_CONTAINER   Docker container name. Default: poker-gangwonland\n'
  printf '  POKER_HOST        Default host used by start, restart, and dev.\n'
  printf '  POKER_PORT        Default host port used by start, restart, and dev.\n'
  printf '  POKER_LOG_TAIL    Default number of log lines.\n'
  printf '  NO_COLOR          Disable colored output when set to any value.\n'
  printf '\n'
  printf '%sExamples:%s\n' "$COLOR_BOLD" "$COLOR_RESET"
  printf '  ./run.sh start --port 3100\n'
  printf '  ./run.sh logs --follow --tail 200\n'
  printf '  POKER_IMAGE=my-poker:test ./run.sh rebuild\n'
}

validate_host() {
  [[ -n "$1" && "$1" != *[[:space:]]* ]]
}

validate_port() {
  local value="$1"

  [[ "$value" =~ ^[0-9]{1,5}$ ]] && ((10#$value >= 1 && 10#$value <= 65535))
}

validate_log_tail() {
  [[ "$1" == "all" || "$1" =~ ^[0-9]+$ ]]
}

prompt_value() {
  local variable_name="$1"
  local label="$2"
  local default_value="$3"
  local entered_value

  printf '%s%s%s [%s]: ' "$COLOR_BOLD" "$label" "$COLOR_RESET" "$default_value"
  if ! IFS= read -r entered_value; then
    printf '\n'
    print_error "Input ended before the selection was complete."
    return 1
  fi

  printf -v "$variable_name" '%s' "${entered_value:-$default_value}"
}

confirm_yes() {
  local prompt="$1"
  local answer

  printf '%s%s%s [Y/n]: ' "$COLOR_BOLD" "$prompt" "$COLOR_RESET"
  if ! IFS= read -r answer; then
    printf '\n'
    return 1
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

confirm_no() {
  local prompt="$1"
  local answer

  printf '%s%s%s [y/N]: ' "$COLOR_BOLD" "$prompt" "$COLOR_RESET"
  if ! IFS= read -r answer; then
    printf '\n'
    return 1
  fi

  case "$answer" in
    y|Y|yes|YES|Yes)
      return 0
      ;;
    *)
      return 1
      ;;
  esac
}

require_docker() {
  if ! command -v docker >/dev/null 2>&1; then
    print_error "Docker is required but was not found in PATH."
    return 1
  fi

  if ! docker info >/dev/null 2>&1; then
    print_error "The Docker daemon is unavailable. Start Docker and try again."
    return 1
  fi
}

container_exists() {
  docker container inspect "$CONTAINER_NAME" >/dev/null 2>&1
}

container_is_running() {
  [[ "$(docker container inspect --format '{{.State.Running}}' "$CONTAINER_NAME" 2>/dev/null)" == "true" ]]
}

image_exists() {
  docker image inspect "$IMAGE_NAME" >/dev/null 2>&1
}

build_image() {
  local no_cache="${1:-false}"
  local -a build_arguments=(build --tag "$IMAGE_NAME")

  require_docker || return 1

  if [[ ! -f "$SCRIPT_DIR/Dockerfile" ]]; then
    print_error "Dockerfile was not found in $SCRIPT_DIR."
    return 1
  fi

  if [[ "$no_cache" == "true" ]]; then
    build_arguments+=(--pull --no-cache)
    print_info "Rebuilding $IMAGE_NAME without cache..."
  else
    print_info "Building $IMAGE_NAME..."
  fi
  build_arguments+=("$SCRIPT_DIR")

  if ! docker "${build_arguments[@]}"; then
    print_error "The Docker image build failed."
    return 1
  fi

  print_success "Docker image is ready: $IMAGE_NAME"
}

print_published_ports() {
  local published_ports

  published_ports="$(docker port "$CONTAINER_NAME" 3000/tcp 2>/dev/null || true)"
  if [[ -n "$published_ports" ]]; then
    print_info "Published port: ${published_ports//$'\n'/, }"
  fi
}

start_container() {
  local host="$1"
  local port="$2"
  local container_id

  if ! validate_host "$host"; then
    print_error "Host must be a non-empty value without spaces."
    return 1
  fi
  if ! validate_port "$port"; then
    print_error "Port must be a number from 1 to 65535."
    return 1
  fi
  require_docker || return 1

  if container_exists; then
    if container_is_running; then
      print_success "Container $CONTAINER_NAME is already running."
    else
      print_info "Starting the existing container $CONTAINER_NAME..."
      if ! docker start "$CONTAINER_NAME" >/dev/null; then
        print_error "The existing container could not be started."
        return 1
      fi
      print_success "Container $CONTAINER_NAME started."
    fi
    print_published_ports
    return 0
  fi

  if ! image_exists; then
    print_warning "Docker image $IMAGE_NAME does not exist yet."
    build_image false || return 1
  fi

  print_info "Creating container $CONTAINER_NAME on ${host}:${port}..."
  if ! container_id="$(docker run \
    --detach \
    --name "$CONTAINER_NAME" \
    --restart unless-stopped \
    --publish "${host}:${port}:3000" \
    --label "com.poker-gangwonland.managed-by=run.sh" \
    "$IMAGE_NAME")"; then
    print_error "The Docker container could not be created."
    return 1
  fi

  print_success "Container started: ${container_id:0:12}"
  print_success "Local URL: http://localhost:${port}"
  print_success "Published URL: http://${host}:${port}"
}

stop_container() {
  require_docker || return 1

  if ! container_exists; then
    print_warning "Container $CONTAINER_NAME has not been created."
    return 0
  fi
  if ! container_is_running; then
    print_warning "Container $CONTAINER_NAME is already stopped."
    return 0
  fi

  print_info "Stopping container $CONTAINER_NAME..."
  if ! docker stop "$CONTAINER_NAME" >/dev/null; then
    print_error "The Docker container could not be stopped."
    return 1
  fi
  print_success "Container $CONTAINER_NAME stopped."
}

restart_container() {
  local host="$1"
  local port="$2"

  require_docker || return 1

  if ! container_exists; then
    print_warning "Container $CONTAINER_NAME does not exist; creating it now."
    start_container "$host" "$port"
    return
  fi

  print_info "Restarting container $CONTAINER_NAME..."
  if ! docker restart "$CONTAINER_NAME" >/dev/null; then
    print_error "The Docker container could not be restarted."
    return 1
  fi
  print_success "Container $CONTAINER_NAME restarted."
  print_published_ports
}

show_status() {
  require_docker || return 1

  printf '%sDocker image%s\n' "$COLOR_BOLD" "$COLOR_RESET"
  if image_exists; then
    docker image ls "$IMAGE_NAME" \
      --format '  {{.Repository}}:{{.Tag}}  ID={{.ID}}  Size={{.Size}}  Created={{.CreatedSince}}'
  else
    print_warning "Image $IMAGE_NAME has not been built."
  fi

  printf '\n%sDocker container%s\n' "$COLOR_BOLD" "$COLOR_RESET"
  if ! container_exists; then
    print_warning "Container $CONTAINER_NAME has not been created."
    return 0
  fi

  docker ps --all \
    --filter "name=^/${CONTAINER_NAME}$" \
    --format '  {{.Names}}  Image={{.Image}}  Status={{.Status}}  Ports={{.Ports}}'
  docker container inspect \
    --format '  Restart policy: {{.HostConfig.RestartPolicy.Name}}' \
    "$CONTAINER_NAME"
  print_published_ports
}

show_logs() {
  local tail_lines="$1"
  local follow_logs="$2"
  local log_status=0
  local -a log_arguments=(logs --timestamps --tail "$tail_lines")

  if ! validate_log_tail "$tail_lines"; then
    print_error "Log tail must be a non-negative number or \"all\"."
    return 1
  fi
  require_docker || return 1
  if ! container_exists; then
    print_error "Container $CONTAINER_NAME has not been created."
    return 1
  fi

  if [[ "$follow_logs" == "true" ]]; then
    log_arguments+=(--follow)
    print_info "Following logs for $CONTAINER_NAME. Press Ctrl+C to return."
  else
    print_info "Showing the latest $tail_lines log lines for $CONTAINER_NAME."
  fi

  docker "${log_arguments[@]}" "$CONTAINER_NAME" || log_status=$?
  if ((log_status == 130)); then
    printf '\n'
    return 0
  fi
  if ((log_status != 0)); then
    print_error "Docker logs exited with status $log_status."
    return "$log_status"
  fi
}

remove_container() {
  local skip_confirmation="$1"

  require_docker || return 1
  if ! container_exists; then
    print_warning "Container $CONTAINER_NAME has already been removed."
    return 0
  fi

  if [[ "$skip_confirmation" != "true" ]]; then
    if [[ ! -t 0 ]]; then
      print_error "Confirmation requires a terminal. Use --force to remove the container."
      return 1
    fi
    if ! confirm_no "Stop and permanently remove container $CONTAINER_NAME?"; then
      print_warning "Container removal cancelled."
      return 0
    fi
  fi

  print_info "Removing container $CONTAINER_NAME..."
  if ! docker rm --force "$CONTAINER_NAME" >/dev/null; then
    print_error "The Docker container could not be removed."
    return 1
  fi
  print_success "Container $CONTAINER_NAME removed. The image was kept."
}

run_local_dev() {
  local host="$1"
  local port="$2"

  if ! validate_host "$host"; then
    print_error "Host must be a non-empty value without spaces."
    return 1
  fi
  if ! validate_port "$port"; then
    print_error "Port must be a number from 1 to 65535."
    return 1
  fi
  if ! command -v npm >/dev/null 2>&1; then
    print_error "npm is required for local development but was not found in PATH."
    return 1
  fi
  if ! command -v go >/dev/null 2>&1; then
    print_error "Go is required for local development but was not found in PATH."
    return 1
  fi

  cd "$SCRIPT_DIR"
  if [[ ! -d node_modules ]]; then
    print_warning "The node_modules directory is missing."
    if [[ -t 0 ]] && confirm_yes "Install dependencies with npm ci?"; then
      print_info "Installing dependencies..."
      if ! npm ci; then
        print_error "Dependency installation failed."
        return 1
      fi
    else
      print_error "Dependencies are required for local development."
      return 1
    fi
  fi

  printf '\n'
  print_info "Building the frontend before starting the local server..."
  print_success "Local URL: http://localhost:${port}"
  print_success "Published URL: http://${host}:${port}"
  print_info "Press Ctrl+C to stop the server."
  printf '\n'

  exec env \
    NODE_ENV="${NODE_ENV:-development}" \
    HOSTNAME="$host" \
    PORT="$port" \
    npm run dev
}

run_doctor() {
  local problems=0
  local docker_ready=false

  print_info "Checking project prerequisites..."

  if command -v docker >/dev/null 2>&1; then
    print_success "Docker CLI: $(docker --version)"
    if docker info >/dev/null 2>&1; then
      docker_ready=true
      print_success "Docker daemon: available"
    else
      print_error "Docker daemon: unavailable"
      problems=$((problems + 1))
    fi
  else
    print_error "Docker CLI: not found"
    problems=$((problems + 1))
  fi

  if [[ -f "$SCRIPT_DIR/Dockerfile" ]]; then
    print_success "Dockerfile: found"
  else
    print_error "Dockerfile: missing"
    problems=$((problems + 1))
  fi

  if command -v npm >/dev/null 2>&1; then
    print_success "npm: $(npm --version)"
  else
    print_warning "npm: not found (required only for local development)"
  fi

  if command -v go >/dev/null 2>&1; then
    print_success "Go: $(go version)"
  else
    print_warning "Go: not found (required only for local development)"
  fi

  if [[ -d "$SCRIPT_DIR/node_modules" ]]; then
    print_success "Local dependencies: installed"
  else
    print_warning "Local dependencies: not installed"
  fi

  if [[ "$docker_ready" == "true" ]]; then
    if image_exists; then
      print_success "Docker image: $IMAGE_NAME"
    else
      print_warning "Docker image: not built"
    fi

    if container_exists; then
      print_success "Docker container: $(docker container inspect --format '{{.State.Status}}' "$CONTAINER_NAME")"
    else
      print_warning "Docker container: not created"
    fi
  fi

  if ((problems > 0)); then
    print_error "Diagnostics found $problems blocking problem(s)."
    return 1
  fi
  print_success "Docker prerequisites are ready."
}

prompt_runtime_settings() {
  APP_HOST="$DEFAULT_HOST"
  APP_PORT="$DEFAULT_PORT"

  prompt_value APP_HOST "Host" "$DEFAULT_HOST" || return 1
  if ! validate_host "$APP_HOST"; then
    print_error "Host must be a non-empty value without spaces."
    return 1
  fi

  prompt_value APP_PORT "Port" "$DEFAULT_PORT" || return 1
  if ! validate_port "$APP_PORT"; then
    print_error "Port must be a number from 1 to 65535."
    return 1
  fi
}

pause_menu() {
  printf '\n%sPress Enter to return to the menu...%s' "$COLOR_BOLD" "$COLOR_RESET"
  IFS= read -r _ || true
  printf '\n'
}

compact_container_status() {
  local state

  if ! command -v docker >/dev/null 2>&1; then
    printf '%sDocker unavailable%s' "$COLOR_RED" "$COLOR_RESET"
    return
  fi
  if ! docker info >/dev/null 2>&1; then
    printf '%sDocker daemon unavailable%s' "$COLOR_RED" "$COLOR_RESET"
    return
  fi
  if ! container_exists; then
    printf '%snot created%s' "$COLOR_YELLOW" "$COLOR_RESET"
    return
  fi

  state="$(docker container inspect --format '{{.State.Status}}' "$CONTAINER_NAME")"
  if [[ "$state" == "running" ]]; then
    printf '%s%s%s' "$COLOR_GREEN" "$state" "$COLOR_RESET"
  else
    printf '%s%s%s' "$COLOR_YELLOW" "$state" "$COLOR_RESET"
  fi
}

menu_start() {
  require_docker || return 1
  if container_exists; then
    start_container "$DEFAULT_HOST" "$DEFAULT_PORT"
    return
  fi
  prompt_runtime_settings || return 1
  start_container "$APP_HOST" "$APP_PORT"
}

menu_restart() {
  require_docker || return 1
  if container_exists; then
    restart_container "$DEFAULT_HOST" "$DEFAULT_PORT"
    return
  fi
  prompt_runtime_settings || return 1
  restart_container "$APP_HOST" "$APP_PORT"
}

menu_dev() {
  prompt_runtime_settings || return 1
  run_local_dev "$APP_HOST" "$APP_PORT"
}

run_menu_action() {
  printf '\n'
  if ! "$@"; then
    print_warning "The requested action did not complete successfully."
  fi
  pause_menu
}

interactive_menu() {
  local choice

  if [[ ! -t 0 ]]; then
    fail "Interactive mode requires a terminal. Run ./run.sh --help for commands."
  fi

  while true; do
    print_banner
    printf 'Image:     %s\n' "$IMAGE_NAME"
    printf 'Container: %s (%s)\n' "$CONTAINER_NAME" "$(compact_container_status)"
    printf '\n'
    printf '%sDocker%s\n' "$COLOR_BOLD" "$COLOR_RESET"
    printf '  1) Start container\n'
    printf '  2) Stop container\n'
    printf '  3) Restart container\n'
    printf '  4) Show status\n'
    printf '  5) Follow logs\n'
    printf '  6) Show recent logs\n'
    printf '  7) Build image\n'
    printf '  8) Rebuild image without cache\n'
    printf '  9) Remove container\n'
    printf '\n%sDevelopment and support%s\n' "$COLOR_BOLD" "$COLOR_RESET"
    printf ' 10) Run local development server\n'
    printf ' 11) Run diagnostics\n'
    printf '  h) Show help\n'
    printf '  q) Quit\n'
    printf '\n%sSelect an option:%s ' "$COLOR_BOLD" "$COLOR_RESET"

    if ! IFS= read -r choice; then
      printf '\n'
      print_info "Goodbye."
      return 0
    fi

    case "$choice" in
      1)
        run_menu_action menu_start
        ;;
      2)
        run_menu_action stop_container
        ;;
      3)
        run_menu_action menu_restart
        ;;
      4)
        run_menu_action show_status
        ;;
      5)
        run_menu_action show_logs "$DEFAULT_LOG_TAIL" true
        ;;
      6)
        run_menu_action show_logs "$DEFAULT_LOG_TAIL" false
        ;;
      7)
        run_menu_action build_image false
        ;;
      8)
        run_menu_action build_image true
        ;;
      9)
        run_menu_action remove_container false
        ;;
      10)
        run_menu_action menu_dev
        ;;
      11)
        run_menu_action run_doctor
        ;;
      h|H|help|HELP|\?)
        printf '\n'
        print_help
        pause_menu
        ;;
      q|Q|quit|QUIT|0)
        print_info "Goodbye."
        return 0
        ;;
      "")
        ;;
      *)
        print_error "Unknown menu option: $choice"
        pause_menu
        ;;
    esac
  done
}

parse_runtime_options() {
  APP_HOST="$DEFAULT_HOST"
  APP_PORT="$DEFAULT_PORT"

  while (($# > 0)); do
    case "$1" in
      --host)
        (($# >= 2)) || fail "--host requires a value."
        APP_HOST="$2"
        shift 2
        ;;
      --host=*)
        APP_HOST="${1#*=}"
        shift
        ;;
      --port)
        (($# >= 2)) || fail "--port requires a value."
        APP_PORT="$2"
        shift 2
        ;;
      --port=*)
        APP_PORT="${1#*=}"
        shift
        ;;
      -h|--help)
        print_help
        exit 0
        ;;
      *)
        fail "Unknown runtime option: $1" 2
        ;;
    esac
  done

  validate_host "$APP_HOST" || fail "Host must be a non-empty value without spaces."
  validate_port "$APP_PORT" || fail "Port must be a number from 1 to 65535."
}

parse_log_options() {
  LOG_TAIL="$DEFAULT_LOG_TAIL"
  FOLLOW_LOGS=false

  while (($# > 0)); do
    case "$1" in
      -f|--follow)
        FOLLOW_LOGS=true
        shift
        ;;
      --tail)
        (($# >= 2)) || fail "--tail requires a value."
        LOG_TAIL="$2"
        shift 2
        ;;
      --tail=*)
        LOG_TAIL="${1#*=}"
        shift
        ;;
      -h|--help)
        print_help
        exit 0
        ;;
      *)
        fail "Unknown logs option: $1" 2
        ;;
    esac
  done

  validate_log_tail "$LOG_TAIL" || fail "Log tail must be a non-negative number or \"all\"."
}

parse_remove_options() {
  FORCE_REMOVE=false

  while (($# > 0)); do
    case "$1" in
      -f|--force)
        FORCE_REMOVE=true
        shift
        ;;
      -h|--help)
        print_help
        exit 0
        ;;
      *)
        fail "Unknown remove option: $1" 2
        ;;
    esac
  done
}

require_no_arguments() {
  local command_name="$1"
  shift

  (($# == 0)) || fail "The $command_name command does not accept arguments." 2
}

main() {
  local command

  if (($# == 0)); then
    interactive_menu
    return
  fi

  command="$1"
  shift
  case "$command" in
    -h|--help|help)
      require_no_arguments "help" "$@"
      print_help
      ;;
    menu)
      require_no_arguments "menu" "$@"
      interactive_menu
      ;;
    start|up)
      parse_runtime_options "$@"
      start_container "$APP_HOST" "$APP_PORT"
      ;;
    stop|down)
      require_no_arguments "stop" "$@"
      stop_container
      ;;
    restart)
      parse_runtime_options "$@"
      restart_container "$APP_HOST" "$APP_PORT"
      ;;
    status|ps)
      require_no_arguments "status" "$@"
      show_status
      ;;
    logs|log)
      parse_log_options "$@"
      show_logs "$LOG_TAIL" "$FOLLOW_LOGS"
      ;;
    build)
      require_no_arguments "build" "$@"
      build_image false
      ;;
    rebuild)
      require_no_arguments "rebuild" "$@"
      build_image true
      ;;
    remove)
      parse_remove_options "$@"
      remove_container "$FORCE_REMOVE"
      ;;
    dev|local)
      parse_runtime_options "$@"
      run_local_dev "$APP_HOST" "$APP_PORT"
      ;;
    doctor|check)
      require_no_arguments "doctor" "$@"
      run_doctor
      ;;
    *)
      print_error "Unknown command: $command"
      printf '\n' >&2
      print_help >&2
      exit 2
      ;;
  esac
}

main "$@"
