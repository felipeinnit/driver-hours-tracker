(() => {
  "use strict";
  const STORAGE_KEY = "driver-hours-tracker-v1";
  const $ = id => document.getElementById(id);
  let state = loadState();
  let tickHandle = null;

  function loadState() {
    try {
      const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
      return { entries: Array.isArray(parsed.entries) ? parsed.entries : [], active: parsed.active || null,
        profile: parsed.profile || "assimilated", vehicle: parsed.vehicle || "Goods vehicle over 3.5 tonnes" };
    } catch { return { entries: [], active: null, profile: "assimilated", vehicle: "Goods vehicle over 3.5 tonnes" }; }
  }
  function persist() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
    catch { alert("Could not save in this browser. Check storage settings or export your records."); }
  }
  function minutes(ms) { return Math.max(0, Math.floor(ms / 60000)); }
  function fmt(totalMinutes) {
    const m = Math.max(0, Math.floor(totalMinutes));
    return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, "0")}m`;
  }
  function duration(entry, now = Date.now()) {
    return minutes((entry.end ? new Date(entry.end).getTime() : now) - new Date(entry.start).getTime());
  }
  function dateKey(date) {
    const d = new Date(date);
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
  }
  function mondayOf(date) {
    const d = new Date(date); d.setHours(0,0,0,0);
    const day = (d.getDay() + 6) % 7; d.setDate(d.getDate() - day); return d;
  }
  function entriesWithActive(now = Date.now()) {
    const all = state.entries.slice();
    if (state.active) all.push({ ...state.active, end: new Date(now).toISOString(), _active: true });
    return all;
  }
  function totalFor(list, activity, from, to) {
    return list.filter(e => e.activity === activity && new Date(e.start) < to &&
      new Date(e.end || Date.now()) > from).reduce((sum, e) => {
        const s = Math.max(new Date(e.start).getTime(), from.getTime());
        const end = Math.min(new Date(e.end || Date.now()).getTime(), to.getTime());
        return sum + minutes(end - s);
      }, 0);
  }
  function totals() {
    const now = new Date();
    const all = entriesWithActive(now.getTime());
    const todayStart = new Date(now); todayStart.setHours(0,0,0,0);
    const weekStart = mondayOf(now);
    const nextWeek = new Date(weekStart); nextWeek.setDate(nextWeek.getDate()+7);
    const priorWeek = new Date(weekStart); priorWeek.setDate(priorWeek.getDate()-7);
    const twoWeekStart = new Date(weekStart); twoWeekStart.setDate(twoWeekStart.getDate()-7);
    const drive = "Driving";
    const today = totalFor(all, drive, todayStart, new Date(now.getTime()+1));
    const week = totalFor(all, drive, weekStart, nextWeek);
    const twoWeek = totalFor(all, drive, twoWeekStart, new Date(now.getTime()+1));
    // Driving since latest completed qualifying break is an estimate; split breaks and rest rules need full context.
    const chronological = all.slice().sort((a,b)=>new Date(a.start)-new Date(b.start));
    let sinceBreak = 0;
    for (const e of chronological) {
      if (e.activity === "Break / rest" && duration(e) >= 45) sinceBreak = 0;
      else if (e.activity === drive) sinceBreak += duration(e);
    }
    const domesticDayDriving = totalFor(all, drive, todayStart, new Date(now.getTime()+1));
    const duty = totalFor(all, drive, todayStart, new Date(now.getTime()+1)) +
      totalFor(all, "Other work", todayStart, new Date(now.getTime()+1));
    return { today, week, twoWeek, sinceBreak, domesticDayDriving, duty, priorWeek };
  }
  function render() {
    const now = Date.now();
    const t = totals();
    $("todayDriving").textContent = fmt(t.today);
    $("weekDriving").textContent = fmt(t.week);
    $("twoWeekDriving").textContent = fmt(t.twoWeek);
    $("sinceBreak").textContent = fmt(t.sinceBreak);
    const profile = state.profile;
    const dailyLimit = profile === "domestic" ? 600 : 540;
    $("dailyLimitLabel").textContent = profile === "domestic" ? "GB domestic guide: 10h driving/day" : "Assimilated guide: 9h (10h up to twice/fixed week)";
    $("dailyProgress").style.width = Math.min(100, t.today/dailyLimit*100) + "%";
    $("weekProgress").style.width = Math.min(100, t.week/3360*100) + "%";
    $("twoWeekProgress").style.width = Math.min(100, t.twoWeek/5400*100) + "%";
    $("breakProgress").style.width = Math.min(100, t.sinceBreak/270*100) + "%";
    $("ruleProfile").value = state.profile;
    $("vehicleType").value = state.vehicle;
    const notes = {
      assimilated: "Assimilated rules commonly apply to goods vehicles over 3.5 tonnes in the UK and on relevant EU journeys. Check vehicle, journey and exemptions.",
      domestic: "GB domestic rules apply to eligible operations in England, Scotland and Wales. Goods vehicle daily driving and duty limits depend on the operation and exemptions.",
      mixed: "Mixed operations may require both rule sets. Time and limits can interact; this prototype cannot determine legal applicability automatically."
    };
    $("ruleNote").textContent = notes[profile];
    if (state.active) {
      $("currentActivity").textContent = state.active.activity;
      $("currentElapsed").textContent = fmt(duration(state.active, now)) + " elapsed";
      $("liveStatus").textContent = "Activity running";
      $("liveStatus").className = "pill";
      $("stopBtn").disabled = false;
    } else {
      $("currentActivity").textContent = "Not running";
      $("currentElapsed").textContent = "00h 00m elapsed";
      $("liveStatus").textContent = "Not running";
      $("liveStatus").className = "pill neutral";
      $("stopBtn").disabled = true;
    }
    renderAlerts(t);
    renderHistory();
  }
  function renderAlerts(t) {
    const alerts = [];
    if (state.profile !== "domestic") {
      if (t.today >= 540) alerts.push(["warn","Daily assimilated driving guide limit reached (9h). A permitted 10h extension may apply on no more than two days in a fixed week."]);
      else if (t.today >= 480) alerts.push(["warn","Approaching 9 hours of driving today. Check whether an extension is available and permitted."]);
      if (t.week >= 3360) alerts.push(["warn","56-hour fixed-week driving guide limit reached."]);
      if (t.twoWeek >= 5400) alerts.push(["warn","90-hour two-consecutive-week driving guide limit reached."]);
      if (t.sinceBreak >= 270) alerts.push(["warn","4h 30m driving threshold reached. Check break requirements immediately."]);
      else if (t.sinceBreak >= 240) alerts.push(["warn","Approaching 4h 30m driving since a logged 45-minute break."]);
    } else {
      if (t.domesticDayDriving >= 600) alerts.push(["warn","10-hour GB domestic daily driving guide limit reached."]);
      if (t.duty >= 660) alerts.push(["warn","11-hour GB domestic duty guide threshold reached. Check the exact rule and exemptions."]);
    }
    if (state.profile === "mixed") alerts.unshift(["info","Mixed operation selected: review both sets of rules and the official mixed-driving guidance."]);
    if (!alerts.length) alerts.push(["ok","No guide threshold flagged from the activities currently logged. Missing entries or special rules can change the result."]);
    $("alerts").innerHTML = alerts.map(([type,msg])=>`<div class="alert ${type==="warn"?"warn":type==="info"?"info":""}">${escapeHtml(msg)}</div>`).join("");
  }
  function renderHistory() {
    const tbody = $("historyBody");
    const rows = state.entries.slice().sort((a,b)=>new Date(b.start)-new Date(a.start));
    tbody.innerHTML = rows.map(e => `<tr><td>${escapeHtml(e.activity)}</td><td>${escapeHtml(dateTime(e.start))}</td><td>${escapeHtml(dateTime(e.end))}</td><td>${fmt(duration(e))}</td><td>${escapeHtml(e.note || "—")}</td><td><button class="delete-entry" data-delete="${e.id}" aria-label="Delete activity">Delete</button></td></tr>`).join("");
    $("emptyState").hidden = rows.length > 0;
  }
  function dateTime(iso) {
    if (!iso) return "—";
    const d = new Date(iso);
    return d.toLocaleString("en-GB", { day:"2-digit", month:"short", year:"numeric", hour:"2-digit", minute:"2-digit" });
  }
  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, c => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[c]));
  }
  function startActivity(activity) {
    if (state.active) {
      if (!confirm(`Stop "${state.active.activity}" and start "${activity}" now?`)) return;
      stopActivity(false);
    }
    state.active = { id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()), activity, start: new Date().toISOString(), note:"" };
    persist(); render();
  }
  function stopActivity(renderAfter = true) {
    if (!state.active) return;
    const ended = { ...state.active, end: new Date().toISOString() };
    if (duration(ended) > 0) state.entries.push(ended);
    state.active = null; persist();
    if (renderAfter) render();
  }
  document.querySelectorAll("[data-activity]").forEach(btn => btn.addEventListener("click", () => startActivity(btn.dataset.activity)));
  $("stopBtn").addEventListener("click", () => stopActivity());
  $("ruleProfile").addEventListener("change", e => { state.profile = e.target.value; persist(); render(); });
  $("vehicleType").addEventListener("change", e => { state.vehicle = e.target.value; persist(); render(); });
  $("entryForm").addEventListener("submit", e => {
    e.preventDefault();
    const activity = $("entryActivity").value, startRaw = $("entryStart").value, endRaw = $("entryEnd").value;
    const start = new Date(startRaw), end = new Date(endRaw);
    if (!startRaw || !endRaw || !Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || end <= start) {
      $("formMessage").textContent = "Enter a valid start and end time; the end must be after the start."; return;
    }
    if (state.active) { $("formMessage").textContent = "Stop the running activity before adding a past entry."; return; }
    state.entries.push({ id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()), activity, start:start.toISOString(), end:end.toISOString(), note:$("entryNote").value.trim() });
    persist(); e.target.reset(); $("formMessage").textContent = "Activity saved on this device."; render();
  });
  $("historyBody").addEventListener("click", e => {
    const id = e.target.dataset.delete; if (!id) return;
    state.entries = state.entries.filter(entry => entry.id !== id); persist(); render();
  });
  $("clearBtn").addEventListener("click", () => $("confirmDialog").showModal());
  $("confirmClear").addEventListener("click", () => {
    state.entries = []; state.active = null; persist(); render();
  });
  $("exportBtn").addEventListener("click", () => {
    const entries = state.entries.slice().sort((a,b)=>new Date(a.start)-new Date(b.start));
    const header = ["Activity","Start ISO","End ISO","Duration minutes","Note"];
    const lines = [header, ...entries.map(e=>[e.activity,e.start,e.end,duration(e),e.note || ""])]
      .map(row=>row.map(v=>`"${String(v).replace(/"/g,'""')}"`).join(",")).join("\r\n");
    const blob = new Blob(["\ufeff"+lines], {type:"text/csv;charset=utf-8;"});
    const url = URL.createObjectURL(blob), a = document.createElement("a");
    a.href = url; a.download = "driver-hours-history.csv"; a.click(); URL.revokeObjectURL(url);
  });
  // Date fields default to the current local time rounded to the minute.
  const localInputValue = date => {
    const d = new Date(date.getTime() - date.getTimezoneOffset()*60000);
    return d.toISOString().slice(0,16);
  };
  $("entryStart").value = localInputValue(new Date(Date.now()-60*60000));
  $("entryEnd").value = localInputValue(new Date());
  render();
  tickHandle = setInterval(render, 15000);
  window.addEventListener("beforeunload", () => { if (tickHandle) clearInterval(tickHandle); });
})();
