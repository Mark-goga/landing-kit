import { defineConfig } from 'orval';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const configDir = path.dirname(fileURLToPath(import.meta.url));
const specTarget =
  process.env.MINDAI_SPEC_URL?.trim() || path.join(configDir, 'src/openapi/mindai.json');

export default defineConfig({
  contentPublishing: {
    input: {
      target: specTarget,
      parserOptions: { validate: false },
      filters: {
        tags: ['content-seo-publishing'],
      },
    },
    output: {
      target: './src/api/generated/content-publishing.ts',
      schemas: './src/api/generated/model',
      client: 'fetch',
      mode: 'single',
      override: {
        mutator: {
          path: './src/api/content-publishing-fetch.ts',
          name: 'contentPublishingFetch',
        },
        fetch: {
          includeHttpResponseReturnType: false,
          forceSuccessResponse: false,
        },
      },
    },
  },
  contentPublishingZod: {
    input: {
      target: specTarget,
      parserOptions: { validate: false },
      filters: {
        tags: ['content-seo-publishing'],
      },
    },
    output: {
      target: './src/api/generated/content-publishing.zod.ts',
      client: 'zod',
      mode: 'single',
      fileExtension: '.zod.ts',
      override: {
        zod: {
          strict: {
            response: true,
          },
        },
      },
    },
  },
});
