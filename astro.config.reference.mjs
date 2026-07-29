import { defineConfig } from "astro/config";
import { loadEnv } from "vite";

const requiredEnv = (env, key) => {
  const value = env[key] ?? process.env[key];

  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }

  return value;
};

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");

  return {
    output: "static",
    site: requiredEnv(env, "SITE_URL"),
    base: requiredEnv(env, "ASTRO_BASE_PATH"),
  };
});
