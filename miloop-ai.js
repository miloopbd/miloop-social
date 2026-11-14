import { auth, db } from "./firebase.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import {
  collection, addDoc, updateDoc, deleteDoc, doc, query, orderBy,
  onSnapshot, getDocs, limit, serverTimestamp, writeBatch
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import { MILOOP_AI_API_URL } from "./miloop-ai-config.js";

const $ = id => document.getElementById(id);
const form = $("promptForm");
const input = $("promptInput");
const messagesEl = $("messages");
const welcome = $("welcomeScreen");
let user = null, chats = [], activeChatId = null, activeMessages = [], stopChats = null, stopMessages = null, busy = false, toastTimer;

function toast(message) {
  const el = $("aiToast"); el.textContent = message; el.classList.add("show");
  clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove("show"), 2800);
}
function showWelcome(show) {
  welcome.style.display = show ? "block" : "none";
  messagesEl.classList.toggle("visible", !show);
}
function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
}
function renderMessages() {
  messagesEl.innerHTML = activeMessages.map(m => {
    const role = m.role === "user" ? "user" : "assistant";
    const label = role === "user" ? "You" : "MILOOP AI";
    const avatar = role === "user" ? escapeHTML((user?.displayName || user?.email || "U").slice(0,1).toUpperCase()) : "✦";
    return '<article class="ai-message '+role+'"><div class="ai-message-avatar">'+avatar+'</div><div class="ai-message-body"><div class="ai-message-name">'+label+'</div><div class="ai-message-text">'+escapeHTML(m.text).replace(/\n/g,"<br>")+'</div></div></article>';
  }).join("");
  messagesEl.scrollTop = messagesEl.scrollHeight;
  showWelcome(activeMessages.length === 0);
}
function renderHistory() {
  const el = $("chatHistory");
  if (!chats.length) { el.innerHTML = '<div class="ai-history-empty">Your chats will appear here.</div>'; return; }
  el.innerHTML = chats.map(c => '<div class="ai-history-item '+(c.id===activeChatId?"active":"")+'"><button class="ai-history-open" data-open-chat="'+escapeHTML(c.id)+'" title="'+escapeHTML(c.title||"New chat")+'">'+escapeHTML(c.title||"New chat")+'</button><button class="ai-history-delete" data-delete-chat="'+escapeHTML(c.id)+'" aria-label="Delete chat" title="Delete chat">×</button></div>').join("");
}
function listenMessages(chatId) {
  if (stopMessages) stopMessages();
  activeMessages = [];
  renderMessages();
  stopMessages = onSnapshot(query(collection(db,"users",user.uid,"aiChats",chatId,"messages"),orderBy("createdAt","asc"),limit(100)), snap => {
    activeMessages = snap.docs.map(d => ({id:d.id,...d.data()}));
    renderMessages();
  }, err => toast("Could not load chat history: "+err.message));
}
function startNewChat() {
  activeChatId = null;
  if (stopMessages) { stopMessages(); stopMessages = null; }
  activeMessages = [];
  renderHistory();
  renderMessages();
  input.focus();
}
async function openChat(chatId) {
  if (!user) return;
  activeChatId = chatId;
  renderHistory();
  listenMessages(chatId);
  input.focus();
}
async function createChat(title) {
  const ref = await addDoc(collection(db,"users",user.uid,"aiChats"), {
    title: title.slice(0,70), createdAt: serverTimestamp(), updatedAt: serverTimestamp()
  });
  activeChatId = ref.id;
  return ref.id;
}
function setBusy(value) {
  busy = value;
  $("sendButton").disabled = value;
  $("sendButton").textContent = value ? "…" : "↑";
  input.disabled = value;
}
async function sendPrompt(raw) {
  const prompt = String(raw||"").trim();
  if (!prompt || busy || !user) return;
  if (!MILOOP_AI_API_URL || MILOOP_AI_API_URL.includes("PASTE_CLOUDFLARE")) {
    toast("MILOOP AI backend setup is not finished yet.");
    return;
  }
  setBusy(true);
  input.value = "";
  input.style.height = "auto";
  let chatId = activeChatId;
  try {
    if (!chatId) chatId = await createChat(prompt);
    const history = activeMessages.slice(-16).map(m => ({
      role: m.role === "assistant" ? "model" : "user", text: m.text
    }));
    const token = await user.getIdToken();
    const response = await fetch(MILOOP_AI_API_URL.replace(/\/$/,"")+"/", {
      method: "POST",
      headers: { "Content-Type":"application/json", "Authorization":"Bearer "+token },
      body: JSON.stringify({ prompt, history })
    });
    const data = await response.json().catch(()=>({}));
    if (!response.ok) throw new Error(data.error || "MILOOP AI could not respond. Please try again.");
    const messagesRef = collection(db,"users",user.uid,"aiChats",chatId,"messages");
    await addDoc(messagesRef,{role:"user",text:prompt,createdAt:serverTimestamp()});
    await addDoc(messagesRef,{role:"assistant",text:data.answer,model:data.model||"Gemini",createdAt:serverTimestamp()});
    await updateDoc(doc(db,"users",user.uid,"aiChats",chatId),{
      title: (chats.find(c=>c.id===chatId)?.title || prompt).slice(0,70),
      updatedAt:serverTimestamp()
    });
  } catch (error) {
    console.error("MILOOP AI:",error);
    toast(error.message || "Something went wrong. Please try again.");
    if (!activeMessages.length && chatId && !chats.some(c=>c.id===chatId)) {
      try { await deleteDoc(doc(db,"users",user.uid,"aiChats",chatId)); } catch {}
      activeChatId = null;
    }
  } finally {
    setBusy(false);
    input.focus();
  }
}
async function deleteChat(chatId) {
  if (!user || !confirm("Delete this conversation permanently?")) return;
  try {
    const ref = collection(db,"users",user.uid,"aiChats",chatId,"messages");
    const snap = await getDocs(query(ref,limit(450)));
    const batch = writeBatch(db);
    snap.docs.forEach(d=>batch.delete(d.ref));
    batch.delete(doc(db,"users",user.uid,"aiChats",chatId));
    await batch.commit();
    if (activeChatId===chatId) startNewChat();
    toast("Conversation deleted.");
  } catch(e) { toast("Could not delete conversation: "+e.message); }
}
function bindUI() {
  $("newChat").addEventListener("click",startNewChat);
  $("mobileNewChat").addEventListener("click",startNewChat);
  $("chatHistory").addEventListener("click",e=>{
    const open=e.target.closest("[data-open-chat]");
    const del=e.target.closest("[data-delete-chat]");
    if(open) openChat(open.dataset.openChat);
    if(del) deleteChat(del.dataset.deleteChat);
  });
  document.querySelectorAll("[data-prompt]").forEach(b=>b.addEventListener("click",()=>{input.value=b.dataset.prompt;sendPrompt(input.value)}));
  form.addEventListener("submit",e=>{e.preventDefault();sendPrompt(input.value)});
  input.addEventListener("input",()=>{input.style.height="auto";input.style.height=Math.min(input.scrollHeight,160)+"px"});
  input.addEventListener("keydown",e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();form.requestSubmit()}});
}
bindUI();
onAuthStateChanged(auth, u => {
  user=u;
  if(stopChats){stopChats();stopChats=null;}
  if(stopMessages){stopMessages();stopMessages=null;}
  if(!u){$("authNotice").hidden=false;$("newChat").disabled=true;return;}
  $("authNotice").hidden=true;
  stopChats=onSnapshot(query(collection(db,"users",u.uid,"aiChats"),orderBy("updatedAt","desc"),limit(60)),snap=>{
    chats=snap.docs.map(d=>({id:d.id,...d.data()}));
    renderHistory();
    if(activeChatId && !chats.some(c=>c.id===activeChatId)) startNewChat();
  },err=>toast("Could not load chat list: "+err.message));
});
