# Sicherheit & Datenschutz

## Sicherheitsmodell

- **Album-Zugriff** – Alben liegen unter `/a/{slug}`. Der Slug besteht aus 10 Zufallszeichen eines 31er-Alphabets (~50 Bit) und lässt sich nicht aufzählen. Entwürfe sind für alle außer Owner und Admins unsichtbar.
- **Passwort-Alben** – Passwörter werden als **scrypt**-Hash gespeichert. Ein korrektes Passwort setzt ein signiertes Cookie, das an die `passwordVersion` des Albums gebunden ist; eine Passwortänderung macht alle Freischalt-Cookies ungültig. Versuche sind ratenbegrenzt.
- **Widerruf** – Das Rotieren des Slugs macht alle QR-Codes und Links auf einen Schlag ungültig. Ablaufdaten werden bei jeder Anfrage geprüft.
- **Medienauslieferung** – Fotos werden nur über `/api/media/{photoId}/{variant}?exp&sig` (HMAC-signiert, kurze Gültigkeit) ausgeliefert, nachdem der Albumzugriff erneut geprüft wurde. Originale gibt es nur, wenn der Owner Downloads erlaubt. Antworten nutzen `Cache-Control: private`.
- **Download-Schutz** – Was er leistet und wo er endet, steht im [Benutzerhandbuch](../guide/download-protection): Screenshots lassen sich nicht verhindern.
- **Autorisierung** wird in der Service-Schicht durchgesetzt, nicht nur in Seiten. Rollen: Viewer < Owner < Admin.
- **Secrets** – Google-Tokens für Foto-Quellen werden mit AES-256-GCM verschlüsselt, mit einem aus `WAYFARE_SECRET` abgeleiteten Schlüssel. Wird das Secret rotiert, werden Sitzungen und gespeicherte Verbindungen ungültig.
- **Cloud-Regeln** – `firestore.rules` und `storage.rules` verbieten jeden Client-Zugriff; der Server nutzt das Admin SDK.
- **Header** – `X-Content-Type-Options`, `X-Frame-Options: DENY`, strenge `Referrer-Policy`, restriktive `Permissions-Policy`; Album-Seiten senden `noindex`.
- **Uploads** werden von `sharp` neu kodiert (außer dem gespeicherten Original bei erlaubten Downloads werden keine rohen Nutzerdateien ausgeliefert) und sind größenbegrenzt.
- **Cron-Endpunkt** erfordert das Bearer-Token `CRON_SECRET`.

### Checkliste für Betreiber

- [ ] Überall HTTPS (Reverse Proxy), `WAYFARE_BASE_URL` ist die https-URL
- [ ] Langes, zufälliges `WAYFARE_SECRET`, `.env` nicht für alle lesbar und nicht in Git
- [ ] Backups von Datenbank und Blobs, Wiederherstellung getestet
- [ ] Docker-Image und Abhängigkeiten aktuell halten (Dependabot ist im Repo konfiguriert)
- [ ] Admins auf vertrauenswürdige Personen beschränken
- [ ] Privater Bucket bei S3

Schwachstelle gefunden? Bitte melde sie vertraulich – siehe [SECURITY.md](https://github.com/nullthrone/wayfare/blob/main/SECURITY.md).

## Datenschutz und DSGVO-Hinweise

::: warning Keine Rechtsberatung
Das Folgende sind technische Maßnahmen, die dem Datenschutz helfen. Ob dein Betrieb konform ist, hängt von deiner Situation ab; im Zweifel frag eine Anwältin, einen Anwalt oder deine Datenschutzbeauftragte bzw. deinen Datenschutzbeauftragten.
:::

- **Kein Tracking.** Keine Analyse, keine Werbung, keine Skripte Dritter. Album-Aufrufe werden anonym mit einem Einweg-Hash pro Tag gezählt, ohne IP-Adressen.
- **Selbst gehostete Schriften** (`@fontsource`) – keine Anfragen an Google Fonts oder ein CDN. Einzige Ausnahme ist das Google-Drive-Picker-Skript, das nur geladen wird, wenn ein Owner es öffnet.
- **EXIF/GPS entfernt.** Vorschaubilder und Anzeigeversionen enthalten keine Metadaten. Originale bleiben unverändert und werden nur mit Download-Erlaubnis ausgeliefert – weise Owner darauf hin.
- **Cookies** – nur funktionale Cookies (Sitzung, Album-Freischaltung, Sprache). Für unbedingt erforderliche Cookies ist kein Einwilligungsbanner nötig, prüfe aber das Recht deines Landes.
- **Rechtstexte** – Admins bearbeiten **Impressum** und **Datenschutzerklärung** (Markdown) unter **/admin → Einstellungen**. Der Footer verlinkt sie, sobald sie gefüllt sind. Für den Inhalt bist du verantwortlich: nenne den Verantwortlichen, die Auftragsverarbeiter (Hoster, SMTP-Anbieter, Google bei Import/Login, Firebase falls genutzt), Zwecke und Speicherdauer.
- **Betroffenenrechte** – Nutzer können ihr Konto selbst löschen (**Konto → Löschen**); dabei werden Alben, Fotos, Kommentare, Reaktionen, Verbindungen, Sitzungen und Passkeys entfernt. Admins können Nutzer sperren und Daten auf Anfrage über den Admin-Bereich und die Datenbank exportieren oder löschen.
- **Auftragsverarbeitungsverträge** – Nutzt du Firebase/Google Cloud, S3-Anbieter oder einen SMTP-Anbieter, schließe deren AVV ab und wähle bei Bedarf EU-Regionen.
- **Kinder und sensible Fotos** – Baby- und Gedenkalben enthalten personenbezogene Daten; empfiehl Ownern ein Passwort und ein Ablaufdatum.
