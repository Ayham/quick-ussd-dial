import { ArrowLeft, Wallet } from "lucide-react";
import { useNavigate } from "react-router-dom";
import {
  buildBalanceCode,
  getCredentials,
  getSimAssignment,
  type Operator,
} from "@/lib/ussd-profiles";
import { dialUssdDirect } from "@/lib/ussd-dialer";
import { toast } from "sonner";

const Balance = () => {
  const navigate = useNavigate();

  const handleBalanceCheck = async (operator: Operator) => {
    const credentials = getCredentials();
    const simAssignment = getSimAssignment();
    const ussd = buildBalanceCode(operator, credentials);
    const simSlot = simAssignment[operator];

    try {
      await dialUssdDirect(ussd, simSlot);
      toast.success(`تم إرسال طلب الرصيد - ${operator === "mtn" ? "MTN" : "Syriatel"}`);
    } catch {
      toast.error("فشل إرسال الطلب");
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col safe-area-insets">
      <header className="bg-primary px-3 py-3 flex items-center gap-3 shadow-md pt-safe">
        <button onClick={() => navigate("/")} className="text-primary-foreground">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <Wallet className="w-5 h-5 text-primary-foreground" />
        <h1 className="text-primary-foreground text-lg font-bold">استعلام الرصيد</h1>
      </header>

      <main className="flex-1 p-4 max-w-md mx-auto w-full flex flex-col gap-4 justify-center pb-safe">
        <button
          onClick={() => handleBalanceCheck("mtn")}
          className="w-full py-8 rounded-2xl bg-operator-mtn text-operator-mtn-foreground font-bold text-xl shadow-lg active:scale-95 transition-transform flex flex-col items-center gap-2"
        >
          <Wallet className="w-8 h-8" />
          رصيد MTN
        </button>

        <button
          onClick={() => handleBalanceCheck("syriatel")}
          className="w-full py-8 rounded-2xl bg-operator-syriatel text-operator-syriatel-foreground font-bold text-xl shadow-lg active:scale-95 transition-transform flex flex-col items-center gap-2"
        >
          <Wallet className="w-8 h-8" />
          رصيد Syriatel
        </button>
      </main>
    </div>
  );
};

export default Balance;
