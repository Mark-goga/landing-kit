const MD_STRIP_RE = /!\[[^\]]*\]\([^)]*\)|\[([^\]]+)\]\([^)]*\)|[`*_~>#\-]+|<[^>]+>|```[\s\S]*?```/g;

export const plainTextFromMarkdown = (raw: string | undefined): string => {
  if (!raw) return "";
  return raw
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/<[^>]+>/g, " ")
    .replace(/[`*_~>#]+/g, " ")
    .replace(/^\s*[-*+]\s+/gm, "")
    .replace(/\s+/g, " ")
    .trim();
};

export const wordCount = (raw: string | undefined): number => {
  const text = plainTextFromMarkdown(raw);
  if (!text) return 0;
  return text.split(/\s+/).filter(Boolean).length;
};

export const articleBodyExcerpt = (raw: string | undefined, maxChars = 500): string => {
  const text = plainTextFromMarkdown(raw);
  if (text.length <= maxChars) return text;
  return `${text.slice(0, maxChars).replace(/\s+\S*$/, "")}…`;
};
