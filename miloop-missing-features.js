import { auth, db } from "./firebase.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import {
  addDoc, collection, deleteDoc, doc, getDoc, getDocs, limit, orderBy,
  query, serverTimestamp, setDoc, updateDoc, where
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

const $ = id => document.getElementById(id);
let user = null;
let settings = { dataSaver: false, defaultAudience: "public", mutedWords: [] };
const style = document.createElement("style");
style.textContent = `
#miloopToolsButton{border:1px solid #dce6f5;background:#fff;color:#155eef;border-radius:10px;padding:9px 12px;font-weight:700;font-size:11px;cursor:pointer}
#miloopTools{position:fixed;z-index:1200;inset:0;background:#10182866;display:none;align-items:flex-start;justify-content:center;padding:7vh 12px 20px;overflow:auto}
#miloopTools.open{display:flex}#miloopTools .tools-card{width:min(560px,100%);max-height:86vh;overflow:auto;background:#fff;border-radius:18px;padding:18px;box-shadow:0 20px 70px #10182840}
#miloopTools .tools-head{display:flex;align-items:center;justify-content:space-between;gap:12px}#miloopTools h2{font-size:17px;margin:0;color:#17233d}
#miloopTools .tools-close{border:0;border-radius:50%;width:34px;height:34px;background:#eef2f8;font-size:22px;color:#53627a}
#miloopTools .tools-section{border-top:1px solid #edf0f5;padding:13px 0}#miloopTools h3{font-size:13px;color:#243653;margin:0 0 8px}
#miloopTools p,#miloopTools small{font-size:10px;line-height:1.5;color:#7d899d}
#miloopTools input,#miloopTools textarea,#miloopTools select{box-sizing:border-box;width:100%;border:1px solid #dce4ef;border-radius:9px;padding:10px;margin:5px 0;font:12px inherit;color:#243653;background:#fff}
#miloopTools textarea{min-height:65px}#miloopTools button.tool-action{border:0;border-radius:8px;background:#155eef;color:white;padding:9px 12px;font-size:11px;font-weight:700;margin:4px 5px 4px 0;cursor:pointer}
#miloopTools button.tool-secondary{background:#eef4ff;color:#155eef}#miloopTools button:disabled{opacity:.55}
#miloopTools .tool-row{border-top:1px solid #edf0f5;padding:9px 0;font-size:11px;color:#243653;overflow-wrap:anywhere}
html.miloop-data-saver video{background:#111827}
`;
document.head.append(style);

const modal = document.createElement("div");
modal.id = "miloopTools";
modal.innerHTML = '<div class="tools-card" role="dialog" aria-modal="true" aria-label="MILOOP tools"><div class="tools-head"><div><h2>MILOOP Tools</h2><small>Account, privacy and creator tools</small></div><button class="tools-close" id="miloopToolsClose" type="button" aria-label="Close">×</button></div><div id="miloopToolsBody"></div></div>';
document.body.append(modal);

function toast(message) {
  const el = $("toast");
  if (el) { el.textContent = message; el.classList.add("show"); setTimeout(() => el.classList.remove("show"), 2800); }
}
function esc(v) { return String(v ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c])); }
function requireUser() {
  if (user) return true;
  $("authOpen")?.click(); toast("Sign in to use MILOOP Tools."); return false;
}
function openTools() { if (!requireUser()) return; modal.classList.add("open"); renderTools(); }
function closeTools() { modal.classList.remove("open"); }
$("miloopToolsClose").addEventListener("click", closeTools);
modal.addEventListener("click", e => { if (e.target === modal) closeTools(); });
document.addEventListener("keydown", e => { if (e.key === "Escape") closeTools(); });

// Tools shortcut removed from the header as requested.
document.getElementById("miloopToolsButton")?.remove();

