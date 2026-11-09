#!/usr/bin/env tsx
// Fails when a blog URL that exists at --ref (default HEAD) is gone from the
// working tree without a redirect in vercel.json. A rebuild must never turn a
// live article into a 404: retire it through the backend, which exports a
// redirect for it.

import { execFileSync } from "node:child_process";
import { promises as fs } from "node:fs";
import { existsSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { blogPath, findLostUrls, readRedirectSources } from "./blog-routes";

const CONTENT_ROOTS = ["src/content/blog/generated", "src/content/blog-static"];
const ARTICLE_RE = /(?:^|\/)([a-z]{2})\/([a-z0-9-]+)\.mdx?$/;

const pathOfFile = (file: string): string | null => {
  const match = ARTICLE_RE.exec(file);
  return match ? blogPath(match[1], match[2]) : null;
};

const toPaths = (files: string[]): Set<string> =>
  new Set(files.map(pathOfFile).filter((route): route is string => route !== null));

const filesAtRef = (repoRoot: string, ref: string): string[] =>
  execFileSync("git", ["ls-tree", "-r", "--name-only", ref, "--", ...CONTENT_ROOTS], {
    cwd: repoRoot,
    encoding: "utf8",
  })
    .split("\n")
    .filter(Boolean);

const filesInTree = async (repoRoot: string): Promise<string[]> => {
  const roots = CONTENT_ROOTS.filter((root) => existsSync(path.join(repoRoot, root)));
  const nested = await Promise.all(
    roots.map(async (root) => {
      const entries = await fs.readdir(path.join(repoRoot, root), { recursive: true });
      return entries.map((entry) => `${root}/${String(entry).replace(/\\/g, "/")}`);
    }),
  );
  return nested.flat();
};

const main = async (): Promise<void> => {
  const refIndex = process.argv.indexOf("--ref");
  const ref = refIndex > -1 ? process.argv[refIndex + 1] : "HEAD";
  const repoRoot = process.cwd();

  const before = toPaths(filesAtRef(repoRoot, ref));
  const after = toPaths(await filesInTree(repoRoot));
  const lost = findLostUrls(before, after, await readRedirectSources(repoRoot));

  if (lost.length > 0) {
    process.stderr.write(
      `${String(lost.length)} blog URL(s) would disappear without a redirect:\n${lost.join("\n")}\n`,
    );
    process.exit(1);
  }
  process.stdout.write(
    `URL retention OK: ${String(before.size)} before, ${String(after.size)} after, none lost.\n`,
  );
};

main().catch((err: unknown) => {
  process.stderr.write(`check-url-retention failed: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});
