import "server-only";
import { marked } from "marked";
import sanitizeHtml from "sanitize-html";

/** Markdown → sanitised HTML (server-side only; output is safe for dangerouslySetInnerHTML). */
export function renderMarkdown(md: string): string {
  const raw = marked.parse(md, { async: false, gfm: true, breaks: false }) as string;
  return sanitizeHtml(raw, {
    allowedTags: [
      "h1", "h2", "h3", "h4", "h5", "h6", "p", "br", "hr", "ul", "ol", "li", "blockquote", "pre", "code",
      "em", "strong", "del", "a", "table", "thead", "tbody", "tr", "th", "td", "span",
    ],
    allowedAttributes: { a: ["href", "title", "rel", "target"], th: ["align"], td: ["align"] },
    allowedSchemes: ["http", "https", "mailto", "tel"],
    transformTags: {
      a: (tagName, attribs) => ({
        tagName,
        attribs: { ...attribs, rel: "noopener noreferrer nofollow", ...(attribs.href?.startsWith("http") ? { target: "_blank" } : {}) },
      }),
    },
  });
}
