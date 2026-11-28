FROM node:24-alpine AS build
RUN corepack enable && corepack prepare pnpm@12.11.2 --activate
WORKDIR /src
COPY . .
RUN pnpm install --frozen-lockfile && pnpm build

FROM node:24-alpine AS runtime
RUN corepack enable && corepack prepare pnpm@12.11.2 --activate
WORKDIR /app
COPY server/package.json server/pnpm-lock.yaml server/pnpm-workspace.yaml ./
RUN pnpm install --prod --frozen-lockfile
COPY --from=build /src/server/dist ./dist
COPY --from=build /src/server/drizzle ./drizzle
COPY --from=build /src/client/dist ./public
RUN mkdir -p /app/uploads && chown -R node:node /app
USER node
ENV NODE_ENV=production
ENV PORT=3001
ENV STATIC_DIR=/app/public
ENV UPLOADS_DIR=/app/uploads
EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3001/api/health').then((response)=>{if(!response.ok)process.exit(1)}).catch(()=>process.exit(1))"
CMD ["node", "dist/index.js"]
