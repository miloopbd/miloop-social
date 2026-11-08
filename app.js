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
    const reaction = p.myReaction || (liked ? "like" : "");
    const reactionNames = {like:"👍 Like",love:"❤️ Love",care:"🥰 Care",haha:"😂 Haha",wow:"😮 Wow",sad:"😢 Sad",angry:"😡 Angry"};
    return `<article class="post" data-id="${safe(p.id)}" data-author-uid="${safe(p.authorUid)}">
      <div class="post-head"><div class="avatar">${safe(initials(p.authorName))}</div>
      <div class="post-author"><b><button type="button" class="post-author-link" data-profile-uid="${safe(p.authorUid)}">${safe(p.authorName||"MILOOP member")}</button></b><small>${safe(relativeTime(p.createdAt))}</small></div>
      <div class="post-menu-wrap"><button type="button" class="post-menu" data-action="menu" aria-label="Post options" aria-expanded="false">•••</button>
        <div class="post-menu-list" hidden>
          <button type="button" data-action="save">▱ <span>Save post</span></button>
          <button type="button" data-action="copy-link">🔗 <span>Copy link</span></button>
          ${!mine?'<button type="button" data-action="block">🚫 <span>Block member</span></button>':""}
          ${mine?'<button type="button" data-action="edit">✎ <span>Edit post</span></button><button type="button" class="danger" data-action="delete">🗑 <span>Delete post</span></button>':""}
        </div>
      </div></div>
      <p class="post-text">${safe(p.text)}</p>
      <div class="stats"><button type="button" data-action="likers" aria-label="See who reacted">👍 ${Number(p.likeCount)||0} reactions · See who</button></div>
      <div class="post-actions">
        <div class="reaction-wrap">
          <button type="button" data-action="reaction-toggle" class="${liked?"liked":""}" aria-expanded="false"><span>${reactionNames[reaction]||"👍 Like"}</span></button>
          <div class="reaction-picker" hidden>
            <button type="button" data-reaction="like" aria-label="Like">👍</button>
            <button type="button" data-reaction="love" aria-label="Love">❤️</button>
            <button type="button" data-reaction="care" aria-label="Care">🥰</button>
            <button type="button" data-reaction="haha" aria-label="Haha">😂</button>
            <button type="button" data-reaction="wow" aria-label="Wow">😮</button>
            <button type="button" data-reaction="sad" aria-label="Sad">😢</button>
            <button type="button" data-reaction="angry" aria-label="Angry">😡</button>
          </div>
        </div>
        <button type="button" data-action="comment"><span>▢</span>Comment</button>
        <button type="button" data-action="share"><span>↗</span>Share</button>
      </div>
    </article>`;
  }).join("") : '<article class="post"><p class="post-text">No posts yet. Be the first to share something!</p></article>';
}

const commentsDialog = $("commentsDialog");
const commentForm = $("commentForm");
const commentText = $("commentText");
async function showPostLikers(post) {
  const dialog = document.createElement("dialog");
  dialog.className = "comments-dialog";
  dialog.innerHTML = '<div class="comments-shell"><div class="dialog-head"><div><p class="eyebrow">POST REACTIONS</p><h2>Reactions</h2></div><button type="button" class="close" aria-label="Close">×</button></div><div class="comments-list"><p class="comment-empty">Loading reactions…</p></div></div>';
  document.body.append(dialog);
  const close = () => { if(dialog.open)dialog.close(); dialog.remove(); };
  dialog.querySelector(".close").onclick = close;
  dialog.addEventListener("click",e=>{if(e.target===dialog)close();});
  dialog.showModal();
  const list = dialog.querySelector(".comments-list");
  const info = {like:["👍","Like"],love:["❤️","Love"],care:["🥰","Care"],haha:["😂","Haha"],wow:["😮","Wow"],sad:["😢","Sad"],angry:["😡","Angry"]};
  try {
    const snap = await getDocs(collection(db,"posts",post.id,"reactions"));
    let people = await Promise.all(snap.docs.map(async d=>{
      const v=d.data(),uid=v.uid||d.id;let name=v.displayName||"MILOOP member";
      try{const profile=await getDoc(doc(db,"publicProfiles",uid));if(profile.exists()){const x=profile.data();name=x.displayName||x.name||name;}}catch(e){console.warn(e);}
      const [emoji,label]=info[v.type]||info.like;return {uid,name,emoji,label};
    }));
    // Backward compatibility for older Like records stored only in posts.likes.
    if(!people.length && Array.isArray(post.likes) && post.likes.length){
      people=await Promise.all(post.likes.map(async uid=>{let name="MILOOP member";try{const profile=await getDoc(doc(db,"publicProfiles",uid));if(profile.exists()){const x=profile.data();name=x.displayName||x.name||name;}}catch(e){console.warn(e);}return {uid,name,emoji:"👍",label:"Like"};}));
    }
    if(!people.length){list.innerHTML='<p class="comment-empty">No reactions yet.</p>';return;}
    const totals=people.reduce((o,x)=>(o[x.label]=(o[x.label]||0)+1,o),{});
    list.innerHTML='<p class="reaction-summary">'+Object.entries(totals).map(([label,n])=>{const item=Object.values(info).find(x=>x[1]===label);return item[0]+' '+n;}).join(' · ')+'</p>'+people.map(x=>'<div class="comment-item"><div class="comment-avatar">'+safe(initials(x.name))+'</div><div class="comment-body"><b>'+safe(x.name)+'</b><small>'+safe(x.label)+'</small></div><span class="reaction-person-emoji">'+x.emoji+'</span></div>').join("");
    dialog.querySelector("h2").textContent="Reactions · "+people.length;
  }catch(error){console.error("Post reactions could not load:",error);list.innerHTML='<p class="comment-empty">Reactions could not load. Firebase Rules may need publishing.</p>';}
}

