from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.database import engine, Base
from app.api import auth, profiles, trades, bias_analyses, risk_profiles, emotional_tags, chat_messages, ai_coach


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Create tables if not exist (for local/dev; in production use migrations)
    Base.metadata.create_all(bind=engine)
    yield


app = FastAPI(
    title="Trading Bias Detector API",
    version="0.1.0",
    lifespan=lifespan,
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount API under /api so frontend can proxy /api -> backend
API_PREFIX = "/api"
app.include_router(auth.router, prefix=API_PREFIX)
app.include_router(profiles.router, prefix=API_PREFIX)
app.include_router(trades.router, prefix=API_PREFIX)
app.include_router(bias_analyses.router, prefix=API_PREFIX)
app.include_router(risk_profiles.router, prefix=API_PREFIX)
app.include_router(emotional_tags.router, prefix=API_PREFIX)
app.include_router(chat_messages.router, prefix=API_PREFIX)
app.include_router(ai_coach.router, prefix=API_PREFIX)


@app.get("/health")
def health():
    return {"status": "ok"}
