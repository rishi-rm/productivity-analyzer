
from fastapi import FastAPI

app = FastAPI(
    title="Productivity Pattern Analyzer",
    description="Data science service for productivity analysis",
    version="1.0.0",
)


@app.get("/")
def root():
    return {
        "message": "Productivity Analytics Service"
    }


@app.get("/api/health")
def health():
    return {
        "status": "OK",
        "service": "analytics"
    }