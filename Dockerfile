# Multi-stage build for Focus Flow Client (Vite + React)
# 1. Build stage uses lightweight Node image
# 2. Runtime stage serves static assets via nginx with proper caching and path base

########## 1. BUILD STAGE ##########
FROM node:20-alpine AS build

# Set working directory
WORKDIR /app

# Install dependencies first (leverage Docker layer cache)
COPY package.json package-lock.json* pnpm-lock.yaml* yarn.lock* ./

# If using npm (default here)
RUN npm install

# Copy the rest of the source
COPY . .

# Build the production bundle
RUN npm run build

########## 2. RUNTIME STAGE ##########
FROM nginx:1.27-alpine AS runtime

# Remove default config and add our own (external file to avoid shell expanding $uri)
RUN rm /etc/nginx/conf.d/default.conf
COPY nginx/focusflow.conf /etc/nginx/conf.d/focusflow.conf

# Copy build output
COPY --from=build /app/dist/ /usr/share/nginx/html/

# Expose port
EXPOSE 80

# Healthcheck (simple static file test)
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 CMD wget -qO- http://localhost/focus-flow-client/index.html >/dev/null 2>&1 || exit 1

CMD ["nginx", "-g", "daemon off;"]
