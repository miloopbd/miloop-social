import { auth, db } from "./firebase.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import { collection, getDocs, query, orderBy, limit } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

const escapeHtml = value => String(value ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const panel = document.querySelector(".right .panel");
if (panel && !document.getElementById("miloopTrendingLive")) {
  const oldRows = panel.querySelectorAll(".trend");
  oldRows.forEach(row => row.remove());
  const live = document.createElement("div");
  live.id = "miloopTrendingLive";
  live.innerHTML = '<p class="trend-loading">Loading community trends…</p>';
  const explore = panel.querySelector("#explore");
  if (explore) explore.before(live); else panel.append(live);
  const style = document.createElement("style");
  style.textContent = "#miloopTrendingLive .trend{display:flex;gap:10px;align-items:flex-start;padding:9px 0;border-bottom:1px solid #edf0f5}#miloopTrendingLive .trend>small{color:#155eef;font-weight:800;min-width:20px}#miloopTrendingLive .trend b{display:block;font-size:11px;color:#243653;overflow-wrap:anywhere}#miloopTrendingLive .trend span{display:block;font-size:9px;color:#8995a8;margin-top:3px}.trend-loading{font-size:10px;color:#8995a8}";
  document.head.append(style);
  let loaded = false;
  onAuthStateChanged(auth, async user => {
    if (!user || loaded) return;
    loaded = true;
    try {
      const snap = await getDocs(query(collection(db, "posts"), orderBy("createdAt", "desc"), limit(80)));
      const counts = new Map();
      snap.docs.forEach(d => {
        const text = d.data().text || "";
        const tags = text.match(/#[\p{L}\p{N}_]{2,30}/gu) || [];
        tags.forEach(tag => {
          const key = tag.toLowerCase();
          const entry = counts.get(key) || { tag, count: 0 };
          entry.count++;
          counts.set(key, entry);
        });
      });
      const top = [...counts.values()].sort((a,b) => b.count-a.count).slice(0,5);
      const rows = top.length
        ? top.map((x,i) => '<div class="trend"><small>'+String(i+1).padStart(2,"0")+'</small><div><b>'+escapeHtml(x.tag)+'</b><span>'+x.count+' recent posts</span></div></div>').join("")
        : snap.docs.slice(0,5).map((d,i) => {const p=d.data();return '<div class="trend"><small>'+String(i+1).padStart(2,"0")+'</small><div><b>'+escapeHtml((p.text||"Community post").slice(0,48))+'</b><span>'+Number(p.likeCount||0)+' reactions</span></div></div>';}).join("");
      live.innerHTML = rows || '<p class="trend-loading">No community trends yet. Be the first to post!</p>';
    } catch (error) {
      console.warn("MILOOP trends unavailable:", error);
      live.innerHTML = '<p class="trend-loading">Community trends will appear when posts are available.</p>';
    }
  });
}
