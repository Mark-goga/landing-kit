import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import { existsSync } from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import http from "node:http";
import os from "node:os";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SCRIPT_PATH = path.join(__dirname, "sync-blog-content.ts");

const APPLICATION_ID = "019e92d8-b331-7321-a2fc-a0f82fc0d2c3";
const REBUILD_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const OTHER_APPLICATION_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const API_KEY = "test-api-key";
const AUTHOR_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const DRAFT_ID_A = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const DRAFT_ID_B = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
const DRAFT_ID_C = "ffffffff-ffff-4fff-8fff-ffffffffffff";
const BLOG_HERO_IMAGES = [
  "/assets/card-1.png",
  "/assets/card-2.png",
  "/assets/card-3.png",
];

const buildAuthor = () => ({
  id: AUTHOR_ID,
  name: "Jane E2E",
  role: "Editor",
  photoUrl: null,
  bio: [{ locale: "en", text: "Short bio" }],
  links: { website: "https://example.com" },
});

const buildPost = (overrides = {}) => ({
  draftId: DRAFT_ID_A,
  includedInRebuild: true,
  slug: "active-recall",
  locale: "en",
  title: "Active Recall",
  metaDescription: "Guide to active recall for durable learning.",
  bodyMdx: "# Active Recall\n\nBody paragraph.",
  faq: [],
  references: [],
  createdAt: "2026-07-28T12:00:00.000Z",
  translationGroupId: DRAFT_ID_A,
  author: buildAuthor(),
  sources: [],
  pageType: "how_to",
  ...overrides,
});

const buildExport = (postsOrOverrides = {}) => {
  const posts = Array.isArray(postsOrOverrides)
    ? postsOrOverrides
    : [buildPost(postsOrOverrides)];
  return {
    schemaVersion: 1,
    rebuild: {
      id: REBUILD_ID,
      applicationId: APPLICATION_ID,
      createdAt: "2026-07-28T12:00:00.000Z",
    },
    application: {
      id: APPLICATION_ID,
      name: "Fluxo",
      domain: "fluxo.today",
      defaultLocale: "en",
    },
    stats: { totalPosts: posts.length, includedPosts: posts.length },
    posts,
  };
};

const startFixtureServer = (respondWith) =>
  new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      if (req.headers["x-api-key"] !== API_KEY) {
        res.writeHead(401);
        res.end("unauthorized");
        return;
      }
      const responder = typeof respondWith === "function" ? respondWith(req) : respondWith;
      const status = responder.status ?? 200;
      res.writeHead(status, { "Content-Type": "application/json" });
      res.end(JSON.stringify(responder.body ?? {}));
    });
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const url = `http://127.0.0.1:${address.port}`;
      resolve({ server, url });
    });
  });

