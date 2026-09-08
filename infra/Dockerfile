# VAJRA Sovereign On-Premise Backend
FROM python:3.12-slim

# Prevent python from writing pyc files and buffering stdout/stderr
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    DEBIAN_FRONTEND=noninteractive

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Copy pyproject.toml first for layer caching
COPY apps/api/pyproject.toml /app/pyproject.toml
COPY apps/api/vajra /app/vajra

# Install dependencies and the vajra package
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir -e .

# Create required on-premise directories
RUN mkdir -p /app/data/uploads /app/data/artifacts /app/data/qdrant /app/data/logs

# Expose API port
EXPOSE 8000

# Healthcheck
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD curl -f http://localhost:8000/api/system/ping || exit 1

# Launch the FastAPI application
CMD ["python", "-m", "vajra.main"]
