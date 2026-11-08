import { auth, db } from "./firebase.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import {
  collection, doc, getDoc, getDocs, addDoc, setDoc, updateDoc,
  query, orderBy, limit, where, serverTimestamp, deleteDoc
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

const $ = id => document.getElementById(id);
const esc = v => String(v ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
let user = null, admin = false;
const panel = document.createElement("section");
panel.id = "miloopDiscover";
panel.innerHTML = '<div class="md-head"><div><small>MILOOP COMMUNITY</small><h2>Discover</h2></div><button type="button" id="mdClose" aria-label="Close">×</button></div><div class="md-tabs" id="mdTabs"></div><div id="mdContent">Loading…</div>';
document.body.append(panel);
const css = document.createElement("style");
css.textContent = `
#miloopDiscover{display:none;position:fixed;z-index:100;inset:4vh max(12px,calc((100vw - 760px)/2));max-height:92vh;overflow:auto;background:#fff;color:#17233d;border:1px solid #e5ebf5;border-radius:20px;box-shadow:0 24px 80px #13264a35;padding:20px;font-family:'DM Sans',sans-serif}
#miloopDiscover.open{display:block}.md-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:14px}.md-head small{font-size:9px;font-weight:800;letter-spacing:1.4px;color:#155eef}.md-head h2{font-size:22px;margin:4px 0}.md-head>button{border:0;border-radius:50%;width:34px;height:34px;font-size:22px;background:#f0f4fa;color:#52627d}
.md-tabs{display:flex;gap:7px;overflow:auto;padding:3px 0 13px}.md-tabs button{white-space:nowrap;border:1px solid #e1e8f2;background:#f7f9fc;color:#52627d;border-radius:20px;padding:8px 12px;font:700 10px 'DM Sans';cursor:pointer}.md-tabs button.active{background:#155eef;color:#fff;border-color:#155eef}
.md-card{border:1px solid #e7edf5;border-radius:13px;padding:14px;margin:9px 0;background:#fff}.md-card h3{font-size:14px;margin:0 0 7px}.md-card p{font-size:11px;line-height:1.6;color:#61708a;white-space:pre-wrap;overflow-wrap:anywhere}.md-muted{font-size:10px;color:#8b97aa}.md-form input,.md-form textarea{box-sizing:border-box;width:100%;padding:11px;border:1px solid #dfe7f2;border-radius:9px;margin:6px 0;font:12px 'DM Sans';background:#fff;color:#17233d}.md-form textarea{min-height:75px;resize:vertical}.md-btn{border:0;border-radius:9px;background:#155eef;color:#fff;padding:10px 14px;font:700 11px 'DM Sans';cursor:pointer;margin:5px 5px 5px 0}.md-btn.alt{background:#edf3ff;color:#155eef}.md-btn:disabled{opacity:.55}.md-row{display:flex;gap:8px;align-items:center;justify-content:space-between;border-top:1px solid #eef1f6;padding:10px 0;font-size:11px}.md-row>div{min-width:0;flex:1}.md-empty{padding:18px;text-align:center;color:#8995a8;font-size:11px}.md-badge{display:inline-block;border-radius:20px;background:#eaf8ef;color:#187044;padding:4px 8px;font-size:9px;font-weight:800}
.md-post{background:#f7f9fc;border-radius:10px;padding:10px;margin:7px 0}.md-post p{margin:0;color:#344563}.md-shortcuts{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px}.md-shortcut{border:1px solid #e7edf5;background:#f9fbff;border-radius:12px;padding:14px;text-align:left;cursor:pointer;color:#17233d}.md-shortcut b{display:block;font-size:12px}.md-shortcut small{display:block;color:#7d899d;font-size:10px;margin-top:5px}
@media(max-width:600px){#miloopDiscover{inset:8px;max-height:calc(100dvh - 16px);padding:14px;border-radius:15px}.md-head h2{font-size:19px}.md-shortcuts{grid-template-columns:1fr}}
`;
css.textContent += "\n.md-group-post{padding:14px!important;border:1px solid #e7edf5!important}.md-group-post-head{display:flex;justify-content:space-between;align-items:center}.md-group-post-head small{display:block;font-size:10px}.md-group-more{border:0;background:transparent;color:#71809a;font-size:20px}.md-group-post-text{white-space:pre-wrap;overflow-wrap:anywhere;color:#26364d;font-size:13px;line-height:1.6;margin:12px 0}.md-group-stats{display:flex;justify-content:space-between;border-bottom:1px solid #e8edf5;padding:8px 0}.md-group-stats button{border:0;background:none;color:#71809a;font-size:10px;cursor:pointer}.md-group-actions{display:flex;align-items:center;gap:4px;padding-top:7px}.md-group-action{flex:1;border:0;background:transparent;border-radius:8px;padding:10px 4px;color:#65738a;font:600 11px 'DM Sans';cursor:pointer}.md-group-action:hover,.md-group-action.active{background:#edf3ff;color:#155eef}.md-group-reaction-wrap{position:relative;flex:1;display:flex}.md-group-reaction-wrap>.md-group-action{width:100%}.md-group-reaction-picker{position:absolute;z-index:4;bottom:44px;left:0;display:flex;gap:4px;padding:7px;background:#fff;border:1px solid #e4eaf2;border-radius:30px;box-shadow:0 5px 22px #17233d20}.md-group-reaction-picker[hidden],.md-post-menu[hidden],.md-group-comments[hidden]{display:none}.md-group-reaction-picker button{border:0;background:transparent;font-size:21px;padding:4px;cursor:pointer}.md-group-comments{border-top:1px solid #e8edf5;margin-top:9px;padding-top:10px}.md-group-comment-list{max-height:300px;overflow:auto}.md-group-comment{padding:9px 0;border-bottom:1px solid #edf0f5}.md-group-comment p{margin:4px 0;white-space:pre-wrap;font-size:12px}.md-group-comment small{color:#8995a8;font-size:10px}.md-group-comment button{border:0;background:none;color:#155eef;font-size:10px}.md-group-comment-form{display:flex;gap:7px;margin-top:10px}.md-group-comment-form input{min-width:0;flex:1;border:1px solid #dce4ef;border-radius:9px;padding:10px;font:12px 'DM Sans'}.md-group-comment-form button{border:0;background:#155eef;color:#fff;border-radius:9px;padding:0 14px;font-weight:700}.md-group-reaction-dialog{border:0;border-radius:16px;padding:0;width:min(420px,calc(100% - 28px));box-shadow:0 15px 50px #17233d30}.md-group-reaction-dialog::backdrop{background:#10182880}.md-group-reaction-shell{padding:15px}.md-group-reaction-head{display:flex;justify-content:space-between;align-items:center;padding-bottom:10px;border-bottom:1px solid #e8edf5}.md-group-reaction-head button{border:0;background:none;font-size:22px}.md-group-reaction-list>div{display:flex;justify-content:space-between;padding:10px 2px;border-bottom:1px solid #f0f2f6;font-size:12px}";
document.head.append(css);
const welcome = document.querySelector(".feed .welcome");
if (welcome && !document.getElementById("miloopDiscoverOpen")) {
  const b = document.createElement("button");
  b.type = "button"; b.id = "miloopDiscoverOpen"; b.className = "primary";
  b.textContent = "✦ Discover";
  b.style.marginLeft = "8px";
  welcome.append(b);
}
const tabs = [["groups","Groups"],["memories","On This Day"],["verify","Verified Profile"],["tools","Community Tools"]];
function toast(msg){const el=$("toast");if(el){el.textContent=msg;el.classList.add("show");setTimeout(()=>el.classList.remove("show"),2600);}}
function open(tab="groups"){
  if(!user){$("authOpen")?.click();toast("Sign in to explore MILOOP.");return;}
  panel.classList.add("open");
  $("mdTabs").innerHTML=tabs.map(x=>'<button type="button" data-md-tab="'+x[0]+'" class="'+(x[0]===tab?"active":"")+'">'+x[1]+'</button>').join("")+(admin?'<button type="button" data-md-tab="reviews" class="'+(tab==="reviews"?"active":"")+'">Admin Reviews</button>':"");
  render(tab);
}
function close(){panel.classList.remove("open");}
$("mdClose").onclick=close;
document.addEventListener("keydown",e=>{if(e.key==="Escape")close();});
$("miloopDiscoverOpen")?.addEventListener("click",()=>open());
document.addEventListener("click",e=>{
 const tab=e.target.closest("[data-md-tab]");if(tab){open(tab.dataset.mdTab);return;}
 const hub=e.target.closest("[data-md-hub]");if(hub){const opener=document.querySelector("[data-hub-open]");if(opener)opener.click();setTimeout(()=>document.querySelector('[data-hub-tab="'+hub.dataset.mdHub+'"]')?.click(),80);}
});
function setContent(html){$("mdContent").innerHTML=html;}
async function render(tab){
 $("mdTabs").querySelectorAll("button").forEach(b=>b.classList.toggle("active",b.dataset.mdTab===tab));
 try{
  if(tab==="groups")await groups();
  if(tab==="memories")await memories();
  if(tab==="verify")await verification();
  if(tab==="tools")tools();
  if(tab==="reviews")await reviews();
 }catch(e){console.error("MILOOP Discover:",e);setContent('<div class="md-card">Could not load this section: '+esc(e.code||e.message||"Unknown error")+'.</div>');}
}
async function groups(){
 setContent('<div class="md-card"><h3>Create a community group</h3><form id="mdGroupForm" class="md-form"><input id="mdGroupName" maxlength="50" placeholder="Group name" required><textarea id="mdGroupDescription" maxlength="240" placeholder="What is this group about?"></textarea><button class="md-btn">Create group</button></form></div><div id="mdGroupList">Loading groups…</div>');
 $("mdGroupForm").onsubmit=async e=>{e.preventDefault();const n=$("mdGroupName").value.trim(),d=$("mdGroupDescription").value.trim();if(n.length<3){toast("Group name must have at least 3 characters.");return;}try{const ref=await addDoc(collection(db,"groups"),{name:n,description:d,createdBy:user.uid,createdAt:serverTimestamp()});await setDoc(doc(db,"groups",ref.id,"members",user.uid),{uid:user.uid,joinedAt:serverTimestamp()});toast("Group created.");groups();}catch(err){toast("Could not create group: "+(err.code||err.message));}};
 const snap=await getDocs(query(collection(db,"groups"),orderBy("createdAt","desc"),limit(40)));
 const list=$("mdGroupList");if(!list)return;
 if(snap.empty){list.innerHTML='<div class="md-empty">No groups yet. Create the first community!</div>';return;}
 list.innerHTML="";
 for(const d of snap.docs){const g=d.data(),joined=await getDoc(doc(db,"groups",d.id,"members",user.uid));const card=document.createElement("article");card.className="md-card";card.innerHTML='<h3>'+esc(g.name||"Community")+(g.verified?'<span class="md-badge" style="margin-left:7px">✓ Verified group</span>':'')+'</h3><p>'+esc(g.description||"A MILOOP community group.")+'</p><small class="md-muted">Created by '+(g.createdBy===user.uid?"you":"a MILOOP member")+'</small><div><button class="md-btn" data-md-view="'+d.id+'">Open group</button><button class="md-btn alt" data-md-join="'+d.id+'" data-joined="'+joined.exists()+'">'+(joined.exists()?"Leave group":"Join group")+'</button>'+(admin?'<button class="md-btn alt" data-md-delete-group="'+d.id+'">Delete group</button>':'')+'</div>';list.append(card);}
 list.querySelectorAll("[data-md-join]").forEach(b=>b.onclick=async()=>{const id=b.dataset.mdJoin;try{const ref=doc(db,"groups",id,"members",user.uid);if(b.dataset.joined==="true"){await import("https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js").then(m=>m.deleteDoc(ref));toast("You left the group.");}else{await setDoc(ref,{uid:user.uid,joinedAt:serverTimestamp()});toast("You joined the group.");}groups();}catch(e){toast("Group action failed: "+(e.code||e.message));}});
 list.querySelectorAll("[data-md-delete-group]").forEach(b=>b.onclick=async()=>{const id=b.dataset.mdDeleteGroup;if(!confirm("Delete this group? This removes it from MILOOP groups."))return;try{await deleteDoc(doc(db,"groups",id));toast("Group deleted.");groups();}catch(e){toast("Could not delete group: "+(e.code||e.message));}});
 list.querySelectorAll("[data-md-view]").forEach(b=>b.onclick=()=>groupDetail(b.dataset.mdView));
}
async function groupDetail(id){
 const member=await getDoc(doc(db,"groups",id,"members",user.uid));
 if(!member.exists()){setContent('<div class="md-card"><p>Join this group to read and write its discussions.</p><button class="md-btn" id="mdJoinNow">Join group</button><button class="md-btn alt" id="mdBackGroups">Back</button></div>');$("mdJoinNow").onclick=async()=>{try{await setDoc(doc(db,"groups",id,"members",user.uid),{uid:user.uid,joinedAt:serverTimestamp()});groupDetail(id);}catch(e){toast("Could not join: "+(e.code||e.message));}};$("mdBackGroups").onclick=groups;return;}
 const group=(await getDoc(doc(db,"groups",id))).data()||{};
 setContent('<button class="md-btn alt" id="mdBackGroups">← Groups</button><div class="md-card"><h3>'+esc(group.name||"Group")+(group.verified?'<span class="md-badge" style="margin-left:7px">✓ Verified group</span>':'')+'</h3><p>'+esc(group.description||"")+'</p>'+((group.createdBy===user.uid||admin)&&!group.verified?'<form id="mdGroupVerifyForm" class="md-form"><textarea id="mdGroupVerifyReason" maxlength="300" placeholder="Why should this group be verified? (10–300 characters)" required></textarea><button class="md-btn alt">Apply for group verification</button></form>':'')+'<form id="mdGroupPost" class="md-form"><textarea id="mdGroupPostText" maxlength="600" placeholder="Share something with this group…" required></textarea><button class="md-btn">Post to group</button></form></div><div id="mdGroupPosts">Loading discussions…</div>');
 $("mdBackGroups").onclick=groups;
 $("mdGroupVerifyForm")?.addEventListener("submit",async e=>{e.preventDefault();const reason=$("mdGroupVerifyReason").value.trim();if(reason.length<10){toast("Please add at least 10 characters.");return;}try{await setDoc(doc(db,"groupVerificationRequests",id),{groupId:id,groupName:group.name||"Community",createdBy:group.createdBy,requestedBy:user.uid,reason,status:"pending",createdAt:serverTimestamp()});toast("Group verification request sent.");groupDetail(id);}catch(err){toast("Group verification request failed: "+(err.code||err.message));}});
 $("mdGroupPost").onsubmit=async e=>{e.preventDefault();const text=$("mdGroupPostText").value.trim();if(!text)return;const btn=e.submitter;if(btn)btn.disabled=true;try{await addDoc(collection(db,"groups",id,"posts"),{uid:user.uid,displayName:user.displayName||user.email?.split("@")[0]||"MILOOP member",text,createdAt:serverTimestamp()});toast("Group post published.");groupDetail(id);}catch(err){toast("Could not post: "+(err.code||err.message));}finally{if(btn)btn.disabled=false;}};
 const posts=await getDocs(query(collection(db,"groups",id,"posts"),orderBy("createdAt","desc"),limit(40)));
 const holder=$("mdGroupPosts");if(posts.empty){holder.innerHTML='<div class="md-empty">No discussions yet.</div>';return;}
 holder.innerHTML=posts.docs.map(d=>{const p=d.data(),mine=p.uid===user.uid;return '<article class="md-card md-group-post" data-gpost="'+esc(d.id)+'"><div class="md-group-post-head"><div><b>'+esc(p.displayName||"Member")+'</b><small class="md-muted"> · '+esc(p.createdAt?.toDate?.().toLocaleString?.()||"Just now")+'</small></div><button type="button" class="md-group-more" data-gp-menu aria-label="Post options">•••</button></div><p class="md-group-post-text">'+esc(p.text||"")+'</p><div class="md-group-stats"><button type="button" data-gp-likers>👍 <span data-gp-count>0</span> reactions · See who</button><button type="button" data-gp-comments>Comments · <span data-gp-comment-count>0</span></button></div><div class="md-group-actions"><div class="md-group-reaction-wrap"><button type="button" class="md-group-action" data-gp-react aria-expanded="false">👍 <span>Like</span></button><div class="md-group-reaction-picker" hidden><button type="button" data-gp-type="like">👍</button><button type="button" data-gp-type="love">❤️</button><button type="button" data-gp-type="care">🥰</button><button type="button" data-gp-type="haha">😂</button><button type="button" data-gp-type="wow">😮</button><button type="button" data-gp-type="sad">😢</button><button type="button" data-gp-type="angry">😡</button></div></div><button type="button" class="md-group-action" data-gp-comments>▢ <span>Comment</span></button><button type="button" class="md-group-action" data-gp-share>↗ <span>Share</span></button></div><div class="md-post-menu" hidden><button type="button" data-gp-save>▱ Save post</button><button type="button" data-gp-copy>🔗 Copy link</button><button type="button" data-gp-report>⚑ Report</button>'+(mine?'<button type="button" data-gp-edit>✎ Edit post</button><button type="button" data-gp-delete>🗑 Delete post</button>':'<button type="button" data-gp-block>🚫 Block member</button>')+'</div><section class="md-group-comments" hidden><div class="md-group-comment-list">Loading comments…</div><form class="md-group-comment-form"><input maxlength="500" placeholder="Write a comment…" required><button type="submit">Send</button></form></section></article>';}).join("");
 const labels={like:"👍 Like",love:"❤️ Love",care:"🥰 Care",haha:"😂 Haha",wow:"😮 Wow",sad:"😢 Sad",angry:"😡 Angry"};
 for(const card of holder.querySelectorAll("[data-gpost]")){
  const pid=card.dataset.gpost,ref=doc(db,"groups",id,"posts",pid),post=posts.docs.find(x=>x.id===pid).data(),rr=doc(db,"groups",id,"posts",pid,"reactions",user.uid);
  async function stats(){const [rs,mr,cs]=await Promise.all([getDocs(collection(db,"groups",id,"posts",pid,"reactions")),getDoc(rr),getDocs(collection(db,"groups",id,"posts",pid,"comments"))]);const type=mr.exists()?mr.data().type:"";card.querySelector("[data-gp-react]").innerHTML=labels[type]||"👍 Like";card.querySelector("[data-gp-react]").classList.toggle("active",!!type);card.querySelector("[data-gp-count]").textContent=rs.size;card.querySelector("[data-gp-comment-count]").textContent=cs.size;}
  try{await stats();}catch(e){console.warn("Group stats:",e);}
  card.querySelector("[data-gp-react]").onclick=()=>{const p=card.querySelector(".md-group-reaction-picker");p.hidden=!p.hidden;card.querySelector("[data-gp-react]").setAttribute("aria-expanded",String(!p.hidden));};
  card.querySelectorAll("[data-gp-type]").forEach(btn=>btn.onclick=async()=>{try{const type=btn.dataset.gpType,old=await getDoc(rr);if(old.exists()&&old.data().type===type)await deleteDoc(rr);else await setDoc(rr,{uid:user.uid,displayName:user.displayName||"MILOOP member",type,createdAt:serverTimestamp()});card.querySelector(".md-group-reaction-picker").hidden=true;await stats();}catch(e){toast("Reaction failed: "+(e.code||e.message));}});
  card.querySelector("[data-gp-likers]").onclick=async()=>{try{const snap=await getDocs(collection(db,"groups",id,"posts",pid,"reactions"));const rows=await Promise.all(snap.docs.map(async d=>{const v=d.data();let name=v.displayName||"MILOOP member";try{const pr=await getDoc(doc(db,"publicProfiles",d.id));name=pr.data()?.displayName||name;}catch(_){}return {name,type:v.type||"like"};}));showGroupReactions(rows);}catch(e){toast("Could not load reactions: "+(e.code||e.message));}};
  card.querySelectorAll("[data-gp-comments]").forEach(btn=>btn.onclick=()=>{const box=card.querySelector(".md-group-comments");box.hidden=!box.hidden;if(!box.hidden)loadGroupComments(id,pid,box.querySelector(".md-group-comment-list"));});
  card.querySelector(".md-group-comment-form").onsubmit=async e=>{e.preventDefault();const input=e.currentTarget.querySelector("input"),text=input.value.trim();if(!text)return;const btn=e.submitter;if(btn)btn.disabled=true;try{await addDoc(collection(db,"groups",id,"posts",pid,"comments"),{uid:user.uid,displayName:user.displayName||"MILOOP member",text,createdAt:serverTimestamp()});input.value="";await loadGroupComments(id,pid,card.querySelector(".md-group-comment-list"));await stats();}catch(err){toast("Comment failed: "+(err.code||err.message));}finally{if(btn)btn.disabled=false;}};
  card.querySelector("[data-gp-menu]").onclick=()=>{const m=card.querySelector(".md-post-menu");m.hidden=!m.hidden;};
  card.querySelector("[data-gp-save]").onclick=async()=>{try{await setDoc(doc(db,"bookmarks",user.uid,"items","group_"+id+"_"+pid),{postId:pid,groupId:id,createdAt:serverTimestamp()});toast("Group post saved.");}catch(e){toast("Save failed: "+(e.code||e.message));}};
  const link=()=>{const u=new URL(location.href);u.searchParams.set("group",id);u.searchParams.set("groupPost",pid);return u.href;};
  card.querySelector("[data-gp-copy]").onclick=async()=>{try{await navigator.clipboard.writeText(link());toast("Group post link copied.");}catch(e){toast("Could not copy link.");}};
  card.querySelector("[data-gp-share]").onclick=async()=>{try{if(navigator.share)await navigator.share({title:"MILOOP group post",text:post.text,url:link()});else{await navigator.clipboard.writeText(link());toast("Group post link copied.");}}catch(e){if(e.name!=="AbortError")toast("Could not share.");}};
  card.querySelector("[data-gp-report]").onclick=async()=>{const reason=prompt("Why are you reporting this group post?");if(reason===null||!reason.trim())return;try{await addDoc(collection(db,"reports"),{reporterUid:user.uid,targetType:"post",targetId:"group_"+id+"_"+pid,targetOwnerUid:post.uid||"",reason:reason.trim().slice(0,300),status:"open",createdAt:serverTimestamp()});toast("Report submitted.");}catch(e){toast("Report failed: "+(e.code||e.message));}};
  card.querySelector("[data-gp-edit]")?.addEventListener("click",async()=>{const old=(await getDoc(ref)).data()?.text||"",next=prompt("Edit your group post",old);if(next===null||!next.trim())return;try{await updateDoc(ref,{text:next.trim().slice(0,600)});groupDetail(id);toast("Post updated.");}catch(e){toast("Edit failed: "+(e.code||e.message));}});
  card.querySelector("[data-gp-delete]")?.addEventListener("click",async()=>{if(!confirm("Delete this group post?"))return;try{await deleteDoc(ref);card.remove();toast("Post deleted.");}catch(e){toast("Delete failed: "+(e.code||e.message));}});
  card.querySelector("[data-gp-block]")?.addEventListener("click",async()=>{if(!post.uid||post.uid===user.uid||!confirm("Block this member?"))return;try{await setDoc(doc(db,"blocks",user.uid,"users",post.uid),{uid:post.uid,createdAt:serverTimestamp()});toast("Member blocked.");}catch(e){toast("Block failed: "+(e.code||e.message));}});
 }
}
function showGroupReactions(rows){
 document.getElementById("mdGroupReactionDialog")?.remove();
 const dialog=document.createElement("dialog");dialog.id="mdGroupReactionDialog";dialog.className="md-group-reaction-dialog";
 const emojis={like:"👍",love:"❤️",care:"🥰",haha:"😂",wow:"😮",sad:"😢",angry:"😡"};
 dialog.innerHTML='<div class="md-group-reaction-shell"><div class="md-group-reaction-head"><b>Post reactions · '+rows.length+'</b><button type="button" aria-label="Close">×</button></div><div class="md-group-reaction-list">'+(rows.length?rows.map(x=>'<div><b>'+esc(x.name)+'</b><span>'+(emojis[x.type]||"👍")+' '+esc(x.type.charAt(0).toUpperCase()+x.type.slice(1))+'</span></div>').join(""):'<p>No reactions yet.</p>')+'</div></div>';
 document.body.append(dialog);dialog.querySelector("button").onclick=()=>dialog.close();dialog.addEventListener("close",()=>dialog.remove());dialog.showModal();
}
async function loadGroupComments(groupId,postId,holder){
 try{const s=await getDocs(query(collection(db,"groups",groupId,"posts",postId,"comments"),orderBy("createdAt","asc")));holder.innerHTML=s.empty?'<p class="md-muted">No comments yet.</p>':s.docs.map(d=>{const c=d.data();return '<div class="md-group-comment"><b>'+esc(c.displayName||"Member")+'</b><p>'+esc(c.text||"")+'</p><small>'+esc(c.createdAt?.toDate?.().toLocaleString?.()||"Just now")+'</small>'+(c.uid===user.uid?'<button type="button" data-gc-delete="'+esc(d.id)+'">Delete</button>':"")+'</div>';}).join("");holder.querySelectorAll("[data-gc-delete]").forEach(b=>b.onclick=async()=>{try{await deleteDoc(doc(db,"groups",groupId,"posts",postId,"comments",b.dataset.gcDelete));loadGroupComments(groupId,postId,holder);}catch(e){toast("Could not delete comment: "+(e.code||e.message));}});}catch(e){holder.textContent="Comments could not load. Check Firestore Rules.";}
}
function dateKey(date){const parts=new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Dhaka",year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(date);const x=Object.fromEntries(parts.map(p=>[p.type,p.value]));return x.year+"-"+x.month+"-"+x.day;}
async function memories(){
 setContent('<div class="md-card"><h3>On This Day ✨</h3><p>আগের বছরগুলোতে আজকের দিনে MILOOP-এ করা পোস্টগুলো এখানে দেখাবে।</p></div><div id="mdMemoryList">Loading memories…</div>');
 const today=dateKey(new Date()),md=today.slice(5),year=Number(today.slice(0,4));
 const snap=await getDocs(query(collection(db,"posts"),orderBy("createdAt","desc"),limit(150)));
 const old=snap.docs.map(d=>({id:d.id,...d.data()})).filter(p=>{const dt=p.createdAt?.toDate?.();return dt&&dt.getFullYear()<year&&dateKey(dt).slice(5)===md;});
 $("mdMemoryList").innerHTML=old.length?old.map(p=>'<article class="md-card"><b>'+esc(p.authorName||"MILOOP member")+'</b><p>'+esc(p.text||"[Media post]")+'</p><small class="md-muted">'+esc(p.createdAt.toDate().toLocaleDateString())+'</small></article>').join(""):'<div class="md-empty">আজকের তারিখে আগের বছরের কোনো পোস্ট পাওয়া যায়নি।</div>';
}
async function verification(){
 const profile=(await getDoc(doc(db,"publicProfiles",user.uid))).data()||{};
 const req=await getDoc(doc(db,"verificationRequests",user.uid));
 const r=req.data()||{};
 setContent('<div class="md-card"><h3>Verified Profile <span class="md-badge">✓ MILOOP</span></h3><p>Verified badge পরিচয় নিশ্চিত করতে সাহায্য করে। আবেদন Admin যাচাই করবেন; Badge নিজে থেকে চালু করা যায় না।</p>'+(profile.verified?'<p class="md-badge">আপনার প্রোফাইল Verified ✓</p>':req.exists()?'<p>আবেদনের অবস্থা: <b>'+esc(r.status||"pending")+'</b></p><p class="md-muted">Admin আবেদন পর্যালোচনা করবেন।</p>':'<form id="mdVerifyForm" class="md-form"><textarea id="mdVerifyReason" maxlength="300" placeholder="কেন আপনার প্রোফাইল যাচাই করা উচিত? (সর্বোচ্চ ৩০০ অক্ষর)" required></textarea><button class="md-btn">Request verification</button></form>')+'</div>');
 $("mdVerifyForm")?.addEventListener("submit",async e=>{e.preventDefault();const reason=$("mdVerifyReason").value.trim();if(reason.length<10){toast("Please add a little more detail.");return;}try{await setDoc(doc(db,"verificationRequests",user.uid),{uid:user.uid,reason,status:"pending",createdAt:serverTimestamp()});toast("Verification request sent.");verification();}catch(err){toast("Request failed: "+(err.code||err.message));}});
}
function tools(){
 setContent('<div class="md-card"><h3>Community Tools</h3><p>এই সুবিধাগুলো Community Hub-এ আগে থেকেই আছে। এখান থেকে সরাসরি খুলতে পারবে।</p><div class="md-shortcuts"><button class="md-shortcut" data-md-hub="badges"><b>🏅 Achievements</b><small>তোমার অর্জিত ব্যাজ দেখো</small></button><button class="md-shortcut" data-md-hub="polls"><b>📊 Public Polls</b><small>ভোট তৈরি ও অংশগ্রহণ</small></button><button class="md-shortcut" data-md-hub="events"><b>📅 Events & Meetups</b><small>ইভেন্ট তৈরি ও RSVP</small></button><button class="md-shortcut" data-md-hub="challenge"><b>🎯 Weekly Challenges</b><small>সাপ্তাহিক চ্যালেঞ্জে অংশ নাও</small></button></div></div>');
}
async function reviews(){
 if(!admin){setContent('<div class="md-empty">Admin access required.</div>');return;}
 setContent('<div class="md-card"><h3>Member verification requests</h3><p>Review member requests and approve only after appropriate checks.</p></div><div id="mdReviewList">Loading member requests…</div><div class="md-card"><h3>Group verification requests</h3><p>Review applications submitted by group creators or administrators.</p></div><div id="mdGroupReviewList">Loading group requests…</div>');
 const [members,groupsSnap]=await Promise.all([getDocs(query(collection(db,"verificationRequests"),where("status","==","pending"),limit(50))),getDocs(query(collection(db,"groupVerificationRequests"),where("status","==","pending"),limit(50)))]);
 const list=$("mdReviewList");
 list.innerHTML=members.empty?'<div class="md-empty">No pending member requests.</div>':members.docs.map(d=>'<article class="md-card"><b>'+esc(d.id)+'</b><p>'+esc(d.data().reason||"")+'</p><button class="md-btn" data-md-approve="'+esc(d.id)+'">Approve & verify</button><button class="md-btn alt" data-md-reject="'+esc(d.id)+'">Decline</button></article>').join("");
 list.querySelectorAll("[data-md-approve]").forEach(b=>b.onclick=()=>reviewRequest(b.dataset.mdApprove,true));
 list.querySelectorAll("[data-md-reject]").forEach(b=>b.onclick=()=>reviewRequest(b.dataset.mdReject,false));
 const gl=$("mdGroupReviewList");
 gl.innerHTML=groupsSnap.empty?'<div class="md-empty">No pending group requests.</div>':groupsSnap.docs.map(d=>{const x=d.data();return '<article class="md-card"><b>'+esc(x.groupName||"Community")+'</b><p>'+esc(x.reason||"")+'</p><small class="md-muted">Group ID: '+esc(x.groupId||d.id)+' · Requested by: '+esc(x.requestedBy||"")+'</small><div><button class="md-btn" data-md-group-approve="'+esc(d.id)+'">Approve group</button><button class="md-btn alt" data-md-group-reject="'+esc(d.id)+'">Decline</button></div></article>';}).join("");
 gl.querySelectorAll("[data-md-group-approve]").forEach(b=>b.onclick=()=>reviewGroupRequest(b.dataset.mdGroupApprove,true));
 gl.querySelectorAll("[data-md-group-reject]").forEach(b=>b.onclick=()=>reviewGroupRequest(b.dataset.mdGroupReject,false));
}
async function reviewGroupRequest(requestId,approve){
 try{
  const req=(await getDoc(doc(db,"groupVerificationRequests",requestId))).data();if(!req?.groupId)throw new Error("Group request is missing its group ID.");
  if(approve)await updateDoc(doc(db,"groups",req.groupId),{verified:true,verifiedAt:serverTimestamp()});
  await updateDoc(doc(db,"groupVerificationRequests",requestId),{status:approve?"approved":"rejected",reviewedBy:user.uid,reviewedAt:serverTimestamp()});
  toast(approve?"Group verified.":"Group request declined.");reviews();
 }catch(e){toast("Group review failed: "+(e.code||e.message));}
}
async function reviewRequest(uid,approve){
 try{
  await updateDoc(doc(db,"verificationRequests",uid),{status:approve?"approved":"rejected",reviewedBy:user.uid,reviewedAt:serverTimestamp()});
  if(approve)await updateDoc(doc(db,"publicProfiles",uid),{verified:true,verifiedAt:serverTimestamp()});
  toast(approve?"Profile verified.":"Request declined.");reviews();
 }catch(e){toast("Review failed: "+(e.code||e.message));}
}
onAuthStateChanged(auth,async u=>{
 user=u;admin=false;
 if(u){try{const a=await getDoc(doc(db,"admins",u.uid));admin=a.exists()&&a.data().enabled===true&&a.data().role==="admin";}catch(e){console.warn("Discover admin check:",e);}}
 if(panel.classList.contains("open"))open("groups");
});
