# Humanly Inference Service

Unified multi-model inference service (Python/FastAPI). **All model inference lives here**,
one endpoint per model; do not spin up a separate service per model.

## Endpoints
- `GET  /health` - status of every loaded model
- `GET  /models` - list of registered model names
- `GET  /models/{name}/spec` - display spec the frontend renders the model's results from
- `POST /models/{name}/predict` - run inference (body is the JSON contract of that model)

Current models:
- `detector` - human typing vs computer-use agent.
  `POST /models/detector/predict` with body `{"events": [...]}`

## Adding a new model
Create a subpackage under `models/<name>/` with a `predict.py` implementing the agreed interface:

```python
NAME = "<name>"
def load(): ...              # load artifacts at startup (must not raise; status() exposes failures)
def status() -> dict: ...    # reported by /health
def predict(body: dict) -> dict: ...   # inference
def spec() -> dict: ...      # optional: display spec served at /models/<name>/spec
```

`service.py` auto-discovers and registers every subpackage under `models/` at startup;
no changes to `service.py` and no new service needed.

## Model weights
Weights (`*.joblib`) are private: excluded from git and from the Docker image
(see `.gitignore` / `.dockerignore`). At runtime they are bind-mounted and located via the
`MODEL_PATH` env var. Set `INFERENCE_ALLOW_MISSING_MODELS=true` (local quickstart) to let the
service run without weights; detector requests then return an inconclusive result.

## Keeping in sync with training
The feature code inside each model directory (e.g. `models/detector/extract_features.py`) and
the deployed weights are a **deployment snapshot** of the training workspace. After retraining,
copy the matching feature code and model file back together; otherwise the feature logic and
model version drift apart and predictions cannot be trusted.
