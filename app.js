import { auth, db } from "./firebase.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import { collection, addDoc, setDoc, onSnapshot, query, orderBy, serverTimestamp, doc, updateDoc, arrayUnion, arrayRemove, deleteDoc, getDoc, getDocs } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

const $ = id => document.getElementById(id);
const dialog = $("postDialog"), textarea = $("postText");
let currentUser = null, posts = [], stopPosts = null, stopComments = null, activePostId = null, toastTimer;
function toast(message) {
  const el = $("toast"); el.textContent = message; el.classList.add("show");
  clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove("show"), 2500);
}
function safe(value) {
  return String(value ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
}
async function copyText(value){if(navigator.clipboard&&window.isSecureContext){await navigator.clipboard.writeText(value);return;}const field=document.createElement("textarea");field.value=value;field.style.position="fixed";field.style.opacity="0";document.body.append(field);field.select();const ok=document.execCommand("copy");field.remove();if(!ok)throw new Error("Copy unavailable");}
function initials(name) { return String(name || "M").trim().split(/\s+/).slice(0,2).map(x=>x[0]||"").join("").toUpperCase(); }
function relativeTime(value) {
  if (!value?.toDate) return "just now";
  const seconds = Math.max(0, Math.floor((Date.now()-value.toDate().getTime())/1000));
  if(seconds<60)return "just now"; if(seconds<3600)return Math.floor(seconds/60)+"m ago";
  if(seconds<86400)return Math.floor(seconds/3600)+"h ago"; return Math.floor(seconds/86400)+"d ago";
}
function render() {
  const q = $("search").value.trim().toLowerCase(), sort = $("sort").value;
  let list = posts.filter(p => (p.text+" "+p.authorName).toLowerCase().includes(q));
  if(sort==="popular") list.sort((a,b)=>(b.likeCount||0)-(a.likeCount||0));
  $("posts").innerHTML = list.length ? list.map(p => {
    const liked = currentUser && (p.likes||[]).includes(currentUser.uid);
    const mine = currentUser && p.authorUid===currentUser.uid;
    return `<article class="post" data-id="${safe(p.id)}">
      <div class="post-head"><div class="avatar">${safe(initials(p.authorName))}</div>
      <div class="post-author"><b><button type="button" class="post-author-link" data-profile-uid="${safe(p.authorUid)}">${safe(p.authorName||"MILOOP member")}</button></b><small>${safe(relativeTime(p.createdAt))}</small></div>
      ${mine?'<button class="post-menu" data-action="edit" aria-label="Edit your post">✎</button><button class="post-menu" data-action="delete" aria-label="Delete your post">×</button>':""}</div>
      <p class="post-text">${safe(p.text)}</p>
      <div class="stats"><button type="button" data-action="likers" aria-label="See who liked this post">♥ ${Number(p.likeCount)||0} likes · See who</button></div>
      <div class="post-actions"><button data-action="like" class="${liked?"liked":""}" ${currentUser?"":"disabled"}><span>${liked?"♥":"♡"}</span>Like</button>
      <button data-action="comment"><span>▢</span>Comment</button><button data-action="share"><span>↗</span>Share</button><button data-action="copy-link"><span>🔗</span>Copy link</button></div>
    </article>`;
  }).join("") : '<article class="post"><p class="post-text">No posts yet. Be the first to share something!</p></article>';
}

const commentsDialog = $("commentsDialog");
const commentForm = $("commentForm");
const commentText = $("commentText");
async function showPostLikers(post) {
  if (!currentUser) { $("authOpen").click(); return; }
  const ids = [...new Set(post.likes || [])];
  const dialog = document.createElement("dialog");
  dialog.className = "comments-dialog";
  dialog.innerHTML = '<div class="comments-shell"><div class="dialog-head"><div><p class="eyebrow">POST REACTIONS</p><h2>Liked by</h2></div><button type="button" class="close" aria-label="Close">×</button></div><div class="comments-list"><p class="comment-empty">Loading people…</p></div></div>';
  document.body.append(dialog);
  const close = () => { dialog.close(); dialog.remove(); };
  dialog.querySelector(".close").onclick = close;
  dialog.addEventListener("click",e=>{if(e.target===dialog)close();});
  dialog.showModal();
  const list = dialog.querySelector(".comments-list");
  if (!ids.length) { list.innerHTML='<p class="comment-empty">No likes yet.</p>'; return; }
  const people = await Promise.all(ids.map(async uid=>{
    try {
      const snap=await getDoc(doc(db,"publicProfiles",uid));
      const data=snap.exists()?snap.data():{};
      return {uid,name:data.displayName||data.name||"MILOOP member"};
    } catch { return {uid,name:"MILOOP member"}; }
  }));
  list.innerHTML=people.map(person=>'<div class="comment-item"><div class="comment-avatar">'+safe(initials(person.name))+'</div><div class="comment-body"><b>'+safe(person.name)+'</b></div></div>').join("");
}

async function openComments(post) {
  activePostId = post.id;
  $("commentsTitle").textContent = "Comments";
  $("commentsList").innerHTML = '<p class="comment-empty">Loading comments…</p>';
  commentText.value = "";
  commentsDialog.showModal();
  if(stopComments) stopComments();
  stopComments = onSnapshot(query(collection(db,"posts",post.id,"comments"),orderBy("createdAt","asc")), async snap=>{
    const rows = await Promise.all(snap.docs.map(async d=>{
      const c=d.data(), own=currentUser && currentUser.uid===c.uid;
      const [likesSnap,repliesSnap,myLike] = await Promise.all([
        getDocs(collection(db,"posts",post.id,"comments",d.id,"likes")),
        getDocs(query(collection(db,"posts",post.id,"comments",d.id,"replies"),orderBy("createdAt","asc"))),
        currentUser ? getDoc(doc(db,"posts",post.id,"comments",d.id,"likes",currentUser.uid)) : Promise.resolve(null)
      ]);
      const replies = repliesSnap.docs.map(rd=>{
        const reply=rd.data(), ownReply=currentUser && currentUser.uid===reply.uid;
        return '<div class="comment-reply"><div class="comment-avatar">'+safe(initials(reply.displayName))+'</div><div class="comment-body"><b>'+safe(reply.displayName||"MILOOP member")+'</b><p>'+safe(reply.text)+'</p><small>'+safe(relativeTime(reply.createdAt))+'</small>'+(ownReply?'<button type="button" class="comment-delete" data-reply-delete="'+safe(d.id)+'|'+safe(rd.id)+'">Delete</button>':"")+'</div></div>';
      }).join("");
      return '<div class="comment-item" data-comment-id="'+safe(d.id)+'"><div class="comment-avatar">'+safe(initials(c.displayName))+'</div><div class="comment-body"><b>'+safe(c.displayName||"MILOOP member")+'</b><p>'+safe(c.text)+'</p><small>'+safe(relativeTime(c.createdAt))+(c.edited?' · edited':"")+'</small><div class="comment-tools"><button type="button" data-comment-like="'+safe(d.id)+'">'+(myLike?.exists()?'♥':'♡')+' Like · '+likesSnap.size+'</button><button type="button" data-reply-toggle="'+safe(d.id)+'">Reply</button>'+(own?'<button type="button" data-comment-edit="'+safe(d.id)+'">Edit</button><button type="button" class="comment-delete" data-comment-delete="'+safe(d.id)+'">Delete</button>':"")+'</div><form class="reply-form" data-reply-form="'+safe(d.id)+'" hidden><input maxlength="500" placeholder="Write a reply…" required><button type="submit">Reply</button></form><div class="comment-replies">'+replies+'</div></div></div>';
    }));
    $("commentsList").innerHTML = rows.length ? rows.join("") : '<p class="comment-empty">No comments yet. Start the conversation.</p>';
  },err=>{console.error(err);$("commentsList").innerHTML='<p class="comment-empty">Could not load comments.</p>';});
}

function openPost() {
  if(!currentUser){$("authOpen").click();toast("Sign in before creating a post.");return;}
  textarea.value=""; $("counter").textContent="0 / 1000"; dialog.showModal(); textarea.focus();
}
document.querySelectorAll("[data-open-post]").forEach(b=>b.addEventListener("click",openPost));
$("closeDialog").addEventListener("click",()=>dialog.close());
textarea.addEventListener("input",()=> $("counter").textContent=textarea.value.length+" / 1000");
$("postForm").addEventListener("submit",async e=>{
  e.preventDefault();
  if(!currentUser){toast("Please sign in first.");return;}
  const text=textarea.value.trim(); if(!text){toast("Write something before publishing.");return;}
  const button=e.submitter; if(button)button.disabled=true;
  try {
    await addDoc(collection(db,"posts"),{authorUid:currentUser.uid,authorName:currentUser.displayName||currentUser.email?.split("@")[0]||"MILOOP member",text,createdAt:serverTimestamp(),likes:[],likeCount:0});
    dialog.close(); toast("Your post is now in your loop!");
  } catch(error){console.error("MILOOP post publish error:",error);toast("Post failed: "+(error.code||error.message||"unknown error"));}
  finally{if(button)button.disabled=false;}
});
$("search").addEventListener("input",render); $("sort").addEventListener("change",render);
$("posts").addEventListener("click",async e=>{
  const b=e.target.closest("[data-action]"); if(!b)return;
  const p=posts.find(x=>x.id===b.closest("[data-id]")?.dataset.id); if(!p)return;
  try {
    if(b.dataset.action==="likers"){ await showPostLikers(p);
    } else if(b.dataset.action==="like"){
      if(!currentUser){$("authOpen").click();return;}
      const liked=(p.likes||[]).includes(currentUser.uid);
      await updateDoc(doc(db,"posts",p.id),{likes:liked?arrayRemove(currentUser.uid):arrayUnion(currentUser.uid),likeCount:Math.max(0,(p.likeCount||0)+(liked?-1:1))});
    } else if(b.dataset.action==="edit" && p.authorUid===currentUser?.uid){
      const edited=window.prompt("Edit your post",p.text);if(edited===null)return;if(!edited.trim()){toast("Post cannot be empty.");return;}await updateDoc(doc(db,"posts",p.id),{text:edited.trim().slice(0,1000)});toast("Post updated.");
    } else if(b.dataset.action==="delete" && p.authorUid===currentUser?.uid){
      if(confirm("Delete this post?")){await deleteDoc(doc(db,"posts",p.id));}
    } else if(b.dataset.action==="share" || b.dataset.action==="copy-link"){
      const url=new URL(location.href);url.search="";url.searchParams.set("post",p.id);url.hash="";
      if(b.dataset.action==="share"&&navigator.share)await navigator.share({title:"MILOOP post",text:p.text,url:url.href});else{await copyText(url.href);toast("Post link copied.");}
    } else if(b.dataset.action==="comment") openComments(p);
  } catch(error){if(error.name!=="AbortError"){console.error(error);toast("Action failed. Please try again.");}}
});
// Profile, messages, notifications, stories and discovery are handled by social-features.js.
// Keep placeholder click handlers out of this file so they cannot override real feature panels.
$("invite").addEventListener("click",async()=>{
  try{if(navigator.share)await navigator.share({title:"Join me on MILOOP",text:"Connect. Share. Belong.",url:location.href});else{await navigator.clipboard.writeText(location.href);toast("Page link copied.");}}catch(e){if(e.name!=="AbortError")toast("Could not share right now.");}
});
onAuthStateChanged(auth,user=>{currentUser=user;render();});
stopPosts=onSnapshot(query(collection(db,"posts"),orderBy("createdAt","desc")),snapshot=>{
  posts=snapshot.docs.map(d=>({id:d.id,...d.data()})); render();
  const targetPost=new URLSearchParams(location.search).get("post");if(targetPost){const card=[...document.querySelectorAll("[data-id]")].find(el=>el.dataset.id===targetPost);if(card){card.scrollIntoView({behavior:"smooth",block:"center"});card.style.outline="3px solid #155eef";card.style.outlineOffset="3px";}}
},error=>{console.error("MILOOP posts listener:",error);toast("Could not load posts. Check Firestore rules.");});
