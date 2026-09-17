import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import YAML from "yaml";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SCRIPT_PATH = path.join(__dirname, "assign-related-posts.ts");
const TSCONFIG_PATH = path.resolve(__dirname, "../../../tsconfig.json");
const MAX_RELATED_POSTS = 3;
const MIN_INBOUND_LINKS = 2;

const runScript = ({ cwd, root }) =>
  new Promise((resolve) => {
    const child = spawn("npx", ["tsx", "--tsconfig", TSCONFIG_PATH, SCRIPT_PATH, "--managed-root", root], {
      cwd,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => (stdout += chunk.toString()));
    child.stderr.on("data", (chunk) => (stderr += chunk.toString()));
    child.on("close", (code) => resolve({ code, stdout, stderr }));
  });

const runOk = async (options) => {
  const result = await runScript(options);
  assert.equal(result.code, 0, `stderr=${result.stderr}`);
  return JSON.parse(result.stdout);
};

const markdown = ({ slug, title, description, body, relatedPosts }) =>
  [
    "---",
    'locale: "en"',
    `slug: "${slug}"`,
    'pageType: "concept"',
    `title: "${title}"`,
    `metaDescription: "${description}"`,
    `translationGroupId: "${slug}-group"`,
    'heroImage: "/assets/card-1.png"',
    ...(relatedPosts ? [YAML.stringify({ relatedPosts }).trimEnd()] : []),
    "---",
    "",
    body,
    "",
  ].join("\n");

const readFrontmatter = async (file) => {
  const source = await fs.readFile(file, "utf8");
  const end = source.indexOf("\n---\n", 4);
  return YAML.parse(source.slice(4, end));
};

// Vocabulary is intentionally uneven so relevance scoring has something to
// separate: without a spread, every ordering would look equally correct.
const CORPUS = [
  ["active-recall", "Active recall for learning", "Use retrieval practice to retain learning material.", "Retrieval practice makes memory durable."],
  ["spaced-repetition", "Spaced repetition and memory", "Use active recall to build durable memory.", "Learning improves when retrieval is spaced over time."],
  ["learning-notes", "Learning notes that improve recall", "Notes and retrieval create better learning habits.", "Active recall connects notes and memory."],
  ["interleaving-practice", "Interleaving practice sessions", "Mix topics so retrieval stays effortful.", "Interleaving forces retrieval across topics."],
  ["feynman-technique", "The Feynman technique explained", "Explain an idea plainly to expose gaps.", "Explaining exposes gaps in understanding."],
  ["zettelkasten-method", "Zettelkasten method for notes", "Link atomic notes into a durable knowledge graph.", "Atomic notes link into a knowledge graph."],
  ["weekly-review", "A weekly review that sticks", "Review notes every week to keep knowledge alive.", "Weekly review keeps knowledge alive."],
  ["memory-palace", "Memory palace walkthrough", "Place vivid images along a familiar route.", "A familiar route anchors vivid images."],
  ["flashcard-design", "Flashcard design principles", "Write one idea per card to keep recall sharp.", "One idea per card keeps recall sharp."],
  ["study-schedule", "Building a study schedule", "Spread study sessions across the week.", "Spread sessions instead of cramming."],
  ["reading-strategy", "A reading strategy for retention", "Read actively and summarise in your own words.", "Summarise in your own words while reading."],
  ["exam-preparation", "Exam preparation without cramming", "Plan retrieval sessions ahead of the exam.", "Plan retrieval sessions ahead of the exam."],
];

// `sync-blog-content` emits `.mdx`; hand-authored posts are still `.md`. Both
// extensions must take part in the graph, so the corpus mixes them.
const extensionFor = (index) => (index % 2 === 0 ? ".mdx" : ".md");

const writeCorpus = async (dir, entries, startIndex = 0) => {
  await fs.mkdir(dir, { recursive: true });
  await Promise.all(
    entries.map(([slug, title, description, body, relatedPosts], offset) =>
      fs.writeFile(
        path.join(dir, `${slug}${extensionFor(startIndex + offset)}`),
        markdown({ slug, title, description, body, relatedPosts }),
      ),
    ),
  );
};

const readGraph = async (dir) => {
  const nodes = new Map();
  for (const file of (await fs.readdir(dir)).sort()) {
    const data = await readFrontmatter(path.join(dir, file));
    nodes.set(`/blog/${data.slug}/`, data.relatedPosts ?? []);
  }
  return nodes;
};

const snapshot = async (dir) => {
  const out = {};
  for (const file of (await fs.readdir(dir)).sort()) {
    out[file] = await fs.readFile(path.join(dir, file), "utf8");
  }
  return out;
};

const withWorkspace = async (prefix, run) => {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
  const root = path.join(workspace, "src/content/blog/generated");
  try {
    return await run({ workspace, root, dir: path.join(root, "en") });
  } finally {
    await fs.rm(workspace, { recursive: true, force: true });
  }
};

let workspace;
let root;
let dir;

before(async () => {
  workspace = await fs.mkdtemp(path.join(os.tmpdir(), "landing-kit-related-"));
  root = path.join(workspace, "src/content/blog/generated");
  dir = path.join(root, "en");
  await writeCorpus(dir, CORPUS);
});

after(async () => {
  await fs.rm(workspace, { recursive: true, force: true });
});

describe("assign-related-posts", () => {
  it("fills every article to the full quota across .md and .mdx", async () => {
    const stats = await runOk({ cwd: workspace, root });
    assert.equal(stats.generated, CORPUS.length, "every article must be picked up, regardless of extension");
    assert.equal(stats.minRelatedPosts, MAX_RELATED_POSTS);
    assert.equal(stats.updated, CORPUS.length);

    const graph = await readGraph(dir);
    assert.equal(graph.size, CORPUS.length);
    for (const [href, related] of graph) {
      assert.equal(related.length, MAX_RELATED_POSTS, `${href} must carry ${MAX_RELATED_POSTS} links`);
      const targets = new Set(related.map((post) => post.href));
      assert.equal(targets.size, related.length, "each recommendation must be unique");
      assert.equal(targets.has(href), false, "article must not link to itself");
      for (const target of targets) assert.ok(graph.has(target), `${target} must resolve to a real article`);
      for (const post of related) {
        assert.ok(post.title.length > 0);
        assert.ok(post.metaDescription.length > 0);
      }
    }
  });

  it("leaves no article without an inbound link", async () => {
    const graph = await readGraph(dir);
    const inbound = new Map([...graph.keys()].map((href) => [href, 0]));
    for (const related of graph.values()) {
      for (const post of related) inbound.set(post.href, (inbound.get(post.href) ?? 0) + 1);
    }
    const starved = [...inbound].filter(([, count]) => count < MIN_INBOUND_LINKS).map(([href]) => href);
    assert.deepEqual(starved, [], `every article needs at least ${MIN_INBOUND_LINKS} inbound links`);
  });

  it("writes nothing on a re-run", async () => {
    const before = await snapshot(dir);
    const stats = await runOk({ cwd: workspace, root });
    assert.equal(stats.updated, 0, "an unchanged corpus must not be rewritten");
    assert.equal(stats.preserved, CORPUS.length);
    assert.deepEqual(await snapshot(dir), before, "a re-run must not churn the files");
  });

  it("keeps published recommendations, bar the slots the newcomers need", async () =>
    withWorkspace("landing-kit-grow-", async ({ workspace: cwd, root: managed, dir: enDir }) => {
      await writeCorpus(enDir, CORPUS.slice(0, 6));
      await runOk({ cwd, root: managed });
      const before = await readGraph(enDir);

      await writeCorpus(enDir, CORPUS.slice(6), 6);
      const stats = await runOk({ cwd, root: managed });
      assert.equal(stats.minRelatedPosts, MAX_RELATED_POSTS);
      assert.equal(stats.minInboundLinks, MIN_INBOUND_LINKS);

      const after = await readGraph(enDir);
      const newcomers = [...after.keys()].filter((href) => !before.has(href));
      assert.equal(newcomers.length, CORPUS.length - 6);

      // An older article may lose exactly one card so a newcomer becomes
      // reachable; everything else about its block has to stay put.
      let changed = 0;
      for (const [href, related] of before) {
        const now = after.get(href);
        assert.equal(now.length, MAX_RELATED_POSTS);
        const kept = now.filter((post) => related.some((old) => old.href === post.href));
        assert.ok(
          kept.length >= MAX_RELATED_POSTS - 1,
          `${href} may give up at most one recommendation, lost ${MAX_RELATED_POSTS - kept.length}`,
        );
        assert.deepEqual(kept, related.filter((old) => now.some((post) => post.href === old.href)),
          `${href} must keep the surviving cards verbatim and in order`);
        if (kept.length !== related.length) changed++;
      }
      assert.ok(
        changed <= newcomers.length * MIN_INBOUND_LINKS,
        `at most ${newcomers.length * MIN_INBOUND_LINKS} older articles may move a link, ${changed} did`,
      );

      const inbound = new Map([...after.keys()].map((href) => [href, 0]));
      for (const related of after.values()) {
        for (const post of related) inbound.set(post.href, (inbound.get(post.href) ?? 0) + 1);
      }
      for (const href of newcomers) {
        assert.ok(
          (inbound.get(href) ?? 0) >= MIN_INBOUND_LINKS,
          `${href} is new and must be reachable from at least ${MIN_INBOUND_LINKS} articles`,
        );
        assert.equal(after.get(href).length, MAX_RELATED_POSTS);
      }
    }));

  it("tops a partial article up without rewriting the card it already had", async () =>
    withWorkspace("landing-kit-partial-", async ({ workspace: cwd, root: managed, dir: enDir }) => {
      // Hand-authored card copy that deliberately differs from the target's own
      // frontmatter — static posts quote a subtitle, not the meta description.
      const handAuthored = {
        href: "/blog/zettelkasten-method/",
        title: "A hand-picked title",
        metaDescription: "Editorial copy that must survive untouched.",
        heroImage: "/assets/card-2.png",
      };
      await writeCorpus(enDir, [
        [...CORPUS[0], [handAuthored]],
        ...CORPUS.slice(1, 6),
      ]);

      const stats = await runOk({ cwd, root: managed });
      assert.equal(stats.minRelatedPosts, MAX_RELATED_POSTS);

      const related = (await readGraph(enDir)).get("/blog/active-recall/");
      assert.equal(related.length, MAX_RELATED_POSTS);
      assert.deepEqual(related[0], handAuthored, "the stored card must stay first and unchanged");
      assert.equal(new Set(related.map((post) => post.href)).size, MAX_RELATED_POSTS);
    }));

  it("drops a recommendation whose target disappeared and refills the slot", async () =>
    withWorkspace("landing-kit-removed-", async ({ workspace: cwd, root: managed, dir: enDir }) => {
      await writeCorpus(enDir, CORPUS.slice(0, 6));
      await runOk({ cwd, root: managed });

      const victim = "/blog/zettelkasten-method/";
      const referrers = [...(await readGraph(enDir))]
        .filter(([, related]) => related.some((post) => post.href === victim))
        .map(([href]) => href);
      assert.ok(referrers.length > 0, "the fixture must actually be linked before it is removed");
      const victimIndex = CORPUS.findIndex((entry) => entry[0] === "zettelkasten-method");
      await fs.rm(path.join(enDir, `zettelkasten-method${extensionFor(victimIndex)}`));

      const stats = await runOk({ cwd, root: managed });
      assert.equal(stats.minRelatedPosts, MAX_RELATED_POSTS);
      const graph = await readGraph(enDir);
      for (const [href, related] of graph) {
        assert.equal(related.some((post) => post.href === victim), false, `${href} must not link to a removed article`);
        assert.equal(related.length, MAX_RELATED_POSTS, `${href} must be refilled`);
      }
    }));

  it("keeps filling the quota as the corpus grows large", async () =>
    withWorkspace("landing-kit-large-", async ({ workspace: cwd, root: managed, dir: enDir }) => {
      // The starvation bug only showed up once the corpus was big enough for the
      // last-processed articles to run out of allowed targets.
      const entries = Array.from({ length: 40 }, (_, index) => {
        const source = CORPUS[index % CORPUS.length];
        return [`${source[0]}-${index}`, `${source[1]} ${index}`, source[2], source[3]];
      });
      await writeCorpus(enDir, entries);
      const stats = await runOk({ cwd, root: managed });
      assert.equal(stats.minRelatedPosts, MAX_RELATED_POSTS);
      assert.equal(stats.orphans, 0);
      assert.equal(stats.minInboundLinks, MIN_INBOUND_LINKS);
      for (const related of (await readGraph(enDir)).values()) {
        assert.equal(related.length, MAX_RELATED_POSTS);
      }
    }));

  it("falls back to the candidate count when a locale is too small", async () =>
    withWorkspace("landing-kit-tiny-", async ({ workspace: cwd, root: managed, dir: enDir }) => {
      await writeCorpus(enDir, CORPUS.slice(0, 2));
      assert.equal((await runOk({ cwd, root: managed })).minRelatedPosts, 1);
    }));
});
