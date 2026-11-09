import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  blogPath,
  findLostUrls,
  readRedirectSources,
  toVercelRedirects,
  writeBlogRedirects,
} from "./blog-routes.ts";

const tempRepo = async (vercel) => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "blog-routes-"));
  if (vercel) await fs.writeFile(path.join(dir, "vercel.json"), JSON.stringify(vercel, null, 2));
  return dir;
};

describe("blogPath", () => {
  it("keeps English at the root and prefixes other locales", () => {
    assert.equal(blogPath("en", "safe-to-spend"), "/blog/safe-to-spend/");
    assert.equal(blogPath("de", "safe-to-spend"), "/de/blog/safe-to-spend/");
  });

  it("points a null slug at the blog index of the locale", () => {
    assert.equal(blogPath("en", null), "/blog/");
    assert.equal(blogPath("es", null), "/es/blog/");
  });
});

describe("toVercelRedirects", () => {
  it("emits permanent redirects sorted by source and drops self-redirects", () => {
    const result = toVercelRedirects([
      { fromLocale: "es", fromSlug: "old", toLocale: "en", toSlug: "new" },
      { fromLocale: "en", fromSlug: "old", toLocale: "en", toSlug: "new" },
      { fromLocale: "en", fromSlug: "same", toLocale: "en", toSlug: "same" },
    ]);
    assert.deepEqual(result, [
      { source: "/blog/old/", destination: "/blog/new/", permanent: true },
      { source: "/es/blog/old/", destination: "/blog/new/", permanent: true },
    ]);
  });
});

describe("writeBlogRedirects", () => {
  it("replaces blog redirects and keeps hand-written ones and other settings", async () => {
    const repo = await tempRepo({
      trailingSlash: true,
      redirects: [
        { source: "/pricing/", destination: "/", permanent: true },
        { source: "/blog/stale/", destination: "/blog/", permanent: true },
      ],
    });

    const changed = await writeBlogRedirects(repo, [
      { fromLocale: "en", fromSlug: "old", toLocale: "en", toSlug: null },
    ]);

    const config = JSON.parse(await fs.readFile(path.join(repo, "vercel.json"), "utf8"));
    assert.equal(changed, true);
    assert.equal(config.trailingSlash, true);
    assert.deepEqual(config.redirects, [
      { source: "/pricing/", destination: "/", permanent: true },
      { source: "/blog/old/", destination: "/blog/", permanent: true },
    ]);
  });

  it("does not touch the file when nothing changes", async () => {
    const repo = await tempRepo({ trailingSlash: true });
    const before = await fs.readFile(path.join(repo, "vercel.json"), "utf8");
    await writeBlogRedirects(repo, []);
    await writeBlogRedirects(repo, []);
    const after = await fs.readFile(path.join(repo, "vercel.json"), "utf8");
    assert.equal(JSON.parse(after).redirects, undefined);
    assert.deepEqual(JSON.parse(after), JSON.parse(before));
  });

  it("reads back the sources it wrote", async () => {
    const repo = await tempRepo({});
    await writeBlogRedirects(repo, [
      { fromLocale: "de", fromSlug: "alt", toLocale: "de", toSlug: "neu" },
    ]);
    assert.deepEqual([...(await readRedirectSources(repo))], ["/de/blog/alt/"]);
  });
});

describe("findLostUrls", () => {
  it("reports URLs that vanish without a redirect", () => {
    const before = new Set(["/blog/a/", "/blog/b/", "/es/blog/c/"]);
    const after = new Set(["/blog/a/"]);
    const redirected = new Set(["/blog/b/"]);
    assert.deepEqual(findLostUrls(before, after, redirected), ["/es/blog/c/"]);
  });

  it("accepts new URLs and moved files that keep their URL", () => {
    const before = new Set(["/blog/a/"]);
    const after = new Set(["/blog/a/", "/de/blog/a/"]);
    assert.deepEqual(findLostUrls(before, after, new Set()), []);
  });
});
