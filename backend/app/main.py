"""
FastAPI app for National Bank Bias Detector.
POST /analyze: accept CSV upload, run bias engine, return JSON (biases, trade_flags, bias_score, trades)
for overtrading, loss aversion, revenge trading, overconfidence, concentration bias,
disposition effect, anchoring, and confirmation bias.
"""
from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware

from app.bias_engine import parse_csv_to_dataframe, run_analysis

app = FastAPI(
    title="National Bank Bias Detector API",
    description=(
        "Analyze trading CSV for behavioral biases "
        "(overtrading, loss aversion, revenge trading, overconfidence, concentration bias, "
        "disposition effect, anchoring, confirmation bias)."
    ),
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


MAX_UPLOAD_BYTES = 150 * 1024 * 1024  # 150 MB for large CSVs (e.g. 200k+ rows)


@app.post("/analyze")
async def analyze(file: UploadFile = File(...)):
    """Accept a CSV file (Timestamp, Buy/Sell, Asset, Quantity, Price, P/L, Balance), run bias detection, return biases, trade_flags, bias_score, and trades."""
    if not file.filename or not file.filename.lower().endswith(".csv"):
        raise HTTPException(status_code=400, detail="Upload a CSV file.")
    try:
        chunks = []
        total = 0
        while chunk := await file.read(1024 * 1024):  # 1 MB chunks
            total += len(chunk)
            if total > MAX_UPLOAD_BYTES:
                raise HTTPException(status_code=413, detail=f"File too large. Max {MAX_UPLOAD_BYTES // (1024*1024)} MB.")
            chunks.append(chunk)
        contents = b"".join(chunks)
    except HTTPException:
        raise
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
