FROM e2bdev/desktop:latest

RUN apt-get update && apt-get install -y \
    fonts-noto-cjk \
    fonts-noto-cjk-extra \
    fonts-noto-color-emoji \
    fonts-noto-core \
    fonts-noto-extra \
    fonts-noto-hinted \
    fonts-noto-unhinted \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Versions compatible with trafilatura 1.12.x (lxml >= 5.3) and playwright 1.48+.
RUN pip install --no-cache-dir \
    playwright==1.48.0 \
    trafilatura==1.12.2 \
    readability-lxml==0.8.1 \
    httpx==0.27.2 \
    beautifulsoup4==4.12.3 \
    lxml==5.3.0

RUN playwright install chromium && playwright install-deps chromium

RUN mkdir -p /home/user/input /home/user/output
