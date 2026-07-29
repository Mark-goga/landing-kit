import { promises as fs } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUTPUT = path.resolve(__dirname, "..", "openapi", "mindai.json");

const parseArgs = () => {
  const out = {};
  for (let i = 2; i < process.argv.length; i++) {
    const arg = process.argv[i];
    if (!arg?.startsWith("--")) continue;
    const next = process.argv[i + 1];
    if (next && !next.startsWith("--")) {
      out[arg.slice(2)] = next;
      i++;
    } else {
      out[arg.slice(2)] = true;
    }
  }
  return out;
};

const readSpecFromFile = async (sourcePath) => {
  const resolved = path.resolve(sourcePath);
  await fs.access(resolved);
  return fs.readFile(resolved, "utf8");
};

const readSpecFromUrl = async (url) => {
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) {
    throw new Error(`Fetch spec failed: ${res.status} ${res.statusText}`);
  }
  return res.text();
};

const main = async () => {
  const args = parseArgs();
  const source =
    typeof args.source === "string" ? args.source : process.env.MINDAI_SPEC_SOURCE;
  const url =
    typeof args.url === "string" ? args.url : process.env.MINDAI_SPEC_URL;
  let content;
  if (source) {
    content = await readSpecFromFile(source);
  } else if (url) {
    content = await readSpecFromUrl(url);
  } else {
    throw new Error(
      "Pass --source <file> or --url <https://…> (or set MINDAI_SPEC_SOURCE / MINDAI_SPEC_URL)",
    );
  }
  await fs.mkdir(path.dirname(OUTPUT), { recursive: true });
  await fs.writeFile(OUTPUT, content, { encoding: "utf8" });
  process.stdout.write(`Wrote ${OUTPUT}\n`);
};

main().catch((err) => {
  process.stderr.write(`pull-mindai-spec failed: ${err.stack ?? err.message}\n`);
  process.exit(1);
});
