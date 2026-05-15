import { registerPlugin } from "@capacitor/core";
import { isWebBrowser } from "./platform";

// Lazy load the Trial plugin to avoid errors on web
let Trial: any = null;

function getTrial() {
  if (!Trial && !isWebBrowser()) {
    try {
      Trial = registerPlugin<any>("Trial");
    } catch (e) {
      console.warn("Failed to load Trial plugin:", e);
    }
  }
  return Trial;
}

export async function getNativeTrial() {
  try {
    // On web browsers, provide a default 30-day trial
    if (isWebBrowser()) {
      return { status: "trial", daysLeft: 30 };
    }

    const Trial = getTrial();
    if (!Trial) {
      return { status: "trial", daysLeft: 30 };
    }

    const result = await Trial.checkTrial();
    return result;
  } catch (e) {
    console.error("Error checking trial:", e);
    // Fallback for native app failures - provide 30-day trial
    return { status: "trial", daysLeft: 30 };
  }
}