const runScript = ({ cwd, args, env = {} }) =>
  new Promise((resolve) => {
    const child = spawn("npx", ["tsx", SCRIPT_PATH, ...args], {
      cwd,
      env: { ...process.env, ...env },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("close", (code) => resolve({ code, stdout, stderr }));
  });

let workspace;
let managedRoot;
let fixtureServer;
let fixtureUrl;
let responseState = { body: buildExport() };

const setResponse = (nextBody) => {
  responseState.body = nextBody;
};

before(async () => {
  workspace = await fs.mkdtemp(path.join(os.tmpdir(), "fluxo-sync-"));
  managedRoot = path.join(workspace, "src/content/blog/generated");
  const started = await startFixtureServer(() => ({ body: responseState.body }));
  fixtureServer = started.server;
  fixtureUrl = started.url;
});

after(async () => {
  await new Promise((resolve) => fixtureServer.close(() => resolve()));
  await fs.rm(workspace, { recursive: true, force: true }).catch(() => {});
});

const invoke = () =>
  runScript({
    cwd: workspace,
    args: [
      "--rebuild-id",
      REBUILD_ID,
      "--api-key",
      API_KEY,
      "--backend-url",
      fixtureUrl,
      "--managed-root",
      managedRoot,
      "--application-id",
      APPLICATION_ID,
    ],
  });

describe("sync-blog-content", () => {
  it("writes the desired file set + manifest + emits stdout JSON", async () => {
    setResponse(
      buildExport([
        buildPost({ draftId: DRAFT_ID_A, slug: "active-recall", locale: "en" }),
        buildPost({
          draftId: DRAFT_ID_B,
          slug: "active-recall",
          locale: "uk",
          title: "Активне пригадування",
          translationGroupId: DRAFT_ID_A,
        }),
      ]),
    );
    const result = await invoke();
    assert.equal(result.code, 0, `stderr=${result.stderr}`);
    const jsonLine = result.stdout.trim();
    const parsed = JSON.parse(jsonLine);
    assert.ok(Array.isArray(parsed.files));
    assert.equal(parsed.files.length, 2);

    const enFile = path.join(managedRoot, "en", "active-recall.md");
    const ukFile = path.join(managedRoot, "uk", "active-recall.md");
    assert.ok(existsSync(enFile));
    assert.ok(existsSync(ukFile));
    const manifestPath = path.join(managedRoot, "manifest.json");
    const manifest = JSON.parse(await fs.readFile(manifestPath, "utf8"));
    assert.equal(manifest.schemaVersion, 1);
    assert.equal(manifest.applicationId, APPLICATION_ID);
    assert.equal(manifest.rebuildId, REBUILD_ID);
    assert.equal(manifest.posts.length, 2);
  });

  it("preserves backend-owned Markdown exactly", async () => {
    setResponse(
      buildExport({
        bodyMdx:
          '# Active Recall\n\n> **Source:** An original video. https://example.com/video\n\n---\n\n> A meaningful quote that belongs to the article.\n\nBody paragraph.',
      }),
    );
    const result = await invoke();
    assert.equal(result.code, 0, `stderr=${result.stderr}`);
    const body = await fs.readFile(path.join(managedRoot, "en", "active-recall.md"), "utf8");
    assert.match(body, /\*\*Source:\*\*/);
    assert.match(body, /> A meaningful quote that belongs to the article\./);
  });

  it("re-run with identical export is byte-identical (idempotent serialization)", async () => {
    const before = await fs.readFile(path.join(managedRoot, "en", "active-recall.md"));
    const beforeManifest = await fs.readFile(path.join(managedRoot, "manifest.json"));
    const result = await invoke();
    assert.equal(result.code, 0, `stderr=${result.stderr}`);
    const after = await fs.readFile(path.join(managedRoot, "en", "active-recall.md"));
    const afterManifest = await fs.readFile(path.join(managedRoot, "manifest.json"));
    assert.deepEqual(after, before);
    assert.deepEqual(afterManifest, beforeManifest);
  });

  it("selects one landing image for a new article and preserves it on later syncs", async () => {
    setResponse(buildExport(buildPost({ draftId: DRAFT_ID_B, slug: "image-choice" })));
    let result = await invoke();
    assert.equal(result.code, 0, `stderr=${result.stderr}`);

    const imagePath = path.join(managedRoot, "en", "image-choice.md");
    const first = await fs.readFile(imagePath, "utf8");
    const firstImage = first.match(/heroImage: "([^"]+)"/u)?.[1];
    assert.ok(firstImage && BLOG_HERO_IMAGES.includes(firstImage));

    result = await invoke();
    assert.equal(result.code, 0, `stderr=${result.stderr}`);
    const second = await fs.readFile(imagePath, "utf8");
    assert.match(second, new RegExp(`heroImage: "${firstImage}"`, "u"));
  });

  it("does not assign a landing image to a video summary", async () => {
    setResponse(
      buildExport(
        buildPost({
          draftId: DRAFT_ID_C,
          slug: "video-summary",
          pageType: "video_summary",
          videoUrl: "https://www.youtube.com/watch?v=abcdefghijk",
        }),
      ),
    );
    const result = await invoke();
    assert.equal(result.code, 0, `stderr=${result.stderr}`);
    const serialized = await fs.readFile(path.join(managedRoot, "en", "video-summary.md"), "utf8");
    assert.doesNotMatch(serialized, /heroImage:/u);
  });

  it("removes managed files that disappear from the export", async () => {
    setResponse(
      buildExport([
        buildPost({ draftId: DRAFT_ID_A, slug: "active-recall", locale: "en" }),
      ]),
    );
    const result = await invoke();
    assert.equal(result.code, 0, `stderr=${result.stderr}`);
    assert.ok(existsSync(path.join(managedRoot, "en", "active-recall.md")));
    assert.equal(
      existsSync(path.join(managedRoot, "uk", "active-recall.md")),
      false,
      "uk translation should be removed when it disappears from the export",
    );
  });

  it("fails on unsupported schemaVersion without touching the managed root", async () => {
    const invalidResponse = buildExport();
    invalidResponse.schemaVersion = 2;
    setResponse(invalidResponse);
    const before = await fs.readFile(path.join(managedRoot, "en", "active-recall.md"));
    const result = await invoke();
    assert.notEqual(result.code, 0);
    assert.match(result.stderr, /schemaVersion|Unrecognized|Invalid/);
    const after = await fs.readFile(path.join(managedRoot, "en", "active-recall.md"));
    assert.deepEqual(after, before, "existing managed content must be untouched on schema failure");
    setResponse(buildExport());
  });

  it("fails on application mismatch and leaves managed root intact", async () => {
    const mismatched = buildExport();
    mismatched.application.id = OTHER_APPLICATION_ID;
    setResponse(mismatched);
    const before = await fs.readFile(path.join(managedRoot, "en", "active-recall.md"));
    const result = await invoke();
    assert.notEqual(result.code, 0);
    assert.match(result.stderr, /Application mismatch|application/i);
    const after = await fs.readFile(path.join(managedRoot, "en", "active-recall.md"));
    assert.deepEqual(after, before);
    setResponse(buildExport());
  });

  it("rejects a malformed slug", async () => {
    setResponse(
      buildExport([
        buildPost({ draftId: DRAFT_ID_C, slug: "../../etc/passwd", locale: "en" }),
      ]),
    );
    const result = await invoke();
    assert.notEqual(result.code, 0);
    assert.match(result.stderr, /Invalid slug|slug/i);
    setResponse(buildExport());
  });

  it("rejects a managed root that is outside content/blog/generated", async () => {
    const dangerous = path.join(workspace, "unsafe-root");
    const result = await runScript({
      cwd: workspace,
      args: [
        "--rebuild-id",
        REBUILD_ID,
        "--api-key",
        API_KEY,
        "--backend-url",
        fixtureUrl,
        "--managed-root",
        dangerous,
        "--application-id",
        APPLICATION_ID,
      ],
    });
    assert.notEqual(result.code, 0);
    assert.match(result.stderr, /Refusing to touch managed root/);
  });

  it("requires all CLI arguments to be provided", async () => {
    const result = await runScript({
      cwd: workspace,
      args: [
        "--rebuild-id",
        REBUILD_ID,
        "--api-key",
        API_KEY,
        "--backend-url",
        fixtureUrl,
      ],
    });
    assert.notEqual(result.code, 0);
    assert.match(result.stderr, /Missing required argument|managed-root/);
  });

  it("propagates a non-2xx backend response as an error", async () => {
    const originalHandler = responseState.body;
    setResponse({ status: 500, body: "backend down" });
    // temporarily wire the fixture to return 500 by wrapping response
    const backend = http.createServer((req, res) => {
      if (req.headers["x-api-key"] !== API_KEY) {
        res.writeHead(401);
        res.end();
        return;
      }
      res.writeHead(500);
      res.end("backend down");
    });
    await new Promise((r) => backend.listen(0, "127.0.0.1", r));
    const port = backend.address().port;
    try {
      const result = await runScript({
        cwd: workspace,
        args: [
          "--rebuild-id",
          REBUILD_ID,
          "--api-key",
          API_KEY,
          "--backend-url",
          `http://127.0.0.1:${port}`,
          "--managed-root",
          managedRoot,
          "--application-id",
          APPLICATION_ID,
        ],
      });
      assert.notEqual(result.code, 0);
      assert.match(result.stderr, /Export failed|500/);
    } finally {
      await new Promise((r) => backend.close(r));
      setResponse(originalHandler);
    }
  });
});
