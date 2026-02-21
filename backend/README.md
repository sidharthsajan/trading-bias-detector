# National Bank Bias Detector – Backend

FastAPI + Polars bias analysis API. Uses **uv** for dependencies.

## Setup

```bash
cd backend
uv sync
```

## Run

```bash
uv run uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

API docs: http://localhost:8000/docs

If you get **Address already in use**, either stop the process using port 8000 or use another port:

```bash
# Free port 8000 (macOS/Linux)
lsof -i :8000   # find PID, then: kill <PID>

# Or run on a different port (e.g. 8001)
uv run uvicorn app.main:app --reload --host 0.0.0.0 --port 8001
```

If you use a different port, set `VITE_API_URL=http://localhost:8001` in the frontend `.env`.

## Endpoints

- `GET /` – health
- `POST /analyze` – upload CSV (Timestamp, Buy/Sell, Asset, Quantity, Price, P/L, Balance); returns `biases`, `trade_flags`, `bias_score`, `trades`.
