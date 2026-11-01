#!/usr/bin/env bash
# Smoke test for scripts/firebase-bootstrap.sh: runs the whole flow with stubbed gcloud / firebase / curl
# on PATH. Nothing touches Google Cloud. Usage: bash scripts/test/bootstrap-dry-run.sh
set -Eeuo pipefail

here=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
script="$here/../firebase-bootstrap.sh"
work=$(mktemp -d)
trap '[ -n "${KEEP:-}" ] || rm -rf "$work"' EXIT
stubs="$work/bin"
mkdir -p "$stubs"
export STUB_LOG="$work/calls.log"

# ------------------------------------------------------------------ stubs
cat >"$stubs/gcloud" <<'EOF'
#!/usr/bin/env bash
echo "gcloud $*" >>"$STUB_LOG"
a="$*"
has() { [[ $a == *"$1"* ]]; }
resume() { [ "${STUB_RESUME:-0}" = 1 ]; }
case "$a" in
  "version"*) echo "Google Cloud SDK 500.0.0" ;;
  "auth list"*) echo "dev@example.com" ;;
  "projects list"*) printf 'wayfare-demo\tWayfare Demo\n' ;;
  "projects describe"*) has projectNumber && echo 123456789012 || echo wayfare-demo ;;
  "billing projects describe"*) resume && echo True || echo False ;;
  "billing projects link"*) if [ "${STUB_LINK_FAIL:-0}" = 1 ]; then echo "ERROR: (gcloud.billing.projects.link) simulated failure" >&2; exit 1; fi ;;
  "billing accounts list"*) printf '0123-4567-89AB\tPersonal\n' ;;
  "firestore databases list"*)
    if resume; then has locationId && printf 'projects/wayfare-demo/databases/(default)\teurope-west4\n' || echo 'projects/wayfare-demo/databases/(default)'; fi ;;
  "storage buckets describe"*) resume && echo wayfare-demo-wayfare-media || exit 1 ;;
  "secrets describe"*) resume && echo projects/1/secrets/WAYFARE_ENV || exit 1 ;;
  "secrets versions access"*)
    resume || exit 1
    printf '%s\n' 'WAYFARE_SECRET=SEKRET-do-not-leak-0123456789-0123456789-abcdef' 'CRON_SECRET=CRON-do-not-leak-0123456789' \
      'FIREBASE_STORAGE_BUCKET=wayfare-demo-wayfare-media' 'WAYFARE_TRUSTED_PROXIES=2' 'WAYFARE_ADMIN_EMAILS=dev@example.com' \
      'MAIL_FROM="Wayfare <dev@example.com>"' 'WAYFARE_BASE_URL=https://wayfare--wayfare-demo.europe-west4.hosted.app' ;;
  "iam service-accounts describe"*) resume && echo "x@y" || exit 1 ;;
  "iam service-accounts list"*) echo "firebase-app-hosting-compute@wayfare-demo.iam.gserviceaccount.com" ;;
  "iam workload-identity-pools describe"*|"iam workload-identity-pools providers describe"*) resume && echo name || exit 1 ;;
  "scheduler jobs describe"*) resume && echo job || exit 1 ;;
  *) exit 0 ;;
esac
EOF
cat >"$stubs/firebase" <<'EOF'
#!/usr/bin/env bash
echo "firebase $*" >>"$STUB_LOG"
case "$*" in
  "--version"*) echo "15.0.0" ;;
  "projects:list"*) if [ "${STUB_RESUME:-0}" = 1 ]; then echo '{"status":"success","result":[{"projectId":"wayfare-demo"}]}'; else echo '{"status":"success","result":[]}'; fi ;;
  "apphosting:backends:list"*)
    if [ "${STUB_RESUME:-0}" = 1 ]; then echo '{"status":"success","result":{"backends":[{"name":"projects/wayfare-demo/locations/europe-west4/backends/wayfare","uri":"wayfare--wayfare-demo.europe-west4.hosted.app"}]}}'
    else echo '{"status":"success","result":{"backends":[]}}'; fi ;;
  *) exit 0 ;;
