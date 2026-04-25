FROM node:22-alpine

RUN apk add --no-cache python3 make g++ ffmpeg

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

RUN npm install -g tsx

COPY tsconfig.json ./
COPY src/ ./src/
COPY *.html ./

RUN mkdir -p data cache

EXPOSE 3000

ENV MEDIA_PATH=/media
ENV DB_PATH=/app/data/media.db
ENV CACHE_DIR=/app/cache

CMD ["tsx", "src/index.ts"]
