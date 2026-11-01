import { defineConfig, type DefaultTheme } from "vitepress";
import { withMermaid } from "vitepress-plugin-mermaid";

const REPO = "https://github.com/nullthrone/wayfare";
const KOFI = "https://ko-fi.com/tsprock";

type Lang = "en" | "de";

const t = {
  en: {
    guide: "User guide",
    operator: "Operator guide",
    contributing: "Contributing",
    edit: "Edit this page on GitHub",
    footer: "Released under the MIT License.",
    support: "Support on Ko-fi",
    labels: {
      userGuide: "User guide",
      overview: "Overview",
      gettingStarted: "Getting started",
      albums: "Albums",
      photos: "Photos",
      import: "Import from Google",
      sharing: "Sharing & QR codes",
      printing: "Printing",
      themes: "Themes",
      themeBuilder: "Theme builder",
      downloadProtection: "Download protection",
      moderation: "Moderation & guest uploads",
      notificationsStats: "Notifications & statistics",
      viewers: "For guests (viewers)",
      faq: "FAQ",
      operatorGuide: "Operator guide",
      architecture: "Architecture",
      selfHosting: "Self-hosting (Docker)",
      firebase: "Firebase",
      configuration: "Configuration reference",
      authentication: "Authentication",
      photoSources: "Photo sources (Google)",
      storage: "Storage",
      mail: "Mail",
      security: "Security & privacy",
      troubleshooting: "Troubleshooting",
      contributing: "Contributing & docs automation",
    },
  },
  de: {
    guide: "Benutzerhandbuch",
    operator: "Betreiberhandbuch",
    contributing: "Mitmachen",
    edit: "Diese Seite auf GitHub bearbeiten",
    footer: "Veröffentlicht unter der MIT-Lizenz.",
    support: "Auf Ko-fi unterstützen",
    labels: {
      userGuide: "Benutzerhandbuch",
      overview: "Überblick",
      gettingStarted: "Erste Schritte",
      albums: "Alben",
      photos: "Fotos",
      import: "Import aus Google",
      sharing: "Teilen & QR-Codes",
      printing: "Drucken",
      themes: "Themes",
      themeBuilder: "Theme-Builder",
      downloadProtection: "Download-Schutz",
      moderation: "Moderation & Gast-Uploads",
      notificationsStats: "Benachrichtigungen & Statistiken",
      viewers: "Für Gäste (Betrachter)",
      faq: "FAQ",
      operatorGuide: "Betreiberhandbuch",
      architecture: "Architektur",
      selfHosting: "Self-Hosting (Docker)",
      firebase: "Firebase",
      configuration: "Konfigurationsreferenz",
      authentication: "Authentifizierung",
      photoSources: "Foto-Quellen (Google)",
      storage: "Speicher",
      mail: "E-Mail",
      security: "Sicherheit & Datenschutz",
      troubleshooting: "Fehlersuche",
      contributing: "Mitmachen & Doku-Automatisierung",
    },
  },
} as const;

function sidebar(l: Lang): DefaultTheme.Sidebar {
  const p = `/${l}`;
  const x = t[l].labels;
  return {
    [`${p}/guide/`]: [
      {
        text: x.userGuide,
        items: [
          { text: x.overview, link: `${p}/guide/` },
          { text: x.gettingStarted, link: `${p}/guide/getting-started` },
          { text: x.albums, link: `${p}/guide/albums` },
          { text: x.photos, link: `${p}/guide/photos` },
          { text: x.import, link: `${p}/guide/import` },
          { text: x.sharing, link: `${p}/guide/sharing` },
          { text: x.printing, link: `${p}/guide/printing` },
          { text: x.themes, link: `${p}/guide/themes` },
          { text: x.themeBuilder, link: `${p}/guide/theme-builder` },
          { text: x.downloadProtection, link: `${p}/guide/download-protection` },
          { text: x.moderation, link: `${p}/guide/moderation` },
          { text: x.notificationsStats, link: `${p}/guide/notifications-stats` },
          { text: x.viewers, link: `${p}/guide/viewers` },
          { text: x.faq, link: `${p}/guide/faq` },
        ],
      },
    ],
    [`${p}/operator/`]: [
      {
        text: x.operatorGuide,
        items: [
          { text: x.architecture, link: `${p}/operator/` },
          { text: x.selfHosting, link: `${p}/operator/self-hosting` },
          { text: x.firebase, link: `${p}/operator/firebase` },
          { text: x.configuration, link: `${p}/operator/configuration` },
          { text: x.authentication, link: `${p}/operator/authentication` },
          { text: x.photoSources, link: `${p}/operator/photo-sources` },
          { text: x.storage, link: `${p}/operator/storage` },
          { text: x.mail, link: `${p}/operator/mail` },
          { text: x.security, link: `${p}/operator/security` },
          { text: x.troubleshooting, link: `${p}/operator/troubleshooting` },
        ],
      },
    ],
    [`${p}/contributing`]: [
      { text: x.contributing, items: [{ text: x.contributing, link: `${p}/contributing` }] },
    ],
  };
}

