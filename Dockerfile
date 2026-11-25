# syntax=docker/dockerfile:1

# ===== Frontend build: Nuxt generate produces a static site =====
FROM node:20-bookworm-slim AS frontend-build
WORKDIR /build/frontend
COPY frontend/package.json frontend/package-lock.json ./
# The lockfile's "resolved" URLs may point to an authenticated private registry (developer's local .npmrc), which returns 401 inside the image.
# Remove "resolved" during the build (integrity checks are unaffected) so npm uses the public registry consistently
RUN node -e "const fs=require('fs');const l=JSON.parse(fs.readFileSync('package-lock.json'));for(const p of Object.values(l.packages||{}))delete p.resolved;fs.writeFileSync('package-lock.json',JSON.stringify(l,null,2))" \
  && npm ci --no-audit --no-fund --registry=https://registry.npmjs.org
COPY frontend/ ./
RUN npm run generate

# ===== Backend build: install dependencies (including native module compilation) =====
FROM node:20-bookworm AS backend-build
WORKDIR /build/backend
COPY backend/package.json backend/package-lock.json ./
RUN node -e "const fs=require('fs');const l=JSON.parse(fs.readFileSync('package-lock.json'));for(const p of Object.values(l.packages||{}))delete p.resolved;fs.writeFileSync('package-lock.json',JSON.stringify(l,null,2))" \
  && npm ci --no-audit --no-fund --registry=https://registry.npmjs.org
COPY backend/ ./
# Runtime uses tsx like existing server deployments (the source uses bundler-style extensionless imports, so tsc output cannot run directly under node);
# tsx is a devDependency, so reinstall it after pruning
RUN npm prune --omit=dev && npm i tsx@^4.21.0 --no-save --no-audit --no-fund --registry=https://registry.npmjs.org

# ===== Runtime =====
FROM node:20-bookworm-slim
ARG HUOBAO_VERSION=dev
ENV NODE_ENV=production \
    HUOBAO_VERSION=${HUOBAO_VERSION} \
    PORT=5679 \
    HUOBAO_DATA_DIR=/app/data \
    SQLITE_PATH=/app/data/huobao.sqlite3 \
    WORKSPACE_PATH=/app/data/workspace \
    FRONTEND_DIST=/app/frontend-dist

WORKDIR /app
COPY --from=backend-build /build/backend/src ./backend/src
COPY --from=backend-build /build/backend/node_modules ./backend/node_modules
COPY --from=backend-build /build/backend/package.json ./backend/package.json
COPY --from=backend-build /build/backend/tsconfig.json ./backend/tsconfig.json
# Workspace templates (skills/prompts); entrypoint copies them once to the data volume, where they can be edited online
COPY backend/workspace ./workspace-template
COPY --from=frontend-build /build/frontend/.output/public ./frontend-dist
COPY docker/entrypoint.sh ./entrypoint.sh
RUN chmod +x ./entrypoint.sh && mkdir -p /app/data

# Data volume: SQLite + generated static files + editable workspace
VOLUME ["/app/data"]
EXPOSE 5679

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s \
  CMD node -e "fetch('http://localhost:'+(process.env.PORT||5679)+'/api/v1/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["./entrypoint.sh"]
