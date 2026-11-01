# Fehlersuche

## Der Server startet nicht: „Invalid Wayfare configuration“

Die Meldung listet jede ungültige Variable auf. Typisch: `WAYFARE_SECRET must be at least 32 characters` oder eine fehlerhafte `WAYFARE_BASE_URL` (braucht `http://` oder `https://`). Siehe [Konfiguration](./configuration).

## Login mit Google/Apple/… schlägt fehl

- `redirect_uri_mismatch` – die registrierte URI muss exakt `${WAYFARE_BASE_URL}/api/auth/callback/<provider>` lauten. Prüfe Schema (http vs. https), Host und Port. Hinter einem Reverse Proxy muss `WAYFARE_BASE_URL` die **öffentliche** URL sein.
- Anbieter-Schaltfläche fehlt – ID **und** Secret müssen gesetzt sein; Server neu starten.
- Apple funktioniert nach Monaten nicht mehr – das Client-Secret-JWT ist abgelaufen; erzeuge es neu ([Authentifizierung](./authentication#apple)).
- Facebook: nur Entwickler können sich anmelden – die App ist noch im *Entwicklungsmodus*.

## Magic Link kommt nicht an

Ohne `SMTP_URL` steht er nur im Log (`docker compose logs wayfare`). Mit SMTP: Zugangsdaten, Port/TLS-Modus, SPF/DKIM und Spam-Ordner prüfen.

## Passkeys lassen sich nicht anlegen

Sie brauchen HTTPS (oder `localhost`) und die Domain aus `WAYFARE_BASE_URL`. Nach einem Domainwechsel funktionieren alte Passkeys nicht mehr; melde dich anders an und lege einen neuen an.

## Uploads schlagen fehl

- „Datei zu groß“ – erhöhe das Limit unter **/admin → Einstellungen** (`maxUploadMb`) *und* die Body-Größe deines Reverse Proxys (nginx `client_max_body_size`, Caddy `max_size`). Server Actions akzeptieren bis zu 30 MB.
- Album voll – `maxPhotosPerAlbum` (Standard 500).
- HEIC nicht dekodiert – auf dem Handy konvertieren (als „Maximale Kompatibilität“ teilen) oder JPEG hochladen.
- Speicher voll auf Firebase – `memoryMiB` in `apphosting.yaml` erhöhen.

## Fotos werden nach Neustart nicht angezeigt / Bilder 403

Medien-URLs sind mit `WAYFARE_SECRET` signiert. Ein geändertes Secret macht geöffnete Seiten ungültig – neu laden. Eine Zeitabweichung zwischen Server und Client spielt keine Rolle, da der Server das Ablaufen prüft.

## „Database is locked“ / Berechtigungsfehler mit SQLite

Der Container-Benutzer ist `node` (UID 1000). Ein per Bind-Mount eingehängtes `/data` muss für ihn beschreibbar sein: `chown -R 1000:1000 ./data`. Teile eine SQLite-Datenbank nicht zwischen mehreren laufenden Instanzen.

## Import aus Google schlägt fehl

Siehe [Foto-Quellen → Fehlersuche](./photo-sources#fehlersuche). Prüfe außerdem, dass `WAYFARE_BASE_URL` zur registrierten Redirect-URI passt und der Zustimmungsbildschirm nicht mit einem nicht eingetragenen Konto im Status *Testing* steht.

## Täglicher Digest kommt nie an

Der Cron-Job muss `POST /api/cron/digest` mit `Authorization: Bearer $CRON_SECRET` aufrufen. Prüfe den HTTP-Status (401 = falsches Secret) und dass die Alben den Benachrichtigungsmodus *täglicher Digest* nutzen. Siehe [E-Mail](./mail).

## Health-Check

`curl -fsS http://localhost:3000/api/health` → `{"status":"ok"}`. HTTP 503 bedeutet, dass Datenbank-/Speicherschicht nicht erreichbar ist; prüfe Logs und Zugangsdaten.

## Immer noch festgefahren?

Öffne ein [Issue](https://github.com/nullthrone/wayfare/issues/new/choose) mit Deployment-Typ, Version und Logs (Secrets entfernen).
