# IntelDoc backend image (spec §13). RU-deployable single-VPS via Compose.
FROM python:3.13-slim AS base

# uv for fast, reproducible installs.
COPY --from=ghcr.io/astral-sh/uv:latest /uv /uvx /bin/

ENV UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1

# Tesseract OCR runtime + Russian/English language data (used when OCR_ENGINE=tesseract).
# Own layer so it caches independently of the Python deps.
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        tesseract-ocr tesseract-ocr-rus tesseract-ocr-eng \
        poppler-utils \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /srv

# Install deps first (layer cache) then app source.
COPY pyproject.toml uv.lock* ./
RUN uv sync --frozen --no-dev --no-install-project 2>/dev/null || uv sync --no-dev

COPY . .
RUN uv sync --no-dev

EXPOSE 8000
CMD ["uv", "run", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
