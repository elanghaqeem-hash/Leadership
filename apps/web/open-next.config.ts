/**
 * OpenNext Cloudflare configuration for the Leadership web application.
 *
 * Kept dependency-free so Cloudflare Workers Builds can compile this config
 * even when @opennextjs/cloudflare is invoked through npx.
 * This mirrors defineCloudflareConfig({}) from @opennextjs/cloudflare 1.20.7.
 */
export default {
  default: {
    override: {
      wrapper: "cloudflare-node",
      converter: "edge",
      proxyExternalRequest: "fetch",
      incrementalCache: "dummy",
      tagCache: "dummy",
      queue: "dummy",
      cdnInvalidation: "dummy",
    },
    routePreloadingBehavior: "none",
  },
  edgeExternals: ["node:crypto"],
  cloudflare: {
    useWorkerdCondition: true,
  },
  dangerous: {
    enableCacheInterception: false,
  },
  middleware: {
    external: true,
    override: {
      wrapper: "cloudflare-edge",
      converter: "edge",
      proxyExternalRequest: "fetch",
      incrementalCache: "dummy",
      tagCache: "dummy",
      queue: "dummy",
    },
  },
};
