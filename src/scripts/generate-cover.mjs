#!/usr/bin/env node
// Generate OG cover PNGs (1200x630) for blog articles.
//
// Modes:
//   node generate-cover.mjs '<json>' [outPath]        legacy: render one article from JSON
//   node generate-cover.mjs --all [--managed-root=<p>] batch every article in the managed content root
//   node generate-cover.mjs --slug=<slug> [--locale=en]  regenerate one article
//
// Uses rsvg-convert (`brew install librsvg`).

import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, readdirSync, statSync, unlinkSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import YAML from "yaml";

const __filename = fileURLToPath(import.meta.url);
const REPO_ROOT = resolve(dirname(__filename), "../../..");
const PUBLIC_DIR = join(REPO_ROOT, "public");
const COVERS_DIR = join(PUBLIC_DIR, "assets", "covers");
const FAVICON_PATH = join(PUBLIC_DIR, "assets", "favicon.png");

const FAVICON_DATA_URI = `data:image/png;base64,${readFileSync(FAVICON_PATH).toString("base64")}`;

const SITE_COVER_CONFIG_PATH = join(REPO_ROOT, "src/config/cover.mjs");
const siteCoverConfig = existsSync(SITE_COVER_CONFIG_PATH)
  ? await import(pathToFileURL(SITE_COVER_CONFIG_PATH).href)
  : {};

const DEFAULT_THEMES = {
  workflows: {
    label: "WORKFLOWS",
    from: "#5B34F0", to: "#3A1CB0", badge: "#E7DEFF",
    motif: `<g fill="none" stroke="#fff" stroke-opacity="0.10" stroke-width="2">
      <circle cx="1140" cy="600" r="120"/><circle cx="1140" cy="600" r="210"/>
      <circle cx="1140" cy="600" r="300"/><circle cx="1140" cy="600" r="410"/></g>`,
  },
  "learning-science": {
    label: "LEARNING SCIENCE",
    from: "#3A1CB0", to: "#241178", badge: "#CFC2FF",
    motif: `<g stroke="#fff" stroke-opacity="0.12" stroke-width="2" fill="#fff" fill-opacity="0.16">
      <line x1="980" y1="150" x2="1080" y2="280"/><line x1="1080" y1="280" x2="960" y2="380"/>
      <line x1="1080" y1="280" x2="1140" y2="180"/><line x1="960" y1="380" x2="1090" y2="470"/>
      <circle cx="980" cy="150" r="10"/><circle cx="1080" cy="280" r="14"/>
      <circle cx="960" cy="380" r="10"/><circle cx="1140" cy="180" r="8"/><circle cx="1090" cy="470" r="12"/></g>`,
  },
  "how-to": {
    label: "HOW-TO",
    from: "#6A46F5", to: "#4526C4", badge: "#EBE4FF",
    motif: `<g fill="#fff" fill-opacity="0.08">
      <rect x="900" y="470" width="80" height="80"/><rect x="990" y="410" width="80" height="140"/>
      <rect x="1080" y="350" width="80" height="200"/></g>`,
  },
  tools: {
    label: "TOOLS",
    from: "#4C27E3", to: "#2E1690", badge: "#DED2FF",
    motif: `<g fill="none" stroke="#fff" stroke-opacity="0.10" stroke-width="2">
      ${Array.from({ length: 12 }, (_, i) => {
        const c = i % 4, r = (i / 4) | 0;
        return `<rect x="${920 + c * 66}" y="${360 + r * 66}" width="52" height="52" rx="10"/>`;
      }).join("")}</g>`,
  },
  video: {
    label: "VIDEO",
    from: "#4C27E3", to: "#1F0F73", badge: "#E7DEFF",
    motif: `<g fill="#fff" fill-opacity="0.10" stroke="#fff" stroke-opacity="0.15" stroke-width="2">
      <rect x="900" y="360" width="220" height="140" rx="16"/>
      <polygon points="990,405 990,455 1035,430" fill="#fff" fill-opacity="0.55"/></g>`,
  },
};

const DEFAULT_PAGE_TYPE_TO_CATEGORY = {
  how_to: "how-to",
  comparison: "workflows",
  concept: "learning-science",
  video_summary: "video",
  template: "tools",
};

const THEMES = { ...DEFAULT_THEMES, ...(siteCoverConfig.themes || {}) };
const PAGE_TYPE_TO_CATEGORY = { ...DEFAULT_PAGE_TYPE_TO_CATEGORY, ...(siteCoverConfig.pageTypeToCategory || {}) };
const STATIC_CATEGORY_TO_THEME = siteCoverConfig.staticCategoryToTheme || {};
const DEFAULT_THEME_KEY = siteCoverConfig.defaultTheme || "workflows";
const BRAND_NAME = siteCoverConfig.brand || "Fluxo";

