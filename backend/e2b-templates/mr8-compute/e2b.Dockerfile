FROM e2bdev/code-interpreter:latest

# Versions pinned to ones that publish cp313 wheels so pip never falls back
# to compiling C extensions from source (which OOMs on a 2 GB builder).
RUN pip install --no-cache-dir \
    numpy==2.1.3 \
    pandas==2.2.3 \
    scipy==1.14.1 \
    scikit-learn==1.5.2 \
    matplotlib==3.9.2 \
    seaborn==0.13.2 \
    Pillow==11.0.0 \
    httpx==0.27.2 \
    requests==2.32.3 \
    beautifulsoup4==4.12.3 \
    lxml==5.3.0 \
    trafilatura==1.12.2 \
    readability-lxml==0.8.1 \
    openpyxl==3.1.5 \
    python-pptx==1.0.2 \
    PyPDF2==3.0.1 \
    pdfplumber==0.11.4 \
    markdown==3.7 \
    black==24.10.0 \
    ruff==0.7.4
