import { useEffect, useState } from "react";
import { useAuthSession } from "@/lib/auth-session";
import { getProfile, type UserProfile } from "@/lib/auth";
import { getCredentials, DEFAULT_CREDENTIALS, type OperatorCredentials } from "@/lib/ussd-profiles";
import { computeSetupProgress, shouldShowWizard, shouldShowReminder, markWizardShown, markReminderShown } from "@/lib/setup-wizard";
import SetupWizard from "@/components/SetupWizard";
import SetupReminder from "@/components/SetupReminder";

const PROFILE_CACHE_KEY = "app_profile_cache_v1";

function readCachedProfile(): UserProfile | null {
  try {
    const raw = localStorage.getItem(PROFILE_CACHE_KEY);
    return raw ? (JSON.parse(raw) as UserProfile) : null;
  } catch {
    return null;
  }
}

function writeCachedProfile(profile: UserProfile | null): void {
  try {
    if (profile) {
      localStorage.setItem(PROFILE_CACHE_KEY, JSON.stringify(profile));
    } else {
      localStorage.removeItem(PROFILE_CACHE_KEY);
    }
  } catch {}
}

export default function OnboardingGate() {
  const { user, loading } = useAuthSession();
  const [profile, setProfile] = useState<UserProfile | null>(() => readCachedProfile());
  const [credentials, setCredentials] = useState<OperatorCredentials>(() => DEFAULT_CREDENTIALS);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [reminderOpen, setReminderOpen] = useState(false);
  const [ready, setReady] = useState(false);
  const [version, setVersion] = useState(0);

  const refresh = () => setVersion((v) => v + 1);

  useEffect(() => {
    if (loading) return;
    if (!user) {
      setProfile(null);
      return;
    }
    let alive = true;
    getProfile()
      .then((p) => {
        if (!alive) return;
        setProfile(p);
        writeCachedProfile(p);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [user, loading, version]);

  useEffect(() => {
    const onFocus = () => refresh();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, []);

  useEffect(() => {
    getCredentials().then((c) => {
      setCredentials(c);
      setReady(true);
    });
  }, []);

  if (loading || !user || !ready) return null;

  const snapshot = computeSetupProgress(profile, credentials);

  const showWizardNow = wizardOpen || shouldShowWizard(profile, credentials);
  const showReminderNow = !showWizardNow && shouldShowReminder(profile, credentials);

  const handleCompleted = () => {
    setWizardOpen(false);
    setReminderOpen(false);
    markWizardShown();
    refresh();
  };

  const handleReminderDismiss = () => {
    setReminderOpen(false);
    markReminderShown();
  };

  return (
    <>
      {showWizardNow && <SetupWizard onCompleted={handleCompleted} />}
      {showReminderNow && (
        <SetupReminder
          snapshot={snapshot}
          onOpen={() => {
            setReminderOpen(false);
            setWizardOpen(true);
          }}
          onDismiss={handleReminderDismiss}
        />
      )}
    </>
  );
}
