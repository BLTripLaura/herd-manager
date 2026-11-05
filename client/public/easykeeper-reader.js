/* EasyKeeper reader for Herd Manager
   Runs on app.easykeeper.com while you are signed in (started from the "EasyKeeper → Herd Manager" bookmark).
   It only READS pages, the same ones you can open yourself, and saves everything into one file
   (easykeeper-herd-YYYY-MM-DD.json) that you then upload on Herd Manager's Getting started page.
   Nothing in EasyKeeper is changed. Progress is kept in this browser, so if it stops you can click
   the bookmark again and it picks up where it left off. */
(function () {
  "use strict";
  var VERSION = 1;
  if (!/(^|\.)easykeeper\.com$/i.test(location.hostname)) {
    alert("Open app.easykeeper.com and sign in first, then click the \"EasyKeeper → Herd Manager\" bookmark again.");
    return;
  }
  if (window.__hmReader) { window.__hmReader.show(); return; }

  // ---------- small helpers ----------
  var P = new DOMParser();
  var sleep = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };
  var clean = function (s) { return String(s == null ? "" : s).replace(/\u00a0/g, " ").replace(/[ \t]+/g, " ").trim(); };
  function lines(el) {
    if (!el) return [];
    var c = el.cloneNode(true);
    c.querySelectorAll("script,style,.no_print,i.fa").forEach(function (x) { x.remove(); });
    c.querySelectorAll("br").forEach(function (x) { x.replaceWith("\n"); });
    c.querySelectorAll("p,div,li,tr,h1,h2,h3,h4,dt,dd,fieldset,legend,table").forEach(function (x) { x.before("\n"); x.after("\n"); });
    return c.textContent.split("\n").map(clean).filter(Boolean);
  }
  function main(d) { return d.querySelector("#actionContent") || d.querySelector("#content_body") || d.body; }
  function headingFor(t) {
    var fs = t.closest("fieldset"); if (fs) { var h = fs.querySelector("h2,h3,legend"); if (h) return clean(h.textContent); }
    var n = t; for (var i = 0; i < 6 && n; i++) { var p = n.previousElementSibling; while (p) { if (/^H[1-4]$/.test(p.tagName)) return clean(p.textContent); var h2 = p.querySelector && p.querySelector("h2,h3"); if (h2) return clean(h2.textContent); p = p.previousElementSibling; } n = n.parentElement; }
    return "";
  }
  function tables(root) {
    return Array.prototype.map.call(root.querySelectorAll("table"), function (t) {
      var headers = Array.prototype.map.call(t.querySelectorAll("thead th, tr:first-child th"), function (th) { return clean(th.textContent); });
      var rows = [];
      t.querySelectorAll("tr").forEach(function (tr) {
        var tds = tr.querySelectorAll("td"); if (!tds.length) return;
        rows.push({
          cells: Array.prototype.map.call(tds, function (td) { return lines(td); }),
          titles: Array.prototype.map.call(tds, function (td) { return td.getAttribute("title") || ""; }),
          sort: Array.prototype.map.call(tds, function (td) { return td.getAttribute("data-sort") || ""; }),
          links: Array.prototype.map.call(tr.querySelectorAll("a[href]"), function (a) { return a.getAttribute("href"); }),
          id: tr.id || "",
        });
      });
      return { heading: headingFor(t), id: t.id || "", cls: t.className || "", headers: headers, rows: rows };
    }).filter(function (t) { return t.rows.length; });
  }
  function formFields(d, match) {
    var f = Array.prototype.find.call(d.querySelectorAll("form"), function (x) { return match.test(x.getAttribute("action") || ""); });
    if (!f) return null;
    var out = {}, radios = [];
    Array.prototype.forEach.call(f.elements, function (e) {
      if (!e.name || e.name === "authenticity_token" || e.name === "_method") return;
      if (e.type === "radio") { radios.push({ name: e.name, value: e.value, checked: e.checked }); return; }
      if (e.type === "checkbox") { out[e.name] = e.checked; return; }
      if (e.tagName === "SELECT") { var o = e.selectedOptions && e.selectedOptions[0]; out[e.name] = o ? clean(o.textContent) : ""; return; }
      if (e.type === "hidden" && e.name in out) return; // Rails' hidden "0" before a checkbox
      out[e.name] = e.value;
    });
    out.__radios = radios;
    return out;
  }

  // ---------- storage (IndexedDB on this site, so a big herd can resume) ----------
  var dbp = new Promise(function (res, rej) {
    var r = indexedDB.open("herd-manager-easykeeper-reader", 1);
    r.onupgradeneeded = function () { r.result.createObjectStore("kv"); };
    r.onsuccess = function () { res(r.result); }; r.onerror = function () { rej(r.error); };
  });
  function idb(mode, fn) { return dbp.then(function (db) { return new Promise(function (res, rej) { var t = db.transaction("kv", mode); var s = t.objectStore("kv"); var q = fn(s); t.oncomplete = function () { res(q && q.result); }; t.onerror = function () { rej(t.error); }; }); }); }
  var kvGet = function (k) { return idb("readonly", function (s) { return s.get(k); }); };
  var kvSet = function (k, v) { return idb("readwrite", function (s) { s.put(v, k); }); };
  var kvKeys = function () { return idb("readonly", function (s) { return s.getAllKeys(); }); };
  var kvClear = function () { return idb("readwrite", function (s) { s.clear(); }); };

  // ---------- polite fetching (EasyKeeper limits how fast pages can be opened) ----------
  var gap = 900, last = 0, paused = false, stopped = false, requests = 0;
  async function page(url) {
    for (var attempt = 0; attempt < 8; attempt++) {
      while (paused) await sleep(500);
      if (stopped) throw new Error("stopped");
      var wait = last + gap - Date.now(); if (wait > 0) await sleep(wait);
      last = Date.now(); requests++;
      var res;
      try { res = await fetch(url, { credentials: "include", headers: { Accept: "text/html" } }); }
      catch (e) { say("Connection hiccup, trying again…"); await sleep(5000); continue; }
      if (res.status === 429) {
        gap = Math.min(Math.round(gap * 1.5), 4000);
        var secs = [60, 120, 240, 300, 300, 300, 300, 300][attempt];
        for (var s = secs; s > 0; s--) { say("EasyKeeper asked us to slow down. Waiting " + s + " seconds, then continuing (nothing is lost)."); await sleep(1000); if (stopped) throw new Error("stopped"); }
        continue;
      }
      if (/sign_in/.test(res.url)) throw new Error("signedout");
      if (res.status === 404) return null;
      if (!res.ok) { await sleep(3000); continue; }
      return P.parseFromString(await res.text(), "text/html");
    }
    throw new Error("EasyKeeper kept refusing " + url);
  }
  var empty = function (d) { return !d || /You have not (recorded|uploaded|entered)/.test(main(d).textContent); };

  // ---------- one goat ----------
  async function readAnimal(row, opts) {
    var id = row.ekId, base = "/herd_animals/" + id, a = { ekId: id, list: row };
    var d = await page(base);
    if (d) { a.profile = { lines: lines(main(d)), header: clean((d.querySelector("#animal_name_header") || {}).textContent) }; }
    d = await page(base + "/edit");
    if (d) a.edit = formFields(d, /herd_animals\/\d+$/);
    d = await page(base + "/genetics");
    if (d) {
      var m = main(d);
      a.progeny = tables(m).filter(function (t) { return /progeny/i.test(t.cls + " " + t.heading); }).flatMap(function (t) { return t.rows; });
      a.pedigree = Array.prototype.map.call(m.querySelectorAll(".pedigree_row"), function (r) {
        var code = clean((r.querySelector(".ancestor_code") || {}).textContent);
        var nameEl = r.querySelector(".animal_registered_name_edit");
        var hid = r.querySelector("input[type=hidden][name*='_herd_animal_id']");
        var ls = lines(r.querySelector(".pedigree_row_contents") || r);
        return { code: code, name: clean(nameEl ? nameEl.textContent : ""), ekId: hid ? hid.value : "", lines: ls };
      }).filter(function (p) { return p.code; });
    }
    d = await page(base + "/health_events");
    if (d && !empty(d)) {
      a.health = tables(main(d));
      if (opts.routes) {
        a.healthDetails = {};
        var hist = a.health.filter(function (t) { return /history/i.test(t.heading) || t === a.health[a.health.length - 1]; });
        var links = []; hist.forEach(function (t) { t.rows.forEach(function (r) { r.links.forEach(function (h) { if (/health_events\/\d+\/edit/.test(h)) links.push(h); }); }); });
        for (var i = 0; i < links.length; i++) {
          say(row.name + ": treatment details " + (i + 1) + " of " + links.length);
          var e = await page(links[i]); if (!e) continue;
          var f = formFields(e, /health_events/); if (!f) continue;
          a.healthDetails[(links[i].match(/health_events\/(\d+)/) || [])[1]] = { route: f["health_event[delivery_method]"] || "", dosage: f["health_event[dosage]"] || "", notes: f["health_event[notes]"] || "", category: f.category || "" };
        }
      }
    }
    d = await page(base + "/breedings");
    if (d && !empty(d)) a.breedings = tables(main(d));
    d = await page(base + "/herd_animal_notes");
    if (d && !empty(d)) a.notes = tables(main(d));
    d = await page(base + "/status");
    if (d) a.status = tables(main(d));
    d = await page(base + "/herd_animal_photos");
    if (d && !empty(d)) a.photos = Array.prototype.map.call(main(d).querySelectorAll("a.herd_animal_photo, .photo_image a[href]"), function (x) {
      return { id: (x.id || "").replace(/\D/g, ""), url: x.getAttribute("href"), thumb: (x.querySelector("img") || {}).src || "", title: clean(x.getAttribute("title")) };
    }).filter(function (p) { return /^https?:/.test(p.url); });
    d = await page(base + "/lactations");
    if (d && !empty(d)) {
      a.lactations = tables(main(d));
      var lacLinks = []; a.lactations.forEach(function (t) { t.rows.forEach(function (r) { r.links.forEach(function (h) { if (/lactations\/\d+$/.test(h) && lacLinks.indexOf(h) < 0) lacLinks.push(h); }); }); });
      a.lactationDetails = {};
      for (var j = 0; j < lacLinks.length; j++) { var ld = await page(lacLinks[j]); if (ld) a.lactationDetails[lacLinks[j]] = { lines: lines(main(ld)).slice(0, 80), tables: tables(main(ld)) }; }
    }
    d = await page(base + "/herd_animal_meats");
    if (d && !empty(d)) a.harvest = tables(main(d));
    return a;
  }

  var say = function () {};
  // Test hook (developer use): expose the readers without showing the panel
  if (window.__hmReaderTest === true) { window.__hmReaderTest = { readAnimal: readAnimal, page: page, tables: tables, setGap: function (g) { gap = g; } }; return; }
  // ---------- the panel ----------
  var box = document.createElement("div");
  box.style.cssText = "position:fixed;z-index:2147483647;top:16px;right:16px;width:360px;max-width:calc(100vw - 32px);background:#fff;color:#1f2a1f;border:2px solid #2f6b3a;border-radius:12px;box-shadow:0 10px 30px rgba(0,0,0,.25);font:14px/1.4 system-ui,-apple-system,Segoe UI,sans-serif;padding:14px";
  box.innerHTML =
    '<div style="display:flex;justify-content:space-between;align-items:center;gap:8px"><b style="font-size:15px">EasyKeeper → Herd Manager</b><button data-x style="border:0;background:none;font-size:18px;cursor:pointer" title="Hide">×</button></div>' +
    '<p style="margin:6px 0 8px;color:#555">Reads every goat and its records (profile, registrations, pedigree, progeny, health and treatment history, reminders, breeding and kidding, notes, status, photos, milk and harvest) into one file. Nothing in EasyKeeper is changed.</p>' +
    '<label style="display:flex;gap:6px;align-items:flex-start;margin:4px 0"><input type="checkbox" data-routes> <span>Also read how each treatment was given (SQ, IM, oral…). Opens every treatment, so it takes much longer.</span></label>' +
    '<div data-bar style="height:8px;background:#e5efe6;border-radius:6px;overflow:hidden;margin:10px 0 6px"><div data-fill style="height:100%;width:0;background:#2f6b3a;transition:width .3s"></div></div>' +
    '<div data-msg style="min-height:40px;color:#333">Ready.</div>' +
    '<div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:10px">' +
    '<button data-go style="flex:1;padding:8px 10px;border-radius:8px;border:0;background:#2f6b3a;color:#fff;font-weight:600;cursor:pointer">Start reading</button>' +
    '<button data-pause style="padding:8px 10px;border-radius:8px;border:1px solid #2f6b3a;background:#fff;color:#2f6b3a;cursor:pointer;display:none">Pause</button>' +
    '<button data-save style="padding:8px 10px;border-radius:8px;border:1px solid #2f6b3a;background:#fff;color:#2f6b3a;cursor:pointer;display:none">Save file</button>' +
    '<button data-reset style="padding:8px 10px;border-radius:8px;border:0;background:none;color:#8a3b2f;cursor:pointer;text-decoration:underline">Start over</button></div>' +
    '<p style="margin:8px 0 0;font-size:12px;color:#666">Keep this tab open. A big herd can take an hour or more because EasyKeeper only lets pages open slowly. If it stops, click the bookmark again to continue.</p>';
  document.body.appendChild(box);
  var $ = function (s) { return box.querySelector(s); };
  say = function (t) { $("[data-msg]").textContent = t; };
  function bar(n, of) { $("[data-fill]").style.width = (of ? Math.round(100 * n / of) : 0) + "%"; }
  $("[data-x]").onclick = function () { box.style.display = "none"; };
  window.__hmReader = { show: function () { box.style.display = "block"; } };

  var running = false;
  async function animalList() {
    var d = await page("/reports/status_all");
    var t = d && tables(main(d))[0];
    if (!t) throw new Error("Couldn't open EasyKeeper's \"All animals ever associated with my herd\" report.");
    var H = t.headers.map(function (h) { return h.toLowerCase(); });
    var col = function (re) { return H.findIndex(function (h) { return re.test(h); }); };
    var cN = col(/name/), cR = col(/reg/), cS = col(/sex/), cD = col(/dob|birth/), cSt = col(/status/);
    return t.rows.map(function (r) {
      var link = r.links.find(function (h) { return /herd_animals\/\d+/.test(h); }) || "";
      return { ekId: (link.match(/herd_animals\/(\d+)/) || [])[1], name: (r.cells[cN] || [])[0] || "", reg: (r.cells[cR] || []).join(" "), sex: (r.cells[cS] || []).join(" "), dob: (r.cells[cD] || []).join(" "), status: (r.cells[cSt] || []).join(" ") };
    }).filter(function (r) { return r.ekId; });
  }
  async function save() {
    var list = (await kvGet("list")) || [];
    var keys = await kvKeys(); var animals = [];
    for (var i = 0; i < list.length; i++) { if (keys.indexOf("a" + list[i].ekId) >= 0) animals.push(await kvGet("a" + list[i].ekId)); }
    var farm = clean((document.querySelector("#herd_name, .herd_name, header h1") || {}).textContent) || "";
    var out = { format: "easykeeper-herd", version: VERSION, readAt: new Date().toISOString(), source: location.origin, farm: farm, totalGoats: list.length, animals: animals };
    var blob = new Blob([JSON.stringify(out)], { type: "application/json" });
    var a = document.createElement("a"); a.href = URL.createObjectURL(blob);
    a.download = "easykeeper-herd-" + new Date().toISOString().slice(0, 10) + ".json";
    document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 5000);
    say("Saved " + animals.length + " of " + list.length + " goats to your Downloads folder as " + a.download + ". Now open your Herd Manager, go to Getting started, and upload that file.");
  }
  async function run() {
    if (running) return; running = true; stopped = false;
    $("[data-go]").disabled = true; $("[data-go]").style.opacity = ".6"; $("[data-pause]").style.display = ""; $("[data-save]").style.display = "";
    var opts = { routes: $("[data-routes]").checked };
    try {
      say("Getting the list of every goat ever in your EasyKeeper herd…");
      var list = (await kvGet("list")) || await animalList();
      await kvSet("list", list);
      var have = await kvKeys();
      var t0 = Date.now(), doneNow = 0;
      for (var i = 0; i < list.length; i++) {
        bar(i, list.length);
        if (have.indexOf("a" + list[i].ekId) >= 0) continue;
        var left = list.length - i, per = doneNow ? (Date.now() - t0) / doneNow : 12000;
        say("Reading goat " + (i + 1) + " of " + list.length + ": " + list[i].name + "  (about " + Math.max(1, Math.round(left * per / 60000)) + " min left)");
        var a = await readAnimal(list[i], opts);
        await kvSet("a" + list[i].ekId, a); doneNow++;
      }
      bar(1, 1);
      say("All " + list.length + " goats read. Saving the file…");
      await save();
      $("[data-pause]").style.display = "none";
    } catch (e) {
      if (e.message === "signedout") say("EasyKeeper signed you out. Sign in again, then click the bookmark to continue where it stopped.");
      else if (e.message !== "stopped") say("Stopped: " + e.message + ". Click the bookmark again to continue where it stopped.");
    } finally { running = false; $("[data-go]").disabled = false; $("[data-go]").style.opacity = "1"; $("[data-go]").textContent = "Continue reading"; }
  }
  $("[data-go]").onclick = run;
  $("[data-pause]").onclick = function () { paused = !paused; this.textContent = paused ? "Resume" : "Pause"; if (paused) say("Paused. Click Resume to keep going."); };
  $("[data-save]").onclick = save;
  $("[data-reset]").onclick = async function () {
    if (!confirm("Forget what has been read so far and start from the beginning?")) return;
    stopped = true; await sleep(300); await kvClear(); bar(0, 1); say("Cleared. Click Start reading."); $("[data-go]").textContent = "Start reading";
  };
  (async function () {
    var list = await kvGet("list"); var keys = await kvKeys();
    if (list && list.length) { var n = keys.filter(function (k) { return /^a/.test(k); }).length; bar(n, list.length); say(n + " of " + list.length + " goats already read in this browser. Click Continue to finish, or Save file."); $("[data-go]").textContent = n >= list.length ? "Check again" : "Continue reading"; $("[data-save]").style.display = ""; }
  })();
})();
