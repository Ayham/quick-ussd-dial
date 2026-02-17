export interface UssdProfile {
  id: string;
  name: string;
  operator: "mtn" | "syriatel";
  code: string; // USSD template: $$$ = amount, p = phone, m = amount again, c = confirm
  type: "units" | "bills" | "adsl" | "check";
  sim: number; // 0 = syriatel, 1 = mtn
}

export const profiles: UssdProfile[] = [
  {
    id: "mtn-units",
    name: "MTN وحدات",
    operator: "mtn",
    code: "*150*{amount}*{phone}*{amount}#",
    type: "units",
    sim: 1,
  },
  {
    id: "mtn-bills",
    name: "MTN فواتير",
    operator: "mtn",
    code: "*154*{amount}*{phone}*{amount}#",
    type: "bills",
    sim: 1,
  },
  {
    id: "syriatel-units",
    name: "سيريتل وحدات",
    operator: "syriatel",
    code: "*150*1*{amount}*1*{amount}*{phone}*{phone}#",
    type: "units",
    sim: 0,
  },
  {
    id: "syriatel-bills",
    name: "سيريتل فواتير",
    operator: "syriatel",
    code: "*150*1*{amount}*5*{amount}*{phone}*{phone}#",
    type: "bills",
    sim: 0,
  },
  {
    id: "mtn-adsl",
    name: "MTN ADSL",
    operator: "mtn",
    code: "*160*{phone}*963{phone}*{amount}#",
    type: "adsl",
    sim: 1,
  },
];

export function buildUssdCode(
  profile: UssdProfile,
  phone: string,
  amount: string
): string {
  return profile.code
    .replace(/\{phone\}/g, phone)
    .replace(/\{amount\}/g, amount);
}

export function dialUssd(ussdCode: string) {
  // Use tel: URI scheme to initiate the USSD call
  const encoded = encodeURIComponent(ussdCode);
  window.location.href = `tel:${encoded}`;
}
