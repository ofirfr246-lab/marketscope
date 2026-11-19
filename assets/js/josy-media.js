/* Josy media library — private Supabase Storage uploads with per-plan quota (ES module).
   Files live in the private "josy-media" bucket under "<user id>/…" and are shown with short-lived signed URLs. */
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./supabase-config.js";
import { esc, toast, confirmDialog } from "./josy-core.js";

/* Must match public.josy_media_quota() / josy_media_max_file() in the database. */
export var JOSY_MEDIA = {
  types: { "image/jpeg": "JPG", "image/png": "PNG", "image/webp": "WEBP", "image/gif": "GIF", "video/mp4": "MP4", "video/quicktime": "MOV", "video/webm": "WEBM" },
  accept: ".jpg,.jpeg,.png,.webp,.gif,.mp4,.mov,.webm,image/jpeg,image/png,image/webp,image/gif,video/mp4,video/quicktime,video/webm",
  maxImage: 10 * 1024 * 1024,
  maxVideo: 50 * 1024 * 1024,
  quota: { free: 200 * 1024 * 1024, starter: 2 * 1024 ** 3, plus: 10 * 1024 ** 3, pro: 50 * 1024 ** 3 }
};
var EXT_MIME = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", gif: "image/gif", mp4: "video/mp4", mov: "video/quicktime", webm: "video/webm" };

export function fmtBytes(n) {
  if (!n && n !== 0) return "—";
  var u = ["B", "KB", "MB", "GB"], i = 0; n = Number(n);
  while (n >= 1024 && i < u.length - 1) { n /= 1024; i++; }
  return (i ? n.toFixed(n < 10 ? 1 : 0) : n) + " " + u[i];
}
function mimeOf(file) {
  if (file.type && JOSY_MEDIA.types[file.type]) return file.type;
  var ext = (file.name.split(".").pop() || "").toLowerCase();
  return EXT_MIME[ext] || file.type || "";
}
export function checkFile(file) {
  var mime = mimeOf(file);
  if (!JOSY_MEDIA.types[mime]) return { error: "“" + file.name + "” isn't supported. Use JPG, PNG, WEBP, GIF, MP4, MOV or WEBM." };
  var max = mime.indexOf("video/") === 0 ? JOSY_MEDIA.maxVideo : JOSY_MEDIA.maxImage;
  if (file.size > max) return { error: "“" + file.name + "” is " + fmtBytes(file.size) + ". The limit is " + fmtBytes(max) + " for " + (mime.indexOf("video/") === 0 ? "videos" : "images") + "." };
  if (!file.size) return { error: "That file is empty." };
  return { mime: mime };
}
export function mediaError(err) {
  var m = (err && (err.message || err.error || err.details)) || String(err || "");
  if (/quota exceeded/i.test(m)) return "Your media storage is full for your plan. Delete files you don't need or upgrade your plan.";
  if (/too large/i.test(m)) return "That file is over the size limit (images 10 MB, videos 50 MB).";
  if (/not allowed|mime|type/i.test(m)) return "That file type isn't supported.";
  if (/network/i.test(m)) return "Network error during upload. Please try again.";
  return "Upload failed. Please try again.";
}

/* ---------- signed URLs (cached ~50 min) ---------- */
var urlCache = {};
export async function signedUrl(sb, path) {
  var c = urlCache[path];
  if (c && c.exp > Date.now()) return c.url;
  var r = await sb.storage.from("josy-media").createSignedUrl(path, 3600);
  if (r.error || !r.data) return "";
  urlCache[path] = { url: r.data.signedUrl, exp: Date.now() + 50 * 60 * 1000 };
  return r.data.signedUrl;
}
var rowCache = {};
export async function getMedia(sb, id) {
  if (!id) return null;
  if (rowCache[id]) return rowCache[id];
  var r = await sb.from("josy_media").select("id, path, file_name, mime, kind, size_bytes, status, width, height, created_at").eq("id", id).maybeSingle();
  if (r.data) rowCache[id] = r.data;
  return r.data || null;
}
export async function listMedia(sb) {
  var r = await sb.from("josy_media").select("id, path, file_name, mime, kind, size_bytes, status, width, height, created_at").eq("status", "ready").order("created_at", { ascending: false }).limit(200);
  (r.data || []).forEach(function (m) { rowCache[m.id] = m; });
  return r.data || [];
}
export async function usage(sb) { var r = await sb.rpc("josy_media_usage"); return r.data || null; }

