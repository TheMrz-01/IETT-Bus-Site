//[TODO]: Add a toggle switch for different type of heading

//[TODO]: Could add ok type
type Err = { ok: false; busCode: string; error: { message: string; status?: number; kind: string } };

type AnnouncementItem = {
  MESAJ?: string;
};

type BusResponse = {
  timeRemaining?: string;
  secondTimeReamining?: string;
  announcement?: AnnouncementItem[];
};

//TEMP TYPE
type announcementInfo = {
  "HATKODU": string;
  "HAT": string;
  "TIP": "Günlük" | "Sefer" | string; 
  "GUNCELLEME_SAATI": string;        
  "MESAJ": string;
};

type departureTimeRemaining = {
  timeRemaining: string;
  secondTimeReamining: string;
}

type BusRoutesResponse = {
  ok: boolean;
  announcements: announcementInfo[];
  times: Record<string, departureTimeRemaining>;
  timestamp: number; // Will return as epoch
  errors: Record<string, Err["error"]>;
  summary: { total: number; success: number; failed: number };
};

// TODO: get bus codes from list

// TODO: Add the remaining elements
const busCodeInput = document.getElementById("busCodeInput");
const addBusList = document.getElementById("addBusList");
const busList = document.querySelector(".busListWrapper");

if (
  !(busCodeInput instanceof HTMLInputElement) ||
  !(addBusList instanceof HTMLButtonElement) ||
  !(busList instanceof HTMLDivElement) 
) {
  throw new Error("Required DOM elements were not found");
}

function normalizeBusCode(value: string): string {
  return value.trim().toUpperCase();
}

// TODO: Check timestamp
function isBusRoutesResponse(value: unknown): value is BusRoutesResponse {
  if (!isRecord(value)) return false;

  if (typeof value.ok !== "boolean") return false;

  if (!Array.isArray(value.announcements)) return false;
  if (!value.announcements.every(isAnnouncementInfo)) return false;

  if (!isRecord(value.times)) return false;
  for (const [k, v] of Object.entries(value.times)) {
    if (typeof k !== "string") return false; 
    if (!isDepartureTimeRemaining(v)) return false;
  }

  if (!isRecord(value.errors)) return false;
  for (const [k, v] of Object.entries(value.errors)) {
    if (typeof k !== "string") return false;
    if (!isErrErrorShape(v)) return false;
  }

  if (!isRecord(value.summary)) return false;
  if (!isNonNegativeInt(value.summary.total)) return false;
  if (!isNonNegativeInt(value.summary.success)) return false;
  if (!isNonNegativeInt(value.summary.failed)) return false;

  if (value.summary.total !== value.summary.success + value.summary.failed) return false;

  if (Object.keys(value.times).length > value.summary.total) return false;
  if (Object.keys(value.errors).length > value.summary.total) return false;

  return true;
}

function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === "object" && x !== null;
}

function isNonNegativeInt(x: unknown): x is number {
  return typeof x === "number" && Number.isInteger(x) && x >= 0;
}

function isAnnouncementInfo(x: unknown): x is announcementInfo {
  if (!isRecord(x)) return false;

  return (
    typeof x.HATKODU === "string" &&
    typeof x.HAT === "string" &&
    typeof x.TIP === "string" &&
    typeof x.GUNCELLEME_SAATI === "string" &&
    typeof x.MESAJ === "string"
  );
}

function isDepartureTimeRemaining(x: unknown): x is departureTimeRemaining {
  if (!isRecord(x)) return false;

  return (
    typeof x.timeRemaining === "string" &&
    typeof x.secondTimeReamining === "string"
  );
}

function isErrErrorShape(x: unknown): x is Err["error"] {
  if (!isRecord(x)) return false;

  if (typeof x.message !== "string") return false;
  if (typeof x.kind !== "string") return false;

  if ("status" in x && x.status !== undefined) {
    if (typeof x.status !== "number" || !Number.isFinite(x.status)) return false;
  }

  return true;
}

function addBusToList() {

}

// TODO: Display different tabs
function displayBusTab() {

}

busList.addEventListener("click", (event) => {
  const target = event.target as HTMLElement;
  const button = target.closest("#busListButton");

  if (!button) return;

})

// TODO: add buses to list from input

//----------------------------------------------------------------
// TODO: POST /bus/routes logic handeling here 

// TODO: Get buses for list from local storage