/* eslint-disable @typescript-eslint/no-require-imports */
/**
 * Preload for CLI scripts (seed): makes `import "server-only"` a no-op outside Next.js.
 * (`tsx --conditions=react-server` also works for `server-only`, but it swaps `react` for its
 * server build, which lacks `createContext` and breaks `next-intl`'s translator.)
 */
const Module = require("node:module");
const orig = Module._resolveFilename;
Module._resolveFilename = function (request, ...rest) {
  if (request === "server-only") return __filename;
  return orig.call(this, request, ...rest);
};
