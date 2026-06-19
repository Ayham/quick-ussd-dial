import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Shield, LogOut, LayoutDashboard, Smartphone, Key, CheckCircle,
  Clock, Activity, Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { toast } from "sonner";
import { signOut } from "@/lib/auth";
import { DashboardOverview } from "@/components/admin/DashboardOverview";
import { DevicesManager } from "@/components/admin/DevicesManager";
import { LicensesManager } from "@/components/admin/LicensesManager";
import { ActivationsManager } from "@/components/admin/ActivationsManager";
import { TrialsManager } from "@/components/admin/TrialsManager";
import { EventsViewer } from "@/components/admin/EventsViewer";
import { TransfersViewer } from "@/components/admin/TransfersViewer";
import { UsersRolesManager } from "@/components/admin/UsersRolesManager";

type AdminTab =
  | "dashboard"
  | "licenses"
  | "devices"
  | "activations"
  | "trials"
  | "monitoring"
  | "users";

const TABS: { id: AdminTab; label: string; icon: typeof LayoutDashboard }[] = [
  { id: "dashboard",   label: "Dashboard",   icon: LayoutDashboard },
  { id: "licenses",    label: "Licenses",    icon: Key },
  { id: "devices",     label: "Devices",     icon: Smartphone },
  { id: "activations", label: "Activations", icon: CheckCircle },
  { id: "trials",      label: "Trials",      icon: Clock },
  { id: "monitoring",  label: "Monitoring",  icon: Activity },
  { id: "users",       label: "Users & Roles", icon: Users },
];

const Admin = () => {
  const navigate = useNavigate();
  const [tab, setTab] = useState<AdminTab>("dashboard");

  const handleLogout = async () => {
    await signOut();
    toast.success("Signed out");
    navigate("/auth");
  };

  return (
    <div className="min-h-dvh bg-background safe-area-insets">
      <header className="header-gradient px-4 pb-3 pt-[calc(env(safe-area-inset-top,0px)+12px)] flex items-center justify-between shadow-elevated">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-primary-foreground/15 flex items-center justify-center">
            <Shield className="w-4.5 h-4.5 text-primary-foreground" />
          </div>
          <h1 className="text-primary-foreground text-lg font-bold tracking-tight">
            Administration
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => navigate("/")} className="text-primary-foreground hover:bg-primary-foreground/15">
            Back to app
          </Button>
          <Button variant="ghost" size="icon" onClick={handleLogout} className="text-primary-foreground hover:bg-primary-foreground/15">
            <LogOut className="w-4 h-4" />
          </Button>
        </div>
      </header>

      <main className="p-4 max-w-7xl mx-auto">
        <Tabs value={tab} onValueChange={(v) => setTab(v as AdminTab)}>
          <TabsList className="flex flex-wrap h-auto gap-1 mb-4">
            {TABS.map((t) => (
              <TabsTrigger key={t.id} value={t.id} className="gap-1.5">
                <t.icon className="w-3.5 h-3.5" />
                <span>{t.label}</span>
              </TabsTrigger>
            ))}
          </TabsList>

          <TabsContent value="dashboard"><DashboardOverview /></TabsContent>
          <TabsContent value="licenses"><LicensesManager /></TabsContent>
          <TabsContent value="devices"><DevicesManager /></TabsContent>
          <TabsContent value="activations"><ActivationsManager /></TabsContent>
          <TabsContent value="trials"><TrialsManager /></TabsContent>
          <TabsContent value="monitoring">
            <div className="space-y-6">
              <TransfersViewer />
              <EventsViewer />
            </div>
          </TabsContent>
          <TabsContent value="users"><UsersRolesManager /></TabsContent>
        </Tabs>
      </main>
    </div>
  );
};

export default Admin;
