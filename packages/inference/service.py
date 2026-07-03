#!/usr/bin/env python3
"""
Humanly Inference Service — a unified multi-model inference service (Python/FastAPI).

All models are served from this single service, each with its own endpoint; adding a model later
just means dropping a subpackage with a predict.py under models/<name>/ (see the interface contract
at the top of models/detector/predict.py), with no need to stand up a new service.

Endpoints:
  GET  /health                       Status of all loaded models
  GET  /models                       List of registered model names
  POST /models/{name}/predict        Run inference for a model (body is that model's agreed JSON)

Run locally:
  python -m uvicorn service:app --port 8000
"""
from __future__ import annotations

import importlib
import os
import pkgutil
from typing import Any

from fastapi import Body, FastAPI, HTTPException

import models as models_pkg

app = FastAPI(title="Humanly Inference Service", version="0.1.0")

# On startup, auto-discover and register every subpackage under models/ (each is expected to expose NAME/load/status/predict).
REGISTRY: dict[str, Any] = {}


def _discover_models() -> None:
    for _finder, name, ispkg in pkgutil.iter_modules(models_pkg.__path__):
        if not ispkg:
            continue
        handler = importlib.import_module(f"models.{name}.predict")
        handler.load()
        REGISTRY[handler.NAME] = handler


_discover_models()


def _allow_missing_models() -> bool:
    return os.environ.get("INFERENCE_ALLOW_MISSING_MODELS", "").lower() in {"1", "true", "yes"}


@app.get("/health")
def health() -> dict[str, Any]:
    models_status = {name: h.status() for name, h in REGISTRY.items()}
    all_ok = all(s.get("loaded") for s in models_status.values()) if models_status else False
    allow_missing_models = _allow_missing_models()
    return {
        "status": "ok" if all_ok or allow_missing_models else "degraded",
        "allowMissingModels": allow_missing_models,
        "models": models_status,
    }


@app.get("/models")
def list_models() -> dict[str, Any]:
    return {"models": sorted(REGISTRY.keys())}


@app.get("/models/{name}/spec")
def model_spec(name: str) -> Any:
    handler = REGISTRY.get(name)
    if handler is None:
        raise HTTPException(status_code=404, detail=f"unknown model: {name}")
    if not hasattr(handler, "spec"):
        raise HTTPException(status_code=404, detail=f"model has no spec: {name}")
    return handler.spec()


@app.post("/models/{name}/predict")
def predict(name: str, body: dict = Body(default={})) -> Any:
    handler = REGISTRY.get(name)
    if handler is None:
        raise HTTPException(status_code=404, detail=f"unknown model: {name}")
    return handler.predict(body)
