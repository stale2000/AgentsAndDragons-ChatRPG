FROM node:20-slim

WORKDIR /app

# Copy package files first for layer caching
COPY package*.json ./

# Install production dependencies
RUN npm ci

# Install mcp-proxy globally
RUN npm install -g mcp-proxy

# Copy source and build
COPY . .
RUN npm run build

# Expose mcp-proxy default port
EXPOSE 8080

# mcp-proxy wraps the stdio-based MCP server into HTTP endpoints
CMD ["mcp-proxy", "--", "node", "dist/index.js"]
