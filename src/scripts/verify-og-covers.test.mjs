import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { verifyOgCovers } from "./verify-og-covers.mjs";

const workspaces = [];

const fixture = () => {
  const root = mkdtempSync(join(tmpdir(), "fluxo-og-covers-"));
  workspaces.push(root);
  const outDir = join(root, "dist");
  const publicDir = join(root, "public");
  mkdirSync(outDir, { recursive: true });
  mkdirSync(join(publicDir, "assets", "covers"), { recursive: true });
  return { outDir, publicDir };
};

const writeArticle = (outDir, image) => {
  const articleDir = join(outDir, "blog", "article");
  mkdirSync(articleDir, { recursive: true });
  writeFileSync(
    join(articleDir, "index.html"),
    `<meta property="og:image" content="https://example.com${image}">`,
  );
};

afterEach(() => {
  while (workspaces.length) rmSync(workspaces.pop(), { recursive: true, force: true });
});

describe("verifyOgCovers", () => {
  it("accepts existing blog covers and ignores non-blog OG images", () => {
    const { outDir, publicDir } = fixture();
    writeFileSync(join(outDir, "index.html"), '<meta property="og:image" content="https://example.com/assets/hero.png">');
    writeArticle(outDir, "/assets/covers/article-uk.png");
    writeFileSync(join(publicDir, "assets", "covers", "article-uk.png"), "cover");

    assert.doesNotThrow(() => verifyOgCovers({ outDir, publicDir }));
  });

  it("fails with every missing blog cover", () => {
    const { outDir, publicDir } = fixture();
    writeArticle(outDir, "/assets/covers/article-uk.png");

    assert.throws(
      () => verifyOgCovers({ outDir, publicDir }),
      /Missing OG cover image\(s\): article-uk\.png/u,
    );
  });
});