function dims(file, mime) {
  return new Promise(function (resolve) {
    var url = URL.createObjectURL(file), done = function (w, h) { URL.revokeObjectURL(url); resolve({ w: w || null, h: h || null }); };
    var t = setTimeout(function () { done(); }, 4000);
    if (mime.indexOf("video/") === 0) { var v = document.createElement("video"); v.preload = "metadata"; v.onloadedmetadata = function () { clearTimeout(t); done(v.videoWidth, v.videoHeight); }; v.onerror = function () { clearTimeout(t); done(); }; v.src = url; }
    else { var i = new Image(); i.onload = function () { clearTimeout(t); done(i.naturalWidth, i.naturalHeight); }; i.onerror = function () { clearTimeout(t); done(); }; i.src = url; }
  });
}

/* Upload: reserve (server checks type, size and quota) → PUT to Storage with progress → confirm (server reads the real size). */
export async function uploadFile(sb, file, onProgress) {
  var chk = checkFile(file);
  if (chk.error) throw new Error(chk.error);
  var res = await sb.rpc("josy_media_reserve", { p_file_name: file.name.slice(0, 200), p_mime: chk.mime, p_size: file.size });
  if (res.error) throw new Error(mediaError(res.error));
  var path = res.data.path, id = res.data.id;
  var sess = await sb.auth.getSession();
  var token = sess.data && sess.data.session ? sess.data.session.access_token : "";
  await new Promise(function (resolve, reject) {
    var x = new XMLHttpRequest();
    x.open("POST", SUPABASE_URL + "/storage/v1/object/josy-media/" + path.split("/").map(encodeURIComponent).join("/"));
    x.setRequestHeader("Authorization", "Bearer " + token);
    x.setRequestHeader("apikey", SUPABASE_ANON_KEY);
    x.setRequestHeader("Content-Type", chk.mime);
    x.setRequestHeader("x-upsert", "false");
    x.setRequestHeader("cache-control", "3600");
    x.upload.onprogress = function (e) { if (e.lengthComputable && onProgress) onProgress(e.loaded / e.total); };
    x.onload = function () { if (x.status >= 200 && x.status < 300) resolve(); else { var m = ""; try { m = JSON.parse(x.responseText).message || ""; } catch (e) { /* ignore */ } reject(new Error(x.status === 413 || /size/i.test(m) ? "That file is over the size limit." : "Upload failed (" + x.status + "). Please try again.")); } };
    x.onerror = function () { reject(new Error("Network error during upload. Please try again.")); };
    x.send(file);
  });
  var d = await dims(file, chk.mime);
  var conf = await sb.rpc("josy_media_confirm", { p_id: id, p_width: d.w, p_height: d.h });
  if (conf.error) throw new Error(mediaError(conf.error));
  rowCache[id] = null;
  return await getMedia(sb, id);
}

/* Delete removes the Storage object first, then the library row (posts/ads keep working; their media link is cleared). */
export async function deleteMedia(sb, m) {
  var r = await sb.storage.from("josy-media").remove([m.path]);
  if (r.error) throw new Error("Couldn't delete the file. Please try again.");
  var d = await sb.from("josy_media").delete().eq("id", m.id);
  if (d.error) throw new Error("File removed, but the library entry couldn't be deleted. Refresh and try again.");
  delete rowCache[m.id]; delete urlCache[m.path];
}

export async function mediaTag(sb, m, cls) {
  if (!m) return "";
  var url = await signedUrl(sb, m.path);
  if (!url) return '<div class="mp-missing">File unavailable</div>';
  return m.kind === "video" ? '<video class="' + (cls || "") + '" src="' + esc(url) + '" muted playsinline controls preload="metadata"></video>' : '<img class="' + (cls || "") + '" src="' + esc(url) + '" alt="' + esc(m.file_name || "") + '" loading="lazy">';
}

/* ---------- picker UI ----------
   mediaPicker(host, { sb, value: media_id, onChange(row|null) }) */
