# Humanly Inference Service image (unified multi-model inference).
FROM python:3.12-slim

# lightgbm needs libgomp at runtime.
RUN apt-get update \
    && apt-get install -y --no-install-recommends libgomp1 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# Service entrypoint + model packages (code only). Model weights are excluded via .dockerignore
# and provided at runtime through a mounted volume (see MODEL_PATH), never baked into the image.
COPY service.py ./
COPY models ./models

EXPOSE 8000
CMD ["uvicorn", "service:app", "--host", "0.0.0.0", "--port", "8000"]
