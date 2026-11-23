# LocalShot — serveur de partage (aucune dépendance npm).
FROM node:22-alpine
ENV NODE_ENV=production \
    LOCALSHOT_HOST=0.0.0.0 \
    LOCALSHOT_DATA=/data \
    PORT=4777
WORKDIR /app
COPY package.json ./
COPY server ./server
RUN mkdir -p /data && chown node:node /data
USER node
VOLUME ["/data"]
EXPOSE 4777
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
  CMD wget -qO- --header="Host: localhost" http://127.0.0.1:4777/api/health >/dev/null || exit 1
CMD ["node", "server/server.js"]
