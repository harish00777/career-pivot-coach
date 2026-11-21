import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowRight,
  BookOpen,
  Briefcase,
  Building2,
  Compass,
  FileText,
  FolderGit2,
  Mic,
  Search,
  Sparkles,
  Target,
  X,
} from 'lucide-react';
import { useCareerStore, type ModuleId } from '../context/CareerStoreContext';

interface PaletteItem {
  id: string;
  group: string;
  title: string;
  subtitle: string;
  icon: React.ReactNode;
  action: () => void;
}

const MODULE_LIST: Array<{ id: ModuleId; title: string; subtitle: string }> = [
  { id: 'overview', title: 'Overview', subtitle: 'Architectural hero, Next Best Step & readiness snapshot' },
  { id: 'resume', title: 'Resume Intelligence', subtitle: 'Parse, edit & audit resume evidence and versions' },
  { id: 'company-dna', title: 'Company DNA', subtitle: 'Job descriptions & cross-company requirement matrix' },
  { id: 'gaps', title: 'Skill Gap Explorer', subtitle: 'Prioritized gap formula, quotes & proof staging' },
  { id: 'preparation', title: 'Preparation Studio', subtitle: 'Track A Role Mastery, Track B Company Prep & Verified Resources' },
  { id: 'roadmap', title: 'Career Roadmap', subtitle: 'Week-by-week learning schedule & adaptive replanning' },
  { id: 'portfolio', title: 'Portfolio Studio', subtitle: 'Tailored gap-closing projects & proof verification' },
  { id: 'interview', title: 'Interview Arena', subtitle: 'Live voice, speech-to-text & 100-point rubric evaluation' },
  { id: 'progress', title: 'Career Progress', subtitle: 'Readiness trajectory chart & momentum diagnosis' },
  { id: 'applications', title: 'Application Tracker', subtitle: 'Role pipeline & response-rate pattern analytics' },
  { id: 'linkedin', title: 'LinkedIn Studio', subtitle: 'Grounded milestone drafts & exportable summary card' },
  { id: 'reports', title: 'Reports', subtitle: 'Printable dossiers & structured JSON intelligence export' },
  { id: 'settings', title: 'Settings', subtitle: 'Sync status, voice preferences & workspace management' },
];

