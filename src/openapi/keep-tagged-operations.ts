// The MindAI spec describes the whole backend; a landing calls only the
// operations under one tag. Dropping everything else before orval runs keeps
// the generated client and models to what the landing actually uses.

type Json = unknown;
type Spec = {
  paths?: Record<string, Record<string, { tags?: string[] } | undefined>>;
  components?: { schemas?: Record<string, Json> };
  [key: string]: unknown;
};

const SCHEMA_REF = "#/components/schemas/";

const refsIn = (value: Json, found: Set<string>): Set<string> => {
  if (Array.isArray(value)) {
    value.forEach((item) => refsIn(item, found));
    return found;
  }
  if (value !== null && typeof value === "object") {
    Object.entries(value).forEach(([key, child]) => {
      if (key === "$ref" && typeof child === "string" && child.startsWith(SCHEMA_REF)) {
        found.add(child.slice(SCHEMA_REF.length));
      } else {
        refsIn(child, found);
      }
    });
  }
  return found;
};

const closure = (start: Set<string>, schemas: Record<string, Json>): Set<string> => {
  const reached = new Set<string>();
  const pending = [...start];
  while (pending.length > 0) {
    const name = pending.pop();
    if (name === undefined || reached.has(name)) continue;
    reached.add(name);
    refsIn(schemas[name], new Set()).forEach((next) => pending.push(next));
  }
  return reached;
};

export const keepTaggedOperations =
  (tag: string) =>
  <T extends object>(input: T): T => {
    const spec = input as Spec;
    const paths = Object.fromEntries(
      Object.entries(spec.paths ?? {}).flatMap(([route, operations]) => {
        const kept = Object.fromEntries(
          Object.entries(operations).filter(([, operation]) => operation?.tags?.includes(tag)),
        );
        return Object.keys(kept).length > 0 ? [[route, kept]] : [];
      }),
    );
    const schemas = spec.components?.schemas ?? {};
    const used = closure(refsIn(paths, new Set()), schemas);
    return {
      ...spec,
      paths,
      components: {
        ...spec.components,
        schemas: Object.fromEntries(Object.entries(schemas).filter(([name]) => used.has(name))),
      },
    } as T;
  };
