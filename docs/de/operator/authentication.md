# Authentifizierung

Wayfare nutzt [Better Auth](https://www.better-auth.com). Welche Anmeldemethoden erscheinen, bestimmen Umgebungsvariablen ([Referenz](./configuration)). Owner und Gäste nutzen dieselben Methoden.

Registriere bei jedem OAuth-Anbieter diese **Redirect-(Callback-)URI**:

```
${WAYFARE_BASE_URL}/api/auth/callback/<provider>
```

mit `<provider>` = `google`, `apple`, `facebook` oder `discord`. Beispiel: `https://photos.example.com/api/auth/callback/google`. Die URL muss exakt zu `WAYFARE_BASE_URL` passen.

## Admin-Bootstrap

- Jeder, dessen E-Mail in `WAYFARE_ADMIN_EMAILS` steht (kommagetrennt), wird bei der Registrierung **Admin** und bei der nächsten Anmeldung befördert.
- Gibt es noch gar keinen Admin, wird der **erste Nutzer**, der sich registriert, Admin.
- Danach befördern Admins weitere Nutzer unter **/admin → Nutzer** und wählen den Onboarding-Modus.

## E-Mail und Passwort

Setze `AUTH_EMAIL_PASSWORD=true`. Standardmäßig aus, weil die meisten Magic Links oder Social Login bevorzugen.

## Magic Link

Standardmäßig an (`AUTH_MAGIC_LINK=true`). Braucht funktionierenden Mailversand ([E-Mail](./mail)); ohne `SMTP_URL` wird der Link nur ins Server-Log geschrieben – für die Entwicklung ausreichend.

## Passkeys

`AUTH_PASSKEY=true` (Standard). Passkeys erfordern **HTTPS** (außer auf `localhost`) und eine **stabile Domain** – ein Passkey ist an den Domainnamen gebunden, eine Änderung von `WAYFARE_BASE_URL` macht bestehende Passkeys ungültig. Nutze Passkeys nicht auf einer Wegwerf-URL.

## Google

1. [Google Cloud Console](https://console.cloud.google.com) → Projekt anlegen/auswählen.
2. *APIs & Dienste → OAuth-Zustimmungsbildschirm*: *Extern* wählen, App-Name, Support-E-Mail und deine Domain angeben; die Scopes `openid`, `email`, `profile` sind unkritisch.
3. *Anmeldedaten → Anmeldedaten erstellen → OAuth-Client-ID → Webanwendung*.
4. Autorisierte Weiterleitungs-URI: `${WAYFARE_BASE_URL}/api/auth/callback/google`.
5. `AUTH_GOOGLE_ID` und `AUTH_GOOGLE_SECRET` setzen.

Veröffentliche den Zustimmungsbildschirm (*In Produktion*), damit sich nicht nur Testnutzer anmelden können. Denselben Client kannst du für den [Foto-Import](./photo-sources) wiederverwenden, indem du die zweite Redirect-URI ergänzt.

## Apple

„Mit Apple anmelden“ erfordert eine Mitgliedschaft im **Apple Developer Program** (**99 USD/Jahr**) und eine HTTPS-Domain.

1. *Certificates, Identifiers & Profiles → Identifiers*: Lege eine **App ID** mit der Capability *Sign in with Apple* an.
2. Lege eine **Services ID** an (z. B. `com.example.wayfare.web`). Aktiviere *Sign in with Apple* und *Configure*: primäre App ID, deine Domain (ohne `https://`) und die Return-URL `${WAYFARE_BASE_URL}/api/auth/callback/apple`.
3. *Keys*: Erstelle einen Schlüssel mit *Sign in with Apple*, lade die `.p8`-Datei einmalig herunter und notiere **Key ID** und deine **Team ID**.
4. Apples „Client Secret“ ist ein **JWT**, signiert mit diesem Schlüssel (ES256; `iss` = Team ID, `sub` = Services ID, `aud` = `https://appleid.apple.com`, Laufzeit max. 6 Monate). Erzeuge es mit einem kleinen Skript oder dem Hilfsprogramm aus der Better-Auth-Dokumentation.
5. Setze `AUTH_APPLE_ID` = **Services ID** und `AUTH_APPLE_SECRET` = das JWT. `AUTH_APPLE_BUNDLE_ID` brauchst du nur für native Apps.

::: warning Das Secret läuft ab
Erzeuge das JWT neu, bevor es abläuft (spätestens alle 6 Monate), und starte neu. Trag dir eine Erinnerung in den Kalender ein.
:::

## Facebook

1. [developers.facebook.com](https://developers.facebook.com) → *App erstellen* (Anwendungsfall: *Mit Facebook authentifizieren und Daten von Nutzern anfordern*).
2. Füge das Produkt *Facebook Login* hinzu → *Gültige OAuth-Redirect-URIs*: `${WAYFARE_BASE_URL}/api/auth/callback/facebook`.
3. *Einstellungen → Allgemein*: **App-ID** und **App-Geheimcode** kopieren → `AUTH_FACEBOOK_ID`, `AUTH_FACEBOOK_SECRET`. Trage die URL zur Datenschutzerklärung (deine /privacy-Seite) und ein App-Icon ein.
4. Die App startet im *Entwicklungsmodus*: Nur Personen mit App-Rolle (du, Tester) können sich anmelden. Für alle anderen schaltest du auf *Live* – Meta verlangt für Berechtigungen über `email` und `public_profile` hinaus möglicherweise eine **Unternehmensverifizierung und App-Überprüfung**. Wayfare braucht nur diese beiden Basisberechtigungen, die nach dem Livegang ohne Überprüfung verfügbar sind.

## Discord

1. [discord.com/developers/applications](https://discord.com/developers/applications) → *New Application*.
2. *OAuth2*: Redirect `${WAYFARE_BASE_URL}/api/auth/callback/discord` hinzufügen; **Client ID** und **Client Secret** kopieren.
3. `AUTH_DISCORD_ID` und `AUTH_DISCORD_SECRET` setzen. Verwendet werden die Scopes `identify` und `email`.

## Prüfen

Starte Wayfare neu und öffne die Anmeldeseite – jeder konfigurierte Anbieter zeigt eine Schaltfläche. Bei Problemen siehe [Fehlersuche](./troubleshooting).
