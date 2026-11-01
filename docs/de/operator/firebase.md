# Deployment auf Firebase

Betreibe Wayfare serverless auf Google Firebase: **App Hosting** (Next.js), **Firestore** (Datenbank), **Firebase Storage** (Fotos). Setze `WAYFARE_RUNTIME=firebase`; das Repository enthält bereits `firebase.json`, `apphosting.yaml`, `firestore.rules`, `storage.rules` und `firestore.indexes.json`.

::: info Kosten
App Hosting setzt den **Blaze-Tarif (Pay-as-you-go)** voraus. Eine kleine Instanz bleibt meist innerhalb oder nahe der Gratis-Kontingente, aber richte einen Budget-Alarm ein.
:::

## 1. Projekt anlegen

1. Erstelle in der [Firebase-Konsole](https://console.firebase.google.com) ein Projekt (oder nutze ein bestehendes Google-Cloud-Projekt) und stelle es auf den **Blaze-Tarif** um.
2. Installiere die CLI und melde dich an:
   ```bash
   npm i -g firebase-tools
   firebase login
   ```
3. Kopiere `.firebaserc.example` nach `.firebaserc` und trage deine Projekt-ID ein.

## 2. Dienste aktivieren

- **Firestore** – *Build → Firestore Database → Datenbank erstellen*, **Native-Modus**, Region nahe bei deinen Nutzern (idealerweise dieselbe wie dein App-Hosting-Backend).
- **Storage** – *Build → Storage → Los geht's*; notiere den Bucket-Namen (`<projekt-id>.firebasestorage.app`).
- **App Hosting** – *Build → App Hosting → Los geht's* und verbinde das GitHub-Repository (dein Fork von `nullthrone/wayfare`); wähle Branch `main`, Root-Verzeichnis `/` und eine Backend-ID (`wayfare`).

## 3. `apphosting.yaml` anpassen

Bearbeite die Werte in `apphosting.yaml`:

- `WAYFARE_BASE_URL` – die Backend-URL aus der Konsole oder deine eigene Domain
- `WAYFARE_ADMIN_EMAILS`
- `FIREBASE_PROJECT_ID`, `FIREBASE_STORAGE_BUCKET`
- `runConfig` – CPU, Speicher (mindestens 1 GiB empfohlen), Instanzen

`WAYFARE_RUNTIME=firebase` ist bereits gesetzt. Der Storage-Treiber ist in dieser Runtime standardmäßig `firebase`. Das Dienstkonto von App Hosting nutzt Application Default Credentials, du brauchst also **kein** `FIREBASE_SERVICE_ACCOUNT`.

## 4. Secrets anlegen

Secrets liegen im Cloud Secret Manager und werden aus `apphosting.yaml` referenziert:

```bash
firebase apphosting:secrets:set WAYFARE_SECRET     # zufälligen String mit 32+ Zeichen einfügen
firebase apphosting:secrets:set CRON_SECRET
# optional, je nach Bedarf:
firebase apphosting:secrets:set AUTH_GOOGLE_ID
firebase apphosting:secrets:set AUTH_GOOGLE_SECRET
firebase apphosting:secrets:set SMTP_URL
```

Der Befehl bietet an, deinem Backend Zugriff auf das Secret zu geben. Entkommentiere die passenden `secret:`-Einträge in `apphosting.yaml`. Alle Schlüssel: [Konfiguration](./configuration).

## 5. Regeln deployen

Die Regeln verbieten **jeden** Client-Zugriff; Wayfare nutzt serverseitig das Admin SDK. Deploye sie einmal (und nach Änderungen):

```bash
firebase deploy --only firestore:rules,firestore:indexes,storage
```

`firestore.indexes.json` ist absichtlich leer: Der Firestore-Adapter sortiert im Speicher, wenn Filter verwendet werden ([ADR 0001](https://github.com/nullthrone/wayfare/blob/main/docs/adr/0001-document-store-port.md)), daher müssen keine zusammengesetzten Indizes deployt werden.

## 6. Ausrollen

Pushe auf `main` – App Hosting baut und deployt automatisch – oder deploye per CLI:

```bash
firebase deploy --only apphosting
```

Öffne die Backend-URL, melde dich mit einer Adresse aus `WAYFARE_ADMIN_EMAILS` an (oder sei der erste Nutzer), und du bist Admin. Trage die URL als Redirect-Basis bei den [Login-Anbietern](./authentication) und [Foto-Quellen](./photo-sources) ein.

## 7. Täglicher Digest mit Cloud Scheduler

App Hosting hat kein eingebautes Cron. Lege einen Cloud-Scheduler-Job an, der den Endpunkt aufruft:

```bash
gcloud scheduler jobs create http wayfare-digest \
  --project DEINE_PROJEKT_ID --location europe-west1 \
  --schedule "0 7 * * *" --time-zone "Europe/Berlin" \
  --uri "https://DEINE_BASE_URL/api/cron/digest" --http-method POST \
  --headers "Authorization=Bearer DEIN_CRON_SECRET"
```

## Eigene Domain

*App Hosting → Einstellungen → Domains* führt dich durch die DNS-Einträge. Danach aktualisierst du `WAYFARE_BASE_URL` und alle OAuth-Redirect-URIs.

## Hinweise

- Hochgeladene Dateien werden in der Instanz verarbeitet; sehr große Fotos brauchen `memoryMiB: 2048`.
- Bei `minInstances: 0` gibt es Kaltstarts. Setze `1`, wenn der erste Aufruf sofort laden soll.
- Die Kosten entstehen durch Firestore-Lesezugriffe, Storage-Egress und Instanzzeit. Fotos werden immer über Wayfare ausgeliefert – nicht direkt aus dem Bucket –, damit die Zugriffskontrolle greift.
