FROM oven/bun:1.3-alpine AS frontend
WORKDIR /app

COPY package.json package-lock.json ./
RUN bun install

COPY index.html vite.config.mjs jsconfig.json ./
COPY src ./src
COPY components ./components
COPY lib ./lib
RUN bun run build

FROM golang:1.25-alpine3.23 AS backend
WORKDIR /src/backend

COPY backend/go.mod ./
COPY backend ./
RUN CGO_ENABLED=0 GOOS=linux go build -trimpath -ldflags="-s -w" -o /out/poker-gangwonland .

FROM gcr.io/distroless/static-debian12:nonroot
WORKDIR /app

ENV HOSTNAME=0.0.0.0
ENV PORT=3000
ENV STATIC_DIR=/app/public
ENV POKER_JS_DIR=/app/lib

COPY --from=frontend --chown=65532:65532 /app/dist ./public
COPY --from=frontend --chown=65532:65532 /app/lib ./lib
COPY --from=backend --chown=65532:65532 /out/poker-gangwonland /app/poker-gangwonland

EXPOSE 3000

USER nonroot:nonroot
ENTRYPOINT ["/app/poker-gangwonland"]
