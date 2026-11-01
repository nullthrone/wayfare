# Deploying on Firebase

Run Wayfare serverless on Google Firebase: **App Hosting** (Next.js on Cloud Run), **Firestore** (database) and a private **Cloud Storage** bucket (photos). The repository ships `firebase.json`, `apphosting.yaml`, `firestore.rules`, `storage.rules` and `firestore.indexes.json`; everything instance-specific lives in **one Secret Manager secret**, `WAYFARE_ENV`, so a fork needs no file changes.

There are three ways to get there:

1. **[Bootstrap script in Cloud Shell](#_1-bootstrap-in-cloud-shell-recommended)** — one command, interactive, re-runnable. Recommended.
2. **[Release workflow](#_2-deploy-on-every-release-github-actions)** — GitHub Actions deploys whenever you publish a GitHub Release.
3. **[Manual setup](#_3-manual-setup-for-experts)** — for people who want to do every step themselves.

::: info Cost
App Hosting requires the **Blaze (pay-as-you-go)** plan. A small instance (1 vCPU, 1 GiB, `minInstances: 0` = scales to zero) plus Firestore and Storage usage usually stays in or near the free quotas, but costs depend on traffic and photo volume. Set a budget alert in Billing.
:::

## 1. Bootstrap in Cloud Shell (recommended)

Open [Google Cloud Shell](https://shell.cloud.google.com) (gcloud, the Firebase CLI, Node and git are preinstalled and signed in with your account) and run:

```bash
bash <(curl -fsSL https://raw.githubusercontent.com/nullthrone/wayfare/main/scripts/firebase-bootstrap.sh)
```

::: tip Until the script is merged into `main`
Use the branch name in the URL, e.g. `.../wayfare/claude/wayfare-photo-app-leku36/scripts/firebase-bootstrap.sh`, and pass `--branch claude/wayfare-photo-app-leku36` so the script deploys that branch.
:::

The script is idempotent: it checks what already exists and only creates what is missing. If something fails, fix the problem and run it again — it resumes. Your answers (no secrets) are remembered in `~/.config/wayfare/bootstrap.env`.

| Step | What happens |
|---|---|
| 1 Preflight | Checks gcloud, firebase-tools ≥ 14.4 (installs 15.x into `~/.local` if needed), Node ≥ 20, git; explains costs |
| 2 Source | Clones (or updates) the repository into `~/wayfare` |
| 3 Project | Pick an existing Google Cloud project or create a new one |
| 4 Billing | Checks billing; lists your billing accounts and links one if needed. On failure it prints the gcloud error and the console link, and lets you retry or exit |
| 5 APIs | Enables the required APIs (Firebase, App Hosting, Cloud Build, Cloud Run, Artifact Registry, Secret Manager, Firestore, Storage, Scheduler, …) and adds Firebase to the project |
| 6 Regions | App Hosting region (`europe-west4`, `us-central1` or `asia-east1`) and Firestore location |
| 7 Data | Firestore database (native mode) and a **private** bucket `gs://<project>-wayfare-media` (uniform access, public access prevention) |
| 8 Configuration | Builds the `WAYFARE_ENV` secret: admin e-mail(s), sender address, optional SMTP, optional login providers, optional Google photo import, optional custom domain. Generates `WAYFARE_SECRET` and `CRON_SECRET` once and **keeps them stable** on re-runs |
| 9 Backend | Creates the App Hosting backend `wayfare`, lets it read the secret, grants its service account `roles/datastore.user` (project) and `roles/storage.objectAdmin` (bucket) |
| 10 Deploy | `firebase deploy` of Firestore rules/indexes and the backend from the clone |
| 11 Measure | Waits for `/api/health`, then measures how many proxies sit in front of the app (see below) and corrects `WAYFARE_TRUSTED_PROXIES` if needed |
| 12 Scheduler | Optional Cloud Scheduler job for the daily digest (default 07:00 in your time zone) |
| 13 GitHub | Optional: workload identity federation + deploy service account for the [release workflow](#_2-deploy-on-every-release-github-actions); sets the repository variables if `gh` is available, otherwise prints them |
| 14 Summary | URL, admin e-mail, next steps, how to re-run and tear down |

Options: `--project ID`, `--repo URL`, `--branch NAME`, `--reconfigure` (ask the step 8 questions again), `--yes` (accept defaults, skip optional features), `--dry-run` (print the commands instead of running them), `--help`.

### What it creates

A Google Cloud project (or uses yours) with: Firebase enabled, a Firestore `(default)` database, the private bucket, the secret `WAYFARE_ENV`, the App Hosting backend `wayfare` (a Cloud Run service plus build resources in Artifact Registry), optionally the Cloud Scheduler job `wayfare-digest`, and — if you opt in — the workload identity pool `github`, an OIDC provider, and the service account `wayfare-deployer`.

### Signing in as admin

Open the URL and sign in with the address you gave as admin e-mail. It must be a **verified** sign-in: Google login (if configured), or a magic link — which needs `SMTP_URL`. E-mail + password only works once the address is verified. Without SMTP, magic links are only written to the server log.

### Why the script measures `X-Forwarded-For`

Wayfare rate-limits password attempts per client IP. Behind Google's front end, the client address is the N-th entry from the right of `X-Forwarded-For`, and N is `WAYFARE_TRUSTED_PROXIES`. We expected `2` for App Hosting but could not verify it from documentation, so after the first deployment the script calls `/api/health?diag=forwarded` (which returns your own request's forwarded chain and the configured value), compares it with your Cloud Shell public IP, and updates `WAYFARE_TRUSTED_PROXIES` in `WAYFARE_ENV` — followed by a re-deploy, because App Hosting pins secret versions at rollout time. The value is deliberately **not** in `apphosting.yaml`: real environment variables override the `WAYFARE_ENV` bundle.

### Editing the configuration later

All settings are a dotenv block in the secret `WAYFARE_ENV` (see [Configuration](./configuration) for every key). Either re-run the script with `--reconfigure` (it merges into the existing secret), or edit manually:

```bash
gcloud secrets versions access latest --secret WAYFARE_ENV --project YOUR_PROJECT > wayfare.env
$EDITOR wayfare.env
gcloud secrets versions add WAYFARE_ENV --data-file wayfare.env --project YOUR_PROJECT
shred -u wayfare.env      # or rm; the file contains secrets
cd ~/wayfare && firebase deploy --only apphosting:wayfare --project YOUR_PROJECT
```

The re-deploy is required: a running backend keeps using the secret version it was rolled out with. Note that `--reconfigure` re-renders the file, so comments you added by hand are dropped (keys the script does not know are kept).

### Custom domain

Connect the domain in the Firebase console (*App Hosting → Settings → Domains*), then run the script with `--reconfigure` and enter the URL (it sets `WAYFARE_BASE_URL`). Update the redirect URIs of your OAuth clients: `<URL>/api/auth/callback/<provider>` for sign-in and `<URL>/api/sources/callback` for Google photo import.

### Tear down

The script prints these at the end but never runs them. They delete your data:

```bash
firebase apphosting:backends:delete wayfare --project YOUR_PROJECT --location REGION
gcloud scheduler jobs delete wayfare-digest --location REGION --project YOUR_PROJECT
gcloud storage rm -r gs://YOUR_PROJECT-wayfare-media
gcloud firestore databases delete --database='(default)' --project YOUR_PROJECT
gcloud secrets delete WAYFARE_ENV --project YOUR_PROJECT
gcloud projects delete YOUR_PROJECT       # or everything at once
```

## 2. Deploy on every release (GitHub Actions)

`.github/workflows/firebase-release.yml` deploys Firestore rules/indexes and the App Hosting backend when you **publish a GitHub Release** (or start the workflow manually). Create a release named like the version, e.g. `v0.2.0` — the workflow checks out that tag, runs lint, typecheck and tests (a failure stops before any deployment), deploys, then polls `/api/health` for up to 10 minutes and writes the URL and version into the job summary.

**Activation.** The deploy job runs if the repository is `nullthrone/wayfare` (always on for the maintainer) **or** the repository variable `FIREBASE_DEPLOY_ENABLED` is `true`. In a fork or clone the workflow therefore does nothing until you opt in; it only prints a hint in the job summary.

**Repository variables** (Settings → Secrets and variables → Actions → Variables — none is a secret):

| Variable | Required | Meaning |
|---|---|---|
| `FIREBASE_DEPLOY_ENABLED` | forks | `true` to enable the workflow |
| `FIREBASE_PROJECT_ID` | yes | Project ID |
| `GCP_WIF_PROVIDER` | yes | `projects/<number>/locations/global/workloadIdentityPools/github/providers/<provider>` |
| `GCP_DEPLOY_SA` | yes | `wayfare-deployer@<project>.iam.gserviceaccount.com` |
| `APPHOSTING_BACKEND` | no | Backend ID, default `wayfare` |
| `APPHOSTING_REGION` | no | Needed for the smoke-test URL `https://<backend>--<project>.<region>.hosted.app` |
| `WAYFARE_PUBLIC_URL` | no | Smoke-test URL instead of the derived one (custom domain) |
| `FIREBASE_DEPLOY_STORAGE_RULES` | no | `true` to also deploy `storage.rules` (only relevant if you use the Firebase default bucket) |

The bootstrap script (step 13) creates everything and sets these variables for you. The workflow authenticates **without a service-account key** through [workload identity federation](https://github.com/google-github-actions/auth#workload-identity-federation): GitHub's OIDC token is exchanged for short-lived credentials of the deploy service account, and only the configured repository may do so (`attribute.repository` condition). The job uses the GitHub environment `production`, so you can add required reviewers under Settings → Environments.

::: warning Roles not verified as least privilege
The deploy service account gets `firebaseapphosting.admin`, `firebaserules.admin`, `datastore.indexAdmin`, `serviceusage.serviceUsageConsumer`, `storage.admin`, `cloudbuild.builds.editor`, `secretmanager.viewer`, `firebase.viewer`, plus `iam.serviceAccountUser` on the App Hosting compute service account. This is a best-effort set; if a deployment fails with a permission error, the message names the missing permission. Review it before using the project for anything sensitive.
:::

The smoke test only checks that `/api/health` answers 200; during a rollout this may still be the previous revision.

## 3. Manual setup (for experts)

```bash
# project, billing and APIs
gcloud projects create PROJECT && gcloud billing projects link PROJECT --billing-account ID
gcloud services enable firebase.googleapis.com firebaseapphosting.googleapis.com cloudbuild.googleapis.com \
  run.googleapis.com artifactregistry.googleapis.com secretmanager.googleapis.com developerconnect.googleapis.com \
  iam.googleapis.com iamcredentials.googleapis.com sts.googleapis.com cloudresourcemanager.googleapis.com \
  serviceusage.googleapis.com firestore.googleapis.com storage.googleapis.com firebaserules.googleapis.com \
  cloudscheduler.googleapis.com --project PROJECT
firebase projects:addfirebase PROJECT

# data
gcloud firestore databases create --project PROJECT --location europe-west4 --type firestore-native
gcloud storage buckets create gs://PROJECT-wayfare-media --project PROJECT --location europe-west4 \
  --uniform-bucket-level-access --public-access-prevention

# configuration secret (dotenv; see Configuration), then backend
gcloud secrets create WAYFARE_ENV --replication-policy automatic --project PROJECT
gcloud secrets versions add WAYFARE_ENV --data-file wayfare.env --project PROJECT
firebase apphosting:backends:create --backend wayfare --primary-region europe-west4 --project PROJECT
firebase apphosting:secrets:grantaccess WAYFARE_ENV --backend wayfare --location europe-west4 --project PROJECT

# let the backend's service account use Firestore and the bucket
SA=firebase-app-hosting-compute@PROJECT.iam.gserviceaccount.com
gcloud projects add-iam-policy-binding PROJECT --member serviceAccount:$SA --role roles/datastore.user
gcloud storage buckets add-iam-policy-binding gs://PROJECT-wayfare-media --member serviceAccount:$SA --role roles/storage.objectAdmin

# deploy (firebase-tools >= 14.4 for local-source deploys)
cp .firebaserc.example .firebaserc     # put your project ID in
firebase deploy --only firestore:rules,firestore:indexes,apphosting:wayfare
```

A minimal `wayfare.env`:

```ini
WAYFARE_BASE_URL=https://wayfare--PROJECT.europe-west4.hosted.app
WAYFARE_SECRET=<48+ random characters>
WAYFARE_ADMIN_EMAILS=you@example.com
FIREBASE_STORAGE_BUCKET=PROJECT-wayfare-media
WAYFARE_TRUSTED_PROXIES=2        # verify with /api/health?diag=forwarded
CRON_SECRET=<random>
```

`firestore.indexes.json` is empty on purpose: the Firestore adapter sorts in memory when filters are used ([ADR 0001](https://github.com/nullthrone/wayfare/blob/main/docs/adr/0001-document-store-port.md)). The rules deny **all** client access; Wayfare uses the Admin SDK on the server. The Storage rules only govern Firebase's default bucket; the private bucket created above is reached through IAM only.

### Daily digest with Cloud Scheduler

App Hosting has no built-in cron:

```bash
gcloud scheduler jobs create http wayfare-digest \
  --project PROJECT --location europe-west4 \
  --schedule "0 7 * * *" --time-zone "Europe/Berlin" \
  --uri "https://YOUR_BASE_URL/api/cron/digest" --http-method POST \
  --headers "Authorization=Bearer YOUR_CRON_SECRET"
```

## Notes

- `apphosting.yaml` is generic (resources, `WAYFARE_RUNTIME=firebase`, the `WAYFARE_ENV` secret binding). Edit `runConfig` there for CPU, memory (raise to 2048 MiB for very large photos) and instances; `minInstances: 1` avoids cold starts at a cost.
- `firebase deploy` uploads the directory containing `firebase.json`, minus `.gitignore` entries and the `ignore` list in `firebase.json`.
- Costs are driven by Firestore reads, Storage egress and instance time. Photos are always delivered through Wayfare — not directly from the bucket — to enforce access control.
- The secret `WAYFARE_ENV` is created with automatic replication. If you need the secret to stay in one region, create it yourself with `--replication-policy user-managed --locations REGION` before running the script.
