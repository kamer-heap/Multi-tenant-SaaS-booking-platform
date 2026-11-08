import { defineConfig } from "vitest/config";
import dotenv from "dotenv";

dotenv.config();

export default defineConfig({
  test: {
    testTimeout: 15_000,
    hookTimeout: 15_000,
    fileParallelism: false,
  },
});
