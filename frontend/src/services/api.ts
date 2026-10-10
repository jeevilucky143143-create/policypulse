import {
  ComplaintTicket,
  ComplaintAnalysis,
  PolicyDocument,
  DispatchPayload,
  DispatchResponse,
  TonePreset,
} from '../types';
import { MOCK_TICKETS, MOCK_ANALYSES, MOCK_POLICIES } from '../data/mockData';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000/api/v1';

export interface BackendStatus {
  isLive: boolean;
  message: string;
  timestamp: string;
}

export const apiService = {
  // Check health of backend
  async checkHealth(): Promise<BackendStatus> {
    try {
      const res = await fetch(`${API_BASE_URL}/health`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      });
      if (res.ok) {
        const data = await res.json();
        return {
          isLive: true,
          message: `Connected to FastAPI (${data.version || 'v1.0.0'})`,
          timestamp: new Date().toISOString(),
        };
      }
    } catch {
      // Backend not running
    }
    return {
      isLive: false,
      message: 'Local Interactive Demo Engine (Backend Offline Fallback)',
      timestamp: new Date().toISOString(),
    };
  },

  // Get active complaint tickets
  async getTickets(): Promise<ComplaintTicket[]> {
    try {
      const res = await fetch(`${API_BASE_URL}/conversations`);
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data) && data.length > 0) {
          return data;
        }
      }
    } catch {
      // Fallback
    }
    return MOCK_TICKETS;
  },

  // Get enterprise policy manuals
  async getPolicies(): Promise<PolicyDocument[]> {
    try {
      const res = await fetch(`${API_BASE_URL}/policies`);
      if (res.ok) {
        const raw = await res.json();
        if (Array.isArray(raw) && raw.length > 0) {
          return raw.map((p: any) => ({
            policy_id: p.policy_id || p.document_id || '',
            title: p.title || p.source_filename || 'Policy Document',
            version: p.version || p.version_label || 'v1.0',
            category: p.category || p.document_type || 'General',
            updated_at: p.updated_at || (p.created_at ? new Date(p.created_at).toISOString() : new Date().toISOString()),
            total_chunks: p.total_chunks || 0,
            status: p.status || 'active',
          }));
        }
      }
    } catch {
      // Fallback
    }
    return MOCK_POLICIES;
  },

  // Analyze complaint with RAG decomposition, citations, guardrail check
  async analyzeComplaint(
    ticket: ComplaintTicket,
    tone: TonePreset = 'empathetic'
  ): Promise<{ analysis: ComplaintAnalysis; isLive: boolean }> {
    try {
      const res = await fetch(`${API_BASE_URL}/complaints/analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          complaint_id: ticket.complaint_id,
          customer_id: ticket.customer_id,
          customer_name: ticket.customer_name,
          channel: ticket.channel,
          raw_text: ticket.raw_text,
          tone_preference: tone,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        return { analysis: data, isLive: true };
      }
    } catch {
      // Fallback to rich mock analysis
    }

    const ticketAnalyses = MOCK_ANALYSES[ticket.complaint_id];
    if (ticketAnalyses && ticketAnalyses[tone]) {
      return { analysis: ticketAnalyses[tone], isLive: false };
    }

    // Default fallback to first mock ticket
    return { analysis: MOCK_ANALYSES['CMP-2026-9042'][tone], isLive: false };
  },

  // Dispatch / Approve complaint response with human authorization
  async dispatchComplaint(
    payload: DispatchPayload
  ): Promise<{ response: DispatchResponse; isLive: boolean }> {
    try {
      const res = await fetch(`${API_BASE_URL}/complaints/dispatch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        const data = await res.json();
        return { response: data, isLive: true };
      }
    } catch {
      // Fallback
    }

    // Demo dispatch response with explicit simulation flag
    const mockResponse: DispatchResponse = {
      dispatch_id: `DISP-${Math.floor(1000 + Math.random() * 9000)}-SIMULATED`,
      complaint_id: payload.complaint_id,
      status: payload.action === 'APPROVE' ? 'SIMULATED_DISPATCH' : payload.action === 'ESCALATE' ? 'ESCALATED' : 'REJECTED',
      dispatched_at: new Date().toISOString(),
      audit_log_id: `AUDIT-SIMULATED-${Date.now()}`,
      delivery_channel: 'SIMULATED_LOCAL_DEMO',
    };

    return { response: mockResponse, isLive: false };
  },
};
