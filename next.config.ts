import type { NextConfig } from "next";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

const nextConfig: NextConfig = {
  typedRoutes: true,
  // Without this, Next walks up and finds a lockfile in the home directory,
  // picks that as the workspace root, and traces the wrong file set.
  outputFileTracingRoot: dirname(fileURLToPath(import.meta.url)),
};

export default nextConfig;
