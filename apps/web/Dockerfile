FROM node:22-alpine AS build
RUN corepack enable
WORKDIR /app
COPY . .
RUN pnpm install --frozen-lockfile=false && pnpm --filter @bro/web build
CMD ["pnpm","--filter","@bro/web","start"]
