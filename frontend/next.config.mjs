import { createMDX } from "fumadocs-mdx/next";

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  webpack(config) {
    // Fumadocs MDX v14 emits meta.json imports with a `?collection=docs`
    // resource query. Force webpack to retain Next's JSON parsing for that
    // generated virtual import instead of treating the JSON as JavaScript.
    config.module.rules.push({
      test: /meta\\.json$/,
      resourceQuery: /collection=docs/,
      type: "json"
    });
    return config;
  },
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "pbs.twimg.com" },
      { protocol: "https", hostname: "abs.twimg.com" }
    ]
  }
};

export default createMDX()(nextConfig);
