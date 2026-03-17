# Dockerfile for Isolated Stealth Engine
FROM node:20-slim

# Install system dependencies for Playwright
RUN apt-get update && apt-get install -y \
    libgbm-dev \
    libnss3 \
    libasound2 \
    libxshmfence1 \
    libglu1 \
    fonts-liberation \
    fonts-noto-color-emoji \
    fonts-roboto \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy package files
COPY stealth-engine/package*.json ./

# Install dependencies
RUN npm install

# Install Playwright browsers
RUN npx playwright install chromium

# Copy engine code
COPY stealth-engine/ .

# Expose the runtime port
EXPOSE 3001

# Command to run the engine
CMD ["node", "server.js"]
