"""
Multilingual E5 FastAPI Server

Local embedding server using intfloat/multilingual-e5-base model.
Provides fast, low-latency embeddings for Arabic/multilingual text.

Model: intfloat/multilingual-e5-base
Dimensions: 768
License: MIT (fully open, no authentication required)

Note: Originally planned to use google/embeddinggemma-300m but it requires
HuggingFace authentication. multilingual-e5-base has similar performance
for multilingual semantic search tasks.

Usage:
    uvicorn main:app --host 0.0.0.0 --port 8000

Endpoints:
    POST /embed        - Single text embedding
    POST /embed/batch  - Batch embeddings (up to 32 texts)
    GET /health        - Health check with model info
"""

import os
import time
import logging
from contextlib import asynccontextmanager
from typing import List

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field
import torch

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Global model instance
model = None


# Model to use - can be overridden via environment variable
MODEL_NAME = os.environ.get("EMBEDDING_MODEL", "intfloat/multilingual-e5-base")


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Load the model on startup"""
    global model
    logger.info(f"Loading model: {MODEL_NAME}...")
    start_time = time.time()

    from sentence_transformers import SentenceTransformer

    # Determine device
    if torch.backends.mps.is_available():
        device = "mps"
    elif torch.cuda.is_available():
        device = "cuda"
    else:
        device = "cpu"

    logger.info(f"Using device: {device}")

    # Load model
    model = SentenceTransformer(
        MODEL_NAME,
        device=device,
    )

    load_time = time.time() - start_time
    logger.info(f"Model loaded in {load_time:.2f}s")
    logger.info(f"Model embedding dimension: {model.get_sentence_embedding_dimension()}")

    yield

    # Cleanup
    logger.info("Shutting down embedding server")


app = FastAPI(
    title="Local Embedding Server",
    description="Local embedding server for multilingual text (Arabic, English, etc.)",
    version="1.0.0",
    lifespan=lifespan,
)


# Check if model is E5 (requires query/passage prefixes)
def is_e5_model() -> bool:
    return "e5" in MODEL_NAME.lower()


def format_text(text: str, text_type: str = "query") -> str:
    """Format text with appropriate prefix for E5 models"""
    if is_e5_model():
        if text_type == "query":
            return f"query: {text}"
        else:
            return f"passage: {text}"
    return text


# Request/Response models
class EmbedRequest(BaseModel):
    """Request for single text embedding"""

    text: str = Field(..., description="Text to embed", min_length=1)
    text_type: str = Field(
        default="query",
        description="Type of text: 'query' for search queries, 'passage' for documents"
    )


class EmbedResponse(BaseModel):
    """Response with single embedding"""

    embedding: List[float]
    dimensions: int
    latency_ms: float


class EmbedBatchRequest(BaseModel):
    """Request for batch text embeddings"""

    texts: List[str] = Field(
        ...,
        description="List of texts to embed",
        min_length=1,
        max_length=32,
    )
    text_type: str = Field(
        default="passage",
        description="Type of text: 'query' for search queries, 'passage' for documents"
    )


class EmbedBatchResponse(BaseModel):
    """Response with batch embeddings"""

    embeddings: List[List[float]]
    dimensions: int
    count: int
    latency_ms: float


class HealthResponse(BaseModel):
    """Health check response"""

    status: str
    model: str
    dimensions: int
    device: str


@app.post("/embed", response_model=EmbedResponse)
async def embed(req: EmbedRequest) -> EmbedResponse:
    """Generate embedding for a single text"""
    if model is None:
        raise HTTPException(status_code=503, detail="Model not loaded")

    start_time = time.time()

    # Format text with appropriate prefix for E5 models
    formatted_text = format_text(req.text, req.text_type)

    # Generate embedding
    embedding = model.encode(
        formatted_text,
        normalize_embeddings=True,
        show_progress_bar=False,
    )

    latency_ms = (time.time() - start_time) * 1000

    return EmbedResponse(
        embedding=embedding.tolist(),
        dimensions=len(embedding),
        latency_ms=round(latency_ms, 2),
    )


@app.post("/embed/batch", response_model=EmbedBatchResponse)
async def embed_batch(req: EmbedBatchRequest) -> EmbedBatchResponse:
    """Generate embeddings for multiple texts in a batch"""
    if model is None:
        raise HTTPException(status_code=503, detail="Model not loaded")

    if len(req.texts) == 0:
        return EmbedBatchResponse(
            embeddings=[],
            dimensions=768,
            count=0,
            latency_ms=0,
        )

    start_time = time.time()

    # Format texts with appropriate prefix for E5 models
    formatted_texts = [format_text(t, req.text_type) for t in req.texts]

    # Generate embeddings in batch (more efficient)
    embeddings = model.encode(
        formatted_texts,
        normalize_embeddings=True,
        show_progress_bar=False,
        batch_size=min(32, len(formatted_texts)),
    )

    latency_ms = (time.time() - start_time) * 1000

    return EmbedBatchResponse(
        embeddings=embeddings.tolist(),
        dimensions=embeddings.shape[1],
        count=len(embeddings),
        latency_ms=round(latency_ms, 2),
    )


@app.get("/health", response_model=HealthResponse)
async def health() -> HealthResponse:
    """Health check endpoint with model info"""
    if model is None:
        raise HTTPException(status_code=503, detail="Model not loaded")

    # Get device info
    if torch.backends.mps.is_available():
        device = "mps"
    elif torch.cuda.is_available():
        device = "cuda"
    else:
        device = "cpu"

    return HealthResponse(
        status="ok",
        model=MODEL_NAME,
        dimensions=model.get_sentence_embedding_dimension(),
        device=device,
    )


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
