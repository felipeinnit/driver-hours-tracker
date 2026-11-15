FROM node:22-alpine

WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY . .
RUN mkdir -p /app/data && chown -R node:node /app

ENV PORT=8080
ENV DATA_DIR=/app/data
EXPOSE 8080
VOLUME ["/app/data"]

USER node
CMD ["npm", "start"]
