import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const COVER_PATH_RE = /\/assets\/covers\/([^/?#]+\.png)(?:[?#][^"']*)?$/u;

const htmlFiles = (dir) =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return htmlFiles(path);
    return entry.isFile() && entry.name.endsWith(".html") ? [path] : [];
  });

export const verifyOgCovers = ({ outDir, publicDir }) => {
  const missing = new Set();

  for (const file of htmlFiles(outDir)) {
    const html = readFileSync(file, "utf8");
    for (const match of html.matchAll(/<meta property="og:image" content="([^"]+)"/gu)) {
      const cover = match[1].match(COVER_PATH_RE)?.[1];
      if (cover && !existsSync(join(publicDir, "assets", "covers", cover))) {
        missing.add(cover);
      }
    }
  }

  if (missing.size) {
    throw new Error(
      `Missing OG cover image(s): ${[...missing].sort().join(", ")}. ` +
        "Run npm run covers:generate before building.",
    );
  }
};
