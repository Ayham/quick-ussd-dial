import { getCredentials, type OperatorCredentials } from "@/lib/ussd-profiles";
import { getBusinessName, isSimConfigured } from "@/lib/onboarding";
import type { UserProfile } from "@/lib/auth";

const SETUP_LAST_REMINDER_KEY = "setup-wizard-last-reminder-v1";
const SETUP_TRANSFER_COUNT_KEY = "setup-wizard-transfer-count-v1";
const SETUP_SHOWN_AT_KEY = "setup-wizard-shown-at-v1";
const SETUP_SKIPPED_KEY = "setup-wizard-skipped-v1";

export type SetupStepId = "sim" | "business" | "profile";

export interface SetupStep {
  id: SetupStepId;
  title: string;
  description: string;
  required: boolean;
  completed: boolean;
}

export interface SetupSnapshot {
  steps: SetupStep[];
  overallProgress: number;
  requiredCompleted: number;
  requiredTotal: number;
  optionalCompleted: number;
  optionalTotal: number;
  requiredComplete: boolean;
  nextIncomplete: SetupStepId | null;
}

const TWENTY_FOUR_HOURS = 24 * 60 * 60 * 1000;
const TEN_TRANSFERS = 10;

function readLocal(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeLocal(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* ignore */
  }
}

export function computeSetupProgress(
  profile: UserProfile | null,
  credentials: OperatorCredentials,
): SetupSnapshot {
  const simCompleted = isSimConfigured(credentials);
  const businessCompleted = Boolean(getBusinessName().trim());
  const profileCompleted = Boolean(
    (profile?.display_name || "").trim() && (profile?.phone || "").trim(),
  );

  const steps: SetupStep[] = [
    { id: "sim", title: "setupWizard.stepSim", description: "setupWizard.simDesc", required: true, completed: simCompleted },
    { id: "business", title: "setupWizard.stepBusiness", description: "setupWizard.businessNameHint", required: true, completed: businessCompleted },
    { id: "profile", title: "setupWizard.stepProfile", description: "setupWizard.profileHint", required: true, completed: profileCompleted },
  ];

  const required = steps.filter((s) => s.required);
  const optional = steps.filter((s) => !s.required);
  const requiredCompleted = required.filter((s) => s.completed).length;
  const optionalCompleted = optional.filter((s) => s.completed).length;
  const completed = requiredCompleted + optionalCompleted;
  const total = steps.length;
  const requiredComplete = requiredCompleted === required.length;

  const nextIncomplete =
    steps.find((s) => (s.required && !s.completed) || (!s.required && !s.completed))?.id ?? null;

  return {
    steps,
    overallProgress: total > 0 ? Math.round((completed / total) * 100) : 0,
    requiredCompleted,
    requiredTotal: required.length,
    optionalCompleted,
    optionalTotal: optional.length,
    requiredComplete,
    nextIncomplete,
  };
}

export async function getSetupProgress(profile: UserProfile | null): Promise<SetupSnapshot> {
  const credentials = await getCredentials();
  return computeSetupProgress(profile, credentials);
}

export function shouldShowWizard(profile: UserProfile | null, credentials: OperatorCredentials): boolean {
  try {
    const snapshot = computeSetupProgress(profile, credentials);
    if (snapshot.requiredComplete) return false;
    if (readLocal(SETUP_SHOWN_AT_KEY)) return false;
    return true;
  } catch {
    return true;
  }
}

export function shouldShowReminder(profile: UserProfile | null, credentials: OperatorCredentials): boolean {
  try {
    const snapshot = computeSetupProgress(profile, credentials);
    if (snapshot.requiredComplete) return false;

    const now = Date.now();
    const shownAt = Number(readLocal(SETUP_SHOWN_AT_KEY) || "0");
    const lastReminder = Number(readLocal(SETUP_LAST_REMINDER_KEY) || "0");
    const transferCount = Number(readLocal(SETUP_TRANSFER_COUNT_KEY) || "0");

    if (!shownAt) return true;
    if (now - shownAt < TWENTY_FOUR_HOURS) return false;
    if (transferCount >= TEN_TRANSFERS && now - lastReminder > TWENTY_FOUR_HOURS) return true;
    return false;
  } catch {
    return false;
  }
}

export function markWizardShown(): void {
  writeLocal(SETUP_SHOWN_AT_KEY, String(Date.now()));
}

export function markReminderShown(): void {
  writeLocal(SETUP_LAST_REMINDER_KEY, String(Date.now()));
  writeLocal(SETUP_TRANSFER_COUNT_KEY, "0");
}

export function dismissReminder(): void {
  markReminderShown();
}

export function incrementTransferCount(): void {
  const count = Number(readLocal(SETUP_TRANSFER_COUNT_KEY) || "0");
  writeLocal(SETUP_TRANSFER_COUNT_KEY, String(count + 1));
}

export function getRemainingRequiredCount(snapshot: SetupSnapshot): number {
  return snapshot.requiredTotal - snapshot.requiredCompleted;
}

export function getSkippedSteps(): string[] {
  try {
    const stored = readLocal(SETUP_SKIPPED_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
}

export function addSkippedStep(stepId: SetupStepId): void {
  const skipped = getSkippedSteps();
  if (!skipped.includes(stepId)) {
    skipped.push(stepId);
    writeLocal(SETUP_SKIPPED_KEY, JSON.stringify(skipped));
  }
}

export function removeSkippedStep(stepId: SetupStepId): void {
  const skipped = getSkippedSteps().filter((id) => id !== stepId);
  writeLocal(SETUP_SKIPPED_KEY, JSON.stringify(skipped));
}

export function isStepSkipped(stepId: string): boolean {
  return getSkippedSteps().includes(stepId);
}

export function getFirstIncompleteIndex(snapshot: SetupSnapshot): number {
  return snapshot.steps.findIndex((s) => !s.completed);
}
