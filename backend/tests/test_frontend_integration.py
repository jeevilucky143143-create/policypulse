import uuid
from fastapi.testclient import TestClient


def test_frontend_health_check(client: TestClient):
    """Verify health endpoint responds with 200 OK for frontend health banner."""
    response = client.get("/api/v1/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ok"


def test_frontend_list_conversations(client: TestClient):
    """Verify /api/v1/conversations returns ticket list for review studio sidebar."""
    response = client.get("/api/v1/conversations")
    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, list)
    assert len(data) >= 1
    # Check ticket structure
    ticket = data[0]
    assert "complaint_id" in ticket
    assert "customer_name" in ticket
    assert "raw_text" in ticket
    assert "review_status" in ticket


def test_frontend_list_policies(client: TestClient):
    """Verify /api/v1/policies returns policy documents for sidebar indexed counter."""
    response = client.get("/api/v1/policies")
    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, list)
    assert len(data) >= 1
    pol = data[0]
    assert "title" in pol or "source_filename" in pol
    assert "policy_id" in pol or "document_id" in pol


def test_frontend_analyze_complaint_flow(client: TestClient):
    """Verify POST /api/v1/complaints/analyze decomposes issues, checks guardrails, and drafts response."""
    payload = {
        "complaint_id": "CMP-2026-9042",
        "customer_id": "CUST-8102",
        "customer_name": "Eleanor Vance",
        "channel": "email",
        "raw_text": (
            "I received my order #48192 three days late, and when I opened the box, the espresso machine "
            "was dented and leaking water. Your delivery driver was dismissive and refused to note the "
            "damage on the receipt. I demand an immediate full refund and a $100 gift card for my trouble."
        ),
        "tone_preference": "empathetic",
    }
    response = client.post("/api/v1/complaints/analyze", json=payload)
    assert response.status_code == 200
    data = response.json()

    assert data["complaint_id"] == "CMP-2026-9042"
    assert "decomposed_concerns" in data
    assert len(data["decomposed_concerns"]) >= 1
    assert "guardrail_report" in data
    assert "verdict" in data["guardrail_report"]
    assert "grounded_draft" in data
    assert "body" in data["grounded_draft"]
    assert data["grounded_draft"]["tone"] == "empathetic"
    assert data["human_review_required"] is True

    # Check that concerns have citations
    first_concern = data["decomposed_concerns"][0]
    assert "citations" in first_concern
    assert len(first_concern["citations"]) >= 1
    assert "clause_id" in first_concern["citations"][0]


def test_frontend_dispatch_complaint_flow(client: TestClient):
    """Verify POST /api/v1/complaints/dispatch records human approval with audit trail."""
    payload = {
        "complaint_id": "CMP-2026-9042",
        "agent_id": "AGENT-042",
        "agent_name": "Marcus Aurelius",
        "action": "APPROVE",
        "final_text": "Dear Eleanor, We have approved an immediate replacement for your transit-damaged espresso machine.",
        "notes": "Verified photographic proof. Shipping fee credited.",
        "override_reasons": [],
    }
    response = client.post("/api/v1/complaints/dispatch", json=payload)
    assert response.status_code == 200
    data = response.json()

    assert data["complaint_id"] == "CMP-2026-9042"
    assert data["status"] == "SIMULATED_DISPATCH"
    assert "dispatch_id" in data
    assert "audit_log_id" in data
    assert "dispatched_at" in data
