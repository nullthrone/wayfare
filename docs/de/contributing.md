# Mitmachen & Doku-Automatisierung

Wayfare ist Open Source (MIT) und freut sich über Beiträge: Fehlerberichte, Themes, Übersetzungen, Foto-Quellen, Login-Anbieter und Dokumentation. Den vollständigen Leitfaden findest du in [CONTRIBUTING.md](https://github.com/nullthrone/wayfare/blob/main/CONTRIBUTING.md) (auf Englisch). Die wichtigsten Punkte:

## Schnellstart

```bash
git clone https://github.com/nullthrone/wayfare.git && cd wayfare
npm ci
cp .env.example .env     # WAYFARE_SECRET setzen (32+ Zeichen)
npm run dev
```

Führe vor dem PR `npm run lint && npm run typecheck && npm test` aus. Nutze [Conventional Commits](https://www.conventionalcommits.org/) (`feat(album): …`, `fix: …`, `docs: …`).

## Konventionen kurz gefasst

- Ports & Adapters: Nur `src/server/container.ts` wählt Implementierungen; die Autorisierung liegt in `src/server/services`.
- Aller UI-Text über next-intl, **sowohl** `messages/de` **als auch** `messages/en`; Deutsch duzt.
- Keine Anfragen Dritter aus dem Browser (selbst gehostete Schriften, keine Analyse).
- Erweitern: [Theme hinzufügen](https://github.com/nullthrone/wayfare/blob/main/CONTRIBUTING.md#how-to-add-a-theme), [Foto-Quelle](https://github.com/nullthrone/wayfare/blob/main/CONTRIBUTING.md#how-to-add-a-photo-source-adapter) oder [Login-Anbieter](https://github.com/nullthrone/wayfare/blob/main/CONTRIBUTING.md#how-to-add-a-login-provider).

## Regeln für die Dokumentation

Jede Änderung, die Nutzer oder Betreiber bemerken können, muss `docs/en/**` **und** `docs/de/**` aktualisieren. Neue Umgebungsvariablen gehören in `docs/{en,de}/operator/configuration.md`. Hat sich die Oberfläche geändert, aktualisiere das Screenshot-Szenario `e2e/screenshots.mjs`.

```bash
npm run docs:dev      # Live-Vorschau dieser Seite
npm run docs:build    # Produktions-Build
npm run docs:check    # prüft, ob die Doku zum Code passt
```

## Wie die Doku aktuell bleibt

Drei Ebenen arbeiten zusammen, damit die Dokumentation nicht veraltet:

1. **Claude-Code-Stop-Hook** (`.claude/settings.json` → `.claude/hooks/docs-sync-check.mjs`). Arbeitest du mit Claude Code und beendest einen Durchgang, vergleicht der Hook deine Änderungen (gegen `origin/main` plus uncommittete Dateien) mit der Doku. Hat sich nutzersichtbarer Code ohne Doku-Änderung geändert – oder fehlt ein Env-Schlüssel aus `src/server/config.ts` in der Konfigurationsreferenz –, blockiert er das Beenden und fordert Claude auf, die Doku in beiden Sprachen zu aktualisieren oder zu begründen, warum keine nötig ist. Dieselbe Logik gibt es als `npm run docs:check` (`scripts/check-docs.mjs`), das auch die CI nutzt.
2. **Workflow `claude-docs`** (`.github/workflows/claude-docs.yml`). Bei Pushes auf `main`, die `src/**` oder `messages/**` berühren, vergleicht die Claude-Code-GitHub-Action den Diff mit der Doku und öffnet einen Pull Request `docs: sync with <sha>`, falls etwas zu aktualisieren ist. Sie braucht das Repository-Secret `ANTHROPIC_API_KEY`; ohne wird der Job übersprungen.
3. **Workflow `docs`** (`.github/workflows/docs.yml`). Bei Pushes auf `main` baut er die App, startet sie im Demo-Modus mit Seed-Daten (`npm run seed`), erstellt die Screenshots mit Playwright (`npm run screenshots` → `docs/public/screenshots/{de,en}/*.png`), baut diese VitePress-Seite und deployt sie auf GitHub Pages. Die Screenshots sind damit immer aktuell und werden nie von Hand committet.

## Demo-Daten & Screenshots lokal

Die Screenshots stammen aus einer befüllten Demo-Instanz (deutschsprachige Inhalte, echte Vorschaubilder, Kommentare, Moderations-Warteschlange, ein eigenes Theme). So erzeugst du sie selbst:

```bash
export WAYFARE_SECRET=docs-demo-secret-0123456789-0123456789-abcdef
export WAYFARE_DEMO_MODE=true WAYFARE_BASE_URL=http://localhost:3000 DATA_DIR=./data-demo
npm run build
npm run seed -- --reset   # --reset leert zuerst DATA_DIR; ohne WAYFARE_DEMO_MODE=true bricht das Skript ab
npm start &               # danach in einer zweiten Shell:
npx playwright install chromium   # einmalig
npm run screenshots       # schreibt docs/public/screenshots/{de,en}/*.png
```

Alle Demo-Konten haben das Passwort `wayfare-demo`: `admin@wayfare.demo` (Admin), `thomas@wayfare.demo` (Owner) sowie die Gäste `mia@`, `jonas@`, `oma.erika@` und `ben@wayfare.demo`. Das passwortgeschützte Hochzeitsalbum hat das Album-Passwort `lena-jonas`. Fotos werden aus `e2e/fixtures/photos/<name>.jpg` übernommen, falls vorhanden (siehe dortige `PROMPTS.md`); fehlende Dateien ersetzt das Skript durch generierte Platzhalter. Details: [`e2e/README.md`](https://github.com/nullthrone/wayfare/blob/main/e2e/README.md).

## Das Projekt unterstützen

Wenn Wayfare dir nützt: [☕ ko-fi.com/tsprock](https://ko-fi.com/tsprock).
