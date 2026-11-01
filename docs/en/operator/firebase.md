# Deploying on Firebase

Run Wayfare serverless on Google Firebase: **App Hosting** (Next.js), **Firestore** (database), **Firebase Storage** (photos). Set `WAYFARE_RUNTIME=firebase`; the repository already contains `firebase.json`, `apphosting.yaml`, `firestore.rules`, `storage.rules` and `firestore.indexes.json`.

::: info Cost
App Hosting requires the **Blaze (pay-as-you-go)** plan. A small instance usually stays in or near the free quotas, but set a budget alert.
:::

## 1. Create the project

1. In the [Firebase console](https://console.firebase.google.com) create a project (or reuse a Google Cloud project) and upgrade it to the **Blaze plan**.
2. Install the CLI and log in:
   ```bash
   npm i -g firebase-tools
   firebase login
   ```
3. Copy `.firebaserc.example` to `.firebaserc` and put in your project ID.

## 2. Enable the services

- **Firestore** — *Build → Firestore Database → Create database*, **Native mode**, choose a region close to your users (the same region as your App Hosting backend is ideal).
- **Storage** — *Build → Storage → Get started*; note the bucket name (`<project-id>.firebasestorage.app`).
- **App Hosting** — *Build → App Hosting → Get started* and connect the GitHub repository (your fork of `nullthrone/wayfare`); choose branch `main`, root directory `/`, and a backend ID (`wayfare`).

## 3. Configure `apphosting.yaml`

Edit the values in `apphosting.yaml`:

- `WAYFARE_BASE_URL` — the backend URL shown in the console or your custom domain
- `WAYFARE_ADMIN_EMAILS`
- `FIREBASE_PROJECT_ID`, `FIREBASE_STORAGE_BUCKET`
- `runConfig` — CPU, memory (1 GiB minimum recommended), instances

`WAYFARE_RUNTIME=firebase` is already set. The storage driver defaults to `firebase` in this runtime. App Hosting's service account uses Application Default Credentials, so you **don't need** `FIREBASE_SERVICE_ACCOUNT`.

## 4. Create secrets

Secrets are stored in Cloud Secret Manager and referenced from `apphosting.yaml`:

```bash
firebase apphosting:secrets:set WAYFARE_SECRET     # paste a 32+ char random string
firebase apphosting:secrets:set CRON_SECRET
# optional, as needed:
firebase apphosting:secrets:set AUTH_GOOGLE_ID
firebase apphosting:secrets:set AUTH_GOOGLE_SECRET
firebase apphosting:secrets:set SMTP_URL
```

The command offers to grant your backend access to the secret. Uncomment the matching `secret:` entries in `apphosting.yaml`. See [Configuration](./configuration) for all keys.

## 5. Deploy the rules

The rules deny **all** client access; Wayfare uses the Admin SDK on the server. Deploy them once (and after changes):

```bash
firebase deploy --only firestore:rules,firestore:indexes,storage
```

`firestore.indexes.json` is empty on purpose: the Firestore adapter sorts in memory when filters are used ([ADR 0001](https://github.com/nullthrone/wayfare/blob/main/docs/adr/0001-document-store-port.md)), so no composite indexes need deploying.

## 6. Roll out

Push to `main` — App Hosting builds and deploys automatically — or deploy from the CLI:

```bash
firebase deploy --only apphosting
```

Open the backend URL, sign in with an address from `WAYFARE_ADMIN_EMAILS` (or be the first user) and you are admin. Add the URL as the redirect base for [login providers](./authentication) and [photo sources](./photo-sources).

## 7. Daily digest with Cloud Scheduler

App Hosting has no built-in cron. Create a Cloud Scheduler job that calls the endpoint:

```bash
gcloud scheduler jobs create http wayfare-digest \
  --project YOUR_PROJECT_ID --location europe-west1 \
  --schedule "0 7 * * *" --time-zone "Europe/Berlin" \
  --uri "https://YOUR_BASE_URL/api/cron/digest" --http-method POST \
  --headers "Authorization=Bearer YOUR_CRON_SECRET"
```

## Custom domain

*App Hosting → Settings → Domains* guides you through DNS records. Afterwards update `WAYFARE_BASE_URL` and every OAuth redirect URI.

## Notes

- Uploaded files are processed in the instance; very large photos need `memoryMiB: 2048`.
- Cold starts occur with `minInstances: 0`. Set it to `1` if you want instant first loads.
- Costs are driven by Firestore reads, Storage egress and instance time. Photos are always delivered through Wayfare — not directly from the bucket — to enforce access control.
