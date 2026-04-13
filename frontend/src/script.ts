//[TODO]: Add a toggle switch for different type of heading
//[TODO]: Analyze the bus codes data find the longest bus code name
//[TODO]: Dont just loop over data panel elements get them ahead of time and handle them inside of functions
//[TODO]: Could add ok type
type Err = { ok: false; busCode: string; error: { message: string; status?: number; kind: string } };

type AnnouncementItem = {
  MESAJ?: string;
};

// IETT Stufz
type direction = "D" | "G"; 
type dayType = "I" | "C" | "P";


type BusRoutesResponse = {
  ok: boolean;
  announcements: announcementInfo[];
  times: Record<string, departureTimesInfo[]>;
  timestamp: number; // Will return as epoch
  errors: Record<string, Err["error"]>;
  summary: { total: number; success: number; failed: number };
};

type busRoute = {
  busCode: string,
  direction: direction,
  dayType: dayType
}

type busRoutesBody = {
  busRoutes: busRoute[]
}

// Response type
type announcementInfo = {
  "HATKODU": string;
  /* Could add these in the future
  "HAT": string;
  TIP": "Günlük" | "Sefer" | string; */
  "GUNCELLEME_SAATI": string;    
  "MESAJ": string;
};

// Response type
type departureTimesInfo = {
  "SHATKODU": string;
  "HATADI": string;
  // Could add these in the future
  //"SGUZERAH": string;
  "SYON": string;
  "SGUNTIPI": string;
  "GUZERGAH_ISARETI": string | null;
  //"SSERVISTIPI": string; 
  "DT": string;
};

// TODO: Add the remaining elements
const _busCodeInput = document.getElementById("busCodeInput");
const _addBusList = document.getElementById("addBusList");
const _busList = document.querySelector(".busListWrapper .busList");
const _dataPanel = document.getElementById("dataPanel");
const _removeBusBtn = document.querySelector(".dataPanel .removeBus");
const _directionBtn = document.querySelector(".dataPanel .directionControl .changeDirection");

if (
  !(_busCodeInput instanceof HTMLInputElement) ||
  !(_addBusList instanceof HTMLButtonElement) ||
  !(_busList instanceof HTMLUListElement) ||
  !(_dataPanel instanceof HTMLDivElement) ||
  !(_removeBusBtn instanceof HTMLButtonElement) ||
  !(_directionBtn instanceof HTMLImageElement)
) {
  throw new Error("Required DOM elements were not found");
}

const busCodeInput = _busCodeInput;
const addBusList = _addBusList;
const busList = _busList;
const dataPanel = _dataPanel;
const removeBusBtn = _removeBusBtn;
const directionBtn = _directionBtn;

//BULLSHIT SECTION I NEED TO REFACTOR THIS ASAP
const _directionControl = dataPanel.querySelector(".directionControl");
const _remainingTime = dataPanel.querySelector(".remainingTime");
const _announcementTexts = dataPanel.querySelector(".announcementTexts"); 
const _timeTable = dataPanel.querySelector(".timeTable"); 

if (
  !(_directionControl instanceof HTMLDivElement) ||
  !(_remainingTime instanceof HTMLDivElement) ||
  !(_announcementTexts instanceof HTMLDivElement) ||
  !(_timeTable instanceof HTMLDivElement) 
) {
  throw new Error("Required data panel DOM elements were not found");
}

const directionControl = _directionControl;
const remainingTime = _remainingTime;
const announcementTexts = _announcementTexts;
const timeTable = _timeTable;

// BULLSHIIII
type IstanbulDatePart = "year" | "month" | "day" | "hour" | "minute" | "second";

function getDayType(): dayType{
  const date = new Date();
  const day = date.getDay();

  if (day === 0) return "P"; // Pazar
  if (day === 6) return "C"; // Cumartesi
  
  return "I"; // Is gunu
}

// ======= REQUEST SHI ===========
let selectedBusCode: string = ""; 
let selectedDirection: direction = "G"; // Yeah okey just put the fleshlight into my bag lil bro
let currentDayType: dayType = getDayType();

function normalizeBusCode(value: string): string {
  return value.trim().toUpperCase();
}

function isDepartureTimesInfo(x: any): x is departureTimesInfo{
  return (
    x &&
    typeof x === "object" &&
    typeof x.SHATKODU === "string" &&
    typeof x.HATADI === "string" &&
    (x.SYON === "D" || x.SYON === "G") &&
    (x.SGUNTIPI === "I" || x.SGUNTIPI === "C" || x.SGUNTIPI === "P")  &&
    (typeof x.GUZERGAH_ISARETI === "string" || x.GUZERGAH_ISARETI === null ) &&
    typeof x.DT === "string"
  );
}

