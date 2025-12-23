const withBundleAnalyzer = require('@next/bundle-analyzer')({
  enabled: process.env.ANALYZE === 'true',
})

const nextConfig = {
  webpack: (config) => {
    // Ensure zod subpath exports (like zod/v3, zod/v4-mini) are resolved correctly
    // This is needed for @modelcontextprotocol/sdk compatibility
    config.resolve.extensionAlias = {
      '.js': ['.js', '.ts', '.tsx'],
      '.jsx': ['.jsx', '.tsx'],
    };
    
    return config;
  },
}

module.exports = withBundleAnalyzer(nextConfig)