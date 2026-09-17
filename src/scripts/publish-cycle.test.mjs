// End-to-end rehearsal of what the publish workflow does to a landing:
// `sync-blog-content` pulls a rebuild from the backend and rewrites the managed
// root from scratch, then `assign-related-posts` fills the "Keep reading" block.
// The pair has to behave like the hero image does — a recommendation is picked
// once and then left alone, however many rebuilds run afterwards.

import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import http from "node:http";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import YAML from "yaml";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SYNC_SCRIPT = path.join(__dirname, "sync-blog-content.ts");
const ASSIGN_SCRIPT = path.join(__dirname, "assign-related-posts.ts");
const TSCONFIG_PATH = path.resolve(__dirname, "../../../tsconfig.json");

const MAX_RELATED_POSTS = 3;
const MIN_INBOUND_LINKS = 2;
const APPLICATION_ID = "019e92d8-b331-7321-a2fc-a0f82fc0d2c3";
const REBUILD_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const API_KEY = "test-api-key";

const TOPICS = [
  ["active-recall", "Active Recall for Durable Learning", "Retrieval practice beats rereading for durable learning."],
  ["spaced-repetition", "Spaced Repetition Explained", "Space your reviews so memory survives the forgetting curve."],
  ["interleaving", "Interleaving Your Practice", "Mixing topics keeps retrieval effortful and transfer strong."],
  ["feynman-technique", "The Feynman Technique", "Explain an idea plainly and the gaps in it become obvious."],
  ["zettelkasten", "Zettelkasten for Note Takers", "Atomic notes linked together turn into a knowledge graph."],
  ["memory-palace", "The Memory Palace Method", "Anchor vivid images along a route you already know by heart."],
];

const draftIdFor = (index) => `dddddddd-dddd-4ddd-8ddd-${String(index).padStart(12, "0")}`;

const buildPost = (index) => {
  const [slug, title, metaDescription] = TOPICS[index];
  return {
    draftId: draftIdFor(index),
    includedInRebuild: true,
    slug,
    locale: "en",
    title,
    metaDescription,
    bodyMdx: `# ${title}\n\n${metaDescription} Learning and memory improve when retrieval is spaced and effortful.`,
    faq: [],
    references: [],
    createdAt: "2026-07-28T12:00:00.000Z",
    updatedAt: "2026-07-29T12:00:00.000Z",
    translationGroupId: draftIdFor(index),
    author: {
      id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      name: "Jane E2E",
      role: "Editor",
      photoUrl: null,
      bio: [{ locale: "en", text: "Short bio" }],
      links: { website: "https://example.com" },
    },
    sources: [],
    pageType: "concept",
  };
};

const buildExport = (indices) => {
  const posts = indices.map((index) => buildPost(index));
  return {
    schemaVersion: 1,
    rebuild: { id: REBUILD_ID, applicationId: APPLICATION_ID, createdAt: "2026-07-28T12:00:00.000Z" },
    application: { id: APPLICATION_ID, name: "Fluxo", domain: "fluxo.today", defaultLocale: "en" },
    stats: { totalPosts: posts.length, includedPosts: posts.length },
    posts,
  };
};

