//[TODO]: Add a toggle switch for different type of heading
//[TODO]: Analyze the bus codes data find the longest bus code name

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

let selectedBusCode: string = "";

// TODO: Add the remaining elements
const _busCodeInput = document.getElementById("busCodeInput");
const _addBusList = document.getElementById("addBusList");
const _busList = document.querySelector(".busListWrapper .busList");
const _dataPanel = document.getElementById("dataPanel");
const _removeBusBtn = document.querySelector(".dataPanel .removeBus");

if (
  !(_busCodeInput instanceof HTMLInputElement) ||
  !(_addBusList instanceof HTMLButtonElement) ||
  !(_busList instanceof HTMLUListElement) ||
  !(_dataPanel instanceof HTMLDivElement) ||
  !(_removeBusBtn instanceof HTMLButtonElement)
) {
  throw new Error("Required DOM elements were not found");
}

const busCodeInput = _busCodeInput;
const addBusList = _addBusList;
const busList = _busList;
const dataPanel = _dataPanel;
const removeBusBtn = _removeBusBtn;

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

function getListBusCodes(){
  if(busList instanceof HTMLUListElement){
    return Array.from(busList.querySelectorAll("li"))
      .map((li) =>
        normalizeBusCode(li.textContent) ?? "");
  }
}

function updateBusList(busCodes: unknown){
  if(busCodeInput instanceof HTMLInputElement ){
    if(!(busCodes instanceof Array)) throw new Error("Arguments is not of array type");

    busCodes.forEach((busCode) => {
      const li = document.createElement("li");
      li.className = "";
      li.id = busCode;

      const button = document.createElement("button");
      button.className = "busListButton";
      button.textContent = busCode;

      li.appendChild(button);

      const busList = document.getElementById("busList") as HTMLUListElement;
      busList.appendChild(li);
    });
  }
}

function showDataPanel() {
  if(!dataPanel) { console.log("Where panel??"); return; }

  dataPanel.hidden = false;
}

function hideDataPanel() {
  if(!dataPanel) { console.log("Where panel??"); return; }

  dataPanel.hidden = true;
}

function addBusToList() {
  const busCodes = getListBusCodes();
  if(!(busCodes instanceof Array) || busCodes.length >= 5) { alert("No more bussy bus bus than 5"); return; }

  if(busCodeInput instanceof HTMLInputElement){
    const busCode = normalizeBusCode(busCodeInput.value) ?? "";
    busCodeInput.value = "";
    busCodeInput.focus();

    console.log(busCodes);
    if(busCodes.includes(busCode)) { alert("This bus code is already included in the list twin"); return; }
    if(busCode === "") { alert("Input bus code not cool twin"); return; }

    const li = document.createElement("li");
    li.className = "";
    li.id = busCode;

    const button = document.createElement("button");
    button.className = "busListButton";
    button.textContent = busCode;

    li.appendChild(button);

    busList.appendChild(li);

    const updatedBusCodes = [...new Set(getListBusCodes())];
    localStorage.setItem("busCodes", JSON.stringify(updatedBusCodes));
  }
}

function removeBus(){
  busList.querySelectorAll("li").forEach((element) => { if(element.id == selectedBusCode) element.remove(); })
  selectedBusCode = "";

  // TODO: derender the data panel

  const updatedBusCodes = [...new Set(getListBusCodes())];
  localStorage.setItem("busCodes", JSON.stringify(updatedBusCodes));  
}

function renderData(busCode: string, type?: string) {
  if(!dataPanel) { console.log("Where panel??"); return; }

  
}

async function fetchData() {
  const response: unknown = await fetch("");
}

function loadStorage(){
  const savedBusCodes: string | null = localStorage.getItem("busCodes");

  const parsedBusCodes: string[] = savedBusCodes
    ? JSON.parse(savedBusCodes)
    : [];

    try {
      updateBusList(parsedBusCodes);
    } catch(err: unknown) {
        alert("Couldn't load storage " + err as string);
    }
}

/* ------------------------------------
* Actual shi section ------------------
*/

// Run on DOM Load
window.addEventListener("DOMContentLoaded", async () => {
  loadStorage();
  fetchData();
  // TODO: i donno
});

// Remove bussy bussss
removeBusBtn.addEventListener("click", (event) => {
  removeBus();
});


// Add bus to list on enter
busCodeInput.addEventListener("keydown", (event) => {
  if (event.key !== "Enter") {
    return;
  }

  event.preventDefault();
  addBusToList();
});

// Normalize input field on every key
busCodeInput.addEventListener("input", () => {
  busCodeInput.value = normalizeBusCode(busCodeInput.value);
});

// L frauta + bumki
addBusList.addEventListener("click", () => {
  addBusToList();
})

busList.addEventListener("click", (event) => {
  const target = event.target as HTMLLIElement;
  const button = target.closest(".busCode");

  if (!button) return;

  const busCode = button.id;
  if (!busCode) return;
  
  selectedBusCode = normalizeBusCode(busCode);
  renderData(busCode);
})