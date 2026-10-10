# Safety & Validation Protocols
## Project: PolicyPulse AI — Enterprise Compliance Guardrails
**Team**: TENSOR TITANS | PS-40

---

## 1. Safety Principles & Zero-Tolerance Policies

In enterprise customer support, unverified AI outputs present severe compliance, legal, and financial liabilities. PolicyPulse AI enforces three non-negotiable safety laws:

1. **Law of Non-Dispatch**: The AI system is structurally prohibited from dispatching messages to customers autonomously. Every communication must pass through an authorized human agent.
2. **Law of Evidence Grounding**: The system cannot promise monetary refunds, account credits, product replacements, fee waivers, or policy exceptions unless directly supported by a retrieved policy clause.
3. **Law of Honest Uncertainty**: When no matching policy clause is discovered, the issue must be labeled `uncovered` or `needs_human_review`, rather than improvising plausible advice.

---

## 2. Unsupported-Commitment Detection Engine

### 2.1 Monitored Commitment Classes
The guardrail scanner inspects both customer requests and AI-generated drafts for the following commitment types:

| Class | Examples | Guardrail Rule |
| :--- | :--- | :--- |
| **Monetary Compensation** | Cash refunds, chargeback waivers, goodwill credits >$25 | Blocked unless Clause 3.2 / 7.1 authorizes. |
| **Contractual Exceptions** | Warranty extensions, return deadline waivers (e.g. past 14 days) | Blocked without tier-2 supervisory override. |
| **Legal Admissions** | Conceding corporate liability for injury or property damages | Instantly flagged for Legal / Risk Escalation. |
| **Punitive Promises** | Guaranteeing termination or reprimand of named couriers/staff | Blocked by Employee Conduct guidelines. |

### 2.2 Validation Algorithm
```
Input: Draft Text D, Retrieved Citations C
1. Extract candidate commitment spans in D using financial & promise patterns.
2. For each detected commitment span S:
     a. Locate supporting clause citation in C with status == 'covered'.
     b. Verify numerical parameters (e.g., amount, timeline) <= policy limits.
     c. If ungrounded or exceeds limits:
          Flag commitment with severity CRITICAL.
          Append to guardrail_report.unsupported_commitments_detected.
3. If any ungrounded commitment exists:
     Set guardrail_report.verdict = 'FLAGGED'.
     Set human_review_required = true.
```

---

## 3. Human-in-the-Loop Approval Workflow

### 3.1 Review States & Actions
The workspace interface requires the support agent to complete one of three verified actions:

1. **`Approve & Dispatch`**:
   - Condition: All concerns reviewed; guardrails passed or explicitly overridden with logged agent justification.
   - Action: Submits final response text to `POST /api/v1/complaints/dispatch`.
2. **`Edit & Re-validate`**:
   - Condition: Agent refines wording or removes flagged claims.
   - Action: Draft is re-evaluated by the guardrail engine in real-time.
3. **`Escalate to Tier-2 / Lead`**:
   - Condition: Complex policy gap, legal threat, or unresolvable conflict.
   - Action: Freezes ticket and routes to senior supervisor queue with full citation trail.

### 3.2 Immutable Audit Logging
Every dispatch action creates an immutable record in `dispatch_audit_logs`:
- Timestamp, Complaint ID, Agent ID
- Original AI draft vs. Final edited text (with diff)
- Cited policy chunk IDs
- Guardrail flags encountered and agent override reason (if any)

---

## 4. Input Sanitization & Prompt Injection Protection
1. **Delimited XML Prompt Framing**: Customer complaints are strictly encapsulated within `<customer_complaint>` tags to prevent jailbreak or instruction override attacks.
2. **PII Masking**: Credit card numbers (Luhn check), Social Security Numbers, and bank account numbers are scrubbed or masked prior to LLM submission.
3. **Strict Output Schemas**: All responses are validated against Pydantic models with typed fields. Unstructured markdown is never executed as HTML without sanitization.
