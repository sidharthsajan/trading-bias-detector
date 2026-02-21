"""
FastAPI app for National Bank Bias Detector.
POST /analyze: accept CSV upload, run bias engine, return JSON (biases, trade_flags, bias_score, trades).
"""
from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware

from app.bias_engine import parse_csv_to_dataframe, run_analysis

app = FastAPI(
    title="National Bank Bias Detector API",
    description="Analyze trading CSV for behavioral biases (overtrading, loss aversion, revenge trading).",
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://localhost:3000",
        "http://127.0.0.1:5173",
        "http://127.0.0.1:3000",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
def root():
    return {"service": "National Bank Bias Detector API", "docs": "/docs"}


@app.post("/analyze")
async def analyze(file: UploadFile = File(...)):
    """Accept a CSV file (Timestamp, Buy/Sell, Asset, Quantity, Price, P/L, Balance), run bias detection, return biases, trade_flags, bias_score, and trades."""
    if not file.filename or not file.filename.lower().endswith(".csv"):
        raise HTTPException(status_code=400, detail="Upload a CSV file.")
    try:
        contents = await file.read()
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to read file: {e}") from e
    try:
        df = parse_csv_to_dataframe(contents)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    if df.height == 0:
        raise HTTPException(status_code=400, detail="CSV has no data rows.")
    result = run_analysis(df)
    return result
