/** Shared blob-key validation: POSIX-like relative paths, no traversal, no absolute paths. */
export function assertSafeKey(key: string, kind: "key" | "prefix" = "key"): void {
  const bad = (why: string) => {
    throw new Error(`Invalid blob ${kind} ${JSON.stringify(key)}: ${why}`);
  };
  if (typeof key !== "string" || key.length === 0) bad("empty");
  if (key.includes("\0")) bad("NUL byte");
  if (key.includes("\\")) bad("backslash");
  if (key.startsWith("/") || /^[A-Za-z]:/.test(key)) bad("absolute path");
  if (key.split("/").some((seg) => seg === ".." || seg === ".")) bad("path traversal");
  if (key.includes("..")) bad("path traversal");
  if (kind === "key" && (key.endsWith("/") || key.endsWith(".meta.json"))) bad("reserved name");
}
