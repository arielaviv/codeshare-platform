FROM e2bdev/desktop:latest

RUN apt-get update && apt-get install -y \
    fonts-noto-cjk \
    fonts-noto-cjk-extra \
    fonts-noto-color-emoji \
    fonts-noto-core \
    fonts-noto-extra \
    fonts-noto-hinted \
    fonts-noto-unhinted \
    && rm -rf /var/lib/apt/lists/*

RUN pip install --no-cache-dir \
    playwright==1.44.0 \
    trafilatura==1.9.0 \
    readability-lxml==0.8.1 \
    httpx==0.27.0 \
    beautifulsoup4==4.12.3 \
    lxml==5.2.2

RUN playwright install chromium && playwright install-deps chromium

RUN mkdir -p /home/user/input /home/user/output
