import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Shield, LogOut, LayoutGrid, Users, Smartphone, Key, Activity, FileText, Database, Bell, Award } from "lucide-react";
import { Button } from "@/components/ui/button";
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
import { ContactsAdminViewer } from "@/components/admin/ContactsAdminViewer";

const tabs = [
  { value: "overview", labelKey: "admin.dashboard", icon: LayoutGrid },
  { value: "users", labelKey: "admin.users", icon: Users },
  { value: "devices", labelKey: "admin.devices", icon: Smartphone },
  { value: "licenses", labelKey: "admin.licenses", icon: Key },
  { value: "activations", labelKey: "admin.activations", icon: Bell },
  { value: "trials", labelKey: "admin.trials", icon: Award },
  { value: "transfers", labelKey: "admin.transfers", icon: Activity },
  { value: "contacts", labelKey: "admin.customers", icon: FileText },
  { value: "events", labelKey: "admin.events", icon: Database },
];

const Admin = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState("overview");

  const handleLogout = async () => {
    await signOut();
    toast.success("Signed out");
    navigate("/auth");
  };

  const renderPanel = (value: string) => {
    switch (value) {
      case "overview":
        return <DashboardOverview />;
      case "users":
        return <UsersRolesManager />;
      case "devices":
        return <DevicesManager />;
      case "licenses":
        return <LicensesManager />;
      case "activations":
        return <ActivationsManager />;
      case "trials":
        return <TrialsManager />;
      case "transfers":
        return <TransfersViewer />;
      case "contacts":
        return <ContactsAdminViewer />;
      case "events":
        return <EventsViewer />;
      default:
        return <DashboardOverview />;
    }
  };

  return (
    <div className="min-h-dvh bg-background safe-area-insets">
      <header className="header-gradient px-4 pb-3 pt-[calc(env(safe-area-inset-top,0px)+12px)] flex flex-col gap-4 shadow-elevated">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-primary-foreground/15 flex items-center justify-center">
              <Shield className="w-5 h-5 text-primary-foreground" />
            </div>
            <div>
              <h1 className="text-primary-foreground text-lg font-bold tracking-tight">Administration</h1>
              <p className="text-sm text-muted-foreground">Operational console for licenses, devices, users, and system events.</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => navigate("/")}>Back to app</Button>
            <Button variant="ghost" size="icon" onClick={handleLogout}>
              <LogOut className="w-4 h-4" />
            </Button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <div className="flex gap-2 rounded-2xl border border-border bg-card p-2">
            {tabs.map((tab) => {
              const active = activeTab === tab.value;
              return (
                <button
                  key={tab.value}
                  onClick={() => setActiveTab(tab.value)}
                  className={`inline-flex items-center gap-2 rounded-2xl px-4 py-2 text-sm font-semibold transition-all ${active ? 'bg-primary text-primary-foreground shadow-sm' : 'bg-muted text-foreground hover:bg-muted/80'}`}
                >
                  <tab.icon className="h-4 w-4" />
                  {t(tab.labelKey)}
                </button>
              );
            })}
          </div>
        </div>

      </header>

      <main className="p-4 max-w-7xl mx-auto pb-8">
        <section className="rounded-2xl border border-border bg-card p-4 shadow-sm">
          {tabs.map((tab) => (
            <div
              key={tab.value}
              className={activeTab === tab.value ? "block" : "hidden"}
            >
              {renderPanel(tab.value)}
            </div>
          ))}
        </section>
      </main>
    </div>
  );
};

export default Admin;
