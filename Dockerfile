FROM node:20-alpine

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci --omit=dev

COPY server.js ./
COPY public/ ./public/
COPY data/ ./data/

ENV PORT=3000
ENV TEACHER_PIN=1234

EXPOSE 3000

CMD ["node", "server.js"]
