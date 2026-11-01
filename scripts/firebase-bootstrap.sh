#!/usr/bin/env bash
# Wayfare - interactive Firebase bootstrap for Google Cloud Shell.
#
#   bash <(curl -fsSL https://raw.githubusercontent.com/nullthrone/wayfare/main/scripts/firebase-bootstrap.sh)
#
# Creates (or repairs) everything Wayfare needs on Firebase: project APIs, Firestore, a private media
# bucket, the WAYFARE_ENV secret, an App Hosting backend, IAM, a first deployment, optionally a Cloud
# Scheduler digest job and a GitHub Actions release pipeline (workload identity federation).
# Idempotent: re-run it to resume or repair. See docs/en/operator/firebase.md.
set -Eeuo pipefail
set +x # never trace: secrets pass through this script

# ----------------------------------------------------------------------------- constants / defaults
readonly TOTAL_STEPS=14
readonly BACKEND="wayfare" # must match backendId in firebase.json
readonly SECRET_NAME="WAYFARE_ENV"
readonly SCHEDULER_JOB="wayfare-digest"
readonly DEPLOYER_NAME="wayfare-deployer"
readonly WIF_POOL="github"
readonly DEFAULT_REPO_URL="https://github.com/nullthrone/wayfare"
readonly DEFAULT_BRANCH="main"
readonly MIN_FIREBASE_TOOLS="14.4.0"
readonly STATE_DIR="${HOME}/.config/wayfare"
readonly STATE_FILE="${STATE_DIR}/bootstrap.env"
readonly DOCS_URL="https://nullthrone.github.io/wayfare/en/operator/firebase"

ASSUME_YES=0
DRY_RUN=0
RECONFIGURE=0
PROJECT_ID="" REGION="" FS_LOCATION="" BUCKET="" REPO_URL="" BRANCH="" CLONE_DIR=""
GH_REPO="" TIMEZONE="" WANT_PHOTO_IMPORT="" BILLING_ACCOUNT=""
PROJECT_NUMBER="" BASE_URL="" COMPUTE_SA="" CURRENT_STEP="startup"
CUSTOM_DOMAIN=0
SECRET_MASKS=()

# ----------------------------------------------------------------------------- output helpers
if [ -t 1 ] && [ -z "${NO_COLOR:-}" ]; then
  BOLD=$'\033[1m' DIM=$'\033[2m' RED=$'\033[31m' GREEN=$'\033[32m' YELLOW=$'\033[33m' CYAN=$'\033[36m' RESET=$'\033[0m'
else
  BOLD="" DIM="" RED="" GREEN="" YELLOW="" CYAN="" RESET=""
fi
info() { printf '%s\n' "$*"; }
ok() { printf '%s[ok]%s %s\n' "$GREEN" "$RESET" "$*"; }
warn() { printf '%s[!]%s %s\n' "$YELLOW" "$RESET" "$*" >&2; }
note() { printf '%s    %s%s\n' "$DIM" "$*" "$RESET"; }
die() {
  printf '%s[x]%s %s\n' "$RED" "$RESET" "$*" >&2
  exit 1
}
step() {
  CURRENT_STEP="$1 - $2"
  printf '\n%s%s[%s/%s]%s %s%s%s\n' "$BOLD" "$CYAN" "$1" "$TOTAL_STEPS" "$RESET" "$BOLD" "$2" "$RESET"
}

on_error() {
  local rc=$? line=$1
  printf '\n%s[x]%s Step "%s" failed (line %s, exit code %s).\n' "$RED" "$RESET" "$CURRENT_STEP" "$line" "$rc" >&2
  printf '    Nothing is lost: your answers are saved in %s.\n    Fix the problem shown above and run the script again - it resumes where it stopped.\n' "$STATE_FILE" >&2
  exit "$rc"
}
trap 'on_error $LINENO' ERR
trap 'printf "\n"; warn "Interrupted. Re-run the script to resume."; exit 130' INT