export function CommandPalette() {
  const {
    store,
    analysis,
    commandPaletteOpen,
    setCommandPaletteOpen,
    setActiveModule,
    setSelectedGapSkillId,
    setPrepPreset,
    setInterviewPreset,
    setReadinessDrawerOpen,
    loadDemoCandidate,
    exportAllJson,
  } = useCareerStore();

  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (commandPaletteOpen) {
      setQuery('');
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 20);
    }
  }, [commandPaletteOpen]);

  const allItems = useMemo<PaletteItem[]>(() => {
    const items: PaletteItem[] = [];

    // Modules
    for (const m of MODULE_LIST) {
      items.push({
        id: `mod-${m.id}`,
        group: 'Modules',
        title: m.title,
        subtitle: m.subtitle,
        icon: <Compass className="w-3.5 h-3.5 text-[#B86D37]" />,
        action: () => {
          setActiveModule(m.id);
          setCommandPaletteOpen(false);
        },
      });
    }

    // Quick actions
    items.push({
      id: 'act-readiness',
      group: 'Quick Actions',
      title: 'Inspect Readiness Calculation Audit',
      subtitle: `Current overall readiness: ${Math.round(analysis.overallReadiness * 100)}%`,
      icon: <Target className="w-3.5 h-3.5 text-[#B86D37]" />,
      action: () => {
        setCommandPaletteOpen(false);
        setReadinessDrawerOpen(true);
      },
    });
    items.push({
      id: 'act-interview',
      group: 'Quick Actions',
      title: 'Start Rubric-Scored Mock Interview',
      subtitle: 'Launch Interview Arena (Live voice, dictation, or text)',
      icon: <Mic className="w-3.5 h-3.5 text-[#B86D37]" />,
      action: () => {
        setActiveModule('interview');
        setCommandPaletteOpen(false);
      },
    });
    if (!store.resumeVersions.length && !store.jobDescriptions.length) {
      items.push({
        id: 'act-demo',
        group: 'Quick Actions',
        title: 'Explore Sample Demo Workspace',
        subtitle: 'Populate Maya Lin candidate journey (Stripe, Datadog, Linear)',
        icon: <Sparkles className="w-3.5 h-3.5 text-[#B86D37]" />,
        action: () => {
          void loadDemoCandidate();
          setCommandPaletteOpen(false);
        },
      });
    }
    items.push({
      id: 'act-export',
      group: 'Quick Actions',
      title: 'Export Career Workspace JSON',
      subtitle: 'Download complete portable snapshot',
      icon: <FileText className="w-3.5 h-3.5 text-[#B86D37]" />,
      action: () => {
        exportAllJson();
        setCommandPaletteOpen(false);
      },
    });

    // Companies & Target Roles
    for (const role of store.targetRoles) {
      const co = store.companies.find((c) => c.id === role.companyId);
      items.push({
        id: `role-${role.id}`,
        group: 'Companies & Roles',
        title: `${co?.name || 'Company'} — ${role.title}`,
        subtitle: 'Open Company DNA & specific preparation track',
        icon: <Building2 className="w-3.5 h-3.5 text-[#A69A8C]" />,
        action: () => {
          if (co) {
            setPrepPreset({ companyId: co.id, tab: 'company' });
          }
          setActiveModule('company-dna');
          setCommandPaletteOpen(false);
        },
      });
    }

    // Priority Skill Gaps
    for (const gap of analysis.gaps) {
      items.push({
        id: `gap-${gap.skillId}`,
        group: 'Skill Gaps',
        title: gap.skillLabel,
        subtitle: `${gap.status.replace('_', ' ')} · ${Math.round(gap.strength * 100)}% proof · Priority ${gap.priorityScore.toFixed(2)}`,
        icon: <Target className="w-3.5 h-3.5 text-[#A69A8C]" />,
        action: () => {
          setSelectedGapSkillId(gap.skillId);
          setActiveModule('gaps');
          setCommandPaletteOpen(false);
        },
      });
    }

    // Learning Resources
    for (const res of store.learningResources) {
      items.push({
        id: `res-${res.id}`,
        group: 'Learning Resources',
        title: res.title,
        subtitle: `${res.skill} · ${res.provider || res.resourceType} · ${res.status}`,
        icon: <BookOpen className="w-3.5 h-3.5 text-[#A69A8C]" />,
        action: () => {
          setPrepPreset({ skill: res.skill, tab: 'resources' });
          setActiveModule('preparation');
          setCommandPaletteOpen(false);
        },
      });
    }

    // Portfolio Projects
    for (const proj of store.portfolioProjects) {
      items.push({
        id: `proj-${proj.id}`,
        group: 'Portfolio Projects',
        title: proj.title,
        subtitle: `Skills: ${proj.skills.slice(0, 3).join(', ')} · ${proj.status.replace('_', ' ')}`,
        icon: <FolderGit2 className="w-3.5 h-3.5 text-[#A69A8C]" />,
        action: () => {
          setActiveModule('portfolio');
          setCommandPaletteOpen(false);
        },
      });
    }

    // Roadmap Tasks
    for (const week of store.roadmap?.weeks ?? []) {
      items.push({
        id: `week-${week.n}`,
        group: 'Roadmap',
        title: `Week ${week.n}: ${week.objective}`,
        subtitle: `${week.tasks.filter((t) => t.status === 'done').length}/${week.tasks.length} tasks · ${week.skills.join(', ')}`,
        icon: <Compass className="w-3.5 h-3.5 text-[#A69A8C]" />,
        action: () => {
          setActiveModule('roadmap');
          setCommandPaletteOpen(false);
        },
      });
    }

    // Applications
    for (const app of store.applications) {
      items.push({
        id: `app-${app.id}`,
        group: 'Applications',
        title: `${app.company} — ${app.role}`,
        subtitle: `Status: ${app.status.replace('_', ' ')} · Channel: ${app.channel}`,
        icon: <Briefcase className="w-3.5 h-3.5 text-[#A69A8C]" />,
        action: () => {
          setActiveModule('applications');
          setCommandPaletteOpen(false);
        },
      });
    }

    // Interviews
    for (const sess of store.interviewSessions) {
      const co = store.companies.find((c) => c.id === sess.config.companyId);
      items.push({
        id: `int-${sess.id}`,
        group: 'Interviews',
        title: `${sess.config.type} Mock${co ? ` (${co.name})` : ''}`,
        subtitle: sess.report
          ? `Score: ${sess.report.overallScore}/100 · ${sess.report.practiceOutcomeLabel}`
          : `${sess.turns.length} turns recorded`,
        icon: <Mic className="w-3.5 h-3.5 text-[#A69A8C]" />,
        action: () => {
          setInterviewPreset({ companyId: sess.config.companyId, roleId: sess.config.roleId });
          setActiveModule('interview');
          setCommandPaletteOpen(false);
        },
      });
    }

    return items;
  }, [
    analysis,
    store,
    setActiveModule,
    setCommandPaletteOpen,
    setSelectedGapSkillId,
    setPrepPreset,
    setInterviewPreset,
    setReadinessDrawerOpen,
    loadDemoCandidate,
    exportAllJson,
  ]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return allItems.slice(0, 14);
    return allItems
      .filter(
        (item) =>
          item.title.toLowerCase().includes(q) ||
          item.subtitle.toLowerCase().includes(q) ||
          item.group.toLowerCase().includes(q)
      )
      .slice(0, 18);
  }, [allItems, query]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  useEffect(() => {
    if (!commandPaletteOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        setCommandPaletteOpen(false);
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex((prev) => (filtered.length > 0 ? (prev + 1) % filtered.length : 0));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex((prev) =>
          filtered.length > 0 ? (prev - 1 + filtered.length) % filtered.length : 0
        );
      } else if (e.key === 'Enter' && filtered[selectedIndex]) {
        e.preventDefault();
        filtered[selectedIndex].action();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [commandPaletteOpen, filtered, selectedIndex, setCommandPaletteOpen]);

  if (!commandPaletteOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-[10vh] px-4 bg-[#12100F]/85"
      role="dialog"
      aria-modal="true"
      aria-label="Global workspace search"
      onClick={(e) => {
        if (e.target === e.currentTarget) setCommandPaletteOpen(false);
      }}
    >
      <div className="w-full max-w-2xl bg-[#1B1714] border border-[#B86D37]/40 shadow-2xl overflow-hidden">
        <div className="flex items-center gap-3 px-4 py-3.5 border-b border-[#382920] bg-[#12100F]">
          <Search className="w-4 h-4 text-[#B86D37] shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search modules, companies, skill gaps, resources, projects, interviews..."
            className="w-full bg-transparent text-sm text-[#EAE4DC] placeholder:text-[#A69A8C]/60 outline-none"
          />
          <span className="hidden sm:inline text-[10px] tracking-[0.14em] uppercase text-[#A69A8C] border border-[#382920] px-1.5 py-0.5 shrink-0">
            ESC
          </span>
          <button
            type="button"
            onClick={() => setCommandPaletteOpen(false)}
            aria-label="Close search"
            className="text-[#A69A8C] hover:text-[#EAE4DC] p-1"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="max-h-[58vh] overflow-y-auto divide-y divide-[#382920]/60">
          {filtered.length === 0 ? (
            <div className="p-8 text-center text-xs text-[#A69A8C]">
              No matching modules, skills, companies, or actions found for &ldquo;{query}&rdquo;.
            </div>
          ) : (
            filtered.map((item, idx) => {
              const active = idx === selectedIndex;
              return (
                <button
                  key={item.id}
                  type="button"
                  onMouseEnter={() => setSelectedIndex(idx)}
                  onClick={item.action}
                  className={`w-full text-left px-4 py-3 flex items-center justify-between gap-4 transition-colors ${
                    active ? 'bg-[#211A16]' : 'hover:bg-[#211A16]/60'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="h-7 w-7 flex items-center justify-center border border-[#382920] bg-[#12100F] shrink-0">
                      {item.icon}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-medium text-[#EAE4DC] truncate">
                          {item.title}
                        </span>
                        <span className="text-[10px] tracking-[0.12em] uppercase text-[#B86D37] shrink-0">
                          {item.group}
                        </span>
                      </div>
                      <div className="text-[11px] text-[#A69A8C] truncate mt-0.5">
                        {item.subtitle}
                      </div>
                    </div>
                  </div>
                  <ArrowRight
                    className={`w-3.5 h-3.5 shrink-0 transition-transform ${
                      active ? 'text-[#B86D37] translate-x-0.5' : 'text-[#A69A8C]/40'
                    }`}
                  />
                </button>
              );
            })
          )}
        </div>

        <div className="px-4 py-2.5 border-t border-[#382920] bg-[#12100F] flex items-center justify-between text-[10px] tracking-[0.14em] uppercase text-[#A69A8C]">
          <span>↑↓ Navigate · Enter Open</span>
          <span>Cmd / Ctrl + K</span>
        </div>
      </div>
    </div>
  );
}
