import { readdir, readFile } from "node:fs/promises";
import { gzipSync } from "node:zlib";
import { fileURLToPath } from "node:url";
import type { Plugin } from "vite";

// Generate transport copies only; original point clouds remain unchanged and
// serve as the fallback for browsers without streaming gzip decompression.
export function galaxyCompression(): Plugin {
  return {
    name: "galaxy-lossless-transport",
    apply: "build",
    async generateBundle() {
      const root = new URL("./public/galaxy/galaxies/", import.meta.url);
      for (const directory of await readdir(root, { withFileTypes: true })) {
        if (!directory.isDirectory() || !/^galaxy-[a-e]$/.test(directory.name)) continue;
        const folder = new URL(`${directory.name}/`, root);
        for (const file of await readdir(folder)) {
          if (!file.endsWith(".bin")) continue;
          const path = fileURLToPath(new URL(file, folder));
          this.addWatchFile(path);
          this.emitFile({
            type: "asset",
            fileName: `galaxy/galaxies/${directory.name}/${file}.gz`,
            source: gzipSync(await readFile(path), { level: 9 }),
          });
        }
      }
    },
  };
}
