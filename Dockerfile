FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM deps AS builder
WORKDIR /app
COPY . .
ARG NEXT_PUBLIC_REALTIME_URL=http://localhost:4000
ENV NEXT_PUBLIC_REALTIME_URL=$NEXT_PUBLIC_REALTIME_URL
ENV DATABASE_URL=postgresql://postgres:postgres@db:5432/saas
ENV APP_DATABASE_URL=postgresql://postgres:postgres@db:5432/saas
ENV AUTH_SECRET=build-only-placeholder-auth-secret
ENV SESSION_SECRET=build-only-placeholder-session-secret
ENV STRIPE_SECRET_KEY=sk_test_build_placeholder
ENV STRIPE_WEBHOOK_SECRET=whsec_build_placeholder
ENV STRIPE_PRICE_PRO=price_build_placeholder
ENV STRIPE_PRICE_BUSINESS=price_build_placeholder
RUN npm run build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV HOSTNAME=0.0.0.0
ENV PORT=3000
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
EXPOSE 3000
CMD ["node", "server.js"]

FROM deps AS migrate
WORKDIR /app
COPY db ./db
COPY scripts ./scripts
CMD ["npx", "tsx", "scripts/migrate-zero.ts"]
