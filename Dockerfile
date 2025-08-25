# Unified multi-stage Dockerfile for Focus Flow Client (Vite + React)
# Build -> Nginx runtime with caching and model file headers

########## 1. BUILD STAGE ##########
FROM node:20-alpine AS build
WORKDIR /app

# Install dependencies (use npm; adjust if you add a lock file type later)
COPY package.json package-lock.json* pnpm-lock.yaml* yarn.lock* ./
RUN npm install --legacy-peer-deps || npm install

# Copy source
COPY . .

# Build
RUN npm run build

########## 2. RUNTIME STAGE ##########
FROM nginx:1.27-alpine AS runtime

# Remove default config
RUN rm /etc/nginx/conf.d/default.conf

# Nginx config (supports base path /focus-flow-client/ and caching)
RUN printf "server {\n\
    listen 80;\n\
    server_name _;\n\
    root /usr/share/nginx/html;\n\
    index index.html;\n\
    location / {\n\
        try_files $uri $uri/ /index.html;\n\
    }\n\
    location /focus-flow-client/ {\n\
        try_files $uri $uri/ /focus-flow-client/index.html;\n\
    }\n\
    location ~* \\.(?:js|css|woff2?|ttf|eot)$ {\n\
        add_header Cache-Control \"public, max-age=31536000, immutable\";\n\
        try_files $uri =404;\n\
    }\n\
    location ~* \\.(?:png|jpg|jpeg|gif|svg|ico|webp)$ {\n\
        add_header Cache-Control \"public, max-age=31536000, immutable\";\n\
        try_files $uri =404;\n\
    }\n\
    location ~* \\.(onnx)$ {\n\
        add_header Access-Control-Allow-Origin *;\n\
        add_header Cache-Control \"public, max-age=31536000, immutable\";\n\
        types { application/octet-stream onnx; }\n\
        try_files $uri =404;\n\
    }\n\
}\n" > /etc/nginx/conf.d/focusflow.conf

# Copy build artifacts
COPY --from=build /app/dist/ /usr/share/nginx/html/

# (Optional) ensure favicon & models (already inside dist if copied by build script, copying again is safe)
COPY public/favi.png /usr/share/nginx/html/favi.png
COPY public/models /usr/share/nginx/html/models

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 CMD wget -qO- http://localhost/focus-flow-client/index.html >/dev/null 2>&1 || exit 1

CMD ["nginx", "-g", "daemon off;"]
