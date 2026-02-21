# Backend: uv for deps, uvicorn to run FastAPI
FROM python:3.12-slim

WORKDIR /app
ENV UV_SYSTEM_PYTHON=1
COPY pyproject.toml ./
COPY app ./app
RUN pip install uv && uv pip install --system .
EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]