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

// TODO: Add the remaining elements
const _busCodeInput = document.getElementById("busCodeInput");
const _addBusList = document.getElementById("addBusList");
const _busList = document.querySelector(".busListWrapper .busList");
const _dataPanel = document.getElementById("dataPanel");

if (
  !(_busCodeInput instanceof HTMLInputElement) ||
  !(_addBusList instanceof HTMLButtonElement) ||
  !(_busList instanceof HTMLUListElement) ||
  !(_dataPanel instanceof HTMLDivElement)
) {
  throw new Error("Required DOM elements were not found");
}

const busCodeInput = _busCodeInput;
const addBusList = _addBusList;
const busList = _busList;
const dataPanel = _dataPanel;

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
  /*
  if(busCodeInput instanceof HTMLInputElement ){
    const li = document.createElement("li");
    li.className = "busCode";
    li.id = busCode;

    const button = document.createElement("button");
    button.className = "busListButton";
    button.textContent = busCode;

    li.appendChild(button);

    const busList = document.getElementById("busList") as HTMLUListElement;
    busList.appendChild(li);
  }
  */
}

function showDataPanel() {
  if(!dataPanel) { console.log("Where panel??"); return; }

  dataPanel.hidden = false;
}

function hideDataPanel() {
  if(!dataPanel) { console.log("Where panel??"); return; }

  dataPanel.hidden = true;
}

// TODO: Add everything into local storage
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
    li.className = "busCode";
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

function renderData(busCode: string) {
  if(!dataPanel) { console.log("Where panel??"); return; }

  // TODO: sudo rm -rf /
  if(dataPanel.hidden == true){
    showDataPanel();
  } else {
    hideDataPanel();
  }
}

async function fetchData() {

}

/* ------------------------------------
* Actual shi section ------------------
*/

// run on DOM Load
window.addEventListener("DOMContentLoaded", async () => {
  // TODO: Set the list from the local storage
  // TODO: POST to server
});

busCodeInput.addEventListener("keydown", (event) => {
  if (event.key !== "Enter") {
    return;
  }

  event.preventDefault();
  addBusToList();
});

busCodeInput.addEventListener("input", () => {
  busCodeInput.value = normalizeBusCode(busCodeInput.value);
});

addBusList.addEventListener("keydown", (event) => {
  addBusToList();
})

addBusList.addEventListener("click", () => {
  addBusToList();
})

busList.addEventListener("click", (event) => {
  const target = event.target as HTMLLIElement;
  const button = target.closest(".busCode");

  if (!button) return;

  const busCode = button.id;
  if (!busCode) return;
  
  renderData(busCode);
})

//----------------------------------------------------------------
// TODO: POST /bus/routes logic handeling here 

// TODO: Get buses for list from local storage