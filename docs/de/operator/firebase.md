# Deployment auf Firebase

Betreibe Wayfare serverless auf Google Firebase: **App Hosting** (Next.js auf Cloud Run), **Firestore** (Datenbank) und ein privater **Cloud-Storage**-Bucket (Fotos). Das Repository enthält `firebase.json`, `apphosting.yaml`, `firestore.rules`, `storage.rules` und `firestore.indexes.json`; alles Instanzspezifische steht in **einem Secret-Manager-Secret**, `WAYFARE_ENV` – ein Fork braucht daher keine Dateiänderungen.

Es gibt drei Wege:

1. **[Bootstrap-Skript in Cloud Shell](#_1-bootstrap-in-cloud-shell-empfohlen)** – ein Befehl, interaktiv, beliebig wiederholbar. Empfohlen.
2. **[Release-Workflow](#_2-bei-jedem-release-deployen-github-actions)** – GitHub Actions deployt, sobald du ein GitHub Release veröffentlichst.
3. **[Manuelle Einrichtung](#_3-manuelle-einrichtung-fur-profis)** – wenn du jeden Schritt selbst machen willst.

::: info Kosten
App Hosting setzt den **Blaze-Tarif (Pay-as-you-go)** voraus. Eine kleine Instanz (1 vCPU, 1 GiB, `minInstances: 0` = skaliert auf null) plus Firestore- und Storage-Nutzung bleibt meist innerhalb oder nahe der Gratis-Kontingente; die Kosten hängen aber von Traffic und Fotomenge ab. Richte in der Abrechnung einen Budget-Alarm ein.
:::

## 1. Bootstrap in Cloud Shell (empfohlen)

Öffne [Google Cloud Shell](https://shell.cloud.google.com) (gcloud, Firebase CLI, Node und git sind vorinstalliert und mit deinem Konto angemeldet) und führe aus:

```bash
bash <(curl -fsSL https://raw.githubusercontent.com/nullthrone/wayfare/main/scripts/firebase-bootstrap.sh)
```

::: tip Solange das Skript nicht in `main` gemerged ist
Setze den Branch-Namen in die URL, z. B. `.../wayfare/claude/wayfare-photo-app-leku36/scripts/firebase-bootstrap.sh`, und übergib `--branch claude/wayfare-photo-app-leku36`, damit das Skript diesen Branch deployt.
:::

Das Skript ist idempotent: Es prüft, was schon existiert, und legt nur Fehlendes an. Schlägt etwas fehl, behebe das Problem und starte es erneut – es macht dort weiter. Deine Antworten (ohne Secrets) merkt es sich in `~/.config/wayfare/bootstrap.env`.

| Schritt | Was passiert |
|---|---|
| 1 Vorabprüfung | Prüft gcloud, firebase-tools ≥ 14.4 (installiert bei Bedarf 15.x nach `~/.local`), Node ≥ 20, git; erklärt die Kosten |
| 2 Quellcode | Klont (oder aktualisiert) das Repository nach `~/wayfare` |
| 3 Projekt | Bestehendes Google-Cloud-Projekt wählen oder neues anlegen |
| 4 Abrechnung | Prüft die Abrechnung; listet deine Rechnungskonten und verknüpft eines. Bei einem Fehler zeigt es die gcloud-Meldung und den Konsolen-Link und lässt dich wiederholen oder beenden |
| 5 APIs | Aktiviert die nötigen APIs (Firebase, App Hosting, Cloud Build, Cloud Run, Artifact Registry, Secret Manager, Firestore, Storage, Scheduler, …) und fügt dem Projekt Firebase hinzu |
| 6 Regionen | App-Hosting-Region (`europe-west4`, `us-central1` oder `asia-east1`) und Firestore-Standort |
| 7 Daten | Firestore-Datenbank (Native-Modus) und ein **privater** Bucket `gs://<projekt>-wayfare-media` (Uniform Access, Public-Access-Prevention) |
| 8 Konfiguration | Baut das Secret `WAYFARE_ENV`: Admin-E-Mail(s), Absenderadresse, optional SMTP (geführt: Host, Port, Benutzer, Passwort – die URL wird korrekt kodiert zusammengesetzt; eine gespeicherte fehlerhafte `SMTP_URL` wird erkannt), Login-Anbieter, Google-Foto-Import, eigene Domain. Erzeugt `WAYFARE_SECRET` und `CRON_SECRET` einmalig und **hält sie bei erneuten Läufen stabil** |
| 9 Backend | Legt das App-Hosting-Backend `wayfare` an, erlaubt ihm das Lesen des Secrets und gibt seinem Dienstkonto `roles/datastore.user` (Projekt) und `roles/storage.objectAdmin` (Bucket) |
| 10 Deploy | `firebase deploy` von Firestore-Regeln/-Indizes und Backend aus dem Klon |
| 11 Messen | Wartet auf `/api/health`, misst dann, wie viele Proxys vor der App sitzen (siehe unten), und korrigiert bei Bedarf `WAYFARE_TRUSTED_PROXIES` |
| 12 Scheduler | Optionaler Cloud-Scheduler-Job für den täglichen Digest (Standard 07:00 in deiner Zeitzone) |
| 13 GitHub | Optional: Workload Identity Federation + Deploy-Dienstkonto für den [Release-Workflow](#_2-bei-jedem-release-deployen-github-actions); setzt die Repository-Variablen, wenn `gh` verfügbar ist, sonst gibt es sie aus |
| 14 Zusammenfassung | URL, Admin-E-Mail, nächste Schritte, erneut ausführen und abbauen |

Optionen: `--project ID`, `--repo URL`, `--branch NAME`, `--reconfigure` (Fragen aus Schritt 8 erneut stellen), `--yes` (Standardwerte, optionale Funktionen überspringen), `--dry-run` (Befehle nur ausgeben statt ausführen), `--help`.

### Was angelegt wird

Ein Google-Cloud-Projekt (oder deines) mit: aktiviertem Firebase, Firestore-Datenbank `(default)`, dem privaten Bucket, dem Secret `WAYFARE_ENV`, dem App-Hosting-Backend `wayfare` (ein Cloud-Run-Dienst samt Build-Ressourcen in Artifact Registry), optional dem Cloud-Scheduler-Job `wayfare-digest` und – wenn du zustimmst – dem Workload-Identity-Pool `github`, einem OIDC-Provider und dem Dienstkonto `wayfare-deployer`.

### Als Admin anmelden

Öffne die URL und melde dich mit der Adresse an, die du als Admin-E-Mail angegeben hast. Die Anmeldung muss **verifiziert** sein: Google-Login (falls eingerichtet) oder ein Magic Link – der braucht `SMTP_URL`. E-Mail + Passwort funktioniert erst, wenn die Adresse verifiziert ist. Ohne SMTP landen Magic Links nur im Server-Log.

### Warum das Skript `X-Forwarded-For` misst

Wayfare begrenzt Passwortversuche pro Client-IP. Hinter Googles Frontend ist die Client-Adresse der N-te Eintrag von rechts in `X-Forwarded-For`; N ist `WAYFARE_TRUSTED_PROXIES`. Für App Hosting erwarten wir `2`, konnten das aber nicht anhand der Dokumentation bestätigen. Deshalb ruft das Skript nach dem ersten Deployment `/api/health?diag=forwarded` auf (liefert die Forwarded-Kette deiner eigenen Anfrage und den konfigurierten Wert), vergleicht mit der öffentlichen IP deiner Cloud Shell und passt `WAYFARE_TRUSTED_PROXIES` in `WAYFARE_ENV` an – gefolgt von einem Re-Deploy, weil App Hosting Secret-Versionen beim Rollout festschreibt. Der Wert steht bewusst **nicht** in `apphosting.yaml`: Echte Umgebungsvariablen überschreiben das `WAYFARE_ENV`-Bündel.

### Konfiguration später ändern

Alle Einstellungen sind ein Dotenv-Block im Secret `WAYFARE_ENV` (alle Schlüssel: [Konfiguration](./configuration)). Starte das Skript mit `--reconfigure` (es mergt ins bestehende Secret) oder ändere manuell:

```bash
gcloud secrets versions access latest --secret WAYFARE_ENV --project DEIN_PROJEKT > wayfare.env
$EDITOR wayfare.env
gcloud secrets versions add WAYFARE_ENV --data-file wayfare.env --project DEIN_PROJEKT
shred -u wayfare.env      # oder rm; die Datei enthält Secrets
cd ~/wayfare && firebase deploy --only apphosting:wayfare --project DEIN_PROJEKT
```

Der Re-Deploy ist nötig: Ein laufendes Backend nutzt weiter die Secret-Version, mit der es ausgerollt wurde. Beachte, dass `--reconfigure` die Datei neu schreibt – von Hand ergänzte Kommentare gehen verloren (unbekannte Schlüssel bleiben erhalten).

### Eigene Domain

Verbinde die Domain in der Firebase-Konsole (*App Hosting → Einstellungen → Domains*), starte dann das Skript mit `--reconfigure` und gib die URL ein (setzt `WAYFARE_BASE_URL`). Passe die Redirect-URIs deiner OAuth-Clients an: `<URL>/api/auth/callback/<anbieter>` für den Login (und den Google-Foto-Import bei Mitnutzung von `AUTH_GOOGLE_ID`) bzw. `<URL>/api/sources/callback` bei einem separaten `GOOGLE_SOURCES_CLIENT_ID`.

### Abbauen

Das Skript gibt diese Befehle am Ende aus, führt sie aber nie aus. Sie löschen deine Daten:

```bash
firebase apphosting:backends:delete wayfare --project DEIN_PROJEKT --location REGION
gcloud scheduler jobs delete wayfare-digest --location REGION --project DEIN_PROJEKT
gcloud storage rm -r gs://DEIN_PROJEKT-wayfare-media
gcloud firestore databases delete --database='(default)' --project DEIN_PROJEKT
gcloud secrets delete WAYFARE_ENV --project DEIN_PROJEKT
gcloud projects delete DEIN_PROJEKT       # oder alles auf einmal
```

## 2. Bei jedem Release deployen (GitHub Actions)

`.github/workflows/firebase-release.yml` deployt Firestore-Regeln/-Indizes und das App-Hosting-Backend, wenn du ein **GitHub Release veröffentlichst** (oder den Workflow manuell startest). Lege ein Release mit der Version als Namen an, z. B. `v0.2.0` – der Workflow checkt dieses Tag aus, führt Lint, Typecheck und Tests aus (schlägt etwas fehl, wird nichts deployt), deployt, fragt dann bis zu 10 Minuten lang `/api/health` ab und schreibt URL und Version in die Job-Zusammenfassung.

**Aktivierung.** Der Deploy-Job läuft, wenn das Repository `nullthrone/wayfare` ist (beim Maintainer immer an) **oder** die Repository-Variable `FIREBASE_DEPLOY_ENABLED` auf `true` steht. In einem Fork oder Klon tut der Workflow also nichts, bis du dich dafür entscheidest; er gibt nur einen Hinweis in der Job-Zusammenfassung aus.

**Repository-Variablen** (Settings → Secrets and variables → Actions → Variables – keine davon ist geheim):

| Variable | Pflicht | Bedeutung |
|---|---|---|
| `FIREBASE_DEPLOY_ENABLED` | Forks | `true` aktiviert den Workflow |
| `FIREBASE_PROJECT_ID` | ja | Projekt-ID |
| `GCP_WIF_PROVIDER` | ja | `projects/<nummer>/locations/global/workloadIdentityPools/github/providers/<provider>` |
| `GCP_DEPLOY_SA` | ja | `wayfare-deployer@<projekt>.iam.gserviceaccount.com` |
| `APPHOSTING_BACKEND` | nein | Backend-ID, Standard `wayfare` |
| `APPHOSTING_REGION` | nein | Nötig für die Smoke-Test-URL `https://<backend>--<projekt>.<region>.hosted.app` |
| `WAYFARE_PUBLIC_URL` | nein | Smoke-Test-URL statt der abgeleiteten (eigene Domain) |
| `FIREBASE_DEPLOY_STORAGE_RULES` | nein | `true` deployt zusätzlich `storage.rules` (nur relevant bei Nutzung des Firebase-Standard-Buckets) |

Das Bootstrap-Skript (Schritt 13) legt alles an und setzt die Variablen für dich. Der Workflow meldet sich **ohne Dienstkonto-Schlüssel** per [Workload Identity Federation](https://github.com/google-github-actions/auth#workload-identity-federation) an: Das OIDC-Token von GitHub wird gegen kurzlebige Zugangsdaten des Deploy-Dienstkontos getauscht, und nur das konfigurierte Repository darf das (Bedingung auf `attribute.repository`). Der Job nutzt die GitHub-Umgebung `production`; unter Settings → Environments kannst du Pflicht-Reviewer ergänzen.

::: warning Rollen nicht als Least Privilege verifiziert
Das Deploy-Dienstkonto erhält `firebaseapphosting.admin`, `firebaserules.admin`, `datastore.indexAdmin`, `serviceusage.serviceUsageConsumer`, `storage.admin`, `cloudbuild.builds.editor`, `secretmanager.viewer`, `firebase.viewer` sowie `iam.serviceAccountUser` auf dem Compute-Dienstkonto von App Hosting. Das ist ein bestmöglicher Satz; schlägt ein Deployment mit einem Berechtigungsfehler fehl, nennt die Meldung die fehlende Berechtigung. Prüfe die Rollen, bevor du das Projekt für Sensibles nutzt.
:::

Der Smoke-Test prüft nur, ob `/api/health` mit 200 antwortet; während eines Rollouts kann das noch die vorherige Revision sein.

## 3. Manuelle Einrichtung (für Profis)

```bash
# Projekt, Abrechnung und APIs
gcloud projects create PROJEKT && gcloud billing projects link PROJEKT --billing-account ID
gcloud services enable firebase.googleapis.com firebaseapphosting.googleapis.com cloudbuild.googleapis.com \
  run.googleapis.com artifactregistry.googleapis.com secretmanager.googleapis.com developerconnect.googleapis.com \
  iam.googleapis.com iamcredentials.googleapis.com sts.googleapis.com cloudresourcemanager.googleapis.com \
  serviceusage.googleapis.com firestore.googleapis.com storage.googleapis.com firebaserules.googleapis.com \
  cloudscheduler.googleapis.com --project PROJEKT
firebase projects:addfirebase PROJEKT

# Daten
gcloud firestore databases create --project PROJEKT --location europe-west4 --type firestore-native
gcloud storage buckets create gs://PROJEKT-wayfare-media --project PROJEKT --location europe-west4 \
  --uniform-bucket-level-access --public-access-prevention

# Konfigurations-Secret (Dotenv; siehe Konfiguration), dann Backend
gcloud secrets create WAYFARE_ENV --replication-policy automatic --project PROJEKT
gcloud secrets versions add WAYFARE_ENV --data-file wayfare.env --project PROJEKT
firebase apphosting:backends:create --backend wayfare --primary-region europe-west4 --project PROJEKT
firebase apphosting:secrets:grantaccess WAYFARE_ENV --backend wayfare --location europe-west4 --project PROJEKT

# Dienstkonto des Backends für Firestore und Bucket berechtigen
SA=firebase-app-hosting-compute@PROJEKT.iam.gserviceaccount.com
gcloud projects add-iam-policy-binding PROJEKT --member serviceAccount:$SA --role roles/datastore.user
gcloud storage buckets add-iam-policy-binding gs://PROJEKT-wayfare-media --member serviceAccount:$SA --role roles/storage.objectAdmin

# Deploy (firebase-tools >= 14.4 für Deploys aus lokalem Quellcode)
cp .firebaserc.example .firebaserc     # Projekt-ID eintragen
firebase deploy --only firestore:rules,firestore:indexes,apphosting:wayfare
```

Eine minimale `wayfare.env`:

```ini
WAYFARE_BASE_URL=https://wayfare--PROJEKT.europe-west4.hosted.app
WAYFARE_SECRET=<48+ zufällige Zeichen>
WAYFARE_ADMIN_EMAILS=du@example.com
FIREBASE_STORAGE_BUCKET=PROJEKT-wayfare-media
WAYFARE_TRUSTED_PROXIES=2        # mit /api/health?diag=forwarded prüfen
CRON_SECRET=<zufällig>
```

`firestore.indexes.json` ist absichtlich leer: Der Firestore-Adapter sortiert im Speicher, wenn Filter verwendet werden ([ADR 0001](https://github.com/nullthrone/wayfare/blob/main/docs/adr/0001-document-store-port.md)). Die Regeln verbieten **jeden** Client-Zugriff; Wayfare nutzt serverseitig das Admin SDK. Die Storage-Regeln gelten nur für Firebases Standard-Bucket; der oben angelegte private Bucket wird ausschließlich über IAM angesprochen.

### Täglicher Digest mit Cloud Scheduler

App Hosting hat kein eingebautes Cron:

```bash
gcloud scheduler jobs create http wayfare-digest \
  --project PROJEKT --location europe-west4 \
  --schedule "0 7 * * *" --time-zone "Europe/Berlin" \
  --uri "https://DEINE_BASE_URL/api/cron/digest" --http-method POST \
  --headers "Authorization=Bearer DEIN_CRON_SECRET"
```

## Hinweise

- `apphosting.yaml` ist generisch (Ressourcen, `WAYFARE_RUNTIME=firebase`, Bindung des Secrets `WAYFARE_ENV`). Passe dort `runConfig` an: CPU, Speicher (für sehr große Fotos auf 2048 MiB erhöhen) und Instanzen; `minInstances: 1` vermeidet Kaltstarts, kostet aber Geld.
- `firebase deploy` lädt das Verzeichnis mit der `firebase.json` hoch – ohne `.gitignore`-Einträge und ohne die `ignore`-Liste in `firebase.json`.
- Die Kosten entstehen durch Firestore-Lesezugriffe, Storage-Egress und Instanzzeit. Fotos werden immer über Wayfare ausgeliefert – nicht direkt aus dem Bucket –, damit die Zugriffskontrolle greift.
- Das Secret `WAYFARE_ENV` wird mit automatischer Replikation angelegt. Soll es in einer Region bleiben, lege es vor dem Skript selbst mit `--replication-policy user-managed --locations REGION` an.