usage() {
  cat <<'EOF'
Wayfare Firebase bootstrap (Google Cloud Shell)

Usage: firebase-bootstrap.sh [options]

  --project ID      Use this Google Cloud project ID (created if it does not exist)
  --repo URL        Git repository to deploy (default: https://github.com/nullthrone/wayfare)
  --branch NAME     Branch/tag to deploy (default: main)
  --reconfigure     Ask the instance-configuration questions (step 8) again, even if WAYFARE_ENV exists
  --yes, -y         Non-interactive: accept defaults, skip optional features
  --dry-run         Print the gcloud/firebase commands that would change something instead of running them
  --help, -h        Show this help

Answers are remembered in ~/.config/wayfare/bootstrap.env (no secrets). Secrets live in Secret Manager.
Docs: https://nullthrone.github.io/wayfare/en/operator/firebase
EOF
}

# ----------------------------------------------------------------------------- command helpers
mask() { # replace known secret values in a string
  local s=$1 m
  for m in "${SECRET_MASKS[@]+"${SECRET_MASKS[@]}"}"; do [ -n "$m" ] && s=${s//"$m"/"****"}; done
  printf '%s' "$s"
}
show_cmd() { note "\$ $(mask "$*")"; }

# run: mutating command. Printed; executed unless --dry-run.
run() {
  show_cmd "$@"
  [ "$DRY_RUN" = 1 ] && return 0
  "$@"
}
# run_in DATA cmd...: like run, DATA is fed to stdin (secrets never touch the command line or disk).
run_in() {
  local data=$1
  shift
  show_cmd "printf %s '<${#data} bytes>' |" "$@"
  [ "$DRY_RUN" = 1 ] && return 0
  printf '%s' "$data" | "$@"
}
# capture: mutating command whose combined output is kept in LAST_OUT (and returned rc).
LAST_OUT=""
capture() {
  show_cmd "$@"
  if [ "$DRY_RUN" = 1 ]; then
    LAST_OUT=""
    return 0
  fi
  local rc=0
  LAST_OUT=$("$@" 2>&1) || rc=$?
  return "$rc"
}
# q: read-only query, stdout only, errors silenced. Always executed (also in --dry-run).
q() { "$@" 2>/dev/null; }

# JSON helper (node is always present in Cloud Shell; jq may not be). Usage: json_eval 'js using j' < json
json_eval() {
  node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{let j;try{j=JSON.parse(s)}catch{process.exit(3)}const r=new Function("j","args","return ("+process.argv[1]+")")(j,process.argv.slice(2));if(r!==undefined&&r!==null&&r!=="")console.log(r)})' "$@"
}

rand_b64url() { # rand_b64url BYTES
  if command -v node >/dev/null 2>&1; then
    node -e 'process.stdout.write(require("crypto").randomBytes(+process.argv[1]).toString("base64url"))' "$1"
  else
    openssl rand -base64 "$1" | tr '+/' '-_' | tr -d '=\n'
  fi
}

version_ge() { [ "$(printf '%s\n%s\n' "$2" "$1" | sort -V | head -n1)" = "$2" ]; } # version_ge HAVE NEED

# ----------------------------------------------------------------------------- prompts
IN_FD=0
if [ "${WAYFARE_BOOTSTRAP_STDIN:-}" != 1 ] && [ ! -t 0 ] && { : </dev/tty; } 2>/dev/null; then
  exec 3</dev/tty
  IN_FD=3
fi

is_email() { [[ $1 =~ ^[^@[:space:],]+@[^@[:space:],]+\.[^@[:space:],]+$ ]]; }
v_email_list() { # one or more, comma separated
  local e IFS=,
  [ -n "$1" ] || return 1
  for e in $1; do is_email "${e// /}" || return 1; done
}
v_project_id() { [[ $1 =~ ^[a-z][a-z0-9-]{4,28}[a-z0-9]$ ]]; }
v_https_url_opt() { [ -z "$1" ] || [[ $1 =~ ^https://[A-Za-z0-9.-]+(:[0-9]+)?(/[^[:space:]]*)?$ ]]; }
# Same rule as isValidSmtpUrl() in src/server/config.ts (the app refuses to start with a malformed SMTP_URL).
v_smtp_opt() {
  [ -z "$1" ] && return 0
  node -e 'try{const u=new URL(process.argv[1]);process.exit((u.protocol==="smtp:"||u.protocol==="smtps:")&&/^(localhost|[0-9.]+|([A-Za-z0-9-]+\.)+[A-Za-z]{2,})$/.test(u.hostname)?0:1)}catch{process.exit(1)}' "$1"
}
v_hostname() { [[ $1 =~ ^([A-Za-z0-9-]+\.)+[A-Za-z]{2,}$ ]]; }
v_port() { [[ $1 =~ ^[0-9]{2,5}$ ]] && [ "$1" -le 65535 ]; }
v_nonempty() { [ -n "$1" ]; }
v_mail_from() { [[ $1 == *@* ]]; }
v_timezone() { [[ $1 =~ ^[A-Za-z_]+(/[A-Za-z0-9_+-]+){0,2}$ ]]; }
v_git_url() { [[ $1 =~ ^(https://|git@|ssh://)[^[:space:]]+$ ]]; }
v_int_0_10() { [[ $1 =~ ^([0-9]|10)$ ]]; }
v_location() { [[ $1 =~ ^[a-z]+[a-z0-9-]*$ ]]; }

ask() { # ask VAR "prompt" "default" [validator]
  local __var=$1 prompt=$2 def=${3-} validator=${4-} ans
  if [ "$ASSUME_YES" = 1 ]; then
    printf -v "$__var" '%s' "$def"
    note "$prompt -> ${def:-<empty>}"
    return 0
  fi
  while true; do
    printf '%s%s%s ' "$BOLD" "$prompt" "$RESET"
    [ -n "$def" ] && printf '[%s] ' "$def"
    IFS= read -r -u "$IN_FD" ans || die "No input available. Run interactively or pass --yes."
    ans=${ans:-$def}
    if [ -z "$validator" ] || "$validator" "$ans"; then
      printf -v "$__var" '%s' "$ans"
      return 0
    fi
    warn "That does not look right, please try again."
  done
}
ask_secret() { # ask_secret VAR "prompt" [validator]  (input hidden; empty allowed unless validator rejects)
  local __var=$1 prompt=$2 validator=${3-} ans
  if [ "$ASSUME_YES" = 1 ]; then
    printf -v "$__var" '%s' ""
    return 0
  fi
  while true; do
    printf '%s%s%s (input hidden) ' "$BOLD" "$prompt" "$RESET"
    IFS= read -r -s -u "$IN_FD" ans || die "No input available."
    printf '\n'
    if [ -z "$validator" ] || "$validator" "$ans"; then
      printf -v "$__var" '%s' "$ans"
      [ -n "$ans" ] && SECRET_MASKS+=("$ans")
      return 0
    fi
    warn "That does not look right, please try again."
  done
}
ask_yn() { # ask_yn "prompt" y|n  -> rc 0 = yes
  local prompt=$1 def=${2:-y} ans hint="[Y/n]"
  [ "$def" = n ] && hint="[y/N]"
  if [ "$ASSUME_YES" = 1 ]; then
    note "$prompt -> $([ "$def" = y ] && echo yes || echo no)"
    [ "$def" = y ]
    return
  fi
  while true; do
    printf '%s%s%s %s ' "$BOLD" "$prompt" "$RESET" "$hint"
    IFS= read -r -u "$IN_FD" ans || die "No input available. Run interactively or pass --yes."
    ans=${ans:-$def}
    case "${ans,,}" in
      y | yes | j | ja) return 0 ;;
      n | no | nein) return 1 ;;
    esac
  done
}
MENU_IDX=0
menu() { # menu "title" default_index(0-based) option... -> MENU_IDX
  local title=$1 def=$2 i ans
  shift 2
  local opts=("$@")
  if [ "$ASSUME_YES" = 1 ]; then
    MENU_IDX=$def
    note "$title -> ${opts[$def]}"
    return 0
  fi
  printf '%s%s%s\n' "$BOLD" "$title" "$RESET"
  for i in "${!opts[@]}"; do printf '  %s) %s\n' "$((i + 1))" "${opts[$i]}"; done
  while true; do
    printf 'Choice [%s]: ' "$((def + 1))"
    IFS= read -r -u "$IN_FD" ans || die "No input available. Run interactively or pass --yes."
    ans=${ans:-$((def + 1))}
    if [[ $ans =~ ^[0-9]+$ ]] && [ "$ans" -ge 1 ] && [ "$ans" -le "${#opts[@]}" ]; then
      MENU_IDX=$((ans - 1))
      return 0
    fi
    warn "Please enter a number between 1 and ${#opts[@]}."
  done
}

# ----------------------------------------------------------------------------- state file
STATE_KEYS=(PROJECT_ID REGION FS_LOCATION BUCKET REPO_URL BRANCH CLONE_DIR GH_REPO TIMEZONE WANT_PHOTO_IMPORT BILLING_ACCOUNT)
state_load() {
  [ -f "$STATE_FILE" ] || return 0
  local line k v key
  while IFS= read -r line || [ -n "$line" ]; do
    k=${line%%=*}
    v=${line#*=}
    for key in "${STATE_KEYS[@]}"; do
      # command-line flags win over saved state
      if [ "$k" = "$key" ] && [ -z "${!key}" ]; then printf -v "$key" '%s' "$v"; fi
    done
  done <"$STATE_FILE"
}
state_save() {
  [ "$DRY_RUN" = 1 ] && return 0
  mkdir -p "$STATE_DIR"
  chmod 700 "$STATE_DIR"
  local tmp key
  tmp=$(mktemp "${STATE_DIR}/.bootstrap.XXXXXX")
  chmod 600 "$tmp"
  {
    echo "# Wayfare bootstrap answers (no secrets). Safe to delete; the script will ask again."
    for key in "${STATE_KEYS[@]}"; do [ -n "${!key}" ] && printf '%s=%s\n' "$key" "${!key}"; done
  } >"$tmp"
  mv "$tmp" "$STATE_FILE"
}

# ----------------------------------------------------------------------------- WAYFARE_ENV (dotenv bundle) in memory
declare -A E=()
EK=()
ENV_BASELINE="" # content of the latest secret version as read at the start (to skip no-op writes)
env_set() {
  [ -n "${E[$1]+x}" ] || EK+=("$1")
  E[$1]=$2
}
env_get() { printf '%s' "${E[$1]-}"; }
env_has() { [ -n "${E[$1]-}" ]; }
env_parse() {
  local line key val
  while IFS= read -r line || [ -n "$line" ]; do
    line=${line#"${line%%[![:space:]]*}"}
    line=${line%"${line##*[![:space:]]}"}
    [ -z "$line" ] && continue
    [ "${line:0:1}" = "#" ] && continue
    line=${line#export }
    [[ $line =~ ^([A-Za-z_][A-Za-z0-9_]*)[[:space:]]*=(.*)$ ]] || continue
    key=${BASH_REMATCH[1]}
    val=${BASH_REMATCH[2]}
    val=${val#"${val%%[![:space:]]*}"}
    if [[ $val == \"*\" && ${#val} -ge 2 ]]; then
      val=${val:1:${#val}-2}
      val=${val//\\\"/\"}
    elif [[ $val == \'*\' && ${#val} -ge 2 ]]; then
      val=${val:1:${#val}-2}
    else
      val=$(sed -E 's/[[:space:]]+#.*$//; s/[[:space:]]+$//' <<<"$val")
    fi
    env_set "$key" "$val"
  done <<<"$1"
}
env_render() {
  local k v out=""
  for k in "${EK[@]}"; do
    v=${E[$k]}
    [ -z "$v" ] && continue
    if [[ -z $v || $v =~ [[:space:]\#\"\'] ]]; then v="\"${v//\"/\\\"}\""; fi
    out+="$k=$v"$'\n'
  done
  printf '%s' "${out%$'\n'}"
}
is_secret_key() { [[ $1 =~ (SECRET|PASSWORD|API_KEY|SMTP_URL|PRIVATE) ]]; }
env_summary() {
  local k v
  for k in "${EK[@]}"; do
    v=${E[$k]}
    [ -z "$v" ] && continue
    if is_secret_key "$k"; then v="**** (${#v} chars)"; fi
    printf '    %s=%s\n' "$k" "$v"
  done
}
# env_save: writes a new secret version only if the rendered content changed.
env_save() {
  local content
  content=$(env_render)
  if [ "$content" = "$ENV_BASELINE" ]; then
    ok "$SECRET_NAME unchanged - no new secret version written."
    return 0
  fi
  run_in "$content" gcloud secrets versions add "$SECRET_NAME" --data-file=- --project "$PROJECT_ID" --quiet
  ENV_BASELINE=$content
  ok "New version of secret $SECRET_NAME stored."
}

# ----------------------------------------------------------------------------- steps
step_preflight() {
  step 1 "Preflight checks"
  info "This script will set up Wayfare on Firebase in your Google Cloud account. It will:"
  info "  - create/choose a Google Cloud project and enable the required APIs"
  info "  - create a Firestore database, a private Cloud Storage bucket and an App Hosting backend"
  info "  - store the instance configuration in Secret Manager (secret $SECRET_NAME)"
  info "  - deploy Wayfare, and optionally set up a daily-digest job and GitHub release deployments"
  printf '\n%sCosts:%s App Hosting needs the Blaze (pay-as-you-go) billing plan. Wayfare runs on a small Cloud Run\n' "$BOLD" "$RESET"
  info "instance (1 vCPU, 1 GiB, minInstances 0, so it scales to zero) plus Firestore and Storage usage; a hobby"
  info "instance typically stays within or close to the free quotas. Consider setting a budget alert in Billing."
  [ "$DRY_RUN" = 1 ] && warn "DRY RUN: commands that change something are only printed."
  echo
  ask_yn "Continue?" y || {
    info "Aborted."
    exit 0
  }

  local missing=()
  for t in gcloud firebase node git; do command -v "$t" >/dev/null 2>&1 || missing+=("$t"); done
  if [ "${#missing[@]}" -gt 0 ] && { [ "${#missing[@]}" -gt 1 ] || [ "${missing[0]}" != firebase ]; }; then
    die "Missing tools: ${missing[*]}. This script is made for Google Cloud Shell (https://shell.cloud.google.com) where they are preinstalled."
  fi
  if ! command -v openssl >/dev/null 2>&1; then note "openssl not found - using node's crypto for random secrets."; fi

  local nv
  nv=$(node -v | sed 's/^v//')
  version_ge "$nv" "20.0.0" || die "Node.js >= 20 is required (found $nv)."
  ok "node $nv, git $(git --version | awk '{print $3}'), gcloud $(q gcloud version --format='value("Google Cloud SDK")' | head -n1)"

  local fv=""
  if command -v firebase >/dev/null 2>&1; then fv=$(q firebase --version | tail -n1 | tr -d '[:space:]'); fi
  if [ -z "$fv" ] || ! version_ge "$fv" "$MIN_FIREBASE_TOOLS"; then
    info "firebase-tools ${fv:-not installed}; need >= $MIN_FIREBASE_TOOLS (local-source App Hosting deploys). Installing 15.x into ~/.local ..."
    run npm install -g firebase-tools@15 --prefix "$HOME/.local"
    export PATH="$HOME/.local/bin:$PATH"
    hash -r
    [ "$DRY_RUN" = 1 ] || fv=$(firebase --version | tail -n1 | tr -d '[:space:]')
  fi
  ok "firebase-tools ${fv:-15.x}"

  local acct
  acct=$(q gcloud auth list --filter=status:ACTIVE --format='value(account)' | head -n1 || true)
  if [ -z "$acct" ]; then
    info "gcloud is not authenticated. Starting login..."
    run gcloud auth login --no-launch-browser
    acct=$(q gcloud auth list --filter=status:ACTIVE --format='value(account)' | head -n1 || true)
  fi
  GCLOUD_ACCOUNT=$acct
  ok "gcloud account: ${acct:-unknown}"

  if ! q firebase projects:list --json >/dev/null; then
    info "The Firebase CLI is not logged in. Starting login..."
    run firebase login --no-localhost
    [ "$DRY_RUN" = 1 ] || firebase projects:list --json >/dev/null || die "Firebase CLI login failed."
  fi
  ok "Firebase CLI is authenticated."
}

step_source() {
  step 2 "Source code"
  [ -n "$REPO_URL" ] || REPO_URL=$DEFAULT_REPO_URL
  [ -n "$BRANCH" ] || BRANCH=$DEFAULT_BRANCH
  [ -n "$CLONE_DIR" ] || CLONE_DIR="$HOME/wayfare"
  v_git_url "$REPO_URL" || die "Invalid repository URL: $REPO_URL"
  if [ -d "$CLONE_DIR/.git" ]; then
    info "Updating $CLONE_DIR ($BRANCH)"
    if [ -n "$(q git -C "$CLONE_DIR" status --porcelain)" ]; then
      warn "$CLONE_DIR has local changes - leaving the working tree untouched and deploying it as is."
    else
      run git -C "$CLONE_DIR" fetch --depth 50 origin "$BRANCH"
      run git -C "$CLONE_DIR" checkout "$BRANCH"
      run git -C "$CLONE_DIR" merge --ff-only "origin/$BRANCH"
    fi
  else
    [ ! -e "$CLONE_DIR" ] || [ -z "$(ls -A "$CLONE_DIR" 2>/dev/null)" ] || die "$CLONE_DIR exists and is not a git checkout. Move it away or pass --repo for another location."
    info "Cloning $REPO_URL ($BRANCH) into $CLONE_DIR"
    run git clone --depth 50 --branch "$BRANCH" "$REPO_URL" "$CLONE_DIR"
  fi
  if [ "$DRY_RUN" != 1 ]; then
    [ -f "$CLONE_DIR/firebase.json" ] || die "$CLONE_DIR/firebase.json not found - is this a Wayfare checkout?"
    ok "Version: $(git -C "$CLONE_DIR" describe --tags --always 2>/dev/null || echo unknown)"
  fi
  state_save
}

create_project() {
  local id=$1 pname
  pname="Wayfare"
  run gcloud projects create "$id" --name="$pname" --quiet
}

step_project() {
  step 3 "Google Cloud project"
  if [ -z "$PROJECT_ID" ]; then
    local ids=() labels=() line id name
    while IFS=$'\t' read -r id name; do
      [ -n "$id" ] || continue
      ids+=("$id")
      labels+=("$id  (${name:-no name})")
    done < <(q gcloud projects list --filter='lifecycleState:ACTIVE' --format='value(projectId,name)' --limit=25 || true)
    line=""
    if [ "${#ids[@]}" -gt 0 ]; then
      labels+=("Create a new project")
      menu "Which project should host Wayfare?" "${#ids[@]}" "${labels[@]}"
      if [ "$MENU_IDX" -lt "${#ids[@]}" ]; then PROJECT_ID=${ids[$MENU_IDX]}; fi
    fi
    if [ -z "$PROJECT_ID" ]; then
      note "Project IDs: 6-30 chars, lowercase letters, digits, hyphens; start with a letter. Globally unique."
      ask PROJECT_ID "New project ID:" "wayfare-$(rand_b64url 4 | tr -dc 'a-z0-9' | head -c 6)" v_project_id
    fi
  fi
  v_project_id "$PROJECT_ID" || die "Invalid project ID '$PROJECT_ID' (needs ^[a-z][a-z0-9-]{4,28}[a-z0-9]\$)."
  if q gcloud projects describe "$PROJECT_ID" --format='value(projectId)' | grep -qx "$PROJECT_ID"; then
    ok "Using existing project $PROJECT_ID"
  else
    info "Project $PROJECT_ID not found - creating it."
    create_project "$PROJECT_ID"
  fi
  run gcloud config set project "$PROJECT_ID" --quiet
  PROJECT_NUMBER=$(q gcloud projects describe "$PROJECT_ID" --format='value(projectNumber)' || true)
  [ -n "$PROJECT_NUMBER" ] || { [ "$DRY_RUN" = 1 ] && PROJECT_NUMBER="000000000000"; } || die "Could not read the project number of $PROJECT_ID."
  COMPUTE_SA="firebase-app-hosting-compute@${PROJECT_ID}.iam.gserviceaccount.com"
  state_save
  ok "Project number: $PROJECT_NUMBER"
}

billing_enabled() { [[ "$(q gcloud billing projects describe "$PROJECT_ID" --format='value(billingEnabled)' || true)" =~ ^[Tt]rue$ ]]; }

pick_billing_account() {
  local ids=() labels=() id name
  while IFS=$'\t' read -r id name; do
    [ -n "$id" ] || continue
    ids+=("$id")
    labels+=("$id  (${name:-unnamed})")
  done < <(q gcloud billing accounts list --filter='open=true' --format='value(name.basename(),displayName)' || true)
  if [ "${#ids[@]}" -eq 0 ]; then
    cat >&2 <<EOF

${RED}[x]${RESET} No open billing account is available to your user.
    Create one (needs a credit card): https://console.cloud.google.com/billing/create
    or ask your billing administrator for the "Billing Account User" role.
    Then run this script again - your progress is saved.
EOF
    exit 1
  fi
  if [ "${#ids[@]}" -eq 1 ]; then
    BILLING_ACCOUNT=${ids[0]}
    ok "Billing account: ${labels[0]}"
  else
    menu "Which billing account should pay for this project?" 0 "${labels[@]}"
    BILLING_ACCOUNT=${ids[$MENU_IDX]}
  fi
  state_save
}

step_billing() {
  step 4 "Billing"
  if billing_enabled; then
    ok "Billing is enabled for $PROJECT_ID"
    return 0
  fi
  info "Billing (Blaze plan) is not enabled for $PROJECT_ID. App Hosting requires it."
  [ -n "$BILLING_ACCOUNT" ] || pick_billing_account
  while true; do
    if capture gcloud billing projects link "$PROJECT_ID" --billing-account="$BILLING_ACCOUNT"; then
      ok "Linked $PROJECT_ID to billing account $BILLING_ACCOUNT"
      break
    fi
    printf '%s\n' "$LAST_OUT" >&2
    local link="https://console.cloud.google.com/billing/linkedaccount?project=$PROJECT_ID"
    [ "$ASSUME_YES" = 1 ] && die "Could not link billing. Link it manually at $link and re-run."
    ask_yn "Linking billing failed (see above). Retry? (No = exit; progress is saved, link it at $link)" y || {
      info "Exiting. Link billing at $link , then re-run the script."
      exit 0
    }
  done
  state_save
}

step_apis() {
  step 5 "APIs and Firebase"
  if [ -z "$WANT_PHOTO_IMPORT" ]; then
    if ask_yn "Do you want Google Photos / Drive import (needs extra APIs and OAuth setup)?" n; then WANT_PHOTO_IMPORT=yes; else WANT_PHOTO_IMPORT=no; fi
  fi
  local apis=(
    firebase.googleapis.com firebaseapphosting.googleapis.com cloudbuild.googleapis.com run.googleapis.com
    artifactregistry.googleapis.com secretmanager.googleapis.com developerconnect.googleapis.com
    iam.googleapis.com iamcredentials.googleapis.com sts.googleapis.com cloudresourcemanager.googleapis.com
    serviceusage.googleapis.com firestore.googleapis.com storage.googleapis.com firebaserules.googleapis.com
    cloudscheduler.googleapis.com
  )
  [ "$WANT_PHOTO_IMPORT" = yes ] && apis+=(photospicker.googleapis.com drive.googleapis.com picker.googleapis.com)
  info "Enabling ${#apis[@]} APIs (this can take a few minutes the first time)..."
  run gcloud services enable "${apis[@]}" --project "$PROJECT_ID"

  if q firebase projects:list --json | json_eval 'JSON.stringify((function f(o){return o&&typeof o==="object"&&(o.projectId===args[0]||Object.values(o).some(f))})(j))' "$PROJECT_ID" | grep -q true; then
    ok "Firebase is already enabled for $PROJECT_ID"
  else
    info "Adding Firebase to $PROJECT_ID ..."
    run firebase projects:addfirebase "$PROJECT_ID"
  fi
  state_save
}

step_regions() {
  step 6 "Regions"
  local regions=(europe-west4 us-central1 asia-east1) labels
  if [ -z "$REGION" ]; then
    labels=("europe-west4 (Netherlands, EU)" "us-central1 (Iowa, US)" "asia-east1 (Taiwan)")
    menu "App Hosting region (where the app runs; cannot be changed later):" 0 "${labels[@]}"
    REGION=${regions[$MENU_IDX]}
  fi
  v_location "$REGION" || die "Invalid region '$REGION'."
  ok "App Hosting region: $REGION"

  local existing
  existing=$(q gcloud firestore databases list --project "$PROJECT_ID" --format='value(name,locationId)' | awk -F'\t' '$1 ~ /\(default\)$/ {print $2}' | head -n1 || true)
  if [ -n "$existing" ]; then
    FS_LOCATION=$existing
    ok "Firestore database already exists in $FS_LOCATION (location cannot be changed)"
  elif [ -z "$FS_LOCATION" ]; then
    menu "Firestore location (cannot be changed later; close to users and the app is best):" 0 \
      "$REGION (same as App Hosting)" "eur3 (multi-region Europe)" "nam5 (multi-region US)" "Other (enter a location ID)"
    case "$MENU_IDX" in
      0) FS_LOCATION=$REGION ;;
      1) FS_LOCATION=eur3 ;;
      2) FS_LOCATION=nam5 ;;
      3) ask FS_LOCATION "Firestore location ID:" "$REGION" v_location ;;
    esac
  fi
  ok "Firestore location: $FS_LOCATION"
  state_save
}

step_data() {
  step 7 "Firestore database and media bucket"
  if q gcloud firestore databases list --project "$PROJECT_ID" --format='value(name)' | grep -q '(default)$'; then
    ok "Firestore (default) database exists - skipping"
  else
    run gcloud firestore databases create --project "$PROJECT_ID" --location="$FS_LOCATION" --type=firestore-native
  fi
  [ -n "$BUCKET" ] || BUCKET="${PROJECT_ID}-wayfare-media"
  if q gcloud storage buckets describe "gs://$BUCKET" --project "$PROJECT_ID" --format='value(name)' | grep -qx "$BUCKET"; then
    ok "Bucket gs://$BUCKET exists - skipping"
  else
    note "A plain private Cloud Storage bucket (not the Firebase default bucket); only Wayfare's service account gets access."
    run gcloud storage buckets create "gs://$BUCKET" --project "$PROJECT_ID" --location="$REGION" --uniform-bucket-level-access --public-access-prevention
  fi
  state_save
}

smtp_part() { # smtp_part host|port|user  -> component of the current SMTP_URL (user decoded)
  node -e 'try{const u=new URL(process.argv[1]);const p={host:u.hostname,port:u.port||(u.protocol==="smtps:"?"465":"587"),user:decodeURIComponent(u.username)};console.log(p[process.argv[2]]||"")}catch{}' "$(env_get SMTP_URL)" "$1"
}

# Asks for host / port / user in the clear and only the password hidden, then builds a correctly
# URL-encoded SMTP_URL (a hand-typed URL with hidden input is too easy to get wrong).
smtp_setup() {
  local host port user pass url cur_host="" cur_port="" cur_user=""
  if env_has SMTP_URL && v_smtp_opt "$(env_get SMTP_URL)"; then
    cur_host=$(smtp_part host); cur_port=$(smtp_part port); cur_user=$(smtp_part user)
  fi
  note "Gmail: host smtp.gmail.com, port 465, user = your Gmail address, password = an app password"
  note "      (https://myaccount.google.com/apppasswords, needs 2-step verification). MAIL_FROM should be that address."
  while true; do
    ask host "SMTP host (e.g. smtp.gmail.com):" "$cur_host" v_hostname
    ask port "SMTP port (465 = TLS, 587 = STARTTLS):" "${cur_port:-465}" v_port
    ask user "SMTP user name (often the full e-mail address):" "${cur_user:-$(env_get WAYFARE_ADMIN_EMAILS | cut -d, -f1)}" v_nonempty
    ask_secret pass "SMTP password:" v_nonempty
    [ "$host" = smtp.gmail.com ] && pass=${pass// /} # app passwords are displayed in groups of four
    url=$(node -e 'const [h,p,u,pw]=process.argv.slice(1);console.log(`${p==="465"?"smtps":"smtp"}://${encodeURIComponent(u)}:${encodeURIComponent(pw)}@${h}:${p}`)' "$host" "$port" "$user" "$pass")
    SECRET_MASKS+=("$url" "$(node -e 'console.log(encodeURIComponent(process.argv[1]))' "$pass")")
    if v_smtp_opt "$url"; then
      env_set SMTP_URL "$url"
      ok "SMTP_URL set (host $host, port $port, user $user)."
      return 0
    fi
    warn "Could not build a valid SMTP URL from these values, please try again."
  done
}

default_base_url() { printf 'https://%s--%s.%s.hosted.app' "$BACKEND" "$PROJECT_ID" "$REGION"; }

step_config() {
  step 8 "Instance configuration ($SECRET_NAME)"
  local prompts=0
  if q gcloud secrets describe "$SECRET_NAME" --project "$PROJECT_ID" --format='value(name)' | grep -q .; then
    ENV_BASELINE=$(q gcloud secrets versions access latest --secret="$SECRET_NAME" --project "$PROJECT_ID" || true)
    env_parse "$ENV_BASELINE"
    ok "Existing $SECRET_NAME found - merging (WAYFARE_SECRET / CRON_SECRET stay stable)."
    local k
    for k in WAYFARE_SECRET CRON_SECRET; do [ -n "${E[$k]-}" ] && SECRET_MASKS+=("${E[$k]}"); done
  else
    run gcloud secrets create "$SECRET_NAME" --replication-policy=automatic --project "$PROJECT_ID"
  fi
  if [ "$RECONFIGURE" = 1 ] || ! env_has WAYFARE_ADMIN_EMAILS; then prompts=1; fi

  # --- generated, stable secrets
  if ! env_has WAYFARE_SECRET; then env_set WAYFARE_SECRET "$(rand_b64url 48)"; note "generated WAYFARE_SECRET"; fi
  if ! env_has CRON_SECRET; then env_set CRON_SECRET "$(rand_b64url 32)"; note "generated CRON_SECRET"; fi
  SECRET_MASKS+=("$(env_get WAYFARE_SECRET)" "$(env_get CRON_SECRET)")

  # --- derived / fixed values
  env_set FIREBASE_STORAGE_BUCKET "$BUCKET"
  env_has WAYFARE_TRUSTED_PROXIES || env_set WAYFARE_TRUSTED_PROXIES 2
  local pattern_url
  pattern_url=$(default_base_url)

  if [ "$prompts" = 1 ]; then
    local admin def_admin v
    def_admin=$(env_get WAYFARE_ADMIN_EMAILS)
    [ -n "$def_admin" ] || { is_email "${GCLOUD_ACCOUNT:-}" && def_admin=$GCLOUD_ACCOUNT; } || def_admin=""
    note "Admins manage users and settings. The admin e-mail must sign in with a VERIFIED method (Google login or magic link)."
    ask admin "Admin e-mail address(es), comma separated:" "$def_admin" v_email_list
    env_set WAYFARE_ADMIN_EMAILS "${admin// /}"

    local first=${admin%%,*}
    ask v "Sender address for mails (MAIL_FROM):" "$(env_has MAIL_FROM && env_get MAIL_FROM || echo "Wayfare <${first// /}>")" v_mail_from
    env_set MAIL_FROM "$v"

    note "Custom domain: connect it first in the Firebase console (App Hosting -> Settings -> Domains). Leave empty for the *.hosted.app URL."
    local cur_base custom=""
    cur_base=$(env_get WAYFARE_BASE_URL)
    [ -n "$cur_base" ] && [ "$cur_base" != "$pattern_url" ] && custom=$cur_base
    ask custom "Custom domain URL (https://...), or empty:" "$custom" v_https_url_opt
    custom=${custom%/}
    if [ -n "$custom" ]; then
      env_set WAYFARE_BASE_URL "$custom"
      CUSTOM_DOMAIN=1
    else
      env_set WAYFARE_BASE_URL "$pattern_url"
    fi
    BASE_URL=$(env_get WAYFARE_BASE_URL)

    note "SMTP is needed for magic-link sign-in and notifications in production (without it mails are only logged)."
    if env_has SMTP_URL && v_smtp_opt "$(env_get SMTP_URL)"; then
      if ask_yn "SMTP is configured (host: $(smtp_part host)). Change it?" n; then smtp_setup; fi
    elif ask_yn "Configure SMTP now?" n; then
      smtp_setup
    fi

    if ask_yn "Enable Google sign-in?" n; then
      info "Create an OAuth client (type: Web application):"
      info "  consent screen:  https://console.cloud.google.com/apis/credentials/consent?project=$PROJECT_ID"
      info "  create client:   https://console.cloud.google.com/apis/credentials/oauthclient?project=$PROJECT_ID"
      info "  Authorized redirect URI: ${BASE_URL}/api/auth/callback/google"
      ask v "Google client ID:" "$(env_get AUTH_GOOGLE_ID)" v_nonempty
      env_set AUTH_GOOGLE_ID "$v"
      ask_secret v "Google client secret:" v_nonempty
      env_set AUTH_GOOGLE_SECRET "$v"
    fi
    local prov
    for prov in apple facebook discord; do
      if ask_yn "Enable ${prov^} sign-in?" n; then
        info "  Setup guide: https://nullthrone.github.io/wayfare/en/operator/authentication"
        info "  Redirect URI: ${BASE_URL}/api/auth/callback/${prov}"
        ask v "${prov^} client ID:" "$(env_get "AUTH_${prov^^}_ID")" v_nonempty
        env_set "AUTH_${prov^^}_ID" "$v"
        ask_secret v "${prov^} client secret:" v_nonempty
        env_set "AUTH_${prov^^}_SECRET" "$v"
        if [ "$prov" = apple ]; then
          ask v "Apple bundle ID (optional):" "$(env_get AUTH_APPLE_BUNDLE_ID)"
          [ -n "$v" ] && env_set AUTH_APPLE_BUNDLE_ID "$v"
        fi
      fi
    done

    if [ "$WANT_PHOTO_IMPORT" = yes ]; then
      if env_has AUTH_GOOGLE_ID; then
        ok "Google photo import reuses your Google sign-in OAuth client (${BASE_URL}/api/auth/callback/google)."
        note "Make sure the OAuth consent screen includes the scopes 'photospicker.mediaitems.readonly' and 'drive.file'."
      else
        info "Google photo import: create a Web OAuth client with authorized redirect URI: ${BASE_URL}/api/sources/callback"
        ask v "OAuth client ID for photo import:" "$(env_get GOOGLE_SOURCES_CLIENT_ID)" v_nonempty
        env_set GOOGLE_SOURCES_CLIENT_ID "$v"
        ask_secret v "OAuth client secret for photo import:" v_nonempty
        env_set GOOGLE_SOURCES_CLIENT_SECRET "$v"
      fi
      info "  API key (for the Drive Picker): https://console.cloud.google.com/apis/credentials?project=$PROJECT_ID -> Create credentials -> API key"
      note "  (If you restrict the API key to specific APIs, include 'Google Picker API' / picker.googleapis.com.)"
      ask_secret v "GOOGLE_API_KEY (empty = skip):"
      [ -n "$v" ] && env_set GOOGLE_API_KEY "$v"
    fi

    ask v "Trusted proxies in front of the app (measured automatically in step 11):" "$(env_get WAYFARE_TRUSTED_PROXIES)" v_int_0_10
    env_set WAYFARE_TRUSTED_PROXIES "$v"
  else
    ok "Configuration present - not asking again (use --reconfigure to change it)."
    env_has WAYFARE_BASE_URL || env_set WAYFARE_BASE_URL "$pattern_url"
    BASE_URL=$(env_get WAYFARE_BASE_URL)
    [ "$BASE_URL" = "$pattern_url" ] || CUSTOM_DOMAIN=1
  fi
  [ "$WANT_PHOTO_IMPORT" = yes ] && env_set GOOGLE_APP_ID "$PROJECT_NUMBER"

  # A malformed SMTP_URL stops the app at startup - never store one.
  if env_has SMTP_URL && ! v_smtp_opt "$(env_get SMTP_URL)"; then
    warn "The stored SMTP_URL is malformed (expected smtps://user:password@smtp.example.com:465)."
    if [ "$ASSUME_YES" != 1 ] && ask_yn "Re-enter the SMTP settings now? (no = remove SMTP_URL)" y; then
      smtp_setup
    else
      env_set SMTP_URL ""
      warn "SMTP_URL removed - mails are only logged until you run this script with --reconfigure."
    fi
  fi

  echo
  info "Configuration to be stored (secrets masked):"
  env_summary
  env_save
  state_save
}

discover_base_url() { # sets BASE_URL if the backend reports a different default URL
  local uri
  uri=$(q firebase apphosting:backends:list --project "$PROJECT_ID" --json | json_eval '(function(){let out="";(function w(o){if(!o||typeof o!=="object")return;if(typeof o.name==="string"&&o.name.endsWith("/backends/"+args[0])&&o.uri)out=o.uri;for(const v of Object.values(o))w(v)})(j);return out})()' "$BACKEND" || true)
  [ -n "$uri" ] || return 0
  [[ $uri == http* ]] || uri="https://$uri"
  uri=${uri%/}
  local pattern
  pattern=$(default_base_url)
  if [ "$CUSTOM_DOMAIN" = 0 ] && [ "$uri" != "$pattern" ]; then
    warn "The backend URL is $uri (expected $pattern). Updating WAYFARE_BASE_URL."
    env_set WAYFARE_BASE_URL "$uri"
    BASE_URL=$uri
    env_save
  fi
}

step_backend() {
  step 9 "App Hosting backend and permissions"
  local exists=0
  if q firebase apphosting:backends:list --project "$PROJECT_ID" --json | json_eval '(function(){let f=false;(function w(o){if(!o||typeof o!=="object")return;if(typeof o.name==="string"&&o.name.endsWith("/backends/"+args[0]))f=true;for(const v of Object.values(o))w(v)})(j);return f?"yes":""})()' "$BACKEND" | grep -q yes; then exists=1; fi
  if [ "$exists" = 1 ]; then
    ok "Backend '$BACKEND' exists - skipping"
  else
    note "Creating the backend without a GitHub connection (code is deployed from this checkout / GitHub Actions)."
    if ! capture firebase apphosting:backends:create --backend "$BACKEND" --primary-region "$REGION" --project "$PROJECT_ID" --non-interactive; then
      printf '%s\n' "$LAST_OUT" >&2
      warn "The non-interactive create failed (it may insist on a GitHub connection)."
      if [ "$ASSUME_YES" = 1 ]; then die "Create the backend manually: firebase apphosting:backends:create --project $PROJECT_ID  (backend ID: $BACKEND, region: $REGION; choose to deploy from local source / skip the GitHub connection), then re-run."; fi
      info "Falling back to the interactive command. Use backend ID '$BACKEND', region '$REGION',"
      info "and choose to deploy from LOCAL SOURCE / skip connecting a GitHub repository."
      firebase apphosting:backends:create --project "$PROJECT_ID" || die "Backend creation failed."
    fi
    ok "Backend '$BACKEND' created."
  fi
  [ "$DRY_RUN" = 1 ] || discover_base_url

  # Compute service account (name verified at runtime)
  if ! q gcloud iam service-accounts describe "$COMPUTE_SA" --project "$PROJECT_ID" --format='value(email)' | grep -q .; then
    local found
    found=$(q gcloud iam service-accounts list --project "$PROJECT_ID" --format='value(email)' | grep -i 'app-hosting' | head -n1 || true)
    if [ -n "$found" ]; then
      COMPUTE_SA=$found
    elif [ "$DRY_RUN" != 1 ]; then
      warn "Could not find the App Hosting compute service account (expected $COMPUTE_SA)."
      ask COMPUTE_SA "Service account e-mail used by the backend (see Cloud Run -> $BACKEND -> Security):" "$COMPUTE_SA" is_email
    fi
  fi
  ok "Backend service account: $COMPUTE_SA"

  info "Granting the backend access to the secret and data ..."
  if ! capture firebase apphosting:secrets:grantaccess "$SECRET_NAME" --backend "$BACKEND" --location "$REGION" --project "$PROJECT_ID"; then
    warn "firebase apphosting:secrets:grantaccess failed - granting secretAccessor directly."
    printf '%s\n' "$LAST_OUT" >&2
    run gcloud secrets add-iam-policy-binding "$SECRET_NAME" --project "$PROJECT_ID" --member="serviceAccount:$COMPUTE_SA" --role=roles/secretmanager.secretAccessor --quiet
  fi
  run gcloud projects add-iam-policy-binding "$PROJECT_ID" --member="serviceAccount:$COMPUTE_SA" --role=roles/datastore.user --condition=None --quiet >/dev/null
  run gcloud storage buckets add-iam-policy-binding "gs://$BUCKET" --member="serviceAccount:$COMPUTE_SA" --role=roles/storage.objectAdmin --project "$PROJECT_ID" --quiet >/dev/null
  ok "IAM granted: roles/datastore.user (project), roles/storage.objectAdmin (bucket)"
}

deploy_all() { # deploy_all targets
  if [ "$DRY_RUN" = 1 ]; then
    run firebase deploy --only "$1" --project "$PROJECT_ID" --non-interactive
  else
    (cd "$CLONE_DIR" && show_cmd firebase deploy --only "$1" --project "$PROJECT_ID" --non-interactive && firebase deploy --only "$1" --project "$PROJECT_ID" --non-interactive)
  fi
}

step_deploy() {
  step 10 "First deployment"
  if [ "$DRY_RUN" = 1 ]; then
    note "(dry run) would write $CLONE_DIR/.firebaserc with project $PROJECT_ID"
  else
    printf '{\n  "projects": {\n    "default": "%s"\n  }\n}\n' "$PROJECT_ID" >"$CLONE_DIR/.firebaserc"
    grep -qx '.firebaserc' "$CLONE_DIR/.git/info/exclude" 2>/dev/null || echo '.firebaserc' >>"$CLONE_DIR/.git/info/exclude"
  fi
  info "Deploying Firestore rules/indexes and the App Hosting backend. The build takes about 5-10 minutes."
  deploy_all "firestore:rules,firestore:indexes,apphosting:${BACKEND}"
  ok "Deployment submitted."
}

wait_health() { # wait_health TIMEOUT_SECONDS -> rc 0 when /api/health answers 200
  local timeout=$1 deadline code
  deadline=$((SECONDS + timeout))
  while true; do
    code=$(curl -4 -s -o /dev/null -m 20 -w '%{http_code}' "$BASE_URL/api/health" 2>/dev/null || true)
    [ "$code" = 200 ] && return 0
    [ "$DRY_RUN" = 1 ] && return 1
    [ "$SECONDS" -ge "$deadline" ] && return 1
    printf '.'
    sleep 15
  done
}

step_measure() {
  step 11 "Health check and proxy measurement"
  info "Waiting for $BASE_URL/api/health (up to 10 minutes) ..."
  if ! wait_health 600; then
    echo
    if [ "$DRY_RUN" = 1 ]; then
      warn "(dry run) app not reachable - skipping the measurement."
      return 0
    fi
    warn "The app did not answer with 200 in time. Check the rollout: https://console.firebase.google.com/project/$PROJECT_ID/apphosting"
    warn "Re-run this script later to repeat the measurement. Continuing."
    return 0
  fi
  echo
  ok "Wayfare is up at $BASE_URL"

  local ip diag chain pos="" n i
  ip=$(curl -4 -fsS -m 10 https://checkip.amazonaws.com 2>/dev/null | tr -d '[:space:]' || true)
  [ -n "$ip" ] || ip=$(curl -4 -fsS -m 10 https://api.ipify.org 2>/dev/null | tr -d '[:space:]' || true)
  diag=$(curl -4 -fsS -m 20 "$BASE_URL/api/health?diag=forwarded" 2>/dev/null || true)
  chain=$(json_eval 'Array.isArray(j.forwardedFor)?j.forwardedFor.join(" "):""' <<<"$diag" || true)
  if [ -z "$ip" ] || [ -z "$chain" ]; then
    warn "Could not measure the proxy chain (my public IP: '${ip:-?}', forwardedFor: '${chain:-none}'). The deployed version may predate the diagnostics endpoint."
    warn "Keeping WAYFARE_TRUSTED_PROXIES=$(env_get WAYFARE_TRUSTED_PROXIES). Re-run after updating."
    return 0
  fi
  read -r -a arr <<<"$chain"
  n=${#arr[@]}
  for ((i = n - 1; i >= 0; i--)); do
    if [ "${arr[$i]}" = "$ip" ]; then
      pos=$((n - i))
      break
    fi
  done
  info "X-Forwarded-For seen by the app: ${chain// /, }   (my IP: $ip)"
  if [ -z "$pos" ]; then
    warn "Your IP is not in the chain, so the position can't be derived. Keeping WAYFARE_TRUSTED_PROXIES=$(env_get WAYFARE_TRUSTED_PROXIES)."
    return 0
  fi
  ok "The client is entry #$pos from the right -> WAYFARE_TRUSTED_PROXIES=$pos"
  if [ "$pos" != "$(env_get WAYFARE_TRUSTED_PROXIES)" ]; then
    info "Configured value is $(env_get WAYFARE_TRUSTED_PROXIES). A wrong value makes rate limiting (password albums) use the wrong IP, so I'll correct it."
    env_set WAYFARE_TRUSTED_PROXIES "$pos"
    env_save
    info "The new configuration only takes effect with a new rollout (App Hosting pins secret versions when it deploys)."
    if ask_yn "Re-deploy now (about 5-10 minutes)?" y; then
      deploy_all "apphosting:${BACKEND}"
      ok "Re-deploy submitted."
    else
      warn "Not re-deployed. Run: cd $CLONE_DIR && firebase deploy --only apphosting:${BACKEND} --project $PROJECT_ID"
    fi
  else
    ok "Matches the configured value - nothing to change."
  fi
}

default_timezone() {
  local tz=${TZ:-}
  [ -n "$tz" ] || tz=$(q timedatectl show -p Timezone --value || true)
  case "$tz" in "" | UTC | Etc/UTC | Etc/*) tz=Europe/Berlin ;; esac
  printf '%s' "$tz"
}

step_scheduler() {
  step 12 "Daily digest (Cloud Scheduler)"
  if ! ask_yn "Create a Cloud Scheduler job that triggers the daily e-mail digest (07:00)?" y; then
    note "Skipped. Create it later with: gcloud scheduler jobs create http $SCHEDULER_JOB ... (see docs)"
    return 0
  fi
  [ -n "$TIMEZONE" ] || TIMEZONE=$(default_timezone)
  ask TIMEZONE "Time zone (IANA name):" "$TIMEZONE" v_timezone
  state_save
  local cron_secret verb=create
  cron_secret=$(env_get CRON_SECRET)
  if q gcloud scheduler jobs describe "$SCHEDULER_JOB" --location "$REGION" --project "$PROJECT_ID" --format='value(name)' | grep -q .; then verb=update; fi
  run gcloud scheduler jobs "$verb" http "$SCHEDULER_JOB" --project "$PROJECT_ID" --location "$REGION" \
    --schedule="0 7 * * *" --time-zone="$TIMEZONE" --uri="${BASE_URL}/api/cron/digest" --http-method=POST \
    --headers="Authorization=Bearer ${cron_secret}"
  ok "Scheduler job $SCHEDULER_JOB ${verb}d (daily 07:00 $TIMEZONE)."
  note "Note: if you change CRON_SECRET later, run this step again (re-run the script) to update the job."
}

gh_slug_from_url() { # https://github.com/o/r(.git) | git@github.com:o/r.git -> o/r
  sed -E 's#^(https?://|ssh://)?(git@)?github\.com[:/]##; s#\.git$##; s#/+$##' <<<"$1"
}

step_github() {
  step 13 "GitHub release deployments (optional)"
  note "Lets GitHub Actions deploy to this project whenever you publish a GitHub Release (keyless, via workload identity federation)."
  if ! ask_yn "Set up GitHub Actions release deployments?" n; then
    note "Skipped. Re-run the script any time to add it."
    return 0
  fi
  local def_repo
  def_repo=${GH_REPO:-$(gh_slug_from_url "$(q git -C "$CLONE_DIR" remote get-url origin || echo "$REPO_URL")")}
  ask GH_REPO "GitHub repository (OWNER/REPO) that should be allowed to deploy:" "$def_repo" v_gh_repo
  state_save

  local owner_repo_id provider sa wif_provider principal
  provider="github-$(tr '[:upper:]/_.' '[:lower:]---' <<<"$GH_REPO")"
  provider=${provider:0:32}
  provider=${provider%-}
  sa="${DEPLOYER_NAME}@${PROJECT_ID}.iam.gserviceaccount.com"
  wif_provider="projects/${PROJECT_NUMBER}/locations/global/workloadIdentityPools/${WIF_POOL}/providers/${provider}"
  principal="principalSet://iam.googleapis.com/projects/${PROJECT_NUMBER}/locations/global/workloadIdentityPools/${WIF_POOL}/attribute.repository/${GH_REPO}"
  owner_repo_id=$GH_REPO

  if q gcloud iam workload-identity-pools describe "$WIF_POOL" --location=global --project "$PROJECT_ID" --format='value(name)' | grep -q .; then
    ok "Workload identity pool '$WIF_POOL' exists"
  else
    run gcloud iam workload-identity-pools create "$WIF_POOL" --location=global --project "$PROJECT_ID" --display-name="GitHub Actions"
  fi
  if q gcloud iam workload-identity-pools providers describe "$provider" --location=global --workload-identity-pool="$WIF_POOL" --project "$PROJECT_ID" --format='value(name)' | grep -q .; then
    ok "OIDC provider '$provider' exists"
  else
    run gcloud iam workload-identity-pools providers create-oidc "$provider" --location=global --workload-identity-pool="$WIF_POOL" --project "$PROJECT_ID" \
      --issuer-uri=https://token.actions.githubusercontent.com \
      --attribute-mapping="google.subject=assertion.sub,attribute.repository=assertion.repository,attribute.repository_owner=assertion.repository_owner" \
      --attribute-condition="assertion.repository=='${owner_repo_id}'"
  fi
  if q gcloud iam service-accounts describe "$sa" --project "$PROJECT_ID" --format='value(email)' | grep -q .; then
    ok "Deploy service account $sa exists"
  else
    run gcloud iam service-accounts create "$DEPLOYER_NAME" --project "$PROJECT_ID" --display-name="Wayfare GitHub deployer"
  fi
  note "Deploy roles below are a best-effort set and NOT verified as least-privilege; review them for your needs."
  local role
  for role in roles/firebaseapphosting.admin roles/firebaserules.admin roles/datastore.indexAdmin roles/serviceusage.serviceUsageConsumer \
    roles/storage.admin roles/cloudbuild.builds.editor roles/secretmanager.viewer roles/firebase.viewer; do
    run gcloud projects add-iam-policy-binding "$PROJECT_ID" --member="serviceAccount:$sa" --role="$role" --condition=None --quiet >/dev/null
  done
  run gcloud iam service-accounts add-iam-policy-binding "$COMPUTE_SA" --project "$PROJECT_ID" --member="serviceAccount:$sa" --role=roles/iam.serviceAccountUser --quiet >/dev/null
  run gcloud iam service-accounts add-iam-policy-binding "$sa" --project "$PROJECT_ID" --member="$principal" --role=roles/iam.workloadIdentityUser --quiet >/dev/null
  ok "Workload identity federation ready for $GH_REPO"

  local vars=("FIREBASE_PROJECT_ID=$PROJECT_ID" "GCP_WIF_PROVIDER=$wif_provider" "GCP_DEPLOY_SA=$sa" "APPHOSTING_REGION=$REGION")
  [ "$CUSTOM_DOMAIN" = 1 ] && vars+=("WAYFARE_PUBLIC_URL=$BASE_URL")
  [ "$GH_REPO" != "nullthrone/wayfare" ] && vars+=("FIREBASE_DEPLOY_ENABLED=true")

  local set_auto=0
  if command -v gh >/dev/null 2>&1 && q gh auth status >/dev/null 2>&1; then
    ask_yn "Set these repository variables on $GH_REPO with the gh CLI now?" y && set_auto=1
  fi
  local kv
  if [ "$set_auto" = 1 ]; then
    for kv in "${vars[@]}"; do run gh variable set "${kv%%=*}" --body "${kv#*=}" --repo "$GH_REPO"; done
    ok "Repository variables set."
  else
    info "Set these repository VARIABLES (GitHub: $GH_REPO -> Settings -> Secrets and variables -> Actions -> Variables):"
    for kv in "${vars[@]}"; do info "    ${kv%%=*} = ${kv#*=}"; done
    info "Or with the gh CLI:"
    for kv in "${vars[@]}"; do info "    gh variable set ${kv%%=*} --repo $GH_REPO --body '${kv#*=}'"; done
  fi
  info "Optionally protect the 'production' environment (Settings -> Environments) with required reviewers."
  info "Then publish a GitHub Release (e.g. v0.1.0) to deploy."
}
v_gh_repo() { [[ $1 =~ ^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$ ]]; }

step_summary() {
  step 14 "Done"
  local admin
  admin=$(env_get WAYFARE_ADMIN_EMAILS)
  cat <<EOF

${GREEN}${BOLD}Wayfare is deployed.${RESET}

  URL:            ${BASE_URL}
  Project:        ${PROJECT_ID} (region ${REGION}, Firestore ${FS_LOCATION})
  Media bucket:   gs://${BUCKET} (private)
  Config secret:  ${SECRET_NAME}  (https://console.cloud.google.com/security/secret-manager?project=${PROJECT_ID})
  Admin e-mail:   ${admin}

${BOLD}Sign in as admin${RESET}
  Open the URL and sign in with the admin e-mail using a VERIFIED method: Google login, or a magic link
  (needs SMTP_URL). E-mail + password only works after the address is verified.

${BOLD}Next steps${RESET}
  - Costs: set a budget alert in Billing (Billing -> Budgets & alerts).
  - Add the redirect URIs shown in step 8 to your OAuth clients (sign-in: ${BASE_URL}/api/auth/callback/<provider>).
  - Custom domain: App Hosting -> Settings -> Domains, then re-run with --reconfigure to set the URL.
  - Legal pages (imprint/privacy): /admin -> Settings.

${BOLD}Later${RESET}
  Re-run / repair:      bash <(curl -fsSL https://raw.githubusercontent.com/nullthrone/wayfare/main/scripts/firebase-bootstrap.sh)
  Change configuration: run the script again with --reconfigure (merges; secrets stay stable)
  Update the app:       publish a GitHub Release (if step 13 was set up), or:
                        cd ${CLONE_DIR} && git pull && firebase deploy --only apphosting:${BACKEND} --project ${PROJECT_ID}
  Docs:                 ${DOCS_URL}

${BOLD}Tear down${RESET} (NOT executed; irreversible - this deletes your data):
  firebase apphosting:backends:delete ${BACKEND} --project ${PROJECT_ID} --location ${REGION}
  gcloud scheduler jobs delete ${SCHEDULER_JOB} --location ${REGION} --project ${PROJECT_ID}
  gcloud storage rm -r gs://${BUCKET}                      # all photos
  gcloud firestore databases delete --database='(default)' --project ${PROJECT_ID}
  gcloud secrets delete ${SECRET_NAME} --project ${PROJECT_ID}
  gcloud iam service-accounts delete ${DEPLOYER_NAME}@${PROJECT_ID}.iam.gserviceaccount.com --project ${PROJECT_ID}
  gcloud iam workload-identity-pools delete ${WIF_POOL} --location=global --project ${PROJECT_ID}
  # or remove everything at once:
  gcloud projects delete ${PROJECT_ID}

EOF
  [ "$DRY_RUN" = 1 ] && warn "That was a dry run: nothing was created."
  return 0
}

# ----------------------------------------------------------------------------- main
main() {
  while [ $# -gt 0 ]; do
    case "$1" in
      --yes | -y) ASSUME_YES=1 ;;
      --dry-run) DRY_RUN=1 ;;
      --reconfigure) RECONFIGURE=1 ;;
      --project)
        [ $# -ge 2 ] || die "--project needs a value"
        PROJECT_ID=$2
        shift
        ;;
      --repo)
        [ $# -ge 2 ] || die "--repo needs a value"
        REPO_URL=$2
        shift
        ;;
      --branch)
        [ $# -ge 2 ] || die "--branch needs a value"
        BRANCH=$2
        shift
        ;;
      --help | -h)
        usage
        exit 0
        ;;
      *) die "Unknown option: $1 (see --help)" ;;
    esac
    shift
  done
  [ -z "$PROJECT_ID" ] || v_project_id "$PROJECT_ID" || die "Invalid --project '$PROJECT_ID'."
  state_load

  printf '%s%sWayfare - Firebase bootstrap%s\n' "$BOLD" "$CYAN" "$RESET"
  GCLOUD_ACCOUNT=""
  step_preflight
  step_source
  step_project
  step_billing
  step_apis
  step_regions
  step_data
  step_config
  step_backend
  step_deploy
  step_measure
  step_scheduler
  step_github
  step_summary
}

main "$@"
