import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Shield, Loader2, AlertCircle } from "lucide-react";

// Local typed wrapper for the beta supabase.auth.oauth namespace.
type AuthorizationDetails = {
  client?: { name?: string; client_name?: string; redirect_uris?: string[] };
  redirect_url?: string;
  redirect_to?: string;
  scope?: string;
  scopes?: string[];
  user_email?: string;
};
type OAuthResult = { data: AuthorizationDetails | null; error: { message: string } | null };
type OAuthApi = {
  getAuthorizationDetails: (id: string) => Promise<OAuthResult>;
  approveAuthorization: (id: string) => Promise<OAuthResult>;
  denyAuthorization: (id: string) => Promise<OAuthResult>;
};
function oauth(): OAuthApi {
  return (supabase.auth as unknown as { oauth: OAuthApi }).oauth;
}

export default function OAuthConsent() {
  const [params] = useSearchParams();
  const authorizationId = params.get("authorization_id") ?? "";
  const [details, setDetails] = useState<AuthorizationDetails | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      if (!authorizationId) {
        setError("Missing authorization_id");
        return;
      }
      const { data: sess } = await supabase.auth.getSession();
      if (!sess.session) {
        const next = window.location.pathname + window.location.search;
        window.location.href = "/auth?next=" + encodeURIComponent(next);
        return;
      }
      try {
        const { data, error: err } = await oauth().getAuthorizationDetails(authorizationId);
        if (!active) return;
        if (err) return setError(err.message);
        const immediate = data?.redirect_url ?? data?.redirect_to;
        if (immediate && !data?.client) {
          window.location.href = immediate;
          return;
        }
        setDetails(data);
      } catch (e) {
        setError((e as Error).message);
      }
    })();
    return () => {
      active = false;
    };
  }, [authorizationId]);

  async function decide(approve: boolean) {
    setBusy(true);
    try {
      const { data, error: err } = approve
        ? await oauth().approveAuthorization(authorizationId)
        : await oauth().denyAuthorization(authorizationId);
      if (err) {
        setError(err.message);
        setBusy(false);
        return;
      }
      const target = data?.redirect_url ?? data?.redirect_to;
      if (!target) {
        setError("No redirect returned by the authorization server.");
        setBusy(false);
        return;
      }
      window.location.href = target;
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  if (error) {
    return (
      <div className="min-h-dvh bg-background flex items-center justify-center p-6 safe-area-insets">
        <div className="w-full max-w-sm bg-card border border-border rounded-2xl p-6 text-center space-y-3">
          <AlertCircle className="w-10 h-10 mx-auto text-destructive" />
          <h1 className="text-lg font-bold">Authorization error</h1>
          <p className="text-sm text-muted-foreground break-words">{error}</p>
        </div>
      </div>
    );
  }

  if (!details) {
    return (
      <div className="min-h-dvh bg-background flex items-center justify-center p-6 safe-area-insets">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const clientName = details.client?.name ?? details.client?.client_name ?? "an app";
  const scopeList =
    details.scopes ??
    (details.scope ? details.scope.split(/\s+/).filter(Boolean) : ["openid", "email", "profile"]);

  return (
    <div className="min-h-dvh bg-background flex items-center justify-center p-6 safe-area-insets">
      <div className="w-full max-w-sm space-y-5">
        <div className="text-center space-y-2">
          <Shield className="w-14 h-14 mx-auto text-primary" />
          <h1 className="text-xl font-bold">Connect {clientName}</h1>
          <p className="text-sm text-muted-foreground">
            This lets {clientName} use Quick USSD Dial as you.
          </p>
        </div>

        <div className="bg-card border border-border rounded-2xl p-4 space-y-3">
          <div className="text-xs text-muted-foreground">Signed in as</div>
          <div className="text-sm font-medium break-all">{details.user_email ?? ""}</div>

          <div className="border-t border-border pt-3 space-y-2">
            <div className="text-xs font-medium text-muted-foreground uppercase">Requested access</div>
            <ul className="text-sm space-y-1">
              {scopeList.map((s) => (
                <li key={s} className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-primary" /> {s}
                </li>
              ))}
            </ul>
            <p className="text-xs text-muted-foreground pt-1">
              This does not bypass app permissions or server policies.
            </p>
          </div>
        </div>

        <div className="flex gap-2">
          <Button variant="outline" className="flex-1 h-11" onClick={() => decide(false)} disabled={busy}>
            Cancel
          </Button>
          <Button className="flex-1 h-11 font-bold" onClick={() => decide(true)} disabled={busy}>
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : "Approve"}
          </Button>
        </div>
      </div>
    </div>
  );
}
