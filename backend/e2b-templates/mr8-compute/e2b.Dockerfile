FROM e2bdev/code-interpreter:latest

RUN pip install --no-cache-dir \
    pandas==2.2.2 \
    numpy==1.26.4 \
    scipy==1.13.1 \
    scikit-learn==1.5.0 \
    matplotlib==3.9.0 \
    seaborn==0.13.2 \
    Pillow==10.3.0 \
    httpx==0.27.0 \
    requests==2.32.3 \
    beautifulsoup4==4.12.3 \
    lxml==5.2.2 \
    trafilatura==1.9.0 \
    readability-lxml==0.8.1 \
    openpyxl==3.1.2 \
    python-pptx==0.6.23 \
    PyPDF2==3.0.1 \
    pdfplumber==0.11.1 \
    markdown==3.6 \
    black==24.4.2 \
    ruff==0.4.8
