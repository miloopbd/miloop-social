import { auth, db } from "./firebase.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import { collection, addDoc, setDoc, onSnapshot, query, orderBy, serverTimestamp, doc, updateDoc, arrayUnion, arrayRemove, deleteDoc } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

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
      <div class="post-author"><b>${safe(p.authorName||"MILOOP member")}</b><small>${safe(relativeTime(p.createdAt))}</small></div>
      ${mine?'<button class="post-menu" data-action="delete" aria-label="Delete your post">···</button>':""}</div>
      <p class="post-text">${safe(p.text)}</p>
      <div class="stats"><span>♥ ${Number(p.likeCount)||0} likes</span></div>
      <div class="post-actions"><button data-action="like" class="${liked?"liked":""}" ${currentUser?"":"disabled"}><span>${liked?"♥":"♡"}</span>Like</button>
      <button data-action="comment"><span>▢</span>Comment</button><button data-action="share"><span>↗</span>Share</button></div>
    </article>`;
  }).join("") : '<article class="post"><p class="post-text">No posts yet. Be the first to share something!</p></article>';
}

const commentsDialog = $("commentsDialog");
const commentForm = $("commentForm");
const commentText = $("commentText");
function openComments(post) {
  activePostId = post.id;
  $("commentsTitle").textContent = "Comments";
  $("commentsList").innerHTML = '<p class="comment-empty">Loading comments…</p>';
  commentText.value = "";
  commentsDialog.showModal();
  if(stopComments) stopComments();
  stopComments = onSnapshot(query(collection(db,"posts",post.id,"comments"),orderBy("createdAt","asc")),snap=>{
    $("commentsList").innerHTML = snap.empty ? '<p class="comment-empty">No comments yet. Start the conversation.</p>' : snap.docs.map(d=>{
      const c=d.data(), own=currentUser && currentUser.uid===c.uid;
      return `<div class="comment-item"><div class="comment-avatar">${safe(initials(c.displayName))}</div><div class="comment-body"><b>${safe(c.displayName||"MILOOP member")}</b><p>${safe(c.text)}</p><small>${safe(relativeTime(c.createdAt))}</small></div>${own?`<button type="button" class="comment-delete" data-comment-delete="${safe(d.id)}">Delete</button>`:""}</div>`;
    }).join("");
  },err=>{console.error(err);$("commentsList").innerHTML='<p class="comment-empty">Could not load comments.</p>';});
}
$("closeComments").addEventListener("click",()=>{commentsDialog.close();if(stopComments){stopComments();stopComments=null;}});
commentForm.addEventListener("submit",async e=>{
  e.preventDefault();
  if(!currentUser){$("authOpen").click();return;}
  const text=commentText.value.trim();
  if(!text || !activePostId)return;
  const submit=e.submitter;if(submit)submit.disabled=true;
  try{
    await addDoc(collection(db,"posts",activePostId,"comments"),{
      uid:currentUser.uid,
      displayName:currentUser.displayName||currentUser.email?.split("@")[0]||"MILOOP member",
      text,createdAt:serverTimestamp()
    });
    commentText.value="";
  }catch(err){console.error(err);toast("Could not add comment. Check Firestore Rules.");}
  finally{if(submit)submit.disabled=false;}
});
$("commentsList").addEventListener("click",async e=>{
  const b=e.target.closest("[data-comment-delete]");if(!b||!activePostId)return;
  try{await deleteDoc(doc(db,"posts",activePostId,"comments",b.dataset.commentDelete));}
  catch(err){console.error(err);toast("Could not delete comment.");}
});

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
    if(b.dataset.action==="like"){
      if(!currentUser){$("authOpen").click();return;}
      const liked=(p.likes||[]).includes(currentUser.uid);
      await updateDoc(doc(db,"posts",p.id),{likes:liked?arrayRemove(currentUser.uid):arrayUnion(currentUser.uid),likeCount:Math.max(0,(p.likeCount||0)+(liked?-1:1))});
    } else if(b.dataset.action==="delete" && p.authorUid===currentUser?.uid){
      if(confirm("Delete this post?")){await deleteDoc(doc(db,"posts",p.id));}
    } else if(b.dataset.action==="share"){
      const shareText=p.text;
      if(navigator.share) await navigator.share({title:"MILOOP post",text:shareText});
      else if(navigator.clipboard){await navigator.clipboard.writeText(shareText);toast("Post text copied.");}
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
},error=>{console.error("MILOOP posts listener:",error);toast("Could not load posts. Check Firestore rules.");});
