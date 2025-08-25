# Stage 1: Build the React app
FROM node:20 AS builder
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install --legacy-peer-deps
COPY . .
RUN npm run build

# Stage 2: Serve the build with nginx
FROM nginx:alpine
WORKDIR /usr/share/nginx/html
COPY --from=builder /app/dist .
COPY public/favi.png ./favi.png
COPY public/models ./models
COPY public/_headers ./_headers
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
