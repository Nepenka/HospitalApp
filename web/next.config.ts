import type { NextConfig } from "next";

// Local Windows setup keeps secrets outside the OneDrive-synchronized project.
// Explicit environment variables still win (e.g. isolated integration tests).
if (process.env.ANAFIX_LOCAL_ENV_PATH) process.loadEnvFile(process.env.ANAFIX_LOCAL_ENV_PATH);

const nextConfig: NextConfig = {
  agentRules: false,
  // Cold URLs bypass legacy workers which cached mutable development bundles.
  assetPrefix: process.env.NODE_ENV === "development" ? "/__anafix_dev_v2" : undefined,
};

export default nextConfig;