async function showCommentReactions(postId,commentId){
  const dialog=document.createElement("dialog");dialog.className="comments-dialog";
  dialog.innerHTML='<div class="comments-shell"><div class="dialog-head"><div><p class="eyebrow">COMMENT REACTIONS</p><h2>Reactions</h2></div><button type="button" class="close" aria-label="Close">×</button></div><div class="comments-list"><p class="comment-empty">Loading…</p></div></div>';
  document.body.append(dialog);const close=()=>{if(dialog.open)dialog.close();dialog.remove();};
  dialog.querySelector(".close").onclick=close;dialog.addEventListener("click",e=>{if(e.target===dialog)close();});dialog.showModal();
  const list=dialog.querySelector(".comments-list"),info={like:["👍","Like"],love:["❤️","Love"],care:["🥰","Care"],haha:["😂","Haha"],wow:["😮","Wow"],sad:["😢","Sad"],angry:["😡","Angry"]};
  try{const snap=await getDocs(collection(db,"posts",postId,"comments",commentId,"reactions"));
    if(!snap.size){list.innerHTML='<p class="comment-empty">No reactions yet.</p>';return;}
    const people=await Promise.all(snap.docs.map(async d=>{const v=d.data(),uid=v.uid||d.id;let name=v.displayName||"MILOOP member";try{const p=await getDoc(doc(db,"publicProfiles",uid));if(p.exists())name=p.data().displayName||p.data().name||name;}catch(e){console.warn(e);}const [emoji,label]=info[v.type]||info.like;return {uid,name,emoji,label};}));
    const totals=people.reduce((o,x)=>(o[x.label]=(o[x.label]||0)+1,o),{});
    list.innerHTML='<p class="reaction-summary">'+Object.entries(totals).map(([label,n])=>Object.values(info).find(x=>x[1]===label)[0]+' '+n).join(' · ')+'</p>'+people.map(x=>'<div class="comment-item"><div class="comment-avatar">'+safe(initials(x.name))+'</div><div class="comment-body"><b>'+safe(x.name)+'</b><small>'+safe(x.label)+'</small></div><span class="reaction-person-emoji">'+x.emoji+'</span></div>').join("");
    dialog.querySelector("h2").textContent="Reactions · "+people.length;
  }catch(e){console.error(e);list.innerHTML='<p class="comment-empty">Could not load reactions. Publish the updated Firestore Rules.</p>';}
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
      const [reactionSnap,repliesSnap,myReactionSnap] = await Promise.all([
        getDocs(collection(db,"posts",post.id,"comments",d.id,"reactions")),
        getDocs(query(collection(db,"posts",post.id,"comments",d.id,"replies"),orderBy("createdAt","asc"))),
        currentUser ? getDoc(doc(db,"posts",post.id,"comments",d.id,"reactions",currentUser.uid)) : Promise.resolve(null)
      ]);
      const reactionTotals={};
      reactionSnap.docs.forEach(rd=>{const type=rd.data().type||"like";reactionTotals[type]=(reactionTotals[type]||0)+1;});
      const reactionEmoji={like:"👍",love:"❤️",care:"🥰",haha:"😂",wow:"😮",sad:"😢",angry:"😡"};
      const reactionSummary=Object.entries(reactionTotals).map(([type,count])=>(reactionEmoji[type]||"👍")+" "+count).join(" · ");
      const myCommentReaction=myReactionSnap?.exists()?myReactionSnap.data().type:"";
      const replies = repliesSnap.docs.map(rd=>{
        const reply=rd.data(), ownReply=currentUser && currentUser.uid===reply.uid;
        return '<div class="comment-reply"><div class="comment-avatar">'+safe(initials(reply.displayName))+'</div><div class="comment-body"><b><button type="button" class="profile-name-link" data-profile-uid="'+safe(reply.uid)+'">'+safe(reply.displayName||"MILOOP member")+'</button></b><p>'+safe(reply.text)+'</p><small>'+safe(relativeTime(reply.createdAt))+'</small>'+(ownReply?'<button type="button" class="comment-delete" data-reply-delete="'+safe(d.id)+'|'+safe(rd.id)+'">Delete</button>':"")+'</div></div>';
      }).join("");
      return '<div class="comment-item" data-comment-id="'+safe(d.id)+'"><div class="comment-avatar">'+safe(initials(c.displayName))+'</div><div class="comment-body"><b><button type="button" class="profile-name-link" data-profile-uid="'+safe(c.uid)+'">'+safe(c.displayName||"MILOOP member")+'</button></b><p>'+safe(c.text)+'</p><small>'+safe(relativeTime(c.createdAt))+(c.edited?' · edited':"")+'</small><div class="comment-tools"><button type="button" data-comment-reaction-toggle="'+safe(d.id)+'">'+(reactionEmoji[myCommentReaction]||"☺")+' React</button><button type="button" data-comment-reaction-list="'+safe(d.id)+'">'+safe(reactionSummary||"0 reactions")+'</button><button type="button" data-reply-toggle="'+safe(d.id)+'">Reply</button>'+(own?'<button type="button" data-comment-edit="'+safe(d.id)+'">Edit</button><button type="button" class="comment-delete" data-comment-delete="'+safe(d.id)+'">Delete</button>':"")+'</div><div class="comment-reaction-picker" data-comment-picker="'+safe(d.id)+'" hidden>'+Object.entries(reactionEmoji).map(([type,emoji])=>'<button type="button" data-comment-reaction="'+type+'" data-comment-id="'+safe(d.id)+'" aria-label="'+type+'">'+emoji+'</button>').join("")+'</div><form class="reply-form" data-reply-form="'+safe(d.id)+'" hidden><input maxlength="500" placeholder="Write a reply…" required><button type="submit">Reply</button></form><div class="comment-replies">'+replies+'</div></div></div>';
    }));
    $("commentsList").innerHTML = rows.length ? rows.join("") : '<p class="comment-empty">No comments yet. Start the conversation.</p>';
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
    const parentPost=posts.find(p=>p.id===activePostId);
    if(parentPost?.authorUid && parentPost.authorUid!==currentUser.uid){
      await addDoc(collection(db,"users",parentPost.authorUid,"notifications"),{type:"comment",fromUid:currentUser.uid,postId:activePostId,text:(currentUser.displayName||"A member")+" commented on your post.",createdAt:serverTimestamp(),read:false}).catch(err=>console.warn("Comment notification failed:",err));
    }
    commentText.value="";
  }catch(err){console.error(err);toast("Could not add comment. Check Firestore Rules.");}
  finally{if(submit)submit.disabled=false;}
});
$("commentsList").addEventListener("click",async e=>{
  const reactToggle=e.target.closest("[data-comment-reaction-toggle]");
  const reactButton=e.target.closest("[data-comment-reaction]");
  const reactList=e.target.closest("[data-comment-reaction-list]");
  const toggle=e.target.closest("[data-reply-toggle]");
  const edit=e.target.closest("[data-comment-edit]");
  const del=e.target.closest("[data-comment-delete]");
  const replyDel=e.target.closest("[data-reply-delete]");
  try{
    if(reactList){
      await showCommentReactions(activePostId,reactList.dataset.commentReactionList);
      return;
    }
    if(!currentUser){$("authOpen").click();return;}
    if(reactToggle){
      const picker=$("commentsList").querySelector('[data-comment-picker="'+reactToggle.dataset.commentReactionToggle+'"]');
      if(picker)picker.hidden=!picker.hidden;
    } else if(reactButton){
      const commentId=reactButton.dataset.commentId,type=reactButton.dataset.commentReaction;
      const ref=doc(db,"posts",activePostId,"comments",commentId,"reactions",currentUser.uid);
      const existing=await getDoc(ref);
      if(existing.exists()&&existing.data().type===type)await deleteDoc(ref);
      else await setDoc(ref,{uid:currentUser.uid,displayName:currentUser.displayName||currentUser.email?.split("@")[0]||"MILOOP member",type,createdAt:serverTimestamp()});
      const active=posts.find(p=>p.id===activePostId);if(active)openComments(active);
    } else if(toggle){
      const form=$("commentsList").querySelector('[data-reply-form="'+toggle.dataset.replyToggle+'"]');
      if(form){form.hidden=!form.hidden;if(!form.hidden)form.querySelector("input").focus();}
    } else if(edit){
      const ref=doc(db,"posts",activePostId,"comments",edit.dataset.commentEdit);
      const snap=await getDoc(ref);if(!snap.exists()||snap.data().uid!==currentUser.uid)return;
      const changed=prompt("Edit your comment",snap.data().text);if(changed===null)return;
      if(!changed.trim()){toast("Comment cannot be empty.");return;}
      await updateDoc(ref,{text:changed.trim().slice(0,500),edited:true,editedAt:serverTimestamp()});
    } else if(del){
      await deleteDoc(doc(db,"posts",activePostId,"comments",del.dataset.commentDelete));
    } else if(replyDel){
      const [commentId,replyId]=replyDel.dataset.replyDelete.split("|");
      const ref=doc(db,"posts",activePostId,"comments",commentId,"replies",replyId);
      const snap=await getDoc(ref);if(snap.exists()&&snap.data().uid===currentUser.uid)await deleteDoc(ref);
    }
  }catch(err){console.error(err);toast("Comment action failed: "+(err.code||"try again"));}
});
$("commentsList").addEventListener("submit",async e=>{
  const form=e.target.closest("[data-reply-form]");if(!form)return;
  e.preventDefault();if(!currentUser){$("authOpen").click();return;}
  const text=form.querySelector("input").value.trim();if(!text)return;
  try{
    await addDoc(collection(db,"posts",activePostId,"comments",form.dataset.replyForm,"replies"),{
      uid:currentUser.uid,
      displayName:currentUser.displayName||currentUser.email?.split("@")[0]||"MILOOP member",
      text:text.slice(0,500),createdAt:serverTimestamp()
    });
    form.reset();toast("Reply added.");
  }catch(err){console.error(err);toast("Could not add reply: "+(err.code||"try again"));}
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
  const card=e.target.closest("[data-id]");if(!card)return;
  const p=posts.find(x=>x.id===card.dataset.id);if(!p)return;
  const action=e.target.closest("[data-action]");
  const reactionButton=e.target.closest("[data-reaction]");
  try {
    if(action?.dataset.action==="menu"){
      const menu=card.querySelector(".post-menu-list");const open=menu.hidden;
      document.querySelectorAll(".post-menu-list,.reaction-picker").forEach(x=>x.hidden=true);
      menu.hidden=!open;action.setAttribute("aria-expanded",String(open));return;
    }
    if(action?.dataset.action==="reaction-toggle"){
      const picker=card.querySelector(".reaction-picker");const open=picker.hidden;
      document.querySelectorAll(".reaction-picker,.post-menu-list").forEach(x=>x.hidden=true);
      picker.hidden=!open;action.setAttribute("aria-expanded",String(open));return;
    }
    if(reactionButton){
      if(!currentUser){$("authOpen").click();return;}
      const type=reactionButton.dataset.reaction,ref=doc(db,"posts",p.id,"reactions",currentUser.uid);
      const existing=await getDoc(ref),liked=(p.likes||[]).includes(currentUser.uid);
      if(existing.exists()&&existing.data().type===type){
        await deleteDoc(ref);
        if(liked)await updateDoc(doc(db,"posts",p.id),{likes:arrayRemove(currentUser.uid),likeCount:Math.max(0,(p.likeCount||0)-1)});
        p.myReaction="";
      }else{
        await setDoc(ref,{uid:currentUser.uid,displayName:currentUser.displayName||currentUser.email?.split("@")[0]||"MILOOP member",type,createdAt:serverTimestamp()});
        if(!liked)await updateDoc(doc(db,"posts",p.id),{likes:arrayUnion(currentUser.uid),likeCount:(p.likeCount||0)+1});
        p.myReaction=type;
        if(!liked&&p.authorUid&&p.authorUid!==currentUser.uid)await addDoc(collection(db,"users",p.authorUid,"notifications"),{type:"like",fromUid:currentUser.uid,postId:p.id,text:(currentUser.displayName||"A member")+" reacted to your post.",createdAt:serverTimestamp(),read:false}).catch(err=>console.warn("Reaction notification failed:",err));
      }
      render();return;
    }
    if(!action)return;
    if(action.dataset.action==="likers"){await showPostLikers(p);
    }else if(action.dataset.action==="save"){
      if(!currentUser){$("authOpen").click();return;}
      const ref=doc(db,"bookmarks",currentUser.uid,"items",p.id),snap=await getDoc(ref);
      if(snap.exists()){await deleteDoc(ref);toast("Removed from Saved.");action.innerHTML="▱ <span>Save post</span>";}
      else{await setDoc(ref,{postId:p.id,createdAt:serverTimestamp()});toast("Post saved.");action.innerHTML="▣ <span>Saved</span>";}
    }else if(action.dataset.action==="block"){
      if(!currentUser){$("authOpen").click();return;}
      if(p.authorUid===currentUser.uid)return;
      if(confirm("Block this member? Their posts will be hidden.")){
        await setDoc(doc(db,"blocks",currentUser.uid,"users",p.authorUid),{uid:p.authorUid,createdAt:serverTimestamp()});
        document.querySelectorAll('#posts .post[data-author-uid="'+CSS.escape(p.authorUid)+'"]').forEach(el=>el.remove());
        toast("Member blocked.");
      }
    }else if(action.dataset.action==="edit"&&p.authorUid===currentUser?.uid){
      const edited=window.prompt("Edit your post",p.text);if(edited===null)return;if(!edited.trim()){toast("Post cannot be empty.");return;}await updateDoc(doc(db,"posts",p.id),{text:edited.trim().slice(0,1000)});toast("Post updated.");
    }else if(action.dataset.action==="delete"&&p.authorUid===currentUser?.uid){
      if(confirm("Delete this post?"))await deleteDoc(doc(db,"posts",p.id));
    }else if(action.dataset.action==="share"||action.dataset.action==="copy-link"){
      const url=new URL(location.href);url.search="";url.searchParams.set("post",p.id);url.hash="";
      if(action.dataset.action==="share"&&navigator.share)await navigator.share({title:"MILOOP post",text:p.text,url:url.href});else{await copyText(url.href);toast("Post link copied.");}
    }else if(action.dataset.action==="comment")openComments(p);
  }catch(error){if(error.name!=="AbortError"){console.error(error);toast("Action failed: "+(error.code||"Please try again."));}}
});
document.addEventListener("click",e=>{if(!e.target.closest(".post-menu-wrap,.reaction-wrap"))document.querySelectorAll(".post-menu-list,.reaction-picker").forEach(x=>x.hidden=true)});
// Profile, messages, notifications, stories and discovery are handled by social-features.js.
// Keep placeholder click handlers out of this file so they cannot override real feature panels.
$("invite").addEventListener("click",async()=>{
  try{if(navigator.share)await navigator.share({title:"Join me on MILOOP",text:"Connect. Share. Belong.",url:location.href});else{await navigator.clipboard.writeText(location.href);toast("Page link copied.");}}catch(e){if(e.name!=="AbortError")toast("Could not share right now.");}
});
onAuthStateChanged(auth,user=>{currentUser=user;render();});
stopPosts=onSnapshot(query(collection(db,"posts"),orderBy("createdAt","desc")),async snapshot=>{
  posts=snapshot.docs.map(d=>({id:d.id,...d.data()}));
  if(currentUser){await Promise.all(posts.map(async p=>{try{const mine=await getDoc(doc(db,"posts",p.id,"reactions",currentUser.uid));p.myReaction=mine.exists()?mine.data().type:"";}catch(err){console.warn("Could not load reaction:",err);}}));}
  render();
  const targetPost=new URLSearchParams(location.search).get("post");if(targetPost){const card=[...document.querySelectorAll("[data-id]")].find(el=>el.dataset.id===targetPost);if(card){card.scrollIntoView({behavior:"smooth",block:"center"});card.style.outline="3px solid #155eef";card.style.outlineOffset="3px";}}
},error=>{console.error("MILOOP posts listener:",error);toast("Could not load posts. Check Firestore rules.");});
