import type { NextConfig } from "next";

// Static export only: the deploy carries zero serverless functions. /api is a CDN rewrite to the relayer.
const nextConfig: NextConfig = { output: "export", images: { unoptimized: true }, trailingSlash: true };

export default nextConfig;