async function loadSettings() {
  if (!user) return;
  try {
    const snap = await getDoc(doc(db, "memberSettings", user.uid));
    if (snap.exists()) settings = { ...settings, ...snap.data() };
  } catch (e) { console.warn("MILOOP settings load:", e); }
  applyPreferences();
}
function applyPreferences() {
  document.documentElement.classList.toggle("miloop-data-saver", !!settings.dataSaver);
  const videos = document.querySelectorAll("video");
  videos.forEach(v => { if (settings.dataSaver) { v.preload = "none"; v.autoplay = false; } });
  applyMutedWords();
}
function applyMutedWords() {
  const words = (settings.mutedWords || []).map(x => String(x).toLocaleLowerCase()).filter(Boolean);
  document.querySelectorAll("#posts .post").forEach(post => {
    const text = (post.innerText || "").toLocaleLowerCase();
    post.hidden = words.some(word => text.includes(word));
  });
}
const feedObserver = new MutationObserver(() => { if (settings.dataSaver) applyPreferences(); if (settings.mutedWords?.length) applyMutedWords(); });
feedObserver.observe(document.body, { childList: true, subtree: true });

function renderTools() {
  const body = $("miloopToolsBody");
  body.innerHTML = `
    <section class="tools-section"><h3>Post drafts</h3><p>Save a text draft privately and continue editing it later.</p><textarea id="toolDraftText" maxlength="1000" placeholder="Write your draft…"></textarea><button class="tool-action" id="toolSaveDraft">Save draft</button><div id="toolDraftList" class="tool-row">Loading drafts…</div></section>
    <section class="tools-section"><h3>Privacy & feed preferences</h3><label><input id="toolDataSaver" type="checkbox" style="width:auto"> Data Saver Mode (reduce video loading)</label><label>Default audience<select id="toolAudience"><option value="public">Public</option><option value="followers">Followers</option><option value="private">Only me</option></select></label><label>Muted words (comma separated)<input id="toolMutedWords" maxlength="600" placeholder="word1, word2"></label><button class="tool-action" id="toolSaveSettings">Save preferences</button></section>
    <section class="tools-section"><h3>Report content or an account</h3><p>Send a report to the moderation team. Add the post ID or member Profile ID.</p><select id="toolReportType"><option value="post">Post</option><option value="user">Member account</option></select><input id="toolReportTarget" maxlength="120" placeholder="Post ID or Profile ID"><textarea id="toolReportReason" maxlength="300" placeholder="Explain the issue (max 300 characters)"></textarea><button class="tool-action" id="toolSendReport">Submit report</button><div id="toolReportStatus"></div></section>
    <section class="tools-section"><h3>Profile verification</h3><p>Request review for a genuine public profile. Never submit passwords or private documents here.</p><textarea id="toolVerifyReason" maxlength="300" placeholder="Why should this profile be verified? (10–300 characters)"></textarea><button class="tool-action" id="toolVerifyRequest">Request verification</button><div id="toolVerifyStatus"></div></section>
    <section class="tools-section"><h3>Story Highlights</h3><p>Save links to your own stories in a named highlight collection. Expired stories may no longer open.</p><input id="toolHighlightTitle" maxlength="40" placeholder="Highlight name"><div id="toolMyStories">Loading your recent stories…</div><button class="tool-action" id="toolCreateHighlight">Create highlight</button><div id="toolHighlightList"></div></section>
    <section class="tools-section" id="toolAdminSection" hidden><h3>Moderation queue</h3><p>Visible only to accounts authorized as MILOOP administrators.</p><div id="toolAdminReports">Checking admin access…</div><h3 style="margin-top:12px">Verification requests</h3><div id="toolAdminVerifications"></div></section>`;
  $("toolDataSaver").checked = !!settings.dataSaver;
  $("toolAudience").value = settings.defaultAudience || "public";
  $("toolMutedWords").value = (settings.mutedWords || []).join(", ");
  bindDrafts(); bindSettings(); bindReports(); bindVerification(); bindHighlights(); checkAdmin();
}
async function bindDrafts() {
  const list = $("toolDraftList");
  try {
    const snap = await getDocs(query(collection(db, "users", user.uid, "drafts"), orderBy("updatedAt", "desc"), limit(20)));
    list.innerHTML = snap.empty ? "No saved drafts." : snap.docs.map(d => '<div class="tool-row"><b>'+esc(d.data().text.slice(0,90))+'</b><br><small>'+esc(d.data().updatedAt?.toDate?.().toLocaleString?.() || "Saved")+'</small><br><button class="tool-action tool-secondary" data-draft-load="'+esc(d.id)+'">Continue</button><button class="tool-action tool-secondary" data-draft-delete="'+esc(d.id)+'">Delete</button></div>').join("");
    list.querySelectorAll("[data-draft-load]").forEach(b => b.onclick = () => { $("toolDraftText").value = snap.docs.find(d=>d.id===b.dataset.draftLoad)?.data().text || ""; $("toolDraftText").focus(); });
    list.querySelectorAll("[data-draft-delete]").forEach(b => b.onclick = async () => { try { await deleteDoc(doc(db,"users",user.uid,"drafts",b.dataset.draftDelete)); bindDrafts(); } catch(e) { toast("Could not delete draft: "+(e.code||e.message)); } });
  } catch(e) { list.textContent = "Drafts unavailable: "+(e.code||e.message)+". Publish the latest Firestore Rules."; }
  $("toolSaveDraft").onclick = async () => {
    const text = $("toolDraftText").value.trim(); if (!text) { toast("Write something first."); return; }
    try { await addDoc(collection(db,"users",user.uid,"drafts"),{uid:user.uid,text:text.slice(0,1000),updatedAt:serverTimestamp()}); $("toolDraftText").value=""; toast("Draft saved privately."); bindDrafts(); }
    catch(e) { toast("Draft save failed: "+(e.code||e.message)); }
  };
}
function bindSettings() {
  $("toolSaveSettings").onclick = async () => {
    const next = { uid:user.uid, dataSaver:$("toolDataSaver").checked, defaultAudience:$("toolAudience").value, mutedWords:$("toolMutedWords").value.split(",").map(x=>x.trim()).filter(Boolean).slice(0,30), updatedAt:serverTimestamp() };
    try { await setDoc(doc(db,"memberSettings",user.uid),next,{merge:true}); settings={...settings,...next}; applyPreferences(); toast("Preferences saved."); }
    catch(e) { toast("Could not save preferences: "+(e.code||e.message)); }
  };
}
function bindReports() {
  $("toolSendReport").onclick = async () => {
    const targetId=$("toolReportTarget").value.trim(), reason=$("toolReportReason").value.trim(), targetType=$("toolReportType").value;
    if(!targetId||!reason){toast("Enter the target ID and reason.");return;}
    try { await addDoc(collection(db,"reports"),{reporterUid:user.uid,targetType,targetId,reason:reason.slice(0,300),status:"open",createdAt:serverTimestamp()}); $("toolReportStatus").textContent="Report submitted. Thank you."; $("toolReportTarget").value=""; $("toolReportReason").value=""; }
    catch(e) { toast("Report failed: "+(e.code||e.message)); }
  };
}
async function bindVerification() {
  const status=$("toolVerifyStatus");
  try {
    const snap=await getDoc(doc(db,"verificationRequests",user.uid));
    if(snap.exists()) status.textContent="Current request: "+(snap.data().status||"pending");
  } catch(e) { status.textContent="Status unavailable."; }
  $("toolVerifyRequest").onclick = async () => {
    const reason=$("toolVerifyReason").value.trim(); if(reason.length<10){toast("Please write at least 10 characters.");return;}
    try { await setDoc(doc(db,"verificationRequests",user.uid),{uid:user.uid,reason:reason.slice(0,300),status:"pending",createdAt:serverTimestamp()}); status.textContent="Request submitted for review."; toast("Verification request sent."); }
    catch(e) { toast("Request failed: "+(e.code||e.message)); }
  };
}
async function bindHighlights() {
  const storyBox=$("toolMyStories"), list=$("toolHighlightList");
  let selected = new Set();
  try {
    const snap=await getDocs(query(collection(db,"stories"),where("uid","==",user.uid),orderBy("createdAt","desc"),limit(20)));
    const stories=snap.docs;
    storyBox.innerHTML=stories.length?stories.map(d=>'<label class="tool-row" style="display:block"><input type="checkbox" value="'+esc(d.id)+'" style="width:auto" data-highlight-story>'+esc(d.data().text||"Story with media")+' <small>'+esc(d.data().createdAt?.toDate?.().toLocaleDateString?.()||"")+'</small></label>').join(""):"No recent stories found.";
    storyBox.querySelectorAll("[data-highlight-story]").forEach(c=>c.onchange=()=>{if(c.checked)selected.add(c.value);else selected.delete(c.value);});
  } catch(e) { storyBox.textContent="Could not load stories: "+(e.code||e.message); }
  try {
    const snap=await getDocs(query(collection(db,"storyHighlights"),where("uid","==",user.uid),orderBy("createdAt","desc"),limit(20)));
    list.innerHTML=snap.empty?"No highlights yet.":snap.docs.map(d=>'<div class="tool-row"><b>'+esc(d.data().title)+'</b><small> · '+(d.data().storyIds||[]).length+' stories</small><button class="tool-action tool-secondary" data-highlight-delete="'+esc(d.id)+'">Delete</button></div>').join("");
    list.querySelectorAll("[data-highlight-delete]").forEach(b=>b.onclick=async()=>{try{await deleteDoc(doc(db,"storyHighlights",b.dataset.highlightDelete));bindHighlights();}catch(e){toast("Delete failed: "+(e.code||e.message));}});
  } catch(e) { list.textContent="Highlights unavailable: "+(e.code||e.message)+". Publish the latest Firestore Rules."; }
  $("toolCreateHighlight").onclick=async()=>{
    const title=$("toolHighlightTitle").value.trim(), storyIds=[...selected];
    if(title.length<2||!storyIds.length){toast("Add a name and select at least one story.");return;}
    try{await addDoc(collection(db,"storyHighlights"),{uid:user.uid,title:title.slice(0,40),storyIds:storyIds.slice(0,20),createdAt:serverTimestamp()});toast("Story highlight created.");$("toolHighlightTitle").value="";bindHighlights();}
    catch(e){toast("Highlight creation failed: "+(e.code||e.message));}
  };
}
async function checkAdmin() {
  const section=$("toolAdminSection");
  try {
    const admin=await getDoc(doc(db,"admins",user.uid));
    if(!admin.exists()||admin.data().enabled!==true||admin.data().role!=="admin"){section.hidden=true;return;}
    section.hidden=false;
    const reports=await getDocs(query(collection(db,"reports"),where("status","==","open"),limit(40)));
    $("toolAdminReports").innerHTML=reports.empty?"No open reports.":reports.docs.map(d=>'<div class="tool-row"><b>'+esc(d.data().targetType)+' · '+esc(d.data().targetId)+'</b><p>'+esc(d.data().reason)+'</p><small>Report '+esc(d.id)+'</small><br><button class="tool-action" data-report-review="'+esc(d.id)+'">Mark reviewed</button><button class="tool-action tool-secondary" data-report-action="'+esc(d.id)+'">Action taken</button></div>').join("");
    section.querySelectorAll("[data-report-review],[data-report-action]").forEach(b=>b.onclick=async()=>{try{await updateDoc(doc(db,"reports",b.dataset.reportReview||b.dataset.reportAction),{status:b.hasAttribute("data-report-review")?"reviewed":"action_taken",reviewedBy:user.uid,reviewedAt:serverTimestamp()});checkAdmin();}catch(e){toast("Moderation update failed: "+(e.code||e.message));}});
    const vr=await getDocs(query(collection(db,"verificationRequests"),where("status","==","pending"),limit(30)));
    $("toolAdminVerifications").innerHTML=vr.empty?"No pending requests.":vr.docs.map(d=>'<div class="tool-row"><b>'+esc(d.id)+'</b><p>'+esc(d.data().reason)+'</p><button class="tool-action" data-verify-approve="'+esc(d.id)+'">Approve</button><button class="tool-action tool-secondary" data-verify-reject="'+esc(d.id)+'">Reject</button></div>').join("");
    section.querySelectorAll("[data-verify-approve],[data-verify-reject]").forEach(b=>b.onclick=async()=>{try{await updateDoc(doc(db,"verificationRequests",b.dataset.verifyApprove||b.dataset.verifyReject),{status:b.hasAttribute("data-verify-approve")?"approved":"rejected",reviewedBy:user.uid,reviewedAt:serverTimestamp()});checkAdmin();}catch(e){toast("Verification review failed: "+(e.code||e.message));}});
  } catch(e) { section.hidden=true; console.warn("Admin tools unavailable:",e); }
}
onAuthStateChanged(auth, async next => {
  user=next;
  if(user) await loadSettings();
  else { settings={dataSaver:false,defaultAudience:"public",mutedWords:[]};applyPreferences(); }
});
