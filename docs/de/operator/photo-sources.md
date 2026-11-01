# Foto-Quellen (Google Fotos & Drive)

Owner können Fotos aus Google Fotos und Google Drive importieren. Dafür brauchst du ein eigenes Google-Cloud-Projekt. Die Fotos werden in Wayfare *kopiert* ([Warum](https://github.com/nullthrone/wayfare/blob/main/docs/adr/0003-import-not-link.md)).

Die Import-Schaltflächen erscheinen nur, wenn die Anbindung konfiguriert ist.

## 1. Projekt und APIs

Wähle in der [Google Cloud Console](https://console.cloud.google.com) ein Projekt (oder lege eins an) und aktiviere unter *APIs & Dienste → Bibliothek*:

- **Google Photos Picker API**
- **Google Drive API**
- **Google Picker API**

## 2. OAuth-Zustimmungsbildschirm

*APIs & Dienste → OAuth-Zustimmungsbildschirm* (bzw. *Google Auth Platform*):

- Nutzertyp *Extern*, App-Name, Support-E-Mail, Link zur Datenschutzerklärung (deine `/privacy`-Seite).
- **Scopes**, die du hinzufügst:
  - `https://www.googleapis.com/auth/photospicker.mediaitems.readonly` – liest nur die Fotos, die der Nutzer auswählt
  - `https://www.googleapis.com/auth/drive.file` – nur Dateien, die der Nutzer über den Picker auswählt (nicht eingeschränkter Scope)
- Trage dich während der Tests als *Testnutzer* ein.

## 3. OAuth-Client

*Anmeldedaten → Anmeldedaten erstellen → OAuth-Client-ID → Webanwendung*. Autorisierte Weiterleitungs-URI:

```
${WAYFARE_BASE_URL}/api/sources/callback
```

Setze `GOOGLE_SOURCES_CLIENT_ID` und `GOOGLE_SOURCES_CLIENT_SECRET`. Lässt du sie leer, fällt Wayfare auf `AUTH_GOOGLE_ID`/`AUTH_GOOGLE_SECRET` zurück – dann trage **beide** Redirect-URIs (`/api/auth/callback/google` und `/api/sources/callback`) bei diesem Client ein.

## 4. Drive Picker: API-Schlüssel und App-ID

Der Drive-Dateiauswahldialog läuft im Browser und braucht:

- **`GOOGLE_API_KEY`** – *Anmeldedaten → Anmeldedaten erstellen → API-Schlüssel*. Beschränke ihn: *Anwendungsbeschränkungen → Websites (HTTP-Referrer)* → `https://photos.example.com/*`; *API-Einschränkungen* → Google Picker API.
- **`GOOGLE_APP_ID`** – die **Projektnummer** (nicht die Projekt-ID) aus dem Dashboard der Cloud Console.

Das Picker-Skript ist das einzige Skript eines Drittanbieters, das Wayfare je lädt – und zwar nur, wenn ein Owner den Drive-Picker öffnet.

## 5. Verifizierung und Grenzen

- Solange der Zustimmungsbildschirm den Status *Testing* hat, können sich nur eingetragene Testnutzer verbinden, und Refresh-Tokens laufen nach 7 Tagen ab. Für den normalen Betrieb auf *In Produktion* stellen.
- Für den sensiblen Fotos-Scope kann Google bei öffentlichen Apps eine **App-Verifizierung** verlangen (kurze Prüfung mit Demovideo und Datenschutzerklärung). Für Familien-und-Freunde-Instanzen kannst du die App unverifiziert lassen: Nutzer sehen dann die Warnung „Google hat diese App nicht überprüft“ und müssen sich durchklicken (bis zu 100 Nutzer).
- `drive.file` ist nicht eingeschränkt, daher entfällt die teure Sicherheitsprüfung – ein Grund, warum Wayfare den Picker nutzt, statt das ganze Drive zu durchsuchen.
- Base-URLs von Google Fotos laufen nach etwa einer Stunde ab; deshalb lädt Wayfare die ausgewählten Fotos sofort herunter.

## Fehlersuche

- `redirect_uri_mismatch` – die URI in der Konsole weicht von `${WAYFARE_BASE_URL}/api/sources/callback` ab (Schema, Host, Pfad, abschließender Slash).
- Drive-Picker öffnet sich nicht – fehlende oder falsche Referrer-Beschränkung bei `GOOGLE_API_KEY` oder falsche `GOOGLE_APP_ID`.
- „Zugriff blockiert: App nicht verifiziert“ – Nutzer als Testnutzer eintragen oder den Zustimmungsbildschirm veröffentlichen.
