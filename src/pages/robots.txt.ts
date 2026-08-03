import { absoluteUrl } from "../config/site";

const AI_BOTS = [
  "GPTBot",
  "OAI-SearchBot",
  "ChatGPT-User",
  "ClaudeBot",
  "Claude-Web",
  "anthropic-ai",
  "Google-Extended",
  "PerplexityBot",
  "Applebot-Extended",
  "CCBot",
  "cohere-ai",
  "meta-externalagent",
  "Bytespider",
];

export function GET() {
  const aiBlock = AI_BOTS.map((bot) => `User-agent: ${bot}\nAllow: /`).join("\n\n");

  const body = `# Default: open to all crawlers.
User-agent: *
Allow: /
# Noise sinks — utm / tracking / one-off flows.
Disallow: /unsubscribe/
Disallow: /*?*utm_
Disallow: /*?*fbclid=
Disallow: /*?*gclid=
Disallow: /*?*from=
Disallow: /*?*ref=

# AI crawlers — explicitly welcomed.
${aiBlock}

Sitemap: ${absoluteUrl("/sitemap.xml")}
`;

  return new Response(body, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
    },
  });
}
