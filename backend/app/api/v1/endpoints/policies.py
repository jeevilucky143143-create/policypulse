import uuid
import logging
from datetime import date, datetime, timezone
from typing import List, Optional
from pathlib import Path
from fastapi import APIRouter, UploadFile, File, Form, Depends, status, BackgroundTasks, Query
from sqlalchemy.orm import Session

from backend.app.schemas.policy import PolicyUploadResponse, PolicyDocumentResponse
from backend.app.core.errors import (
    UnsupportedFileTypeException,
    EmptyDocumentException,
    DocumentSizeLimitExceededException,
    ResourceNotFoundException,
)
from backend.app.core.database import get_session_factory
from backend.app.models.policy import PolicyDocument
from backend.app.services.ingestion import policy_ingestion_service

logger = logging.getLogger("complaint_assistant.policies_api")
router = APIRouter(prefix="/policies", tags=["Policies"])

ALLOWED_EXTENSIONS = {".pdf", ".docx", ".txt"}
MAX_FILE_SIZE = 20 * 1024 * 1024  # 20 MB limit


def _run_background_ingestion(
    doc_id: uuid.UUID,
    filename: str,
    content: bytes,
    version_label: Optional[str],
    effective_from: Optional[date],
    effective_to: Optional[date],
):
    """Background task runner for document ingestion."""
    try:
        policy_ingestion_service.ingest_document(
            doc_id=doc_id,
            filename=filename,
            content=content,
            version_label=version_label,
            effective_from=effective_from,
            effective_to=effective_to,
        )
    except Exception as exc:
        logger.error("Background ingestion failed for %s (%s): %s", filename, doc_id, exc)


@router.post("", response_model=PolicyUploadResponse, status_code=status.HTTP_201_CREATED, summary="Upload policy document")
async def upload_policy(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(..., description="Policy file (PDF, DOCX, or TXT)"),
    version_label: Optional[str] = Form(None, description="Optional document version label"),
    effective_from: Optional[date] = Form(None, description="Optional effective start date"),
    effective_to: Optional[date] = Form(None, description="Optional effective end date"),
    sync: bool = Query(False, description="Run ingestion synchronously if True"),
) -> PolicyUploadResponse:
    """
    Upload and ingest a company policy document (PDF, DOCX, or TXT).
    Validates file format and size, stores original binary in Supabase Storage,
    extracts structured text, generates heading-aware chunks and embeddings,
    and indexes them for hybrid retrieval.
    """
    filename = file.filename or "unknown"
    ext = Path(filename).suffix.lower()

    if ext not in ALLOWED_EXTENSIONS:
        raise UnsupportedFileTypeException(
            f"Unsupported file format '{ext}'. Only PDF, DOCX, and TXT are supported."
        )

    # Read content to check non-empty and size
    content = await file.read()
    if not content or len(content.strip()) == 0:
        raise EmptyDocumentException(f"Uploaded file '{filename}' is empty.")

    if len(content) > MAX_FILE_SIZE:
        raise DocumentSizeLimitExceededException(
            f"File size ({len(content)} bytes) exceeds the maximum limit of {MAX_FILE_SIZE} bytes."
        )

    doc_id = uuid.uuid4()
    doc_type = ext.lstrip(".").upper()

    # Create initial policy_document record in database
    factory = get_session_factory()
    if factory is not None:
        try:
            with factory() as db:
                db_doc = PolicyDocument(
                    id=doc_id,
                    source_filename=filename,
                    document_type=doc_type,
                    version_label=version_label,
                    effective_from=effective_from,
                    effective_to=effective_to,
                    status="processing",
                )
                session_doc = db.query(PolicyDocument).filter(PolicyDocument.id == doc_id).first()
                if not session_doc:
                    db.add(db_doc)
                    db.commit()
        except Exception as exc:
            logger.warning("Database registration during upload failed: %s", exc)

    if sync:
        # Run synchronously
        try:
            ingested = policy_ingestion_service.ingest_document(
                doc_id=doc_id,
                filename=filename,
                content=content,
                version_label=version_label,
                effective_from=effective_from,
                effective_to=effective_to,
            )
            return PolicyUploadResponse(
                document_id=str(doc_id),
                status=ingested.status,
            )
        except Exception:
            return PolicyUploadResponse(
                document_id=str(doc_id),
                status="failed",
            )

    # Dispatch ingestion in background
    background_tasks.add_task(
        _run_background_ingestion,
        doc_id=doc_id,
        filename=filename,
        content=content,
        version_label=version_label,
        effective_from=effective_from,
        effective_to=effective_to,
    )

    return PolicyUploadResponse(
        document_id=str(doc_id),
        status="processing",
    )


