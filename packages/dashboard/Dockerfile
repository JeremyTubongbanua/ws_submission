FROM node:20-bookworm-slim

WORKDIR /app/packages/dashboard

COPY packages/dashboard/package*.json /app/packages/dashboard/
RUN npm ci

COPY packages/dashboard /app/packages/dashboard

RUN npm run build

EXPOSE 3000

CMD ["npm", "run", "start"]
