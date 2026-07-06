import { auth, defineMcp } from "@lovable.dev/mcp-js";
import getProfileTool from "./tools/get-profile";
import listTransfersTool from "./tools/list-transfers";
import listDevicesTool from "./tools/list-devices";
import getLicenseStatusTool from "./tools/get-license-status";


const projectRef = import.meta.env.VITE_SUPABASE_PROJECT_ID ?? "project-ref-unset";

export default defineMcp({
  name: "quick-ussd-dial-mcp",
  title: "Quick USSD Dial",
  version: "0.1.0",
  instructions:
    "Read-only tools for the signed-in Quick USSD Dial user. Use these tools to inspect the user's profile, recent USSD unit transfers, registered devices, current license/trial status, and distributor list. All tools operate on the authenticated user's own data.",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: [
    getProfileTool,
    listTransfersTool,
    listDevicesTool,
    getLicenseStatusTool,
    listDistributorsTool,
  ],
});