function localeTheme(l: Lang): DefaultTheme.Config {
  return {
    nav: [
      { text: t[l].guide, link: `/${l}/guide/`, activeMatch: `/${l}/guide/` },
      { text: t[l].operator, link: `/${l}/operator/`, activeMatch: `/${l}/operator/` },
      { text: t[l].contributing, link: `/${l}/contributing` },
      { text: "GitHub", link: REPO },
      { text: "☕ Ko-fi", link: KOFI },
    ],
    sidebar: sidebar(l),
    editLink: { pattern: `${REPO}/edit/main/docs/:path`, text: t[l].edit },
    footer: {
      message: `${t[l].footer} · <a href="${KOFI}" target="_blank" rel="noopener">☕ ${t[l].support}</a>`,
      copyright: "© Wayfare contributors",
    },
    outline: { level: [2, 3] },
    docFooter: l === "de" ? { prev: "Zurück", next: "Weiter" } : undefined,
    outlineTitle: l === "de" ? "Auf dieser Seite" : "On this page",
    returnToTopLabel: l === "de" ? "Nach oben" : "Back to top",
    sidebarMenuLabel: l === "de" ? "Menü" : "Menu",
    darkModeSwitchLabel: l === "de" ? "Design" : "Appearance",
    langMenuLabel: l === "de" ? "Sprache" : "Language",
  };
}

export default withMermaid(
  defineConfig({
    title: "Wayfare",
    description: "Share photo albums like postcards — via QR code.",
    base: "/wayfare/",
    cleanUrls: true,
    lastUpdated: true,
    srcExclude: ["adr/**", "README.md", "node_modules/**", "public/screenshots/README.md"],
    // Only localhost links (e.g. http://localhost:3000 in the setup guides) may be dead.
    ignoreDeadLinks: [/^https?:\/\/localhost/],
    head: [
      ["link", { rel: "icon", href: "/wayfare/favicon.svg", type: "image/svg+xml" }],
      ["meta", { name: "theme-color", content: "#e07a5f" }],
    ],
    locales: {
      en: { label: "English", lang: "en", link: "/en/", themeConfig: localeTheme("en") },
      de: { label: "Deutsch", lang: "de", link: "/de/", themeConfig: localeTheme("de") },
    },
    themeConfig: {
      logo: { src: "/favicon.svg", alt: "Wayfare" },
      nav: [
        { text: "English", link: "/en/guide/" },
        { text: "Deutsch", link: "/de/guide/" },
        { text: "GitHub", link: REPO },
        { text: "☕ Ko-fi", link: KOFI },
      ],
      socialLinks: [{ icon: "github", link: REPO }],
      search: {
        provider: "local",
        options: {
          locales: {
            de: {
              translations: {
                button: { buttonText: "Suchen", buttonAriaLabel: "Suchen" },
                modal: {
                  noResultsText: "Keine Ergebnisse für",
                  resetButtonTitle: "Zurücksetzen",
                  footer: { selectText: "Auswählen", navigateText: "Navigieren", closeText: "Schließen" },
                },
              },
            },
          },
        },
      },
    },
    markdown: {
      // Screenshots are generated by CI (npm run screenshots) and may not exist yet.
      // Rollup fails on unresolved static image URLs, so render them as dynamic bindings
      // and hide the image if the file is missing.
      config(md) {
        md.renderer.rules.image = (tokens, idx) => {
          const token = tokens[idx];
          const src = token.attrGet("src") ?? "";
          const alt = md.utils.escapeHtml(token.content);
          if (!src.startsWith("/screenshots/")) {
            return `<img src="${md.utils.escapeHtml(src)}" alt="${alt}">`;
          }
          return `<img class="shot" :src="'/wayfare${src}'" alt="${alt}" loading="lazy" @error="$event.target.style.display = 'none'">`;
        };
      },
    },
    mermaid: {},
  }),
);
