from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.database import Base, engine
from app.routers import auth, meetings


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Create tables on startup if they don't exist yet.
    # (A bigger project would use a migration tool like Alembic instead.)
    Base.metadata.create_all(bind=engine)
    yield


app = FastAPI(title="Meeting Summarizer API", lifespan=lifespan)

# Allow the React app (running on a different port) to call this API from the browser.
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(meetings.router)


@app.get("/")
def root():
    # This is an API, not a website. Point visitors to the right places instead of a 404.
    return {
        "message": "Meeting Summarizer API is running. The website is the frontend, not this URL.",
        "docs": "/docs",
        "health": "/api/health",
    }


@app.get("/api/health")
def health():
    return {"status": "ok", "summarizer": settings.summarizer_provider}
