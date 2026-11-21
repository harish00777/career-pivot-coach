import React, { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import {
  Activity,
  CheckCircle2,
  Database,
  Download,
  Loader2,
  LogIn,
  LogOut,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Trash2,
  User,
} from 'lucide-react';
import { useCareerStore } from '../context/CareerStoreContext';
import { probeAiHealth, type HealthStatusResponse } from '../services/apiClient';

export function SettingsModule() {
  const {
    store,
    storageMode,
    user,
    signInWithGoogle,
    signOutUser,
    updateStore,
    loadDemoCandidate,
    clearDemoData,
    deleteAllData,
    exportAllJson,
  } = useCareerStore();

  const [name, setName] = useState(store.profile?.name ?? '');
  const [contact, setContact] = useState(store.profile?.contact ?? '');
  const [careerObjective, setCareerObjective] = useState(store.profile?.careerObjective ?? '');
  const [hoursPerWeek, setHoursPerWeek] = useState(store.profile?.hoursPerWeek ?? 8);
  const [targetWeeks, setTargetWeeks] = useState(store.profile?.targetWeeks ?? 8);
  const [profileSaved, setProfileSaved] = useState(false);

  const [health, setHealth] = useState<HealthStatusResponse | null>(null);
  const [healthLoading, setHealthLoading] = useState(false);
  const [healthError, setHealthError] = useState<string | null>(null);

  const [confirmDeleteStep, setConfirmDeleteStep] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  useEffect(() => {
    setName(store.profile?.name ?? '');
    setContact(store.profile?.contact ?? '');
    setCareerObjective(store.profile?.careerObjective ?? '');
    setHoursPerWeek(store.profile?.hoursPerWeek ?? 8);
    setTargetWeeks(store.profile?.targetWeeks ?? 8);
  }, [store.profile]);

  const runHealthProbe = async (force = false) => {
    setHealthLoading(true);
    setHealthError(null);
    const res = await probeAiHealth(force);
    setHealthLoading(false);
    if (!res.ok) {
      setHealthError(res.error);
      return;
    }
    setHealth(res.data);
  };

  useEffect(() => {
    void runHealthProbe(false);
  }, []);

  async function handleSaveProfile(e: React.FormEvent) {
    e.preventDefault();
    const trimmedName = name.trim() || 'Candidate';
    await updateStore((prev) => ({
      ...prev,
      onboardingComplete: true,
      profile: {
        id: prev.profile?.id ?? `prof-${Date.now()}`,
        name: trimmedName,
        contact: contact.trim(),
        careerObjective:
          careerObjective.trim() ||
          'Transition into target role with verified project and interview proof.',
        targetRoleIds: prev.profile?.targetRoleIds ?? prev.targetRoles.map((r) => r.id),
        hoursPerWeek: Math.max(1, Math.min(80, Number(hoursPerWeek) || 8)),
        targetWeeks: Math.max(1, Math.min(104, Number(targetWeeks) || 8)),
        createdAt: prev.profile?.createdAt ?? new Date().toISOString().slice(0, 10),
        provenance: 'candidate',
      },
    }));
    setProfileSaved(true);
    setTimeout(() => setProfileSaved(false), 3000);
  }

  async function toggleSetting(
    key: 'cameraDefaultOff' | 'micDefaultOff' | 'coachingDefaultOn',
    val: boolean
  ) {
    await updateStore((prev) => ({
      ...prev,
      settings: { ...prev.settings, [key]: val },
    }));
  }

  async function changePreferredMode(mode: 'live' | 'stt_tts' | 'text') {
    await updateStore((prev) => ({
      ...prev,
      settings: { ...prev.settings, preferredVoiceMode: mode },
    }));
  }

  async function handleConfirmDeleteAll() {
    await deleteAllData();
    setConfirmDeleteStep(false);
    setStatusMessage('All workspace records have been permanently deleted.');
  }

  const probeStatus = health?.probe?.status ?? health?.status ?? null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className="max-w-4xl space-y-6"
    >
      <div className="border-b border-[#382920] pb-6">
        <div className="text-[10px] tracking-[0.22em] uppercase text-[#B86D37] mb-1">
          Workspace Preferences & Privacy
        </div>
        <h2 className="font-editorial text-3xl sm:text-4xl font-light text-[#EAE4DC]">
          Settings & Career Profile
        </h2>
        <p className="text-sm text-[#A69A8C] mt-1">
          Configure your weekly availability, cloud sync, privacy controls, and AI service verification.
        </p>
      </div>

      {/* Editable Candidate Profile */}
      <section className="arch-panel p-6 space-y-5">
        <div className="flex items-center justify-between gap-3 border-b border-[#382920] pb-3">
          <div className="flex items-center gap-2">
            <User className="w-4 h-4 text-[#B86D37]" />
            <h3 className="font-editorial text-2xl font-light text-[#EAE4DC]">
              Candidate Profile & Study Schedule
            </h3>
          </div>
          {profileSaved && (
            <span className="inline-flex items-center gap-1.5 text-xs font-medium text-[#B86D37]">
              <CheckCircle2 className="w-3.5 h-3.5" />
              Profile saved
            </span>
          )}
        </div>

        <form onSubmit={handleSaveProfile} className="space-y-4 text-xs">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <label className="block space-y-1">
              <span className="text-[#A69A8C]">Full Name</span>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Your name"
                className="arch-input px-3 py-2 text-sm"
              />
            </label>
            <label className="block space-y-1">
              <span className="text-[#A69A8C]">Location & Contact</span>
              <input
                type="text"
                value={contact}
                onChange={(e) => setContact(e.target.value)}
                placeholder="City, email, or portfolio URL"
                className="arch-input px-3 py-2 text-sm"
              />
            </label>
          </div>

          <label className="block space-y-1">
            <span className="text-[#A69A8C]">Career Goal</span>
            <textarea
              rows={2}
              value={careerObjective}
              onChange={(e) => setCareerObjective(e.target.value)}
              placeholder="e.g. Transition from frontend engineering into full-stack AI systems roles."
              className="arch-input px-3 py-2 text-sm"
            />
          </label>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-end">
            <label className="block space-y-1">
              <span className="text-[#A69A8C]">Study Hours per Week</span>
              <input
                type="number"
                min={1}
                max={80}
                value={hoursPerWeek}
                onChange={(e) => setHoursPerWeek(Number(e.target.value))}
                className="arch-input px-3 py-2 text-sm font-mono-tabular"
              />
            </label>
            <label className="block space-y-1">
              <span className="text-[#A69A8C]">Target Timeline (Weeks)</span>
              <input
                type="number"
                min={1}
                max={104}
                value={targetWeeks}
                onChange={(e) => setTargetWeeks(Number(e.target.value))}
                className="arch-input px-3 py-2 text-sm font-mono-tabular"
              />
            </label>
          </div>

          <div className="flex justify-end pt-1">
            <button type="submit" className="arch-btn-primary px-5 py-2">
              Save Profile
            </button>
          </div>
        </form>
      </section>

      {/* Real AI Service Status Card */}
      <section className="arch-panel p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Activity className="w-4 h-4 text-[#B86D37]" />
            <h3 className="font-editorial text-2xl font-light text-[#EAE4DC]">
              AI Service Status
            </h3>
          </div>
          <button
            type="button"
            disabled={healthLoading}
            onClick={() => runHealthProbe(true)}
            className="arch-btn-secondary px-3.5 py-1.5"
          >
            {healthLoading ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin text-[#B86D37]" />
            ) : (
              <RefreshCw className="w-3.5 h-3.5 text-[#B86D37]" />
            )}
            <span>{healthLoading ? 'Checking...' : 'Test Connection'}</span>
          </button>
        </div>

        {healthError ? (
          <div className="border-l-2 border-[#B86D37] bg-[#211A16] p-4 text-xs text-[#EAE4DC]">
            Could not check AI service availability: {healthError}
          </div>
        ) : health ? (
          <div className="bg-[#12100F] border border-[#382920] p-4 space-y-2 text-xs">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2.5">
                <span
                  className={`inline-block w-2.5 h-2.5 rotate-45 ${
                    probeStatus === 'healthy'
                      ? 'bg-[#B86D37]'
                      : probeStatus === 'degraded'
                        ? 'bg-[#A69A8C]'
                        : 'bg-[#211A16] border border-[#B86D37]'
                  }`}
                />
                <span className="font-medium text-[#EAE4DC] capitalize">
                  {probeStatus === 'healthy'
                    ? 'Healthy — Live AI generation ready'
                    : probeStatus === 'degraded'
                      ? 'Experiencing high demand (degraded)'
                      : 'AI service unavailable'}
                </span>
              </div>
              {typeof health.probe?.latencyMs === 'number' && (
                <span className="font-mono-tabular text-[#B86D37]">
                  {health.probe.latencyMs}ms latency
                </span>
              )}
            </div>
            {health.probe?.message && (
              <p className="text-[#A69A8C] leading-relaxed">{health.probe.message}</p>
            )}
            {health.probe?.checkedAt && (
              <div className="text-[11px] font-mono-tabular text-[#A69A8C]/75">
                Last verified: {new Date(health.probe.checkedAt).toLocaleTimeString()}
              </div>
            )}
          </div>
        ) : (
          <div className="bg-[#12100F] border border-[#382920] p-4 text-xs text-[#A69A8C]">
            Checking AI availability...
          </div>
        )}
      </section>

      {/* Privacy & Fairness Architecture */}
      <section className="arch-panel p-6 space-y-4">
        <div className="flex items-center gap-2">
          <ShieldCheck className="w-5 h-5 text-[#B86D37]" />
          <h3 className="font-editorial text-2xl font-light text-[#EAE4DC]">
            Privacy, Fairness & Transparency
          </h3>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs leading-relaxed text-[#A69A8C]">
          <div className="bg-[#12100F] border border-[#382920] p-4 space-y-1.5">
            <div className="text-[#EAE4DC] font-medium">Local-Only Camera Preview</div>
            <p>
              Your camera is off by default. Even when enabled for self-view, video frames stay
              strictly on your device and are never transmitted, recorded, or scored.
            </p>
          </div>
          <div className="bg-[#12100F] border border-[#382920] p-4 space-y-1.5">
            <div className="text-[#EAE4DC] font-medium">Unscored Delivery Notes</div>
            <p>
              Filler words, pauses, restarts, speaking pace, or accent never lower any rubric score.
              Evaluations score your reasoning and answer substance only.
            </p>
          </div>
          <div className="bg-[#12100F] border border-[#382920] p-4 space-y-1.5">
            <div className="text-[#EAE4DC] font-medium">Clear Source Labels</div>
            <p>
              Resume facts, job posting quotes, AI suggestions, and demo samples carry clear labels
              so real proof is never mixed with estimates.
            </p>
          </div>
        </div>
      </section>

      {/* Interview & Media Defaults */}
      <section className="arch-panel p-6 space-y-5">
        <h3 className="font-editorial text-2xl font-light text-[#EAE4DC]">
          Interview Arena Defaults
        </h3>

        <div className="space-y-4 text-xs">
          <label className="flex items-center justify-between gap-4 border-b border-[#382920] pb-3.5">
            <div>
              <div className="text-[#EAE4DC] font-medium">Keep camera off by default</div>
              <div className="text-[#A69A8C] mt-0.5">
                Recommended. Turns on self-view only when you explicitly enable it.
              </div>
            </div>
            <input
              type="checkbox"
              checked={store.settings.cameraDefaultOff}
              onChange={(e) => toggleSetting('cameraDefaultOff', e.target.checked)}
              className="accent-[#B86D37] w-4 h-4"
            />
          </label>

          <label className="flex items-center justify-between gap-4 border-b border-[#382920] pb-3.5">
            <div>
              <div className="text-[#EAE4DC] font-medium">Keep microphone muted at session start</div>
              <div className="text-[#A69A8C] mt-0.5">
                Gives you time to read the opening question and rubric before speaking.
              </div>
            </div>
            <input
              type="checkbox"
              checked={store.settings.micDefaultOff}
              onChange={(e) => toggleSetting('micDefaultOff', e.target.checked)}
              className="accent-[#B86D37] w-4 h-4"
            />
          </label>

          <label className="flex items-center justify-between gap-4 border-b border-[#382920] pb-3.5">
            <div>
              <div className="text-[#EAE4DC] font-medium">Show live delivery coaching tips</div>
              <div className="text-[#A69A8C] mt-0.5">
                Displays gentle non-scoring pacing reminders during practice.
              </div>
            </div>
            <input
              type="checkbox"
              checked={store.settings.coachingDefaultOn}
              onChange={(e) => toggleSetting('coachingDefaultOn', e.target.checked)}
              className="accent-[#B86D37] w-4 h-4"
            />
          </label>

          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <div className="text-[#EAE4DC] font-medium">Preferred Interview Mode</div>
              <div className="text-[#A69A8C] mt-0.5">
                Choose real-time voice conversation, turn-by-turn voice, or text practice.
              </div>
            </div>
            <select
              value={store.settings.preferredVoiceMode}
              onChange={(e) =>
                changePreferredMode(e.target.value as 'live' | 'stt_tts' | 'text')
              }
              aria-label="Preferred interview mode"
              className="arch-input w-auto px-3 py-2 font-medium"
            >
              <option value="live">Live Voice (Real-Time Audio)</option>
              <option value="stt_tts">Guided Voice (Speech + Transcript)</option>
              <option value="text">Text Interview</option>
            </select>
          </div>
        </div>
      </section>

      {/* Storage & Account Sync */}
      <section className="arch-panel p-6 space-y-4">
        <div className="flex items-center gap-2">
          <Database className="w-4 h-4 text-[#B86D37]" />
          <h3 className="font-editorial text-2xl font-light text-[#EAE4DC]">
            Storage & Cloud Sync
          </h3>
        </div>

        <div className="bg-[#12100F] border border-[#382920] p-4 flex flex-wrap items-center justify-between gap-4 text-xs">
          <div>
            <div className="text-[#EAE4DC] font-medium">
              Active Storage:{' '}
              {storageMode === 'firestore'
                ? 'Firebase Cloud Sync'
                : 'On This Device Only (IndexedDB)'}
            </div>
            <div className="text-[#A69A8C] mt-0.5">
              {user
                ? `Signed in as ${user.email || user.displayName}`
                : 'Sign in with Google to sync your workspace across browsers and devices.'}
            </div>
          </div>

          {user ? (
            <button type="button" onClick={signOutUser} className="arch-btn-secondary px-4 py-2">
              <LogOut className="w-3.5 h-3.5 text-[#B86D37]" />
              <span>Sign Out</span>
            </button>
          ) : (
            <button type="button" onClick={signInWithGoogle} className="arch-btn-primary px-4 py-2">
              <LogIn className="w-3.5 h-3.5 text-[#B86D37]" />
              <span>Sign in with Google</span>
            </button>
          )}
        </div>
      </section>

      {/* Demo Data, Export & Deletion */}
      <section className="arch-panel p-6 space-y-5">
        <h3 className="font-editorial text-2xl font-light text-[#EAE4DC]">
          Data Portability & Workspace Reset
        </h3>

        {statusMessage && (
          <div className="text-xs text-[#EAE4DC] bg-[#211A16] border-l-2 border-[#B86D37] p-3">
            {statusMessage}
          </div>
        )}

        <div className="flex flex-wrap gap-3 text-xs">
          <button type="button" onClick={exportAllJson} className="arch-btn-secondary px-4 py-2.5">
            <Download className="w-3.5 h-3.5 text-[#B86D37]" />
            <span>Export All Data (JSON)</span>
          </button>

          {store.isDemoData ? (
            <button type="button" onClick={clearDemoData} className="arch-btn-secondary px-4 py-2.5">
              Clear Demo Data
            </button>
          ) : (
            <button type="button" onClick={loadDemoCandidate} className="arch-btn-primary px-4 py-2.5">
              <Sparkles className="w-3.5 h-3.5 text-[#B86D37]" />
              <span>Explore Demo Workspace</span>
            </button>
          )}
        </div>

        <div className="pt-4 border-t border-[#382920] space-y-3 text-xs">
          <div className="text-[#EAE4DC] font-medium">Reset Workspace</div>
          {!confirmDeleteStep ? (
            <button
              type="button"
              onClick={() => setConfirmDeleteStep(true)}
              className="arch-btn-secondary border-[#B86D37]/60 text-[#EAE4DC] hover:bg-[#211A16] px-4 py-2"
            >
              <Trash2 className="w-3.5 h-3.5 text-[#B86D37]" />
              <span>Delete All Workspace Data</span>
            </button>
          ) : (
            <div className="bg-[#211A16] border border-[#B86D37]/60 p-4 flex flex-wrap items-center justify-between gap-3">
              <span className="text-[#EAE4DC] font-medium">
                Permanently erase all local and synced RolexIQ records?
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setConfirmDeleteStep(false)}
                  className="arch-btn-secondary px-3 py-1.5"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleConfirmDeleteAll}
                  className="arch-btn-primary px-3.5 py-1.5"
                >
                  Yes, Delete Everything
                </button>
              </div>
            </div>
          )}
        </div>
      </section>
    </motion.div>
  );
}
