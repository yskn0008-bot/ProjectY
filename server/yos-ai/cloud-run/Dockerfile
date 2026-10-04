FROM node:22-slim AS build
WORKDIR /app
COPY package.json ./
RUN npm install
COPY . .
RUN npm run build

FROM node:22-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV YOS_RUNTIME_PROVIDER=google_cloud_run
ENV GOOGLE_AUTH_MODE=application_default
COPY package.json ./
RUN npm install --omit=dev
COPY --from=build /app/dist ./dist
COPY --from=build /app/api ./api
COPY --from=build /app/lib ./lib
COPY --from=build /app/schemas ./schemas
COPY --from=build /app/cloud-run ./cloud-run
EXPOSE 8080
CMD ["node", "cloud-run/server.mjs"]
