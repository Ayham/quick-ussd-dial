import { supabase } from "@/integrations/supabase/client";
import type { ValidationPolicy, ValidationResult } from "./license-cache";

const DAY_MS = 1000 * 60 * 60 * 24;

const DEFAULT_REMIND_DAYS_LICENSE = 7;
const DEFAULT_REMIND_DAYS_TRIAL = 3;

const REMINDER_SENT_KEY = "app_expiration_reminder_sent";

export interface ExpirationReminderConfig {
  /** How many days before a paid license expiry a reminder is sent. */
  remindDaysLicense: number;
  /** How many days before a trial end a reminder is sent. */
  remindDaysTrial: number;
}

export interface ExpirationReminderPlan {
  type: "license_expiring" | "trial_ending";
  /** Whole days remaining until the boundary (>= 1). */
  daysLeft: number;
  /** The authoritative boundary (expiry_date / trial_end) the reminder is based on. */
  boundary: string;
  /** Stable per-boundary key used for deduplication. */
  dedupeKey: string;
}

function parseBoundaryMs(value: string): number | null {
  // Date-only values (expiry_date is a DATE column) expire at the end of that day.
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const ms = new Date(`${value}T23:59:59.999Z`).getTime();
    return Number.isNaN(ms) ? null : ms;
  }
  const ms = new Date(value).getTime();
  return Number.isNaN(ms) ? null : ms;
}

/**
 * Pure decision logic for a license/trial expiration reminder.
 *
 * Rules:
 *  - Based ONLY on the actual expiration date (never extends the license).
 *  - Paid `active` license → reminds inside the license window.
 *  - `trial` → reminds inside the trial window.
 *  - `permanent` and already-expired licenses → no reminder.
 */
export function getExpirationReminderPlan(
  data: Pick<ValidationResult, "license_status" | "expiry_date" | "trial_end"> | null,
  config: ExpirationReminderConfig,
  now: number = Date.now(),
): ExpirationReminderPlan | null {
  if (!data) return null;
  const status = data.license_status;
  if (status === "permanent") return null;

  if (status === "trial") {
    if (!data.trial_end) return null;
    const boundaryMs = parseBoundaryMs(data.trial_end);
    if (boundaryMs === null) return null;
    const daysLeft = Math.floor((boundaryMs - now) / DAY_MS);
    if (daysLeft <= 0 || daysLeft > config.remindDaysTrial) return null;
    return {
      type: "trial_ending",
      daysLeft,
      boundary: data.trial_end,
      dedupeKey: `trial:${data.trial_end}`,
    };
  }

  // Paid license (active or any dated non-trial, non-permanent status).
  if (status !== "active") return null;
  if (!data.expiry_date) return null;
  const boundaryMs = parseBoundaryMs(data.expiry_date);
  if (boundaryMs === null) return null;
  const daysLeft = Math.floor((boundaryMs - now) / DAY_MS);
  if (daysLeft <= 0 || daysLeft > config.remindDaysLicense) return null;
  return {
    type: "license_expiring",
    daysLeft,
    boundary: data.expiry_date,
    dedupeKey: `license:${data.expiry_date}`,
  };
}

export function resolveReminderConfig(policy: ValidationPolicy): ExpirationReminderConfig {
  return {
    remindDaysLicense:
      typeof policy.remind_days_license === "number" && policy.remind_days_license > 0
        ? policy.remind_days_license
        : DEFAULT_REMIND_DAYS_LICENSE,
    remindDaysTrial:
      typeof policy.remind_days_trial === "number" && policy.remind_days_trial > 0
        ? policy.remind_days_trial
        : DEFAULT_REMIND_DAYS_TRIAL,
  };
}

/**
 * Fire-and-forget expiration reminder sync. Called after every successful
 * server validation. It:
 *  - computes the reminder from the actual expiration boundary;
 *  - deduplicates locally (one sync per license boundary per device) and the
 *    server deduplicates too (metadata key) — no duplicate notifications;
 *  - never extends the license and never blocks validation.
 */
export async function syncExpirationReminder(
  data: ValidationResult | null,
  policy: ValidationPolicy,
): Promise<void> {
  try {
    const plan = getExpirationReminderPlan(data, resolveReminderConfig(policy));
    if (!plan) return;
    if (localStorage.getItem(REMINDER_SENT_KEY) === plan.dedupeKey) return;
    if (typeof navigator === "undefined" || !navigator.onLine) return;

    const { error } = await supabase.rpc("ensure_license_expiration_reminders");
    if (error) return;

    try {
      localStorage.setItem(REMINDER_SENT_KEY, plan.dedupeKey);
    } catch {}
  } catch {}
}
