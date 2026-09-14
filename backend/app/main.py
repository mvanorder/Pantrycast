"""FastAPI application and route handlers for the Pantrycast backend."""

import csv
import io
import logging

import uvicorn
from fastapi import Depends, FastAPI, HTTPException, UploadFile
from sqlalchemy import text as sa_text
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_db
from app.routers import auth as auth_router
from app.routers import users as users_router

logger = logging.getLogger(__name__)

_TAGS_METADATA = [
    {"name": "health", "description": "Liveness/readiness checks — no auth required."},
    {
        "name": "auth",
        "description": (
            "Registration, login, and token lifecycle. See "
            "`docs/design/uac-design.md` §1 for the full contract (transport, "
            "error codes, refresh-token rotation/reuse semantics)."
        ),
    },
    {"name": "users", "description": "The authenticated caller's own profile."},
    {"name": "orders", "description": "Order-history CSV ingestion (not yet persisted)."},
]

app = FastAPI(
    title="Pantrycast API",
    description=(
        "Backend for the Pantrycast project: order-history ingestion and, "
        "as of this pass, account registration/login. See `docs/design/` for the "
        "full system design; this schema is generated from the running app via "
        "`python -m app.cli export-openapi`."
    ),
    version="0.1.0",
    openapi_tags=_TAGS_METADATA,
)
app.include_router(auth_router.router, prefix="/auth", tags=["auth"])
app.include_router(users_router.router, prefix="/users", tags=["users"])


def run() -> None:
    """Run the development server via ``uvicorn`` with autoreload enabled.

    Entry point for the ``serve`` script (see ``pyproject.toml``).

    :returns: None
    :rtype: None
    """
    uvicorn.run("app.main:app", reload=True)


@app.get("/health", tags=["health"], summary="Liveness check")
def health() -> dict[str, str]:
    """Report basic application liveness.

    :returns: A static ``{"status": "ok"}`` payload.
    :rtype: dict[str, str]
    """
    return {"status": "ok"}


@app.get("/health/db", tags=["health"], summary="Database connectivity check")
async def health_db(db: AsyncSession = Depends(get_db)) -> dict[str, str]:
    """Check database connectivity by running a trivial query.

    :param db: The database session, injected via dependency.
    :type db: AsyncSession
    :raises HTTPException: If the database is unreachable.
    :returns: A static ``{"status": "ok"}`` payload if the query succeeds.
    :rtype: dict[str, str]
    """
    try:
        await db.execute(sa_text("SELECT 1"))
    except SQLAlchemyError as exc:
        logger.exception("Database check failed")
        raise HTTPException(status_code=503, detail="Database unavailable") from exc
    return {"status": "ok"}


@app.post("/orders/upload", tags=["orders"], summary="Upload an order-history CSV")
async def upload_orders_csv(file: UploadFile) -> dict:
    """Parse an uploaded Walmart order-history CSV and echo its rows.

    :param file: The uploaded CSV file.
    :type file: UploadFile
    :raises HTTPException: If the file is missing, not a ``.csv``, not
        valid UTF-8, or has no header row.
    :returns: The filename, column names, row count, and parsed rows.
    :rtype: dict
    """
    # Check that the file uploaded is a CSV
    if not file.filename or not file.filename.lower().endswith(".csv"):
        raise HTTPException(status_code=400, detail="File must be a .csv")

    # Read the uploaded file
    raw = await file.read()
    try:
        text = raw.decode("utf-8-sig")
    except UnicodeDecodeError as exc:
        raise HTTPException(status_code=400, detail="File is not valid UTF-8 text") from exc

    reader = csv.DictReader(io.StringIO(text))
    if not reader.fieldnames:
        raise HTTPException(status_code=400, detail="CSV has no header row")

    rows = list(reader)
    return {
        "filename": file.filename,
        "columns": reader.fieldnames,
        "row_count": len(rows),
        "rows": rows,
    }
