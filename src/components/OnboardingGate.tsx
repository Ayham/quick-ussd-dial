import { useEffect, useState } from "react";
import { useAuthSession } from "@/lib/auth-session";
import { getProfile, type UserProfile } from "@/lib/auth";
import { isSimConfigured, getBusinessName, shouldPromptBusinessName, shouldPromptProfile } from "@/lib/onboarding";
import { getCredentials } from "@/lib/ussd-profiles";
import OnboardingWizard from "@/components/OnboardingWizard";

export default function OnboardingGate() {
  const { user, loading } = useAuthSession();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [profileLoading, setProfileLoading] = useState(true);
  const [businessName, setBusinessNameState] = useState(() => getBusinessName());

  const refresh = () => setBusinessNameState(getBusinessName());

  useEffect(() => {
    if (loading) return;
    if (!user) {
      setProfile(null);
      setProfileLoading(false);
      return;
    }
    let alive = true;
    setProfileLoading(true);
    getProfile()
      .then((p) => {
        if (alive) {
          setProfile(p);
          setProfileLoading(false);
        }
      })
      .catch(() => {
        if (alive) {
          setProfile(null);
          setProfileLoading(false);
        }
      });
    return () => {
      alive = false;
    };
  }, [user, loading]);

  useEffect(() => {
    const onFocus = () => refresh();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, []);

  if (loading || !user || profileLoading) return null;

  const simConfigured = isSimConfigured(getCredentials());
  const businessNeeded = shouldPromptBusinessName();
  const profileIncomplete = !profile?.display_name?.trim() || !profile?.phone?.trim();
  const profileNeeded = shouldPromptProfile(profileIncomplete);

  if (simConfigured && !businessNeeded && !profileNeeded) return null;

  const initialStep = simConfigured ? (businessNeeded ? 2 : 3) : 1;

  const handleCompleted = () => {
    refresh();
    getProfile()
      .then((p) => setProfile(p))
      .catch(() => {});
  };

  return (
    <OnboardingWizard
      initialStep={initialStep}
      businessNeeded={businessNeeded}
      profileNeeded={profileNeeded}
      profile={profile}
      onCompleted={handleCompleted}
    />
  );
}