const XML_ESCAPES = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" };
const escapeXml = (s) => String(s).replace(/[&<>"']/g, (c) => XML_ESCAPES[c]);

function wrap(title, max = 22) {
  const words = title.split(/\s+/);
  const lines = [];
  let line = "";
  for (const w of words) {
    if (!line) { line = w; continue; }
    if ((line + " " + w).length > max) { lines.push(line); line = w; }
    else line += " " + w;
  }
  if (line) lines.push(line);
  return lines.slice(0, 4);
}

function fontSizeForLines(count) {
  return count <= 2 ? 74 : count === 3 ? 66 : 56;
}

function estimateReadMin(body) {
  const words = body.replace(/```[\s\S]*?```/g, " ").split(/\s+/).filter(Boolean).length;
  return Math.max(3, Math.round(words / 220));
}

const XML_ESCAPES_EXPORT = XML_ESCAPES; // reserved for future re-export
export const svgHelpers = { escapeXml, wrap, fontSizeForLines };

// Kit-supplied default SVG. Sites can replace it entirely by exporting
// `renderSvg({ title, category, readMin, brand, theme })` from src/config/cover.mjs.
// The site-supplied renderer receives the resolved theme + brand so it can
// build a fully custom layout while still reusing the batch pipeline below.
function defaultSvg({ title, category, readMin = 6, brand = BRAND_NAME }) {
  const t = THEMES[category] || THEMES[DEFAULT_THEME_KEY] || THEMES.workflows;
  const lines = wrap(title, category === "learning-science" ? 20 : 22);
  const fs = fontSizeForLines(lines.length);
  const lineHeight = Math.round(fs * 1.12);
  const blockH = lines.length * lineHeight;
  const startY = 260 - Math.round(blockH / 2) + fs;
  const titleTs = lines
    .map((l, i) => `<text x="80" y="${startY + i * lineHeight}" font-size="${fs}">${escapeXml(l)}</text>`)
    .join("");
  const badgeW = 60 + t.label.length * 13;
  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="1200" height="630" viewBox="0 0 1200 630" font-family="'Roboto Flex',Roboto,Arial,sans-serif">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${t.from}"/><stop offset="1" stop-color="${t.to}"/></linearGradient>
    <radialGradient id="glow" cx="0.85" cy="0.15" r="0.9"><stop offset="0" stop-color="#8A6BFF" stop-opacity="0.5"/><stop offset="1" stop-color="#8A6BFF" stop-opacity="0"/></radialGradient>
    <pattern id="dots" width="34" height="34" patternUnits="userSpaceOnUse"><circle cx="2" cy="2" r="2" fill="#fff" fill-opacity="0.06"/></pattern>
  </defs>
  <rect width="1200" height="630" fill="url(#bg)"/><rect width="1200" height="630" fill="url(#dots)"/><rect width="1200" height="630" fill="url(#glow)"/>
  ${t.motif}
  <rect x="80" y="90" width="${badgeW}" height="46" rx="23" fill="#fff" fill-opacity="0.14"/>
  <text x="106" y="120" font-size="20" font-weight="700" letter-spacing="2" fill="${t.badge}">${escapeXml(t.label)}</text>
  <g fill="#fff" font-weight="800" letter-spacing="-1.5">${titleTs}</g>
  <image x="80" y="512" width="52" height="52" xlink:href="${FAVICON_DATA_URI}"/>
  <text x="148" y="547" font-size="26" font-weight="700" fill="#fff">${escapeXml(brand)}</text>
  <text x="1120" y="547" font-size="22" font-weight="500" fill="#D9CEFF" text-anchor="end">${readMin} min read</text>
</svg>`;
}

function svg(args) {
  if (typeof siteCoverConfig.renderSvg === "function") {
    const theme = THEMES[args.category] || THEMES[DEFAULT_THEME_KEY] || THEMES.workflows;
    return siteCoverConfig.renderSvg({
      ...args,
      brand: args.brand ?? BRAND_NAME,
      theme,
      helpers: svgHelpers,
    });
  }
  return defaultSvg(args);
}

function rasterize(svgString, outPng) {
  mkdirSync(dirname(outPng), { recursive: true });
  const tmpSvg = outPng.replace(/\.png$/, ".tmp.svg");
  writeFileSync(tmpSvg, svgString);
  try {
    execFileSync("rsvg-convert", ["-w", "1200", "-h", "630", tmpSvg, "-o", outPng]);
  } finally {
    try { unlinkSync(tmpSvg); } catch {}
  }
}

function splitFrontmatter(source) {
  if (!source.startsWith("---\n")) throw new Error("Missing frontmatter");
  const end = source.indexOf("\n---\n", 4);
  if (end === -1) throw new Error("Unterminated frontmatter");
  return {
    yaml: source.slice(4, end),
    body: source.slice(end + 5),
  };
}

const FRONTMATTER_KEY_ORDER = [
  "schemaVersion","draftId","slug","locale","pageType","title","metaDescription",
  "createdAt","translationGroupId","heroImage","relatedPosts","faq","references",
  "compared","videoUrl","itemCount","importUrl","author","sources",
];

function reorderFrontmatter(fm) {
  const out = {};
  for (const k of FRONTMATTER_KEY_ORDER) if (k in fm) out[k] = fm[k];
  for (const k of Object.keys(fm)) if (!(k in out)) out[k] = fm[k];
  return out;
}

function writeFrontmatter(filePath, fm, body) {
  const yaml = YAML.stringify(reorderFrontmatter(fm), {
    defaultStringType: "QUOTE_DOUBLE",
    defaultKeyType: "PLAIN",
    lineWidth: 0,
    minContentWidth: 0,
  });
  writeFileSync(filePath, `---\n${yaml}---\n${body}`);
}

function articleFromFile(filePath) {
  const raw = readFileSync(filePath, "utf8");
  const { yaml, body } = splitFrontmatter(raw);
  const fm = YAML.parse(yaml);
  // Static-blog frontmatter has no pageType — map its plain `category` string
  // via the site's staticCategoryToTheme config. Generated posts stick with
  // pageType → theme so behaviour for existing Fluxo generated posts is unchanged.
  const category = fm.pageType
    ? (PAGE_TYPE_TO_CATEGORY[fm.pageType] || DEFAULT_THEME_KEY)
    : (STATIC_CATEGORY_TO_THEME[fm.category] || DEFAULT_THEME_KEY);
  return {
    filePath, fm, body,
    slug: fm.slug,
    locale: fm.locale,
    title: fm.title,
    category,
    readMin: estimateReadMin(body),
  };
}

function coverPath(slug, locale) {
  const base = locale && locale !== "en" ? `${slug}-${locale}.png` : `${slug}.png`;
  return { abs: join(COVERS_DIR, base), rel: `/assets/covers/${base}` };
}

function generateFor(article) {
  const { abs, rel } = coverPath(article.slug, article.locale);
  rasterize(svg({
    title: article.title,
    category: article.category,
    readMin: article.readMin,
  }), abs);
  return { abs, rel };
}

function findManagedFiles(managedRoot) {
  const out = [];
  for (const locale of readdirSync(managedRoot)) {
    const dir = join(managedRoot, locale);
    let s;
    try { s = statSync(dir); } catch { continue; }
    if (!s.isDirectory()) continue;
    for (const name of readdirSync(dir)) {
      if (name.endsWith(".mdx") || name.endsWith(".md")) out.push(join(dir, name));
    }
  }
  return out;
}

function parseFlags(argv) {
  const out = { positional: [] };
  for (const a of argv.slice(2)) {
    if (a.startsWith("--")) {
      const [k, v] = a.slice(2).split("=");
      out[k] = v ?? true;
    } else {
      out.positional.push(a);
    }
  }
  return out;
}

function main() {
  const flags = parseFlags(process.argv);

  if (flags.all || flags.slug) {
    const managedRoot = resolve(REPO_ROOT, flags["managed-root"] || "src/content/blog/generated");
    const staticRoot = resolve(REPO_ROOT, flags["static-root"] || "src/content/blog-static");
    const roots = [managedRoot];
    try { if (statSync(staticRoot).isDirectory()) roots.push(staticRoot); } catch {}
    const files = roots.flatMap(findManagedFiles).filter((f) => {
      if (!flags.slug) return true;
      const article = articleFromFile(f);
      const localeOk = !flags.locale || article.locale === flags.locale;
      return article.slug === flags.slug && localeOk;
    });
    if (files.length === 0) {
      console.error("no matching articles");
      process.exit(1);
    }
    for (const f of files) {
      const article = articleFromFile(f);
      const { rel } = generateFor(article);
      console.log(`cover  ${article.locale}/${article.slug}  ${rel}  (${article.readMin} min, ${article.category})`);
    }
    return;
  }

  const json = flags.positional[0];
  if (!json) {
    console.error("Usage: generate-cover.mjs --all | --slug=<slug> [--locale=en] | '<json>' [outPath]");
    process.exit(1);
  }
  const art = JSON.parse(json);
  const out = resolve(flags.positional[1] || join(COVERS_DIR, `${art.slug}.png`));
  rasterize(svg(art), out);
  console.log("wrote", out);
}

main();
