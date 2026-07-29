import { defineConfig } from 'orval';

const specTarget = process.env.MINDAI_SPEC_URL?.trim() || './openapi/mindai.json';

export default defineConfig({
  contentPublishing: {
    input: {
      target: specTarget,
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
