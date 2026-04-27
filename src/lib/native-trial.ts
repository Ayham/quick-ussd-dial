import { registerPlugin } from "@capacitor/core";

const Trial = registerPlugin<any>("Trial");

export async function getNativeTrial() {
  try {
    const result = await Trial.checkTrial();
    return result;
  } catch (e) {
    return { status: "trial_expired" };
  }
}