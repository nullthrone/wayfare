# Import aus Google Fotos & Google Drive

Statt Fotos aufs Handy zu laden und erneut hochzuladen, kannst du sie direkt aus **Google Fotos** oder **Google Drive** importieren.

::: info Nur verfügbar, wenn der Betreiber es eingerichtet hat
Die Import-Schaltflächen erscheinen nur, wenn der Betreiber die Google-Anbindung konfiguriert hat ([Betreiberhandbuch](../operator/photo-sources)).
:::

## Warum Fotos kopiert werden

Wayfare **kopiert** die ausgewählten Fotos in den eigenen Speicher, statt sie nur zu verlinken. Das ist Absicht (siehe [ADR 0003](https://github.com/nullthrone/wayfare/blob/main/docs/adr/0003-import-not-link.md)):

- Google gibt Apps nur zeitlich begrenzten Zugriff auf die ausgewählten Fotos; die Bildlinks laufen nach etwa einer Stunde ab. Dauerhaftes Verlinken ist technisch unmöglich.
- Dein Album funktioniert weiter, auch wenn du Google später trennst, das Original löschst oder dein Google-Konto wechselst.
- Download-Schutz und Wasserzeichen funktionieren für importierte Fotos genauso.

Die Kehrseite: Importierte Fotos belegen Speicherplatz auf dem Wayfare-Server, und neue Fotos, die du später zu einem Google-Album hinzufügst, werden **nicht** automatisch synchronisiert – importiere sie erneut.

## Ablauf bei Google Fotos

1. Wähle im Album **Import → Google Fotos**.
2. Beim ersten Mal meldest du dich bei Google an und erteilst den Zugriff („Verbinden“). Wayfare darf nur die Fotos lesen, die *du auswählst*.
3. Ein Google-Fenster öffnet sich (der **Picker**). Wähle Fotos oder Alben aus und bestätige.
4. Geh zurück zu Wayfare – es merkt, dass du fertig bist, und zeigt die Anzahl der ausgewählten Fotos.
5. Wayfare lädt sie in Paketen von bis zu 10 Stück herunter und zeigt den Fortschritt. Duplikate werden übersprungen.

## Ablauf bei Google Drive

1. Wähle **Import → Google Drive** und verbinde dein Konto einmalig.
2. Der Google-Drive-Dateiauswahldialog öffnet sich direkt in der Seite. Wähle Bilddateien aus.
3. Bestätige – Wayfare importiert sie wie oben in Paketen.

Wayfare erhält nur Zugriff auf die Dateien, die du ausdrücklich auswählst (Berechtigung `drive.file`), niemals auf dein ganzes Drive.

## Verbindung trennen

Du kannst Google jederzeit im Import-Dialog trennen. Gespeicherte Tokens werden gelöscht. Bereits importierte Fotos bleiben im Album.