esac
EOF
cat >"$stubs/curl" <<'EOF'
#!/usr/bin/env bash
echo "curl $*" >>"$STUB_LOG"
a="$*"
case "$a" in
  *checkip.amazonaws.com*|*ipify*) echo "203.0.113.7" ;;
  *diag=forwarded*) echo "{\"status\":\"ok\",\"forwardedFor\":${STUB_XFF:-[\"203.0.113.7\",\"34.1.2.3\"]},\"trustedProxies\":2}" ;;
  *http_code*) printf 200 ;;
  *) echo '{"status":"ok"}' ;;
esac
EOF
chmod +x "$stubs"/*

fail=0
check() { # check "description" pattern file [-v]
  if [ "${4:-}" = "-v" ]; then
    if grep -Eq -- "$2" "$3"; then echo "  FAIL: $1 (unexpected /$2/)"; fail=1; else echo "  ok:   $1"; fi
  elif grep -Eq -- "$2" "$3"; then echo "  ok:   $1"; else echo "  FAIL: $1 (missing /$2/)"; fail=1; fi
}
mutating_calls() { # calls that would change cloud state; must be empty in --dry-run
  grep -E '^(gcloud|firebase) ' "$STUB_LOG" | grep -Ev '^gcloud (version|auth list|projects (list|describe)|billing (projects describe|accounts list)|firestore databases list|storage buckets describe|secrets (describe|versions access)|iam (service-accounts (describe|list)|workload-identity-pools (describe|providers describe))|scheduler jobs describe)|^firebase (--version|projects:list|apphosting:backends:list)' || true
}
scenario() { # scenario NAME resume(0|1) [env...] -- args...
  local name=$1 resume=$2 out="$work/$1.out"
  shift 2
  : >"$STUB_LOG"
  local envs=()
  while [ "$1" != "--" ]; do envs+=("$1"); shift; done
  shift
  echo "== scenario: $name"
  set +e
  env HOME="$work/home-$name" PATH="$stubs:$PATH" STUB_RESUME="$resume" WAYFARE_BOOTSTRAP_STDIN=1 "${envs[@]}" \
    bash "$script" "$@" >"$out" 2>&1 <"${STDIN_FILE:-/dev/null}"
  RC=$?
  set -e
  OUT=$out
}

# ------------------------------------------------------------------ A: fresh project, all defaults
mkdir -p "$work/home-fresh"
scenario fresh 0 STUB_XFF='["6.6.6.6","203.0.113.7","10.0.0.1","10.0.0.2"]' -- --dry-run --yes --project wayfare-demo --repo https://github.com/nullthrone/wayfare
[ "$RC" = 0 ] || { echo "  FAIL: exit code $RC"; tail -20 "$OUT"; fail=1; }
check "all 14 steps shown" '\[14/14\]' "$OUT"
check "billing linked (printed)" 'billing projects link wayfare-demo --billing-account=0123-4567-89AB' "$OUT"
check "APIs enabled" 'services enable firebase\.googleapis\.com' "$OUT"
check "firestore created" 'firestore databases create .*--location=europe-west4' "$OUT"
check "private bucket created" 'buckets create gs://wayfare-demo-wayfare-media .*--public-access-prevention' "$OUT"
check "secret created" 'secrets create WAYFARE_ENV --replication-policy=automatic' "$OUT"
check "secret version added via stdin" 'printf %s .*gcloud secrets versions add WAYFARE_ENV --data-file=-' "$OUT"
check "backend created" 'apphosting:backends:create --backend wayfare --primary-region europe-west4' "$OUT"
check "secret access granted" 'apphosting:secrets:grantaccess WAYFARE_ENV --backend wayfare --location europe-west4' "$OUT"
check "datastore.user granted" 'roles/datastore\.user' "$OUT"
check "deploy" 'firebase deploy --only firestore:rules,firestore:indexes,apphosting:wayfare --project wayfare-demo --non-interactive' "$OUT"
check "XFF measured at position 3" 'WAYFARE_TRUSTED_PROXIES=3' "$OUT"
check "redeploy after correction" 'firebase deploy --only apphosting:wayfare' "$OUT"
check "scheduler job created" 'scheduler jobs create http wayfare-digest' "$OUT"
check "cron secret masked in printed command" 'Authorization=Bearer \*\*\*\*' "$OUT"
check "secrets masked in summary" 'WAYFARE_SECRET=\*\*\*\* ' "$OUT"
check "teardown printed" 'gcloud projects delete wayfare-demo' "$OUT"
[ ! -e "$work/home-fresh/.config/wayfare/bootstrap.env" ] && echo "  ok:   dry-run wrote no state file" || { echo "  FAIL: state file written in dry-run"; fail=1; }
m=$(mutating_calls)
[ -z "$m" ] && echo "  ok:   no mutating gcloud/firebase call was executed" || { echo "  FAIL: mutating calls executed:"; echo "$m"; fail=1; }

# ------------------------------------------------------------------ B: resume / repair, everything exists
mkdir -p "$work/home-resume/.config/wayfare"
printf 'PROJECT_ID=wayfare-demo\nREGION=europe-west4\nFS_LOCATION=europe-west4\nBUCKET=wayfare-demo-wayfare-media\nWANT_PHOTO_IMPORT=no\nCLONE_DIR=%s\n' "$work/clone" >"$work/home-resume/.config/wayfare/bootstrap.env"
scenario resume 1 -- --dry-run --yes
[ "$RC" = 0 ] || { echo "  FAIL: exit code $RC"; tail -20 "$OUT"; fail=1; }
check "project from saved state" 'Using existing project wayfare-demo' "$OUT"
check "billing already enabled" 'Billing is enabled' "$OUT"
check "firestore skipped" 'Firestore \(default\) database exists' "$OUT"
check "bucket skipped" 'Bucket gs://wayfare-demo-wayfare-media exists' "$OUT"
check "existing secret merged" 'Existing WAYFARE_ENV found' "$OUT"
check "secret unchanged -> no new version" 'WAYFARE_ENV unchanged' "$OUT"
check "backend skipped" "Backend 'wayfare' exists" "$OUT"
check "XFF matches" 'Matches the configured value' "$OUT"
check "scheduler updated, not duplicated" 'scheduler jobs update http wayfare-digest' "$OUT"
check "existing secrets never printed" 'SEKRET-do-not-leak|CRON-do-not-leak' "$OUT" -v
check "backends:create not called" 'backends:create' "$OUT" -v
m=$(mutating_calls)
[ -z "$m" ] && echo "  ok:   no mutating call executed" || { echo "  FAIL: mutating calls executed:"; echo "$m"; fail=1; }

# ------------------------------------------------------------------ C: billing link fails (real run against stubs, no cloud, no network)
mkdir -p "$work/home-billing-fail/.config/wayfare" "$work/bf-clone"
git -C "$work/bf-clone" init -q
echo '{}' >"$work/bf-clone/firebase.json" # untracked file = "dirty" tree, so the script does not try to fetch
printf 'PROJECT_ID=wayfare-demo\nCLONE_DIR=%s\n' "$work/bf-clone" >"$work/home-billing-fail/.config/wayfare/bootstrap.env"
scenario billing-fail 0 STUB_LINK_FAIL=1 -- --yes
check "billing failure prints the gcloud error" 'simulated failure' "$OUT"
check "billing failure points to the console" 'console\.cloud\.google\.com/billing/linkedaccount\?project=wayfare-demo' "$OUT"
[ "$RC" != 0 ] && echo "  ok:   non-zero exit on billing failure (--yes)" || { echo "  FAIL: expected non-zero exit"; fail=1; }
# interactive: "Continue?" y, then decline the retry -> clean exit 0 with the console link and a resume hint
mkdir -p "$work/home-billing-retry/.config/wayfare"
cp "$work/home-billing-fail/.config/wayfare/bootstrap.env" "$work/home-billing-retry/.config/wayfare/"
printf 'y\nn\n' >"$work/answers"
STDIN_FILE="$work/answers" scenario billing-retry 0 STUB_LINK_FAIL=1 -- --project wayfare-demo
unset STDIN_FILE
[ "$RC" = 0 ] && echo "  ok:   declining the retry exits cleanly" || { echo "  FAIL: exit $RC"; fail=1; }
check "exit hint mentions re-running" 'Link billing at .* then re-run' "$OUT"

# ------------------------------------------------------------------ D: --help / bad flag
scenario help 0 -- --help
check "--help works" 'Usage: firebase-bootstrap\.sh' "$OUT"
scenario badflag 0 -- --nope
[ "$RC" != 0 ] && echo "  ok:   unknown flag rejected" || { echo "  FAIL: unknown flag accepted"; fail=1; }

echo
if [ "$fail" = 0 ]; then echo "ALL CHECKS PASSED"; else echo "SOME CHECKS FAILED"; exit 1; fi
