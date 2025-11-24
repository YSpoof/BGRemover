import adapter from "@sveltejs/adapter-static";
import { relative, sep } from "node:path";

/** @type {import('@sveltejs/kit').Config} */
const config = {
  compilerOptions: {
    // defaults to rune mode for the project, execept for `node_modules`. Can be removed in svelte 6.
    runes: ({ filename }) => {
      const relativePath = relative(import.meta.dirname, filename);
      const pathSegments = relativePath.toLowerCase().split(sep);
      const isExternalLibrary = pathSegments.includes("node_modules");

      return isExternalLibrary ? undefined : true;
    },
    experimental: {
      async: true,
    },
    modernAst: true,
  },
  kit: {
    adapter: adapter({
      precompress: false,
      fallback: "404.html",
    }),
    experimental: {
      remoteFunctions: true,
      handleRenderingErrors: true,
    },
    output: {
      bundleStrategy: "single",
    },
    version: {
      pollInterval: 1000 * 60, // 1 minute
    },
  },
};

export default config;
