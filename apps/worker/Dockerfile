FROM node:22-bookworm-slim
RUN corepack enable && apt-get update && apt-get install -y ffmpeg && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY . .
RUN pnpm install --frozen-lockfile=false && pnpm --filter @bro/worker build
CMD ["pnpm","--filter","@bro/worker","exec","node","--import","tsx","src/index.ts"]