export function mediaPicker(host, o) {
  var S = { id: o.value || null, row: null, busy: false };
  host.classList.add("mp");
  async function render() {
    if (S.busy) return;
    if (S.id && !S.row) S.row = await getMedia(o.sb, S.id);
    if (S.id && S.row) {
      host.innerHTML = '<div class="mp-sel"><div class="mp-thumb">' + (await mediaTag(o.sb, S.row, "")) + '</div><div class="mp-meta"><b title="' + esc(S.row.file_name || "") + '">' + esc(S.row.file_name || "Media") + "</b><span>" + esc(JOSY_MEDIA.types[S.row.mime] || "") + " · " + fmtBytes(S.row.size_bytes) + (S.row.width ? " · " + S.row.width + "×" + S.row.height : "") +
        '</span><div class="mp-acts"><button type="button" class="btn btn-sm btn-ghost" data-mp-replace style="margin:0">Replace</button><button type="button" class="btn btn-sm btn-ghost" data-mp-detach style="margin:0">Remove</button><button type="button" class="btn btn-sm btn-ghost" data-mp-del style="margin:0;color:var(--red)">Delete file</button></div></div></div>';
      host.querySelector("[data-mp-replace]").onclick = function () { S.id = null; S.row = null; render(); };
      host.querySelector("[data-mp-detach]").onclick = function () { S.id = null; S.row = null; o.onChange && o.onChange(null); render(); };
      host.querySelector("[data-mp-del]").onclick = async function () {
        if (!(await confirmDialog("Delete this file?", "It will be permanently removed from your media library and from any post or ad that uses it.", "Delete"))) return;
        try { await deleteMedia(o.sb, S.row); S.id = null; S.row = null; o.onChange && o.onChange(null); toast("File deleted"); render(); } catch (e) { toast(e.message); }
      };
      return;
    }
    if (S.id && !S.row) { S.id = null; }
    host.innerHTML = '<label class="mp-drop" tabindex="0"><input type="file" accept="' + JOSY_MEDIA.accept + '" hidden data-mp-file>' +
      '<span class="mp-ico"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 16V4"/><path d="M7 9l5-5 5 5"/><path d="M5 20h14"/></svg></span>' +
      '<b>Drop an image or video, or <u>choose a file</u></b><span>JPG, PNG, WEBP, GIF up to 10 MB · MP4, MOV, WEBM up to 50 MB</span></label>' +
      '<div class="mp-row"><button type="button" class="btn btn-sm btn-ghost" data-mp-lib style="margin:0">Choose from library</button><span class="mp-quota" data-mp-quota></span></div><div class="mp-lib" data-mp-libbox hidden></div>';
    var drop = host.querySelector(".mp-drop"), inp = host.querySelector("[data-mp-file]");
    inp.onchange = function () { if (inp.files && inp.files[0]) doUpload(inp.files[0]); };
    drop.addEventListener("keydown", function (e) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); inp.click(); } });
    ["dragenter", "dragover"].forEach(function (ev) { drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.add("over"); }); });
    ["dragleave", "drop"].forEach(function (ev) { drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.remove("over"); }); });
    drop.addEventListener("drop", function (e) { var f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]; if (f) doUpload(f); });
    host.querySelector("[data-mp-lib]").onclick = openLib;
    usage(o.sb).then(function (u) { var q = host.querySelector("[data-mp-quota]"); if (q && u) q.innerHTML = '<i style="--p:' + Math.min(100, Math.round(u.used / u.quota * 100)) + '%"></i>' + fmtBytes(u.used) + " of " + fmtBytes(u.quota) + " used"; });
  }
  async function openLib() {
    var box = host.querySelector("[data-mp-libbox]");
    if (!box.hidden) { box.hidden = true; return; }
    box.hidden = false; box.innerHTML = '<p class="fine">Loading your media…</p>';
    var rows = await listMedia(o.sb);
    if (!rows.length) { box.innerHTML = '<p class="fine">Your media library is empty — upload a file above.</p>'; return; }
    var tiles = await Promise.all(rows.map(async function (m) {
      var url = await signedUrl(o.sb, m.path);
      return '<button type="button" class="mp-tile" data-pick="' + m.id + '" title="' + esc(m.file_name || "") + '">' + (m.kind === "video" ? '<video src="' + esc(url) + '#t=0.1" muted preload="metadata"></video><span class="mp-badge">VIDEO</span>' : '<img src="' + esc(url) + '" alt="" loading="lazy">') + "</button>";
    }));
    box.innerHTML = '<div class="mp-grid">' + tiles.join("") + "</div>";
    box.querySelectorAll("[data-pick]").forEach(function (b) { b.onclick = function () { S.id = b.getAttribute("data-pick"); S.row = rowCache[S.id] || null; o.onChange && o.onChange(S.row); render(); }; });
  }
  async function doUpload(file) {
    var chk = checkFile(file);
    if (chk.error) { toast(chk.error); return; }
    S.busy = true;
    var local = URL.createObjectURL(file);
    host.innerHTML = '<div class="mp-sel uploading"><div class="mp-thumb">' + (chk.mime.indexOf("video/") === 0 ? '<video src="' + local + '" muted playsinline></video>' : '<img src="' + local + '" alt="">') + '</div><div class="mp-meta"><b>' + esc(file.name) + "</b><span>" + fmtBytes(file.size) + ' · uploading…</span><div class="mp-prog"><i data-mp-bar></i></div></div></div>';
    var bar = host.querySelector("[data-mp-bar]");
    try {
      var row = await uploadFile(o.sb, file, function (p) { if (bar) bar.style.width = Math.round(p * 100) + "%"; });
      S.id = row.id; S.row = row; S.busy = false; URL.revokeObjectURL(local);
      o.onChange && o.onChange(row); toast("Uploaded"); render();
    } catch (e) { S.busy = false; URL.revokeObjectURL(local); toast(e.message || "Upload failed"); render(); }
  }
  render();
  return { get: function () { return S.id; }, set: function (id) { S.id = id; S.row = null; render(); } };
}
