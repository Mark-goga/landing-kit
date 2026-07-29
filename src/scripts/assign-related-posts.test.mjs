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

const runScript = ({ cwd, root }) =>
  new Promise((resolve) => {
    const child = spawn("npx", ["tsx", SCRIPT_PATH, "--managed-root", root], {
      cwd,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => (stdout += chunk.toString()));
    child.stderr.on("data", (chunk) => (stderr += chunk.toString()));
    child.on("close", (code) => resolve({ code, stdout, stderr }));
  });

const markdown = ({ slug, title, description, body }) =>
  [
    "---",
    'locale: "en"',
    `slug: "${slug}"`,
    'pageType: "concept"',
    `title: "${title}"`,
    `metaDescription: "${description}"`,
    `translationGroupId: "${slug}-group"`,
    'heroImage: "/assets/card-1.png"',
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

const graphHasCycle = (graph) => {
  const visited = new Set();
  const visiting = new Set();
  const visit = (node) => {
    if (visiting.has(node)) return true;
    if (visited.has(node)) return false;
    visited.add(node);
    visiting.add(node);
    const found = [...(graph.get(node) ?? [])].some(visit);
    visiting.delete(node);
    return found;
  };
  return [...graph.keys()].some(visit);
};

let workspace;
let root;

before(async () => {
  workspace = await fs.mkdtemp(path.join(os.tmpdir(), "fluxo-related-"));
  root = path.join(workspace, "src/content/blog/generated");
  await fs.mkdir(path.join(root, "en"), { recursive: true });
  await Promise.all([
    fs.writeFile(
      path.join(root, "en", "active-recall.md"),
      markdown({
        slug: "active-recall",
        title: "Active recall for learning",
        description: "Use retrieval practice to retain learning material.",
        body: "Retrieval practice makes memory durable.",
      }),
    ),
    fs.writeFile(
      path.join(root, "en", "spaced-repetition.md"),
      markdown({
        slug: "spaced-repetition",
        title: "Spaced repetition and memory",
        description: "Use active recall to build durable memory.",
        body: "Learning improves when retrieval is spaced over time.",
      }),
    ),
    fs.writeFile(
      path.join(root, "en", "learning-notes.md"),
      markdown({
        slug: "learning-notes",
        title: "Learning notes that improve recall",
        description: "Notes and retrieval create better learning habits.",
        body: "Active recall connects notes and memory.",
      }),
    ),
  ]);
});

after(async () => {
  await fs.rm(workspace, { recursive: true, force: true });
});

describe("assign-related-posts", () => {
  it("writes relevant internal links without self-links or cycles", async () => {
    const result = await runScript({ cwd: workspace, root });
    assert.equal(result.code, 0, `stderr=${result.stderr}`);

    const files = await fs.readdir(path.join(root, "en"));
    const graph = new Map();
    for (const file of files) {
      const data = await readFrontmatter(path.join(root, "en", file));
      const related = data.relatedPosts;
      assert.ok(Array.isArray(related));
      assert.ok(related.length <= 3);
      const targets = new Set(related.map((post) => post.href));
      assert.equal(targets.size, related.length, "each recommendation must be unique");
      assert.equal(targets.has(`/blog/${data.slug}/`), false, "article must not link to itself");
      graph.set(`/blog/${data.slug}/`, targets);
    }
    assert.equal(graphHasCycle(graph), false, "related-post graph must stay acyclic");
  });
});
