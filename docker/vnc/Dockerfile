FROM ubuntu:24.04

ENV DEBIAN_FRONTEND=noninteractive
ENV DISPLAY=:99

# Proxy for builds (host machine at 7891)
ARG HTTP_PROXY=http://host.docker.internal:7891
ARG HTTPS_PROXY=http://host.docker.internal:7891
ARG NO_PROXY=localhost,127.0.0.1
ENV http_proxy=$HTTP_PROXY
ENV https_proxy=$HTTPS_PROXY
ENV no_proxy=$NO_PROXY

RUN apt-get update && apt-get install -y --no-install-recommends \
    xvfb x11vnc websockify novnc \
    fonts-noto-cjk ca-certificates curl gnupg \
    && rm -rf /var/lib/apt/lists/*

# Chromium dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    libnss3 libatk1.0-0t64 libatk-bridge2.0-0t64 libcups2t64 libdrm2 \
    libxkbcommon0 libxcomposite1 libxdamage1 libxrandr2 libgbm1 libpango-1.0-0 \
    libcairo2 libasound2t64 libxshmfence1 \
    && rm -rf /var/lib/apt/lists/*

# Install Node.js + Playwright Chromium
RUN curl -fsSL https://deb.nodesource.com/setup_22.x | bash - \
    && apt-get install -y nodejs \
    && npx playwright install chromium \
    && rm -rf /var/lib/apt/lists/*

# Clear proxy env for runtime (not needed after build)
ENV http_proxy=
ENV https_proxy=
ENV no_proxy=

RUN ln -sf /usr/share/novnc/vnc.html /usr/share/novnc/index.html

COPY start.sh /start.sh
RUN chmod +x /start.sh

EXPOSE 6080

CMD ["/start.sh"]
