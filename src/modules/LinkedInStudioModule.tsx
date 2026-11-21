import { useMemo, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { toPng } from 'html-to-image';
import {
  Check,
  ChevronDown,
  ChevronUp,
  Copy,
  Download,
  Loader2,
  Plus,
  Search,
  Share2,
  Sparkles,
} from 'lucide-react';
import { useCareerStore } from '../context/CareerStoreContext';
import { ProvenanceText } from '../components/ProvenanceBadge';
import { postJson } from '../services/apiClient';
import type { LinkedInPost } from '../shared/schemas';

const POST_TYPES: Array<{ value: LinkedInPost['type']; label: string }> = [
  { value: 'project_launch', label: 'Project Launch' },
  { value: 'learning_milestone', label: 'Learning Milestone' },
  { value: 'technical_explanation', label: 'Technical Breakdown' },
  { value: 'hackathon_summary', label: 'Sprint Summary' },
  { value: 'skill_update', label: 'Verified Skill Update' },
  { value: 'portfolio_announcement', label: 'Portfolio Showcase' },
  { value: 'reflection', label: 'Career Transition Note' },
];

type ToneOption = 'professional' | 'conversational' | 'storytelling' | 'technical';
type LengthOption = 'short' | 'medium' | 'detailed';
type EvidenceFilter = 'all' | 'projects' | 'skills' | 'interviews';

export function LinkedInStudioModule() {
  const { store, analysis, updateStore, setActiveModule } = useCareerStore();

  const selectableItems = useMemo(() => {
    const items: Array<{
      id: string;
      kind: 'projects' | 'skills' | 'interviews';
      label: string;
      detail: string;
    }> = [];

    for (const proj of store.portfolioProjects) {
      if (proj.status === 'completed' || proj.status === 'evidence_submitted') {
        items.push({
          id: proj.id,
          kind: 'projects',
          label: proj.title,
          detail: proj.problem,
        });
      }
    }

    for (const ev of store.evidenceRecords) {
      if (ev.level === 'demonstrated') {
        items.push({
          id: ev.id,
          kind: 'skills',
          label: `${ev.skillLabel || ev.skillId} · Verified project proof`,
          detail: ev.note || ev.sourceRef,
        });
      } else if (ev.level === 'assessed') {
        items.push({
          id: ev.id,
          kind: 'interviews',
          label: `${ev.skillLabel || ev.skillId} · Interview assessment`,
          detail: ev.note || ev.sourceRef,
        });
      }
    }
    return items;
  }, [store.evidenceRecords, store.portfolioProjects]);

  const [filterKind, setFilterKind] = useState<EvidenceFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedIds, setSelectedIds] = useState<string[]>(() =>
    selectableItems.slice(0, 2).map((i) => i.id)
  );
  const [postType, setPostType] = useState<LinkedInPost['type']>('project_launch');
  const [tone, setTone] = useState<ToneOption>('professional');
  const [length, setLength] = useState<LengthOption>('medium');
  const [draftText, setDraftText] = useState('');
  const [placeholdersUsed, setPlaceholdersUsed] = useState<string[]>([]);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [savedNotice, setSavedNotice] = useState<string | null>(null);
  const [cardHeadline, setCardHeadline] = useState('Verified Capability Milestone');
  const [exportingPng, setExportingPng] = useState(false);

  const [archiveOpen, setArchiveOpen] = useState(store.linkedInPosts.length > 0);
  const [loggingPostId, setLoggingPostId] = useState<string | null>(null);
  const [impressions, setImpressions] = useState('0');
  const [reactions, setReactions] = useState('0');
  const [comments, setComments] = useState('0');

  const cardRef = useRef<HTMLDivElement>(null);

  const filteredItems = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return selectableItems.filter((item) => {
      if (filterKind !== 'all' && item.kind !== filterKind) return false;
      if (!q) return true;
      return item.label.toLowerCase().includes(q) || item.detail.toLowerCase().includes(q);
    });
  }, [selectableItems, filterKind, searchQuery]);

  function toggleEvidence(id: string) {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }

  async function handleGenerateDraft() {
    setError(null);
    setSavedNotice(null);
    const chosen = selectableItems.filter((item) => selectedIds.includes(item.id));
    if (chosen.length === 0) {
      setError('Choose at least one completed achievement or verified skill first.');
      return;
    }

    setGenerating(true);
    const primaryRole =
      store.targetRoles[0]?.title || store.profile?.careerObjective || 'Target role';
    const res = await postJson<{ text: string; placeholdersUsed: string[] }>(
      '/api/ai/content',
      {
        postType,
        tone,
        length,
        selectedEvidence: chosen.map((c) => ({ label: c.label, detail: c.detail })),
        targetRole: primaryRole,
      }
    );
    setGenerating(false);

    if (!res.ok) {
      setError(res.error);
      return;
    }
    setDraftText(res.data.text);
    setPlaceholdersUsed(res.data.placeholdersUsed);
  }

  async function handleCopy() {
    if (!draftText.trim()) return;
    await navigator.clipboard.writeText(draftText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function handleSavePost() {
    if (!draftText.trim()) return;
    const newPost: LinkedInPost = {
      id: `post-${Date.now()}`,
      type: postType,
      evidenceIds: selectedIds,
      text: draftText.trim(),
      createdAt: new Date().toISOString().slice(0, 10),
      provenance: 'candidate',
    };
    await updateStore((prev) => ({
      ...prev,
      linkedInPosts: [newPost, ...prev.linkedInPosts],
    }));
    setArchiveOpen(true);
    setSavedNotice('Saved post to your archive below.');
  }

  async function handleExportCardPng() {
    if (!cardRef.current) return;
    setExportingPng(true);
    try {
      const dataUrl = await toPng(cardRef.current, {
        cacheBust: true,
        pixelRatio: 2,
      });
      const link = document.createElement('a');
      link.download = `rolexiq-milestone-${new Date().toISOString().slice(0, 10)}.png`;
      link.href = dataUrl;
      link.click();
    } finally {
      setExportingPng(false);
    }
  }

  async function handleSaveMetrics(postId: string) {
    const today = new Date().toISOString().slice(0, 10);
    await updateStore((prev) => ({
      ...prev,
      linkedInPosts: prev.linkedInPosts.map((p) =>
        p.id === postId
          ? {
              ...p,
              manualMetrics: {
                impressions: Math.max(0, Number(impressions) || 0),
                reactions: Math.max(0, Number(reactions) || 0),
                comments: Math.max(0, Number(comments) || 0),
                date: today,
              },
            }
          : p
      ),
    }));
    setLoggingPostId(null);
  }

  const postsWithMetrics = store.linkedInPosts.filter((p) => Boolean(p.manualMetrics));
  const maxImp = Math.max(1, ...postsWithMetrics.map((p) => p.manualMetrics?.impressions ?? 0));

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className="space-y-8"
    >
      {/* Header */}
      <section className="flex flex-wrap items-end justify-between gap-4 border-b border-[#382920] pb-6">
        <div className="space-y-1 max-w-2xl">
          <div className="text-[10px] tracking-[0.22em] uppercase text-[#B86D37]">
            Evidence-Backed Career Publishing
          </div>
          <h2 className="font-editorial text-3xl sm:text-4xl font-light text-[#EAE4DC]">
            Share real milestones on LinkedIn
          </h2>
          <p className="text-sm text-[#A69A8C]">
            Turn verified projects and interview wins into authentic posts—never exaggerated, with
            bracketed placeholders wherever you want to add personal numbers.
          </p>
        </div>
        <span className="text-[11px] text-[#A69A8C] bg-[#1B1714] border border-[#382920] px-3 py-1.5">
          Drafts prepare for manual posting · No automatic publishing
        </span>
      </section>

      {/* Main 3-Step Studio */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left: Step 1 & Step 2 */}
        <div className="lg:col-span-5 space-y-6">
          <div className="arch-panel p-6 space-y-4">
            <div className="flex items-center justify-between gap-2">
              <h3 className="font-editorial text-xl font-light text-[#EAE4DC]">
                1. Choose what to share
              </h3>
              <span className="font-mono-tabular text-xs text-[#B86D37]">
                {selectedIds.length} selected
              </span>
            </div>

            <div className="flex flex-wrap gap-1.5">
              {(
                [
                  { id: 'all', label: 'All' },
                  { id: 'projects', label: 'Projects' },
                  { id: 'skills', label: 'Verified Skills' },
                  { id: 'interviews', label: 'Interviews' },
                ] as const
              ).map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setFilterKind(f.id)}
                  className={`px-2.5 py-1 text-xs font-medium border transition-colors ${
                    filterKind === f.id
                      ? 'bg-[#211A16] border-[#B86D37]/70 text-[#EAE4DC]'
                      : 'bg-[#12100F] border-[#382920] text-[#A69A8C] hover:text-[#EAE4DC]'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>

            <div className="relative">
              <Search className="w-3.5 h-3.5 text-[#A69A8C] absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search projects or skills..."
                aria-label="Filter verified milestones"
                className="arch-input pl-8 pr-3 py-2 text-xs"
              />
            </div>

            {selectableItems.length === 0 ? (
              <div className="p-4 bg-[#12100F] border border-[#382920] text-xs text-[#A69A8C] space-y-2.5">
                <p>
                  No completed projects or assessed skills yet. Add project proof or finish a mock
                  interview first so your post is grounded in real work.
                </p>
                <button
                  type="button"
                  onClick={() => setActiveModule('portfolio')}
                  className="underline font-medium text-[#B86D37] hover:text-[#EAE4DC]"
                >
                  Open Portfolio Studio
                </button>
              </div>
            ) : filteredItems.length === 0 ? (
              <p className="text-xs text-[#A69A8C] py-2">No items match that filter.</p>
            ) : (
              <div className="max-h-60 overflow-y-auto space-y-2 pr-1">
                {filteredItems.map((item) => {
                  const checked = selectedIds.includes(item.id);
                  return (
                    <label
                      key={item.id}
                      className={`block border p-3 text-xs cursor-pointer transition-colors ${
                        checked
                          ? 'bg-[#211A16] border-[#B86D37]/70 text-[#EAE4DC]'
                          : 'bg-[#12100F] border-[#382920] text-[#A69A8C] hover:bg-[#211A16]/50'
                      }`}
                    >
                      <div className="flex items-start gap-2.5">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleEvidence(item.id)}
                          className="mt-0.5 accent-[#B86D37]"
                        />
                        <div className="min-w-0">
                          <div className="font-medium text-[#EAE4DC]">{item.label}</div>
                          <div className="text-[11px] text-[#A69A8C] line-clamp-2 mt-0.5">
                            {item.detail}
                          </div>
                        </div>
                      </div>
                    </label>
                  );
                })}
              </div>
            )}
          </div>

          <div className="arch-panel p-6 space-y-4">
            <h3 className="font-editorial text-xl font-light text-[#EAE4DC]">
              2. Configure & generate
            </h3>

            <div className="space-y-3 text-xs">
              <label className="block space-y-1">
                <span className="text-[#A69A8C]">Post format</span>
                <select
                  value={postType}
                  onChange={(e) => setPostType(e.target.value as LinkedInPost['type'])}
                  className="arch-input px-3 py-2"
                >
                  {POST_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </label>

              <div className="grid grid-cols-2 gap-3">
                <label className="block space-y-1">
                  <span className="text-[#A69A8C]">Tone</span>
                  <select
                    value={tone}
                    onChange={(e) => setTone(e.target.value as ToneOption)}
                    className="arch-input px-3 py-2"
                  >
                    <option value="professional">Professional</option>
                    <option value="conversational">Conversational</option>
                    <option value="storytelling">Storytelling</option>
                    <option value="technical">Technical</option>
                  </select>
                </label>

                <label className="block space-y-1">
                  <span className="text-[#A69A8C]">Length</span>
                  <select
                    value={length}
                    onChange={(e) => setLength(e.target.value as LengthOption)}
                    className="arch-input px-3 py-2"
                  >
                    <option value="short">Short</option>
                    <option value="medium">Medium</option>
                    <option value="detailed">Detailed</option>
                  </select>
                </label>
              </div>
            </div>

            {error && (
              <div className="text-xs text-[#EAE4DC] border-l-2 border-[#B86D37] p-3 bg-[#211A16]">
                {error}
              </div>
            )}

            <button
              type="button"
              onClick={handleGenerateDraft}
              disabled={generating || selectableItems.length === 0}
              className="arch-btn-primary w-full py-2.5"
            >
              {generating ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin text-[#B86D37]" />
              ) : (
                <Sparkles className="w-3.5 h-3.5 text-[#B86D37]" />
              )}
              <span>{generating ? 'Drafting post...' : 'Generate Post Draft'}</span>
            </button>
          </div>
        </div>

        {/* Right: Step 3 Preview, Refine & Architectural Milestone Card */}
        <div className="lg:col-span-7 space-y-6">
          <div className="arch-panel p-6 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="font-editorial text-xl font-light text-[#EAE4DC]">
                3. Preview, edit & copy
              </h3>
              <span className="font-mono-tabular text-xs text-[#A69A8C]">
                {draftText.length} / 3,000 chars
              </span>
            </div>

            <textarea
              rows={8}
              value={draftText}
              onChange={(e) => setDraftText(e.target.value)}
              placeholder="Select a milestone and generate your post, or write your own authentic update..."
              aria-label="LinkedIn post editor"
              className="arch-input p-4 text-sm leading-relaxed"
            />

            {placeholdersUsed.length > 0 && (
              <div className="bg-[#211A16] border-l-2 border-[#B86D37] p-3.5 text-xs space-y-1">
                <div className="text-[#B86D37] font-medium">
                  Personalize these placeholders before posting:
                </div>
                <ul className="list-disc pl-5 text-[#A69A8C]">
                  {placeholdersUsed.map((ph, idx) => (
                    <li key={idx}>{ph}</li>
                  ))}
                </ul>
              </div>
            )}

            {savedNotice && <div className="text-xs text-[#B86D37] font-medium">{savedNotice}</div>}

            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={handleCopy}
                disabled={!draftText.trim()}
                className="arch-btn-primary px-4 py-2"
              >
                {copied ? (
                  <Check className="w-3.5 h-3.5 text-[#B86D37]" />
                ) : (
                  <Copy className="w-3.5 h-3.5 text-[#B86D37]" />
                )}
                <span>{copied ? 'Copied to clipboard' : 'Copy Post'}</span>
              </button>
              <button
                type="button"
                onClick={handleSavePost}
                disabled={!draftText.trim()}
                className="arch-btn-secondary px-4 py-2"
              >
                <Plus className="w-3.5 h-3.5 text-[#B86D37]" />
                <span>Save Draft</span>
              </button>
            </div>
          </div>

          {/* Dark Architectural Luxury Shareable Milestone Card */}
          <div className="arch-panel p-6 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Share2 className="w-4 h-4 text-[#B86D37]" />
                <h3 className="font-editorial text-xl font-light text-[#EAE4DC]">
                  Shareable Milestone Card
                </h3>
              </div>
              <button
                type="button"
                onClick={handleExportCardPng}
                disabled={exportingPng}
                className="arch-btn-secondary px-3.5 py-2"
              >
                <Download className="w-3.5 h-3.5 text-[#B86D37]" />
                <span>{exportingPng ? 'Exporting PNG...' : 'Download Card PNG'}</span>
              </button>
            </div>

            <input
              type="text"
              value={cardHeadline}
              onChange={(e) => setCardHeadline(e.target.value)}
              aria-label="Achievement card headline"
              className="arch-input px-3 py-2 text-xs"
            />

            <div
              ref={cardRef}
              className="bg-[#12100F] border border-[#B86D37]/60 p-7 space-y-5 text-[#EAE4DC]"
              style={{
                backgroundImage:
                  'radial-gradient(ellipse at 90% 10%, rgba(184, 109, 55, 0.14), transparent 55%)',
              }}
            >
              <div className="flex items-center justify-between border-b border-[#382920] pb-3.5">
                <span className="font-editorial text-xl tracking-[0.06em] text-[#EAE4DC]">
                  Rolex<span className="text-[#B86D37]">IQ</span>
                </span>
                <span className="text-[11px] font-mono-tabular tracking-[0.14em] uppercase text-[#A69A8C]">
                  {new Date().toISOString().slice(0, 10)}
                </span>
              </div>
              <div className="space-y-1.5">
                <div className="text-[10px] tracking-[0.22em] uppercase text-[#B86D37]">
                  {store.profile?.name || 'Candidate'} · Verified Capability Proof
                </div>
                <h4 className="font-editorial text-3xl font-light text-[#EAE4DC]">
                  {cardHeadline}
                </h4>
              </div>
              <div className="grid grid-cols-2 gap-4 pt-4 border-t border-[#382920] text-xs">
                <div>
                  <div className="text-[10px] tracking-[0.16em] uppercase text-[#A69A8C]">
                    Verified Readiness
                  </div>
                  <div className="font-mono-tabular text-2xl font-light text-[#B86D37] mt-1">
                    {Math.round(analysis.overallReadiness * 100)}%
                  </div>
                </div>
                <div>
                  <div className="text-[10px] tracking-[0.16em] uppercase text-[#A69A8C]">
                    Proven Milestones
                  </div>
                  <div className="text-[#EAE4DC] font-medium mt-1 leading-relaxed">
                    {selectableItems
                      .filter((i) => selectedIds.includes(i.id))
                      .slice(0, 2)
                      .map((i) => i.label)
                      .join(' · ') || 'Career milestone'}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Secondary Collapsible Post Archive & Manual Engagement Log */}
      <section className="arch-panel p-6 space-y-4">
        <button
          type="button"
          onClick={() => setArchiveOpen((v) => !v)}
          className="w-full flex items-center justify-between gap-4 text-left"
        >
          <div>
            <h3 className="font-editorial text-xl font-light text-[#EAE4DC]">
              Saved Drafts & Engagement Log ({store.linkedInPosts.length})
            </h3>
            <p className="text-xs text-[#A69A8C] mt-0.5">
              Optional manual tracking after you publish your draft on LinkedIn.
            </p>
          </div>
          {archiveOpen ? (
            <ChevronUp className="w-4 h-4 text-[#B86D37]" />
          ) : (
            <ChevronDown className="w-4 h-4 text-[#A69A8C]" />
          )}
        </button>

        {archiveOpen && (
          <div className="space-y-5 pt-3 border-t border-[#382920]">
            {postsWithMetrics.length > 0 && (
              <div className="bg-[#12100F] border border-[#382920] p-4 space-y-2.5">
                <div className="text-[10px] tracking-[0.16em] uppercase text-[#B86D37]">
                  Logged Impressions by Post
                </div>
                <div className="space-y-2">
                  {postsWithMetrics.map((p) => {
                    const imp = p.manualMetrics?.impressions ?? 0;
                    const widthPct = Math.max(4, Math.round((imp / maxImp) * 100));
                    return (
                      <div key={p.id} className="space-y-1 text-xs">
                        <div className="flex justify-between text-[#EAE4DC]">
                          <span className="truncate max-w-md">{p.text.slice(0, 64)}...</span>
                          <span className="font-mono-tabular text-[#A69A8C]">
                            {imp} impr · {p.manualMetrics?.reactions ?? 0} react ·{' '}
                            {p.manualMetrics?.comments ?? 0} comm
                          </span>
                        </div>
                        <div className="h-1.5 bg-[#382920] overflow-hidden">
                          <div className="h-full bg-[#B86D37]" style={{ width: `${widthPct}%` }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {store.linkedInPosts.length === 0 ? (
              <p className="text-xs text-[#A69A8C]">No saved posts yet.</p>
            ) : (
              <div className="space-y-3">
                {store.linkedInPosts.map((post) => (
                  <div
                    key={post.id}
                    className="bg-[#12100F] border border-[#382920] p-4 space-y-3 text-xs"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-3">
                        <span className="text-[#EAE4DC] font-medium capitalize">
                          {post.type.replace(/_/g, ' ')}
                        </span>
                        <ProvenanceText tag={post.provenance} date={post.createdAt} />
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setLoggingPostId(loggingPostId === post.id ? null : post.id);
                          setImpressions(String(post.manualMetrics?.impressions ?? 0));
                          setReactions(String(post.manualMetrics?.reactions ?? 0));
                          setComments(String(post.manualMetrics?.comments ?? 0));
                        }}
                        className="underline text-[#B86D37] hover:text-[#EAE4DC]"
                      >
                        {post.manualMetrics ? 'Update metrics' : 'Log engagement'}
                      </button>
                    </div>

                    <p className="text-[#EAE4DC] whitespace-pre-wrap leading-relaxed">{post.text}</p>

                    {post.manualMetrics && (
                      <div className="text-[11px] font-mono-tabular text-[#A69A8C]">
                        Logged {post.manualMetrics.date}: {post.manualMetrics.impressions}{' '}
                        impressions · {post.manualMetrics.reactions} reactions ·{' '}
                        {post.manualMetrics.comments} comments
                      </div>
                    )}

                    {loggingPostId === post.id && (
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2 border-t border-[#382920]">
                        <label className="space-y-1">
                          <span className="text-[#A69A8C]">Impressions</span>
                          <input
                            type="number"
                            min={0}
                            value={impressions}
                            onChange={(e) => setImpressions(e.target.value)}
                            className="arch-input px-2.5 py-1.5"
                          />
                        </label>
                        <label className="space-y-1">
                          <span className="text-[#A69A8C]">Reactions</span>
                          <input
                            type="number"
                            min={0}
                            value={reactions}
                            onChange={(e) => setReactions(e.target.value)}
                            className="arch-input px-2.5 py-1.5"
                          />
                        </label>
                        <label className="space-y-1">
                          <span className="text-[#A69A8C]">Comments</span>
                          <input
                            type="number"
                            min={0}
                            value={comments}
                            onChange={(e) => setComments(e.target.value)}
                            className="arch-input px-2.5 py-1.5"
                          />
                        </label>
                        <div className="flex items-end">
                          <button
                            type="button"
                            onClick={() => handleSaveMetrics(post.id)}
                            className="arch-btn-primary w-full py-1.5"
                          >
                            Save
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </section>
    </motion.div>
  );
}