const run = (script, args, cwd) =>
  new Promise((resolve) => {
    const child = spawn("npx", ["tsx", "--tsconfig", TSCONFIG_PATH, script, ...args], {
      cwd,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => (stdout += chunk.toString()));
    child.stderr.on("data", (chunk) => (stderr += chunk.toString()));
    child.on("close", (code) => resolve({ code, stdout, stderr }));
  });

let workspace;
let managedRoot;
let server;
let backendUrl;
const ALL = TOPICS.map((_, index) => index);
let published = buildExport(ALL.slice(0, -1));

before(async () => {
  workspace = await fs.mkdtemp(path.join(os.tmpdir(), "landing-kit-cycle-"));
  managedRoot = path.join(workspace, "src/content/blog/generated");
  server = http.createServer((req, res) => {
    if (req.headers["x-api-key"] !== API_KEY) {
      res.writeHead(401);
      res.end("unauthorized");
      return;
    }
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(published));
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  backendUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  await new Promise((resolve) => server.close(() => resolve()));
  await fs.rm(workspace, { recursive: true, force: true }).catch(() => {});
});

// One turn of the publish workflow: pull the rebuild, then assign the links.
const publishCycle = async () => {
  const sync = await run(
    SYNC_SCRIPT,
    [
      "--rebuild-id", REBUILD_ID,
      "--api-key", API_KEY,
      "--backend-url", backendUrl,
      "--managed-root", managedRoot,
      "--application-id", APPLICATION_ID,
    ],
    workspace,
  );
  assert.equal(sync.code, 0, `sync stderr=${sync.stderr}`);
  const assign = await run(ASSIGN_SCRIPT, ["--managed-root", managedRoot], workspace);
  assert.equal(assign.code, 0, `assign stderr=${assign.stderr}`);
  return JSON.parse(assign.stdout);
};

const readBlog = async () => {
  const dir = path.join(managedRoot, "en");
  const out = new Map();
  for (const name of (await fs.readdir(dir)).sort()) {
    const source = await fs.readFile(path.join(dir, name), "utf8");
    const data = YAML.parse(source.slice(4, source.indexOf("\n---\n", 4)));
    out.set(data.slug, data);
  }
  return out;
};

describe("publish cycle: sync then assign", () => {
  it("gives every article of the first rebuild a full Keep reading block", async () => {
    const stats = await publishCycle();
    assert.equal(stats.generated, TOPICS.length - 1);
    assert.equal(stats.minRelatedPosts, MAX_RELATED_POSTS);

    const blog = await readBlog();
    assert.equal(blog.size, TOPICS.length - 1);
    const routes = new Set([...blog.keys()].map((slug) => `/blog/${slug}/`));
    for (const [slug, data] of blog) {
      assert.equal(data.relatedPosts.length, MAX_RELATED_POSTS);
      for (const post of data.relatedPosts) {
        assert.ok(routes.has(post.href), `${slug} links to a real article`);
        assert.notEqual(post.href, `/blog/${slug}/`);
      }
    }
  });

  it("re-running the same rebuild changes nothing at all", async () => {
    const before = await readBlog();
    const stats = await publishCycle();
    assert.equal(stats.updated, 0, "an unchanged rebuild must not rewrite a single article");
    const after = await readBlog();
    for (const [slug, data] of before) {
      assert.deepEqual(after.get(slug).relatedPosts, data.relatedPosts);
      assert.equal(after.get(slug).heroImage, data.heroImage, "the hero image is sticky the same way");
    }
  });

  it("keeps published recommendations and makes the new post reachable", async () => {
    const before = await readBlog();

    // The backend publishes one more article; everything else is unchanged.
    published = buildExport(ALL);
    const stats = await publishCycle();
    assert.equal(stats.generated, TOPICS.length);
    assert.equal(stats.minRelatedPosts, MAX_RELATED_POSTS);
    assert.equal(stats.minInboundLinks, MIN_INBOUND_LINKS);
    assert.ok(
      stats.updated <= 1 + MIN_INBOUND_LINKS,
      `the newcomer plus at most ${MIN_INBOUND_LINKS} donors may be written, ${stats.updated} were`,
    );

    const after = await readBlog();
    let donors = 0;
    for (const [slug, data] of before) {
      const now = after.get(slug).relatedPosts;
      const kept = now.filter((post) => data.relatedPosts.some((old) => old.href === post.href));
      assert.deepEqual(
        kept,
        data.relatedPosts.filter((old) => now.some((post) => post.href === old.href)),
        `${slug} must keep its surviving cards verbatim and in order`,
      );
      assert.ok(kept.length >= MAX_RELATED_POSTS - 1, `${slug} may give up at most one card`);
      if (kept.length !== data.relatedPosts.length) donors++;
    }
    assert.ok(donors <= MIN_INBOUND_LINKS, `at most ${MIN_INBOUND_LINKS} older articles may donate, ${donors} did`);

    const newSlug = TOPICS[TOPICS.length - 1][0];
    const newcomer = after.get(newSlug);
    assert.ok(newcomer, "the new article must exist");
    assert.equal(newcomer.relatedPosts.length, MAX_RELATED_POSTS, "the new article must get its own links");
    assert.match(newcomer.heroImage, /^\/assets\//u);

    const inbound = [...after.values()].flatMap((data) => data.relatedPosts)
      .filter((post) => post.href === `/blog/${newSlug}/`).length;
    assert.ok(
      inbound >= MIN_INBOUND_LINKS,
      `the new article must be reachable from at least ${MIN_INBOUND_LINKS} articles, got ${inbound}`,
    );
  });

  it("edited backend copy does not disturb the link graph", async () => {
    const before = await readBlog();
    published = buildExport(ALL);
    published.posts[0].title = "Active Recall, Revised";
    published.posts[0].bodyMdx = "# Active Recall, Revised\n\nCompletely rewritten body text.";
    published.posts[0].updatedAt = "2026-08-01T12:00:00.000Z";

    const stats = await publishCycle();
    assert.equal(stats.updated, 0, "a content edit must not reshuffle anybody's recommendations");

    const after = await readBlog();
    assert.equal(after.get("active-recall").title, "Active Recall, Revised", "the backend still owns the copy");
    for (const [slug, data] of before) {
      assert.deepEqual(after.get(slug).relatedPosts, data.relatedPosts);
    }
  });

  it("drops an unpublished article from everyone's Keep reading block", async () => {
    // Unpublish an article from the first rebuild: by now it is frozen into
    // other articles' blocks, so the drop has to survive the freeze.
    const removedIndex = 2;
    const removed = TOPICS[removedIndex][0];
    const referrers = [...(await readBlog())]
      .filter(([, data]) => data.relatedPosts.some((post) => post.href === `/blog/${removed}/`))
      .map(([slug]) => slug);
    assert.ok(referrers.length > 0, "the fixture must be linked before it is unpublished");

    published = buildExport(ALL.filter((index) => index !== removedIndex));
    const stats = await publishCycle();
    assert.equal(stats.minRelatedPosts, MAX_RELATED_POSTS, "the freed slots must be refilled");
    assert.equal(stats.updated, referrers.length, "only the articles that lost a link may be rewritten");

    const after = await readBlog();
    assert.equal(after.has(removed), false);
    for (const [slug, data] of after) {
      assert.equal(
        data.relatedPosts.some((post) => post.href === `/blog/${removed}/`),
        false,
        `${slug} must not keep a link to an unpublished article`,
      );
      assert.equal(data.relatedPosts.length, MAX_RELATED_POSTS);
    }
  });
});
