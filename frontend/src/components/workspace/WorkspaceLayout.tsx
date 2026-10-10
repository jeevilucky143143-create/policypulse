import React, { useState, useEffect } from 'react';
import {
  ArrowLeft,
  Menu,
  CheckCircle2,
  RotateCw,
} from 'lucide-react';
import {
  ComplaintTicket,
  ComplaintAnalysis,
  PolicyDocument,
  TonePreset,
  DispatchResponse,
} from '../../types';
import { TicketSidebar } from './TicketSidebar';
import { ComplaintHeader } from './ComplaintHeader';
import { DecomposedConcerns } from './DecomposedConcerns';
import { EvidenceViewer } from './EvidenceViewer';
import { GuardrailBanner } from './GuardrailBanner';
import { DraftEditor } from './DraftEditor';
import { DispatchModal } from './DispatchModal';
import { Button } from '../ui/Button';
import { apiService, BackendStatus } from '../../services/api';
import { AuthUser } from '../auth/Skiper21';

interface WorkspaceLayoutProps {
  onBackToLanding: () => void;
  initialTicketId?: string;
  backendStatus: BackendStatus;
  authUser?: AuthUser | null;
  onOpenAuth?: () => void;
}

export const WorkspaceLayout: React.FC<WorkspaceLayoutProps> = ({
  onBackToLanding,
  initialTicketId = 'CMP-2026-9042',
  backendStatus,
  authUser,
  onOpenAuth,
}) => {
  const [tickets, setTickets] = useState<ComplaintTicket[]>([]);
  const [policies, setPolicies] = useState<PolicyDocument[]>([]);
  const [selectedTicketId, setSelectedTicketId] = useState<string>(initialTicketId);
  const [selectedConcernIndex, setSelectedConcernIndex] = useState<number>(0);
  const [currentTone, setCurrentTone] = useState<TonePreset>('empathetic');
  const [analysis, setAnalysis] = useState<ComplaintAnalysis | null>(null);
  const [editedBody, setEditedBody] = useState<string>('');
  const [isLoadingAnalysis, setIsLoadingAnalysis] = useState<boolean>(true);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState<boolean>(false);

  // Dispatch modal state
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [modalAction, setModalAction] = useState<'APPROVE' | 'ESCALATE' | 'REJECT'>('APPROVE');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [dispatchResult, setDispatchResult] = useState<DispatchResponse | null>(null);

  // Load initial tickets and policies
  useEffect(() => {
    async function loadInitial() {
      const loadedTickets = await apiService.getTickets();
      const loadedPolicies = await apiService.getPolicies();
      setTickets(loadedTickets);
      setPolicies(loadedPolicies);
    }
    loadInitial();
  }, []);

  // Whenever ticket or tone changes, run analysis
  useEffect(() => {
    const currentTicket = tickets.find((t) => t.complaint_id === selectedTicketId);
    if (!currentTicket) return;

    setIsLoadingAnalysis(true);
    apiService.analyzeComplaint(currentTicket, currentTone).then(({ analysis }) => {
      setAnalysis(analysis);
      setEditedBody(analysis.grounded_draft.body);
      setSelectedConcernIndex(0);
      setIsLoadingAnalysis(false);
    });
  }, [selectedTicketId, currentTone, tickets]);

  const activeTicket =
    tickets.find((t) => t.complaint_id === selectedTicketId) || tickets[0];
  const activeConcern = analysis?.decomposed_concerns[selectedConcernIndex];

  // Action handlers
  const handleApprove = () => {
    setModalAction('APPROVE');
    setIsModalOpen(true);
  };

  const handleEscalate = () => {
    setModalAction('ESCALATE');
    setIsModalOpen(true);
  };

  const handleReject = () => {
    if (analysis) {
      setEditedBody(analysis.grounded_draft.body);
    }
  };

  const handleConfirmDispatch = async (notes: string) => {
    if (!activeTicket || !analysis) return;
    setIsSubmitting(true);

    const { response } = await apiService.dispatchComplaint({
      complaint_id: activeTicket.complaint_id,
      agent_id: 'AGENT-042',
      agent_name: 'Marcus Aurelius',
      action: modalAction,
      final_text: editedBody,
      notes: notes,
    });

    setIsSubmitting(false);
    setIsModalOpen(false);
    setDispatchResult(response);

    // Update ticket review status in list
    setTickets((prev) =>
      prev.map((t) =>
        t.complaint_id === activeTicket.complaint_id
          ? { ...t, review_status: response.status }
          : t
      )
    );
  };

  return (
    <div className="flex h-screen bg-[#0D0F12] overflow-hidden text-[#E8EAED]">
      {/* Compact Left Sidebar */}
      <TicketSidebar
        tickets={tickets}
        selectedTicketId={selectedTicketId}
        onSelectTicket={(id) => {
          setSelectedTicketId(id);
          setDispatchResult(null);
        }}
        policies={policies}
        isOpenMobile={isMobileSidebarOpen}
        onCloseMobile={() => setIsMobileSidebarOpen(false)}
      />

      {/* Main Workspace Area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden bg-[#0D0F12]">
        {/* Workspace Top Bar */}
        <header className="h-14 px-4 sm:px-6 border-b border-[#292E36] bg-[#13161B] flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setIsMobileSidebarOpen(true)}
              className="lg:hidden p-1.5 rounded-md text-[#9299A5] hover:text-[#E8EAED] hover:bg-[#181C22]"
            >
              <Menu className="w-4 h-4" />
            </button>

            <Button
              variant="ghost"
              size="sm"
              onClick={onBackToLanding}
              icon={<ArrowLeft className="w-3.5 h-3.5" />}
            >
              <span className="hidden sm:inline">Overview</span>
            </Button>

            <div className="h-4 w-px bg-[#292E36] hidden sm:block" />

            <div className="flex items-center gap-2">
              <span className="font-semibold text-xs sm:text-sm text-[#E8EAED]">
                Agent Review Console
              </span>
              <span className="text-[11px] font-mono text-[#9299A5] hidden md:inline">
                • {authUser ? `${authUser.name}` : 'Agent Marcus Aurelius (Tier-1)'}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-mono bg-[#181C22] border border-[#292E36] text-[#9299A5]">
              <span
                className={`w-1.5 h-1.5 rounded-full ${
                  backendStatus.isLive ? 'bg-[#72B095]' : 'bg-[#D3A365]'
                }`}
              />
              <span className="hidden sm:inline">
                {backendStatus.isLive ? 'Live FastAPI Backend' : 'Demo Fallback Engine'}
              </span>
              <span className="sm:hidden">{backendStatus.isLive ? 'Live' : 'Demo'}</span>
            </div>
          </div>
        </header>

        {/* Scrollable Content Body */}
        <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-7">
          <div className="max-w-7xl mx-auto space-y-5">
            {/* Dispatch Result Confirmation Toast */}
            {dispatchResult && (
              <div className="p-3.5 rounded-lg bg-[#162620] border border-[#234235] text-[#72B095] flex items-center justify-between text-xs animate-in fade-in duration-150">
                <div className="flex items-center gap-2.5">
                  <CheckCircle2 className="w-4 h-4 text-[#72B095] shrink-0" />
                  <div>
                    <span className="font-semibold block">
                      Response Formally {dispatchResult.status}
                    </span>
                    <span className="text-[#9299A5] font-mono text-[10px] block mt-0.5">
                      Dispatch Ref: {dispatchResult.dispatch_id} • Audit Log: {dispatchResult.audit_log_id}
                    </span>
                  </div>
                </div>
                <button
                  onClick={() => setDispatchResult(null)}
                  className="text-[#9299A5] hover:text-[#E8EAED] text-xs px-2 py-1 cursor-pointer"
                >
                  Dismiss
                </button>
              </div>
            )}

            {/* Active Complaint Statement & Details */}
            {activeTicket && <ComplaintHeader ticket={activeTicket} />}

            {/* Guardrail Safety Banner (restrained, shown if flagged or passed) */}
            {analysis && <GuardrailBanner report={analysis.guardrail_report} />}

            {/* Decomposed Issues Selector */}
            {analysis && (
              <DecomposedConcerns
                concerns={analysis.decomposed_concerns}
                selectedIndex={selectedConcernIndex}
                onSelectConcern={(idx) => setSelectedConcernIndex(idx)}
              />
            )}

            {/* Loading State */}
            {isLoadingAnalysis ? (
              <div className="p-16 text-center text-xs text-[#9299A5] space-y-2">
                <RotateCw className="w-5 h-5 animate-spin mx-auto text-[#8BA7D9]" />
                <p>Retrieving policy clauses and grounding complaint...</p>
              </div>
            ) : analysis ? (
              /* Writing-Focused Split Workspace: Editor (7 cols) + Evidence (5 cols) */
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
                {/* Wider Primary Writing Area: Draft Editor (7 cols) */}
                <div className="lg:col-span-7">
                  <DraftEditor
                    draft={analysis.grounded_draft}
                    editedBody={editedBody}
                    onChangeBody={setEditedBody}
                    currentTone={currentTone}
                    onSelectTone={setCurrentTone}
                    onApprove={handleApprove}
                    onReject={handleReject}
                    onEscalate={handleEscalate}
                    isSubmitting={isSubmitting}
                  />
                </div>

                {/* Secondary Narrower Panel: Policy Evidence (5 cols) */}
                <div className="lg:col-span-5">
                  <EvidenceViewer concern={activeConcern} />
                </div>
              </div>
            ) : null}
          </div>
        </main>
      </div>

      {/* Human Review Authorization Modal */}
      {activeTicket && (
        <DispatchModal
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          actionType={modalAction}
          complaintId={activeTicket.complaint_id}
          customerName={activeTicket.customer_name}
          onConfirm={handleConfirmDispatch}
          isSubmitting={isSubmitting}
        />
      )}
    </div>
  );
};
