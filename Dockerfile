# syntax=docker/dockerfile:1

# Serve Harbor's Vite/React web UI (no Rust/Tauri toolchain needed for the browser build).
FROM node:22-bookworm-slim

# The corepack bundled with node can fail to verify the pnpm 11 signature
# ("Cannot find matching keyid"). Upgrade corepack first, then activate the
# exact pnpm version pinned in package.json.
RUN npm install -g corepack@latest && corepack enable

WORKDIR /app

# Copy manifests first for layer caching. pnpm-workspace.yaml carries the
# build-script allow-list (esbuild) that pnpm 10+/11 requires.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN corepack prepare pnpm@11.9.0 --activate

# Deterministic install from the committed lockfile (no `pnpm add`, no drift).
RUN pnpm install --frozen-lockfile

# pnpm 11 blocks postinstall build scripts by default; force esbuild's so the
# Vite bundler's native binary is linked even if the allow-list is not honored.
RUN pnpm rebuild esbuild

# App source.
COPY . .

EXPOSE 1420

# Bind to all interfaces so the port is reachable from the host.
CMD ["pnpm", "dev", "--host", "0.0.0.0"]
