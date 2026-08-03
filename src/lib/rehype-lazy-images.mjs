// Rehype plugin: force `loading="lazy" decoding="async"` on every <img> in MD/MDX
// bodies unless the author already opted in with different values. Also fails
// the build when an <img> has no non-empty `alt` — alt is not automatically
// checked by the content schema, so this catches accessibility/SEO regressions
// at build time instead of in prod.

export default function rehypeLazyImages() {
  return (tree, file) => {
    const filePath = file?.path ?? file?.history?.[0] ?? "<unknown>";

    const visit = (node) => {
      if (!node) return;
      if (node.type === "element" && node.tagName === "img") {
        const props = node.properties ?? (node.properties = {});
        const src = typeof props.src === "string" ? props.src : "";
        const alt = typeof props.alt === "string" ? props.alt.trim() : "";
        if (!alt) {
          throw new Error(
            `[rehype-lazy-images] Missing or empty \`alt\` on <img src="${src}"> in ${filePath}`,
          );
        }
        if (props.loading == null) props.loading = "lazy";
        if (props.decoding == null) props.decoding = "async";
      }
      if (Array.isArray(node.children)) {
        for (const child of node.children) visit(child);
      }
    };

    visit(tree);
  };
}