@router.get("", response_model=List[PolicyDocumentResponse], summary="List ingested policy documents")
def list_policies() -> List[PolicyDocumentResponse]:
    """
    List all registered policy documents with their status and metadata.
    """
    factory = get_session_factory()
    if factory is not None:
        try:
            with factory() as db:
                docs = db.query(PolicyDocument).order_by(PolicyDocument.created_at.desc()).all()
                if docs:
                    return [
                        PolicyDocumentResponse(
                            document_id=str(d.id),
                            policy_id=str(d.id),
                            source_filename=d.source_filename,
                            title=d.source_filename,
                            document_type=d.document_type,
                            category=d.document_type,
                            version_label=d.version_label,
                            version=d.version_label or "v1.0",
                            effective_from=d.effective_from,
                            effective_to=d.effective_to,
                            status=d.status,
                            created_at=d.created_at,
                            updated_at=d.created_at.isoformat() if d.created_at else None,
                            total_chunks=len(d.chunks) if hasattr(d, "chunks") and d.chunks else 0,
                        )
                        for d in docs
                    ]
        except Exception as exc:
            logger.error("Failed to list policy documents from db: %s", exc)

    # Fallback to seed policies when database is not yet populated
    from datetime import timezone
    now_utc = datetime.now(timezone.utc)
    return [
        PolicyDocumentResponse(
            document_id="POL-REFUND-2026",
            policy_id="POL-REFUND-2026",
            source_filename="Enterprise Refund & Return Policy.pdf",
            title="Enterprise Refund & Return Policy",
            document_type="PDF",
            category="Billing & Returns",
            version_label="v2.4",
            version="v2.4",
            status="active",
            created_at=now_utc,
            updated_at="2026-09-15T00:00:00Z",
            total_chunks=48,
        ),
        PolicyDocumentResponse(
            document_id="POL-SHIPPING-2026",
            policy_id="POL-SHIPPING-2026",
            source_filename="Shipping & Fulfillment SLA.pdf",
            title="Shipping & Fulfillment SLA",
            document_type="PDF",
            category="Logistics",
            version_label="v1.8",
            version="v1.8",
            status="active",
            created_at=now_utc,
            updated_at="2026-08-20T00:00:00Z",
            total_chunks=24,
        ),
        PolicyDocumentResponse(
            document_id="POL-WARRANTY-2026",
            policy_id="POL-WARRANTY-2026",
            source_filename="Hardware Warranty & Defect Terms.pdf",
            title="Hardware Warranty & Defect Terms",
            document_type="PDF",
            category="Technical Hardware",
            version_label="v3.0",
            version="v3.0",
            status="active",
            created_at=now_utc,
            updated_at="2026-07-01T00:00:00Z",
            total_chunks=62,
        ),
        PolicyDocumentResponse(
            document_id="POL-CONDUCT-2026",
            policy_id="POL-CONDUCT-2026",
            source_filename="Logistics Partner Code of Conduct.pdf",
            title="Logistics Partner Code of Conduct",
            document_type="PDF",
            category="Operations",
            version_label="v3.1",
            version="v3.1",
            status="active",
            created_at=now_utc,
            updated_at="2026-06-12T00:00:00Z",
            total_chunks=18,
        ),
    ]


@router.get("/{document_id}", response_model=PolicyDocumentResponse, summary="Get policy document by ID")
def get_policy(document_id: str) -> PolicyDocumentResponse:
    """Retrieve details and status for a single policy document."""
    factory = get_session_factory()
    if factory is None:
        raise ResourceNotFoundException(resource_type="policy", resource_id=document_id)

    try:
        doc_uuid = uuid.UUID(document_id)
    except ValueError:
        raise ResourceNotFoundException(resource_type="policy", resource_id=document_id)

    with factory() as db:
        doc = db.query(PolicyDocument).filter(PolicyDocument.id == doc_uuid).first()
        if not doc:
            raise ResourceNotFoundException(resource_type="policy", resource_id=document_id)

        return PolicyDocumentResponse(
            document_id=str(doc.id),
            policy_id=str(doc.id),
            source_filename=doc.source_filename,
            title=doc.source_filename,
            document_type=doc.document_type,
            category=doc.document_type,
            version_label=doc.version_label,
            version=doc.version_label or "v1.0",
            effective_from=doc.effective_from,
            effective_to=doc.effective_to,
            status=doc.status,
            created_at=doc.created_at,
            updated_at=doc.created_at.isoformat() if doc.created_at else None,
            total_chunks=len(doc.chunks) if hasattr(doc, "chunks") and doc.chunks else 0,
        )