function isTimes(body: unknown) {
  if (!isRecord(body)) return false;

  //We do lil ai
  for (const [key, value] of Object.entries(body)) {
    if (typeof key !== "string") return false;
    if (!Array.isArray(value)) return false;
    if (!value.every(isDepartureTimesInfo)) return false;
  }

  return true;
}

// TODO: Check timestamp
function isBusRoutesResponse(value: unknown): value is BusRoutesResponse {
  if (!isRecord(value)) return false;

  if (typeof value.ok !== "boolean") return false;

  if (!Array.isArray(value.announcements)) return false;
  if (!value.announcements.every(isAnnouncementInfo)) return false;

  if (!isRecord(value.times)) return false;
  if (!isTimes(value.times)) return false;

  if(typeof value.timestamp !== "number") return false;

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
    typeof x.GUNCELLEME_SAATI === "string" &&
    typeof x.MESAJ === "string"
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

function getListBusCodes(): Array<string> {
  if(busList instanceof HTMLUListElement){
    return Array.from(busList.querySelectorAll("li"))
      .map((li) =>
        normalizeBusCode(li.textContent) ?? "");
  }

  // TODO: Yeah nah
  return [];
}

function updateBusList(busCodes: unknown): void {
  if(busCodeInput instanceof HTMLInputElement ){
    if(!(busCodes instanceof Array)) throw new Error("Arguments is not of array type");

    busCodes.forEach((busCode) => {
      const li = document.createElement("li");
      li.className = "busCode";
      li.id = busCode;

      const button = document.createElement("button");
      button.className = "busListButton not_active";
      button.textContent = busCode;

      li.appendChild(button);

      const busList = document.getElementById("busList") as HTMLUListElement;
      busList.appendChild(li);
    });
  }
}

function showDataPanelContent(): void {
  const elements = dataPanel.querySelectorAll("*");

  elements.forEach((element) => {
    if(element.className.includes("theThing")) {
      if(element instanceof HTMLElement)
        element.hidden = true;
    } else {
        if(element instanceof HTMLElement)
          element.hidden = false;
    }
  });
}

function showDataPanelEmpty(): void {
  const elements = dataPanel.querySelectorAll("*");

  elements.forEach((element) => {
    if(element.className.includes("theThing")) {
      if(element instanceof HTMLElement)
        element.hidden = false;
    } else {
        if(element instanceof HTMLElement)
          element.hidden = true;
    }
  });
}

function showDataPanel(): void {
  if(!dataPanel) { console.log("Where panel??"); return; }

  dataPanel.hidden = false;
}

function hideDataPanel(): void {
  if(!dataPanel) { console.log("Where panel??"); return; }

  dataPanel.hidden = true;
}

function addBusToList(): void {
  const busCodes = getListBusCodes();
  if(!(busCodes instanceof Array) || busCodes.length >= 5) { alert("No more bussy bus bus than 5"); return; }

  if(busCodeInput instanceof HTMLInputElement){
    const busCode = normalizeBusCode(busCodeInput.value) ?? "";
    busCodeInput.value = "";
    busCodeInput.focus();

    if(busCodes.includes(busCode)) { alert("This bus code is already included in the list twin"); return; }
    if(busCode === "") { alert("Input bus code not cool twin"); return; }

    const li = document.createElement("li");
    li.className = "busCode";
    li.id = busCode;

    const button = document.createElement("button");
    button.className = "busListButton not_active";
    button.textContent = busCode;

    li.appendChild(button);

    busList.appendChild(li);

    const updatedBusCodes = [...new Set(getListBusCodes())];
    localStorage.setItem("busCodes", JSON.stringify(updatedBusCodes));
  }
}

// BULLSHIIII
function getDatePartNumber(
  parts: Intl.DateTimeFormatPart[],
  partType: IstanbulDatePart,
): number {
  const value = parts.find((part) => part.type === partType)?.value;

  if (!value) {
    throw new Error(`Missing date part: ${partType}`);
  }

  return Number(value);
}

// BULLSHIIII
// the minute part doesnt contain 0 for some reason?
function getIstanbulNow(): Date {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Istanbul",
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(new Date());

  return new Date(
    getDatePartNumber(parts, "year"),
    getDatePartNumber(parts, "month") - 1,
    getDatePartNumber(parts, "day"),
    getDatePartNumber(parts, "hour"),
    getDatePartNumber(parts, "minute"),
    getDatePartNumber(parts, "second"),
    0,
  );
}

// TODO: Add seconds
function stringDepartureTime2Date(time: unknown, baseDate: Date = new Date()): Date{
  if(typeof time !== "string") throw new Error("No");

  const [hourText, minuteText] = time.split(":");
  const hour = Number(hourText);
  const minute = Number(minuteText);

  return new Date(
    baseDate.getFullYear(),
    baseDate.getMonth(),
    baseDate.getDate(),
    hour,
    minute,
    0,
    0,
  );
}

// TODO: Add hat names also research that fuck ass edge cases observed in HM3, 500T etc.
function renderDirection(){
  const directionType = directionControl.querySelector(".directionType");

  if(!(directionType instanceof HTMLParagraphElement)) return;

  if(selectedDirection === "G")
    directionType.textContent = "Gidiş";
  else if(selectedDirection === "D")
    directionType.textContent = "Dönüş";
}

// TODO: TODO TODO TODO TODO
function renderDepartures(times: Record<string, departureTimesInfo[]>, busCode: string){
  if(times === undefined || typeof busCode !== "string" ) return;

  const closestDT = closestDepartureTimes(times[busCode]);
  if(closestDT === undefined) { console.log("DT undefined return"); return; }

  const firstRT = remainingTime.querySelector("#first");
  if(firstRT instanceof HTMLParagraphElement) firstRT.textContent = "En Yakın Birinci Kalkış:  " + dateDepartureTime2String(
    closestDT[0] as Date) + closestDT[2];

  const secondRT = remainingTime.querySelector("#second");
  if(secondRT instanceof HTMLParagraphElement) secondRT.textContent = "En Yakın İkinci Kalkış:  " + dateDepartureTime2String(
    closestDT[1] as Date) + closestDT[3];
}

function renderAnnouncement(announcements: announcementInfo[], busCode: string){
  if(!Array.isArray(announcements)) { console.log("Announcements not array"); return; }
  if(typeof busCode !== "string") { console.log("Bus code aint a string"); return; }

  const filteredAnnouncements = announcements.filter((item) => item.HATKODU === busCode);

  const announcementParagraph = announcementTexts.querySelector("#announcementText");

  if(!(announcementParagraph instanceof HTMLParagraphElement)) { return; }

  announcementParagraph.innerHTML = "";

  filteredAnnouncements.forEach(element => {
    announcementParagraph.innerHTML += "<p>" + element.HATKODU + " (" + element.GUNCELLEME_SAATI + ")" 
      + ": " + element.MESAJ + "<p>" + "<br>"
  });
}

// TODO: TODO TODO TODO TODO
function renderTimes(){

}

//TODO: Fix when time is not date case & minute section is fucked
function dateDepartureTime2String(time: unknown){
  if(!(time instanceof Date) && typeof time === "string") return time; 

  if(time instanceof Date){
    if(time.getMinutes() === 0){
      return time.getHours().toString() + ":" + "00";
    } else if(time.getMinutes() < 10){
      return time.getHours().toString() + ":" + "0" + time.getMinutes().toString();
    } else {
      return time.getHours().toString() + ":" + time.getMinutes().toString();
    }
  }
}

// Returns two departure times
function closestDepartureTimes(times: unknown){
  if(!Array.isArray(times) || 
    !times.every(isDepartureTimesInfo) ) { console.log("func dead"); return; }

  const currentTime = getIstanbulNow();

  let firstBus = undefined;
  let secondBus = undefined;
  let firstRouteSign: string = " ";
  let secondRouteSign: string = " ";

  for(let i = 0; i < times.length; i++){
    const cur = stringDepartureTime2Date(times[i]?.DT);

    if (cur && cur instanceof Date && cur > currentTime) {
      firstBus = cur;

      const item = times[i];
      if (!item) continue;

      if (item.GUZERGAH_ISARETI !== null) 
        firstRouteSign = item.GUZERGAH_ISARETI;

      if (i + 1 < times.length) {
        secondBus = stringDepartureTime2Date(times[i + 1]?.DT);

        const item = times[i + 1];
        if (!item) continue;

        if (item.GUZERGAH_ISARETI !== null) 
          secondRouteSign = item.GUZERGAH_ISARETI;
      } else {
        secondBus = "No more departures"; 
        secondRouteSign = " ";
      }
  
      break;
    } 
  }

  /* TODO: Note to myself dont write code after a 2 millers. Im still a baby boy and i dont got any alcohol tolerance.
  * Maybe in the future. Fix this bullshit later
  */
  if (firstBus instanceof Date && secondBus instanceof Date) {
    return [firstBus, secondBus, firstRouteSign, secondRouteSign];
  }
  else if(firstBus instanceof Date && typeof secondBus === "string") {
    return [firstBus, secondBus, firstRouteSign, secondRouteSign];
  }
  else if(firstBus === undefined && secondBus === undefined)
    return ["No more departures","No more departures", firstRouteSign, secondRouteSign];
}

function removeBus(): void {
  busList.querySelectorAll("li").forEach((element) => { if(element.id == selectedBusCode) element.remove(); })
  selectedBusCode = "";

  showDataPanelEmpty();

  const updatedBusCodes = [...new Set(getListBusCodes())];
  localStorage.setItem("busCodes", JSON.stringify(updatedBusCodes));  
}

function renderData(busCode: string, responseBusRoutes?: BusRoutesResponse) {
  if(!dataPanel) { console.log("Where panel??"); return; }

  // TODO: Need a big ass rewrite
  showDataPanelContent();
  // I Dont give a FUCK about type safety
  // TODO: Uuum render?

  renderDirection();

  console.log(isBusRoutesResponse(responseBusRoutes));
  if(!isBusRoutesResponse(responseBusRoutes)) return;

  const times = responseBusRoutes.times;
  if(times === undefined) { console.log("FUcking dead"); return; }
  renderDepartures(times, busCode)

  const announcements = responseBusRoutes.announcements;
  if(announcements === undefined || announcements === null) { console.log("Announcements ded"); return; }
  renderAnnouncement(announcements ,busCode);
}

function isResponse(response: unknown): boolean{
  return (
    Array.isArray(response) &&
      response.every((item) => {
        item &&
        typeof item === "object" 
        // TODO: Continue type shiiiii
    })
  );
}

// ========= NETWORKING SHIT N ==========
function packageSingularRequest(){
  const object = {
    busRoutes: [
      { busCode: selectedBusCode, direction: selectedDirection, dayType: currentDayType}
    ]
  };

  return JSON.stringify( object );
}

// TODO: yes king
function packageListRequest(){
  return JSON.stringify({
      busCode: selectedBusCode,
      direction: selectedDirection,
      dayType: currentDayType
  })
}

// TODO: yes king
function packageRequest(){
  return JSON.stringify({
      busCode: selectedBusCode,
      direction: selectedDirection,
      dayType: currentDayType
  })
}

async function fetchSingularData(): Promise<BusRoutesResponse | undefined>{
  const requestBody = packageSingularRequest();

  console.log(requestBody);

  const response: Response = await fetch("/otobus/routes", {
    method: "POST",
    headers: {
        "Content-Type": "application/json",
    },
    body: requestBody
  });

  // TODO: Check if expected type
  if (!response.ok && isResponse(response)) {
      const text = await response.text().catch(() => "");
      throw new Error(`HTTP error ${response.status}: ${text || response.statusText}`);
  }

  const data: unknown = await response.json();

  if(isBusRoutesResponse(data)) { return data; }

  return;
  
  // TODO: Need to check that return type
}

async function fetchListData() {
  const requestBody = packageSingularRequest();

  console.log(requestBody);

  const response: Response = await fetch("/otobus/routes", {
    method: "POST",
    headers: {
        "Content-Type": "application/json",
    },
    body: requestBody
  });

  // TODO: Check if expected type
  if (!response.ok && isResponse(response)) {
      const text = await response.text().catch(() => "");
      throw new Error(`HTTP error ${response.status}: ${text || response.statusText}`);
    }

    const data: unknown = await response.json();
}
// ====================================================

function loadStorage(): void {
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

function changeDirection(){
  if (selectedDirection != undefined && selectedDirection === "D") selectedDirection = "G";
  else if (selectedDirection != undefined && selectedDirection === "G") selectedDirection = "D";
}

/* ===================
* Actual shi section 
================== */

// Run on DOM Load
window.addEventListener("DOMContentLoaded", async () => {
  loadStorage();
  //fetchListData();
  showDataPanelEmpty();
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

busList.addEventListener("click", async (event) => {
  const target = event.target as HTMLLIElement;
  const button = target.closest(".busCode");

  if (!button) return;

  const busCode = button.id;
  if (!busCode) return;

  busList.querySelectorAll("button").forEach((button) => {
    if(button.textContent === busCode) button.className = button.className.replace("not_active", "is_active");
    else { 
      if (button.className.includes("is_active")) button.className = button.className.replace("is_active", "not_active"); 
    }
  });

  selectedDirection = busCode === selectedBusCode ? selectedDirection : "G";
  selectedBusCode = normalizeBusCode(busCode);

  const data = await fetchSingularData();

  renderData(busCode, data);
})

// Direction thingy
directionBtn.addEventListener("click", async (event) => {
  changeDirection();
  
  const data = await fetchSingularData();
  renderData(selectedBusCode, data)
});

// === [DEBUG] ===

/*
setInterval(() => {
  console.log("============= ");
  console.log("Bus code: " + selectedBusCode);
  console.log("Direction: " + selectedDirection);
  console.log("============= ");
}, 1000);
*/
