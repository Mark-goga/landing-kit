import { readdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, relative, sep } from "node:path";

// Run from the landing's project root — kit is consumed as a submodule, so
// resolving `dist/` off the script location would land inside the kit.
const distDir = join(process.cwd(), "dist");

const walk = async (dir, extensions) => {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const path = join(dir, entry.name);

    if (entry.isDirectory()) {
      files.push(...(await walk(path, extensions)));
      continue;
    }

    if (entry.isFile() && extensions.some((ext) => entry.name.endsWith(ext))) {
      files.push(path);
    }
  }

  return files;
};

const prefixFor = (htmlPath) => {
  const relativeDir = relative(distDir, dirname(htmlPath));

  if (!relativeDir) {
    return "./";
  }

  const depth = relativeDir.split(sep).filter(Boolean).length;

  return "../".repeat(depth);
};

for (const htmlPath of await walk(distDir, [".html"])) {
  const prefix = prefixFor(htmlPath);
  const html = await readFile(htmlPath, "utf8");
  const next = html
    .replaceAll('href="/_astro/', `href="${prefix}_astro/`)
    .replaceAll('src="/_astro/', `src="${prefix}_astro/`)
    .replaceAll('href="/assets/', `href="${prefix}assets/`)
    .replaceAll('src="/assets/', `src="${prefix}assets/`)
    .replaceAll('href="/script.js"', `href="${prefix}script.js"`)
    .replaceAll('src="/script.js"', `src="${prefix}script.js"`);

  if (next !== html) {
    await writeFile(htmlPath, next);
  }
}

// Bundled CSS always lives in dist/_astro/, so font/asset URLs there
// can use a fixed relative prefix that works from file:// and hosting.
for (const cssPath of await walk(join(distDir, "_astro"), [".css"])) {
  const css = await readFile(cssPath, "utf8");
  const next = css.replaceAll("url(/assets/", "url(../assets/");

  if (next !== css) {
    await writeFile(cssPath, next);
  }
}
