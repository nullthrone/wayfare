# Photo sources (Google Photos & Drive)

Owners can import photos from Google Photos and Google Drive. This needs a Google Cloud project that you own. Photos are *copied* into Wayfare ([why](https://github.com/nullthrone/wayfare/blob/main/docs/adr/0003-import-not-link.md)).

The import buttons are shown only when the integration is configured.

## 1. Project and APIs

In the [Google Cloud Console](https://console.cloud.google.com) select (or create) a project and enable under *APIs & Services → Library*:

- **Google Photos Picker API**
- **Google Drive API**
- **Google Picker API**

## 2. OAuth consent screen

*APIs & Services → OAuth consent screen* (or *Google Auth Platform*):

- User type *External*, app name, support e-mail, privacy-policy link (your `/privacy` page).
- **Scopes** to add:
  - `https://www.googleapis.com/auth/photospicker.mediaitems.readonly` — read only the photos the user picks
  - `https://www.googleapis.com/auth/drive.file` — only files the user picks via the Picker (non-restricted scope)
- Add yourself as *test user* while testing.

## 3. OAuth client

If you already use Google sign-in (`AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET`), you can leave `GOOGLE_SOURCES_CLIENT_ID` and `GOOGLE_SOURCES_CLIENT_SECRET` empty: Wayfare automatically reuses that OAuth client and its existing redirect URI (`${WAYFARE_BASE_URL}/api/auth/callback/google`).

If you prefer a dedicated OAuth client for photo import (*Credentials → Create credentials → OAuth client ID → Web application*), set `GOOGLE_SOURCES_CLIENT_ID` and `GOOGLE_SOURCES_CLIENT_SECRET` and add the authorized redirect URI:

```
${WAYFARE_BASE_URL}/api/sources/callback
```

## 4. Drive Picker: API key and app ID

The Drive file picker runs in the browser and needs:

- **`GOOGLE_API_KEY`** — *Credentials → Create credentials → API key*. Restrict it: *Application restrictions → Websites (HTTP referrers)* → `https://photos.example.com/*`; *API restrictions* → Google Picker API.
- **`GOOGLE_APP_ID`** — the **project number** (not the project ID) from the Cloud Console dashboard.

The Picker script is the only third-party script Wayfare ever loads, and only when an owner opens the Drive picker.

## 5. Verification and limits

- While the consent screen is in *Testing* status only listed test users can connect, and refresh tokens expire after 7 days. Move to *In production* for normal use.
- With the sensitive Photos scope Google may require **app verification** for public apps (a short review with a demo video and privacy policy). For friends-and-family instances you can keep the app unverified: users see a "Google hasn't verified this app" warning and have to click through (up to 100 users).
- `drive.file` is non-restricted, so no costly security assessment is needed — one reason Wayfare uses the Picker instead of browsing all of Drive.
- Google Photos baseUrls expire after about one hour, which is why Wayfare downloads the selected photos right away.

## Troubleshooting

- `redirect_uri_mismatch` — the URI in the console differs from `${WAYFARE_BASE_URL}/api/sources/callback` (scheme, host, path, trailing slash).
- Drive picker does not open — missing/incorrect `GOOGLE_API_KEY` referrer restriction or `GOOGLE_APP_ID`.
- "Access blocked: app not verified" — add the user as test user or publish the consent screen.
