import { auth, db } from "./firebase.js";
import { uploadMedia, mediaMarkup } from "./cloudinary.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import {
  doc, getDoc, getDocs, setDoc, addDoc, collection, collectionGroup, onSnapshot, query, orderBy,
  limit, where, serverTimestamp, updateDoc, deleteDoc
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

const $ = id => document.getElementById(id);
let currentUser = null;
let stopListener = null;
let stopChat = null;
let stopPresence = null;
let stopTyping = null;

const panel = document.createElement("section");
panel.id = "socialPanel";
panel.className = "social-panel";
panel.setAttribute("aria-live","polite");
panel.innerHTML = '<div class="social-panel-head"><h2 id="socialPanelTitle">MILOOP</h2><button id="socialPanelClose" type="button" aria-label="Close">×</button></div><div id="socialPanelBody"></div>';
document.body.append(panel);

const styles = document.createElement("style");
styles.textContent = `
.md-verified{display:inline-flex;align-items:center;margin-left:6px;padding:3px 7px;border-radius:20px;background:#eaf2ff;color:#155eef;font-size:9px;font-weight:800;vertical-align:middle}.profile-name-link{border:0;background:transparent;color:#155eef;font:inherit;font-weight:700;padding:0;cursor:pointer;text-align:left}.profile-name-link:hover{text-decoration:underline}
.social-panel{display:none;position:fixed;z-index:40;right:16px;top:82px;width:min(470px,calc(100vw - 24px));max-height:82vh;overflow:auto;background:#fff;border:1px solid #e4eaf4;border-radius:16px;box-shadow:0 18px 60px #14264a30;padding:18px}
.social-panel.open{display:block}.social-panel-head{display:flex;justify-content:space-between;align-items:center;margin-bottom:14px}
.social-panel-head h2{font-size:16px;margin:0;color:#17233d}.social-panel-head button{border:0;border-radius:50%;width:30px;height:30px;background:#f1f4fa;font-size:20px;color:#71809a}
.social-panel p{font-size:11px;color:#7d899d;line-height:1.6}.social-panel input,.social-panel textarea{display:block;width:100%;box-sizing:border-box;border:1px solid #e2e8f2;border-radius:9px;padding:11px;margin:8px 0;font:12px 'DM Sans',sans-serif}.social-panel textarea{min-height:80px;resize:vertical}
.social-panel button.action{border:0;border-radius:8px;padding:10px 13px;background:#155eef;color:white;font:700 11px 'DM Sans',sans-serif;cursor:pointer;margin:5px 4px 5px 0}
.social-panel button.secondary{background:#eef4ff;color:#155eef}.social-item{border-top:1px solid #edf0f5;padding:12px 0;font-size:11px;overflow-wrap:anywhere}.social-item small{display:block;color:#8b97aa;margin-top:5px;font-size:9px}
.social-item .muted{color:#8995a8}.social-chat-log{height:300px;overflow:auto;background:#f7f9fc;border-radius:10px;padding:10px;margin:10px 0}
.social-chat-log .mine{text-align:right}.social-chat-log .bubble{display:inline-block;background:#eaf1ff;border-radius:12px;padding:8px 10px;max-width:88%;color:#243653;text-align:left;margin:5px 0}.social-chat-log .theirs .bubble{background:#fff;border:1px solid #e8edf5}
.social-chat-log .bubble p{font-size:12px;color:#243653;margin:0;white-space:pre-wrap}.social-chat-log .bubble small{display:block;font-size:9px;color:#8794a9;margin-top:5px}
.social-chat-log .msg-tools{display:flex;gap:8px;justify-content:flex-end;margin-top:5px}.social-chat-log .msg-tools button{border:0;background:none;color:#6c7c95;font-size:9px;padding:2px;cursor:pointer}
.chat-row{display:flex;align-items:center;gap:10px;width:100%;padding:11px 2px;border:0;border-top:1px solid #edf0f5;background:#fff;text-align:left;cursor:pointer}
.chat-avatar{width:38px;height:38px;border-radius:50%;background:#eaf1ff;color:#155eef;display:grid;place-items:center;font-weight:800;flex:none}
.chat-row .chat-meta{min-width:0;flex:1}.chat-row b{font-size:11px;color:#243653}.chat-row small{display:block;color:#8995a8;font-size:9px;margin-top:4px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.member-result{border:1px solid #e8edf5;border-radius:10px;padding:10px;margin:8px 0}.chat-send{display:flex;gap:7px;align-items:center}.chat-send input{flex:1;min-width:0}.chat-send button{flex:none}
.chat-presence{display:block;margin-top:4px;font-size:10px;color:#8491a6}.chat-presence.online{color:#0b9b68}.typing-status{min-height:17px;font-size:10px;color:#155eef;padding:0 4px}.reply-preview{display:flex;justify-content:space-between;align-items:center;gap:8px;background:#eef4ff;border-left:3px solid #155eef;padding:8px 10px;border-radius:8px;margin:7px 0}.reply-preview[hidden]{display:none}.reply-preview span{min-width:0}.reply-preview b,.reply-preview small{display:block;font-size:10px;color:#40516e}.reply-preview small{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:300px;margin-top:3px}.reply-preview button{border:0;background:transparent;font-size:18px;color:#75829a}.reply-quote{border-left:2px solid #155eef;background:#f1f5fd;padding:6px 8px;border-radius:5px;margin-bottom:6px}.reply-quote b,.reply-quote span{display:block;font-size:9px;color:#53617a}.reply-quote span{margin-top:3px;white-space:pre-wrap;overflow-wrap:anywhere}
@media(max-width:700px){.social-panel{top:68px;right:8px;width:calc(100vw - 16px);max-height:82vh;padding:14px}.social-chat-log{height:42vh}}
`;
styles.textContent += ".profile-upload-field{border:1px solid #e2e8f2;border-radius:10px;padding:10px;margin:10px 0}.profile-upload-field>b{display:block;font-size:12px;color:#243653;margin-bottom:5px}.profile-upload-field small{display:block;font-size:10px;color:#7d899d;overflow-wrap:anywhere}";
document.head.append(styles);

function toast(message){
  const el=$("toast");
  if(el){el.textContent=message;el.classList.add("show");setTimeout(()=>el.classList.remove("show"),2800);}
}
function escapeHtml(value){
  return String(value??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
}
function openPanel(title,html){
  if(stopListener){stopListener();stopListener=null;}
  if(stopChat){stopChat();stopChat=null;}
  if(stopPresence){stopPresence();stopPresence=null;}
  if(stopTyping){stopTyping();stopTyping=null;}
  $("socialPanelTitle").textContent=title;
  $("socialPanelBody").innerHTML=html;
  panel.classList.add("open");
}
function closePanel(){
  panel.classList.remove("open");
  if(stopListener){stopListener();stopListener=null;}
  if(stopChat){stopChat();stopChat=null;}
  if(stopPresence){stopPresence();stopPresence=null;}
  if(stopTyping){stopTyping();stopTyping=null;}
}
$("socialPanelClose").addEventListener("click",closePanel);
function needUser(){
  if(currentUser)return true;
  $("authOpen")?.click();
  toast("Sign in to use this feature.");
  return false;
}
function button(id){
  const el=$(id);
  if(el)el.addEventListener("click",event=>{
    event.preventDefault();
    event.stopImmediatePropagation();
    if(!needUser())return;
    handlers[id]?.();
  },true);
}
const handlers={};

async function ensurePublicProfile(user){
  const ref=doc(db,"publicProfiles",user.uid);
  const snap=await getDoc(ref);
  if(!snap.exists()){
    await setDoc(ref,{uid:user.uid,displayName:user.displayName||user.email?.split("@")[0]||"MILOOP member",bio:"",createdAt:serverTimestamp(),updatedAt:serverTimestamp()});
  }
}

async function openFollowList(uid,type){
  const isFollowers=type==="followers";
  openPanel(isFollowers?"Followers":"Following",'<p>'+ (isFollowers?"People who follow this member.":"People this member follows.") +'</p><div id="followPeopleList">Loading…</div>');
  try{
    const q=isFollowers
      ? query(collectionGroup(db,"following"),where("uid","==",uid),limit(100))
      : query(collection(db,"follows",uid,"following"),limit(100));
    const snap=await getDocs(q);
    const rows=await Promise.all(snap.docs.map(async edge=>{
      const personUid=isFollowers?edge.ref.parent.parent.id:edge.id;
      const profile=await getDoc(doc(db,"publicProfiles",personUid));
      if(!profile.exists())return "";
      const p=profile.data()||{},name=p.displayName||"MILOOP member";
      return '<button class="chat-row" data-follow-profile="'+escapeHtml(personUid)+'" style="text-align:left"><span class="chat-avatar">'+escapeHtml(name.charAt(0).toUpperCase())+'</span><span class="chat-meta"><b>'+escapeHtml(name)+'</b><small>View profile</small></span><span>›</span></button>';
    }));
    const target=$("followPeopleList");
    if(target)target.innerHTML=rows.filter(Boolean).join("")||'<div class="social-item">No '+(isFollowers?"followers":"following")+' yet.</div>';
    target?.querySelectorAll("[data-follow-profile]").forEach(el=>el.onclick=()=>showMemberProfile(el.dataset.followProfile));
  }catch(e){
    console.error("Follow list error:",e);
    const target=$("followPeopleList");
    if(target)target.textContent="Could not load list: "+(e.code||e.message);
  }
}

async function showMemberProfile(uid){
  try{
    const snap=await getDoc(doc(db,"publicProfiles",uid));
    if(!snap.exists()){toast("Profile not found.");return;}
    const p=snap.data()||{},mine=currentUser.uid===uid;
    const fields=[["School","school"],["Class","class"],["Date of birth","dateOfBirth"],["College","college"],["University","university"],["City","city"]];
    const publicFields=Array.isArray(p.publicFields)?p.publicFields:null;
    const details=fields.filter(x=>p[x[1]] && (x[1]==="dateOfBirth" ? mine : (publicFields ? publicFields.includes(x[1]) : true))).map(x=>'<div class="social-item"><b>'+x[0]+'</b><small>'+escapeHtml(p[x[1]])+'</small></div>').join("");
    openPanel(mine?"My profile":(p.displayName||"Member profile"),
      '<div style="text-align:center;padding:10px"><div style="height:110px;overflow:hidden;border-radius:13px;background:#edf3ff;margin-bottom:-32px">'+(p.coverUrl?'<img src="'+escapeHtml(p.coverUrl)+'" alt="Profile cover" style="width:100%;height:110px;object-fit:cover">':'')+'</div><div class="chat-avatar" style="position:relative;width:64px;height:64px;margin:0 auto 8px;font-size:22px;border:4px solid #fff;overflow:hidden">'+(p.avatarUrl?'<img src="'+escapeHtml(p.avatarUrl)+'" alt="Profile photo" style="width:100%;height:100%;object-fit:cover">':escapeHtml((p.displayName||"M").charAt(0).toUpperCase()))+'</div><h2>'+escapeHtml(p.displayName||"MILOOP member")+(p.verified?'<span class="md-verified" title="Verified profile">✓ Verified</span>':'')+'</h2><p>'+escapeHtml(p.bio||"")+'</p></div>'+
      (mine?'<button class="action" id="editProfileDetails" style="display:block;width:100%;margin:8px 0 14px">✎ Edit profile</button><button class="action secondary" id="shareProfileLink" style="display:block;width:100%;margin:0 0 14px">↗ Share profile</button>':'<div style="display:flex;gap:7px;margin:8px 0 14px"><button class="action" id="profileFollowToggle" style="flex:1">Loading…</button><button class="action secondary" id="messageProfile" style="flex:1">Message</button></div>')+
      '<div class="social-item"><b>Profile ID</b><small>'+escapeHtml(uid)+'</small></div><div id="profileFollowStats" style="display:flex;gap:8px;margin:10px 0"><button class="action secondary" id="showFollowers">Followers · …</button><button class="action secondary" id="showFollowing">Following · …</button></div>'+details+
      '<h3 style="font-size:13px">Posts</h3><div id="memberPosts">Loading…</div>');
    stopListener=onSnapshot(query(collection(db,"posts"),where("authorUid","==",uid),limit(50)),posts=>{
      const el=$("memberPosts");if(!el)return;
      el.innerHTML=posts.empty?'<div class="social-item">No posts yet.</div>':posts.docs.map(d=>'<div class="social-item"><p style="font-size:12px;color:#243653;white-space:pre-wrap">'+escapeHtml(d.data().text||"")+'</p><small>'+escapeHtml(d.data().createdAt?.toDate?.().toLocaleString()||"")+'</small></div>').join("");
    },err=>{console.error(err);if($("memberPosts"))$("memberPosts").textContent="Could not load posts: "+err.code;});
    $("showFollowers").onclick=()=>openFollowList(uid,"followers");
    $("showFollowing").onclick=()=>openFollowList(uid,"following");
    if(!mine){
      const followRef=doc(db,"follows",currentUser.uid,"following",uid);
      const followButton=$("profileFollowToggle");
      followButton.textContent="Checking…";
      let isFollowing=false;
      try{isFollowing=(await getDoc(followRef)).exists();}
      catch(e){console.error("Follow status read failed:",e);followButton.textContent="Follow status unavailable";}
      const renderFollow=()=>{followButton.textContent=isFollowing?"Following ✓":"＋ Follow";followButton.classList.toggle("secondary",isFollowing);};
      renderFollow();
      followButton.onclick=async()=>{
        followButton.disabled=true;
        try{
          if(isFollowing){await deleteDoc(followRef);isFollowing=false;toast("Unfollowed.");}
          else{
            await setDoc(followRef,{uid,createdAt:serverTimestamp()});
            isFollowing=true;
            try{await addDoc(collection(db,"users",uid,"notifications"),{type:"follow",fromUid:currentUser.uid,text:(currentUser.displayName||"A member")+" started following you.",createdAt:serverTimestamp(),read:false});}
            catch(notificationError){console.warn("Follow notification could not be sent:",notificationError);}
            toast("You are now following "+(p.displayName||"this member")+".");
          }
          renderFollow();
          try{
            const countSnap=await getDocs(query(collectionGroup(db,"following"),where("uid","==",uid)));
            $("showFollowers").textContent="Followers · "+countSnap.size;
          }catch(countError){console.warn("Follower count unavailable:",countError);}
        }catch(e){console.error(e);toast("Follow action failed: "+(e.code||e.message));}
        finally{followButton.disabled=false;}
      };
    }
    try{
      const [followersSnap,followingSnap]=await Promise.all([
        getDocs(query(collectionGroup(db,"following"),where("uid","==",uid))),
        getDocs(query(collection(db,"follows",uid,"following")))
      ]);
      $("showFollowers").textContent="Followers · "+followersSnap.size;
      $("showFollowing").textContent="Following · "+followingSnap.size;
    }catch(countError){
      console.warn("Profile follow counts unavailable:",countError);
      $("showFollowers").textContent="Followers";
      $("showFollowing").textContent="Following";
    }
    if(mine){$("editProfileDetails").onclick=()=>editOwnProfile(p);$("shareProfileLink").onclick=async()=>{const url=new URL(location.href);url.search="";url.searchParams.set("profile",uid);url.hash="";try{await navigator.clipboard.writeText(url.href);toast("Profile link copied.");}catch(e){const f=document.createElement("textarea");f.value=url.href;document.body.append(f);f.select();try{document.execCommand("copy");toast("Profile link copied.");}catch(_){toast("Could not copy link.");}f.remove();}};}else $("messageProfile").onclick=()=>openChat(uid,p.displayName||"MILOOP member");
  }catch(e){console.error(e);toast("Could not open profile: "+(e.code||e.message));}
}
function editOwnProfile(p){
  const fields=[["School","school"],["Class","class"],["Date of birth","dateOfBirth"],["College","college"],["University","university"],["City","city"]];
  const defaultPublic=["school","college","university","city"];
  const selectedPublic=Array.isArray(p.publicFields)?p.publicFields:defaultPublic;
  openPanel("Edit profile",'<p>All fields are optional. Choose which details other signed-in members can see. Your full date of birth is private unless you explicitly make it public.</p>'+
    '<label>Display name<input id="profileName" maxlength="60" value="'+escapeHtml(p.displayName||"")+'"></label>'+
    '<label>Bio<textarea id="profileBio" maxlength="180">'+escapeHtml(p.bio||"")+'</textarea></label>'+
    '<div class="profile-upload-field"><b>Profile photo</b><input id="profileAvatarFile" type="file" accept="image/*" hidden><button type="button" class="action secondary" id="chooseProfilePhoto">Choose profile photo</button><small id="profilePhotoFileName" class="muted">No new photo selected</small></div>'+
    '<div class="profile-upload-field"><b>Cover photo</b><input id="profileCoverFile" type="file" accept="image/*" hidden><button type="button" class="action secondary" id="chooseCoverPhoto">Choose cover photo</button><small id="coverPhotoFileName" class="muted">No new cover selected</small></div>'+
    '<small class="muted">JPG, PNG, WebP or GIF. Images up to 10 MB. Leave blank to keep the current photo.</small>'+
    fields.map(x=>'<label>'+x[0]+'<input id="profile_'+x[1]+'" '+(x[1]==="dateOfBirth"?'type="date"':'type="text"')+' maxlength="100" value="'+escapeHtml(p[x[1]]||"")+'"></label>'+(x[1]==="dateOfBirth"?'<small style="color:#7d899d">Private — only you can see your full date of birth.</small>':'<label style="display:flex;align-items:center;gap:8px;font-size:11px"><input type="checkbox" id="public_'+x[1]+'" style="width:auto;margin:0" '+(selectedPublic.includes(x[1])?'checked':'')+'>Show '+x[0]+' on my profile</label>')).join("")+
    '<button class="action" id="savePublicProfile">Save profile</button><button class="action secondary" id="cancelProfileEdit">Cancel</button>');
  $("chooseProfilePhoto").onclick=()=> $("profileAvatarFile").click();
  $("chooseCoverPhoto").onclick=()=> $("profileCoverFile").click();
  $("profileAvatarFile").onchange=()=>{$("profilePhotoFileName").textContent=$("profileAvatarFile").files[0]?.name||"No new photo selected";};
  $("profileCoverFile").onchange=()=>{$("coverPhotoFileName").textContent=$("profileCoverFile").files[0]?.name||"No new cover selected";};
  $("cancelProfileEdit").onclick=()=>showMemberProfile(currentUser.uid);
  $("savePublicProfile").onclick=async()=>{
    const name=$("profileName").value.trim();if(!name){toast("Display name is required.");return;}
    const data={displayName:name.slice(0,60),bio:$("profileBio").value.trim().slice(0,180),updatedAt:serverTimestamp()};
    fields.forEach(x=>data[x[1]]=$("profile_"+x[1]).value.trim().slice(0,100));
    data.publicFields=fields.filter(x=>x[1]!=="dateOfBirth" && $("public_"+x[1]).checked).map(x=>x[1]);
    try{
      const avatarFile=$("profileAvatarFile")?.files?.[0],coverFile=$("profileCoverFile")?.files?.[0];
      if(avatarFile){const uploaded=await uploadMedia(avatarFile);if(uploaded.type!=="image")throw new Error("Profile photos must be images.");data.avatarUrl=uploaded.url;}
      if(coverFile){const uploaded=await uploadMedia(coverFile);if(uploaded.type!=="image")throw new Error("Cover photos must be images.");data.coverUrl=uploaded.url;}
      await updateDoc(doc(db,"publicProfiles",currentUser.uid),data);
      await (await import("https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js")).updateProfile(currentUser,{displayName:name});
      toast("Profile saved.");showMemberProfile(currentUser.uid);
    }catch(e){console.error(e);toast("Could not save profile: "+(e.message||e.code));}
  };
}
handlers.profile=async()=>{try{await ensurePublicProfile(currentUser);await showMemberProfile(currentUser.uid);}catch(e){console.error(e);toast("Could not open profile: "+e.code);}};
document.addEventListener("click",event=>{
  const el=event.target.closest("[data-profile-uid]");if(!el)return;
  event.preventDefault();event.stopPropagation();if(needUser())showMemberProfile(el.dataset.profileUid);
},true);

async function getOrCreateChat(otherUid){
  if(!otherUid||otherUid===currentUser.uid)throw new Error("Choose another member.");
  const members=[currentUser.uid,otherUid].sort();
  const chatId=members.join("_"),chatRef=doc(db,"chats",chatId);
  let existing;
  try{existing=await getDoc(chatRef);}
  catch(err){console.error("MILOOP chat lookup failed:",err);throw new Error("chat-lookup: "+(err.code||err.message||"unknown"));}
  if(existing.exists()){
    if(!Array.isArray(existing.data().members)||!existing.data().members.includes(currentUser.uid)||!existing.data().members.includes(otherUid)){
      throw new Error("chat-members-mismatch: existing chat does not contain both members");
    }
  }else{
    try{await setDoc(chatRef,{members,createdAt:serverTimestamp(),updatedAt:serverTimestamp()});}
    catch(err){console.error("MILOOP chat create failed:",err);throw new Error("chat-create: "+(err.code||err.message||"unknown"));}
  }
  return {chatId,chatRef};
}

async function openChat(otherUid,otherName){
  try{
    const chat=await getOrCreateChat(otherUid),chatId=chat.chatId,chatRef=chat.chatRef;
    $("socialPanelTitle").innerHTML='<button type="button" class="profile-name-link" style="font-size:15px" data-profile-uid="'+escapeHtml(otherUid)+'">'+escapeHtml(otherName||"Private chat")+'</button><small id="chatPresence" class="chat-presence">Checking status…</small>';
    $("socialPanelBody").innerHTML='<button class="action secondary" id="backToChats">← All chats</button><div class="social-chat-log" id="chatLog">Loading messages…</div><div id="typingStatus" class="typing-status"></div><div id="replyPreview" class="reply-preview" hidden></div><form id="chatSendForm" class="chat-send"><input id="chatMessage" maxlength="1000" placeholder="Write a message…" required><button class="action" type="submit">Send</button></form>';
    $("backToChats").onclick=handlers.messages;
    const messagesRef=collection(db,"chats",chatId,"messages");
    if(stopChat)stopChat();if(stopPresence)stopPresence();if(stopTyping)stopTyping();
    let messageCache={},replyTarget=null,typingTimer=null;
    const presenceEl=$("chatPresence");
    stopPresence=onSnapshot(doc(db,"presence",otherUid),snap=>{
      const p=snap.exists()?snap.data():{};
      if(presenceEl){presenceEl.textContent=p.isOnline?"● Online":(p.lastSeenAt?.toDate?"Last seen "+p.lastSeenAt.toDate().toLocaleString():"Offline");presenceEl.classList.toggle("online",!!p.isOnline);}
    },()=>{if(presenceEl)presenceEl.textContent="Status unavailable";});
    stopTyping=onSnapshot(collection(db,"chats",chatId,"typing"),snap=>{
      const status=$("typingStatus");if(!status)return;
      const active=snap.docs.some(d=>d.id===otherUid&&d.data().typing===true&&d.data().updatedAt?.toDate&&Date.now()-d.data().updatedAt.toDate().getTime()<9000);
      status.textContent=active?(escapeHtml(otherName||"Member")+" is typing…"):"";
    });
    stopChat=onSnapshot(query(messagesRef,orderBy("createdAt","asc"),limit(100)),snap=>{
      const log=$("chatLog");if(!log)return;messageCache={};
      log.innerHTML=snap.empty?"<p>No messages yet. Say hello!</p>":snap.docs.map(d=>{
        const m=d.data();messageCache[d.id]=m;const mine=m.uid===currentUser.uid;
        const time=m.createdAt?.toDate?.().toLocaleString()||"Sending…";
        const seen=mine&&(m.seenBy||[]).includes(otherUid);
        const quote=m.replyToText?'<div class="reply-quote"><b>↩ Reply</b><span>'+escapeHtml(m.replyToText)+'</span></div>':"";
        const tools=(mine?'<button data-msg-action="edit" data-id="'+escapeHtml(d.id)+'">Edit</button><button data-msg-action="delete" data-id="'+escapeHtml(d.id)+'">Delete</button>':"")+'<button data-msg-action="reply" data-id="'+escapeHtml(d.id)+'">Reply</button><button data-msg-action="forward" data-id="'+escapeHtml(d.id)+'">Forward</button>';
        return '<div class="'+(mine?"mine":"theirs")+'"><div class="bubble"><small class="chat-sender-name">'+escapeHtml(m.displayName|| (mine?window.miloopDisplayName:otherName)||"MILOOP member")+'</small>'+quote+'<p>'+escapeHtml(m.text)+(m.forwarded?'<small>↪ Forwarded</small>':"")+'</p><small>'+time+(m.edited?" · Edited":"")+(mine?(seen?" · ✓✓ Seen":" · ✓ Sent"):"")+'</small><div class="msg-tools">'+tools+'</div></div></div>';
      }).join("");
      log.scrollTop=log.scrollHeight;
      snap.docs.forEach(d=>{const m=d.data();if(m.uid!==currentUser.uid&&!(m.seenBy||[]).includes(currentUser.uid)){updateDoc(doc(db,"chats",chatId,"messages",d.id),{seenBy:[...(m.seenBy||[]),currentUser.uid],seenAt:serverTimestamp()}).catch(e=>console.warn("Seen update failed:",e));}});
    },err=>{console.error(err);toast("Could not load messages: "+(err.code||err.message));});
    const input=$("chatMessage"),typingRef=doc(db,"chats",chatId,"typing",currentUser.uid);
    input.addEventListener("input",()=>{
      setDoc(typingRef,{uid:currentUser.uid,typing:!!input.value.trim(),updatedAt:serverTimestamp()},{merge:true}).catch(()=>{});
      clearTimeout(typingTimer);typingTimer=setTimeout(()=>setDoc(typingRef,{uid:currentUser.uid,typing:false,updatedAt:serverTimestamp()},{merge:true}).catch(()=>{}),2200);
    });
    $("chatLog").onclick=async event=>{
      const control=event.target.closest("[data-msg-action]");if(!control)return;
      const id=control.dataset.id,action=control.dataset.msgAction,m=messageCache[id];if(!m)return;
      if(action==="reply"){
        replyTarget={uid:m.uid,text:m.text};const preview=$("replyPreview");preview.hidden=false;
        preview.innerHTML='<span><b>Replying to '+(m.uid===currentUser.uid?"yourself":escapeHtml(otherName||"member"))+'</b><small>'+escapeHtml(m.text.slice(0,120))+'</small></span><button type="button" id="cancelReply">×</button>';
        $("cancelReply").onclick=()=>{replyTarget=null;preview.hidden=true;preview.innerHTML="";};input.focus();
      }else if(action==="edit"){
        if(m.uid!==currentUser.uid)return;const edited=window.prompt("Edit your message",m.text);if(edited===null)return;if(!edited.trim()){toast("Message cannot be empty.");return;}
        try{await updateDoc(doc(db,"chats",chatId,"messages",id),{text:edited.trim().slice(0,1000),edited:true,editedAt:serverTimestamp()});}catch(e){toast("Edit failed: "+(e.code||e.message));}
      }else if(action==="delete"){
        if(m.uid!==currentUser.uid)return;if(!window.confirm("Delete this message?"))return;
        try{await deleteDoc(doc(db,"chats",chatId,"messages",id));toast("Message deleted.");}catch(e){toast("Delete failed: "+(e.code||e.message));}
      }else if(action==="forward"){
        const target=window.prompt("Enter the recipient's Profile ID to forward this message");if(!target||!target.trim())return;
        try{const forwardChat=await getOrCreateChat(target.trim());await addDoc(collection(db,"chats",forwardChat.chatId,"messages"),{uid:currentUser.uid,displayName:window.miloopDisplayName||currentUser.displayName||"MILOOP member",text:m.text,createdAt:serverTimestamp(),seenBy:[],forwarded:true});await updateDoc(forwardChat.chatRef,{updatedAt:serverTimestamp(),lastMessage:m.text.slice(0,120),lastMessageAt:serverTimestamp(),lastMessageUid:currentUser.uid});toast("Message forwarded.");}catch(e){toast("Forward failed: "+(e.code||e.message));}
      }
    };
    $("chatSendForm").onsubmit=async e=>{
      e.preventDefault();const text=input.value.trim();if(!text)return;const send=e.submitter;if(send)send.disabled=true;
      try{
        const profileSnap=await getDoc(doc(db,"publicProfiles",currentUser.uid));const displayName=(profileSnap.exists()?profileSnap.data().displayName:"")?.trim()||window.miloopDisplayName||currentUser.displayName||currentUser.email?.split("@")[0]||"MILOOP member";window.miloopDisplayName=displayName;const payload={uid:currentUser.uid,displayName,text,createdAt:serverTimestamp(),seenBy:[]};
        if(replyTarget){payload.replyToUid=replyTarget.uid;payload.replyToText=replyTarget.text.slice(0,160);}
        await addDoc(messagesRef,payload);
        await updateDoc(chatRef,{updatedAt:serverTimestamp(),lastMessage:text.slice(0,120),lastMessageAt:serverTimestamp(),lastMessageUid:currentUser.uid});
        const chatData=(await getDoc(chatRef)).data(),recipientUid=(chatData.members||[]).find(uid=>uid!==currentUser.uid);
        if(recipientUid)await addDoc(collection(db,"users",recipientUid,"notifications"),{type:"message",fromUid:currentUser.uid,toUid:recipientUid,chatId,text:(currentUser.displayName||"A member")+" sent you a message.",createdAt:serverTimestamp(),read:false}).catch(err=>console.warn("Message notification was not saved:",err));
        input.value="";replyTarget=null;$("replyPreview").hidden=true;$("replyPreview").innerHTML="";
        await setDoc(typingRef,{uid:currentUser.uid,typing:false,updatedAt:serverTimestamp()},{merge:true});
      }catch(err){console.error("MILOOP message send error:",err);toast("Message failed: "+(err.code||err.message||"unknown error"));}
      finally{if(send)send.disabled=false;}
    };
  }catch(e){console.error("MILOOP chat open error:",e);toast("Could not open chat: "+(e.message||e.code||"unknown error"));}
}
handlers.messages=()=>{
  openPanel("Messenger",'<p>Search members by name or Profile ID, or open an existing conversation.</p>'+
    '<input id="memberSearch" placeholder="Search name or Profile ID…" autocomplete="off">'+
    '<button class="action" id="searchMembers">Search members</button><div id="memberSearchResults"></div>'+
    '<h3 style="font-size:12px;margin:18px 0 8px;color:#243653">Your conversations</h3><div id="chatList">Loading chats…</div>');
  $("searchMembers").onclick=async()=>{
    const term=$("memberSearch").value.trim(),target=$("memberSearchResults");
    if(!term){toast("Enter a name or Profile ID.");return;}
    target.textContent="Searching…";
    try{
      const exact=await getDoc(doc(db,"publicProfiles",term));
      let profiles=[];
      if(exact.exists())profiles=[exact];
      else{
        const all=await getDocs(query(collection(db,"publicProfiles"),limit(300)));
        const needle=term.toLowerCase();
        profiles=all.docs.filter(d=>{
          const p=d.data();return (p.displayName||"").toLowerCase().includes(needle)||d.id.toLowerCase().includes(needle);
        }).slice(0,25);
      }
      if(!profiles.length){target.innerHTML='<div class="social-item">No members found. Check the spelling or Profile ID.</div>';return;}
      target.innerHTML=profiles.filter(d=>d.id!==currentUser.uid).map(d=>{
        const p=d.data(),name=p.displayName||"MILOOP member",initial=name.trim().charAt(0).toUpperCase()||"M";
        return '<div class="member-result"><div class="chat-row" style="border:0;padding:2px 0"><span class="chat-avatar">'+escapeHtml(initial)+'</span><span class="chat-meta"><b>'+escapeHtml(name)+'</b><small>Profile ID: '+escapeHtml(d.id)+'</small></span><button class="action" data-open-member="'+escapeHtml(d.id)+'" data-name="'+escapeHtml(name)+'">Message</button></div></div>';
      }).join("")||'<div class="social-item">That is your own profile.</div>';
      target.querySelectorAll("[data-open-member]").forEach(el=>el.onclick=()=>openChat(el.dataset.openMember,el.dataset.name));
    }catch(e){console.error(e);target.textContent="Search failed: "+(e.code||e.message);}
  };
  stopListener=onSnapshot(query(collection(db,"chats"),where("members","array-contains",currentUser.uid)),async snap=>{
    const target=$("chatList");if(!target)return;
    if(snap.empty){target.innerHTML='<div class="social-item">No conversations yet. Search a member above to start chatting.</div>';return;}
    const rows=await Promise.all(snap.docs.map(async d=>{
      const data=d.data(),other=(data.members||[]).find(uid=>uid!==currentUser.uid);
      if(!other)return "";
      let name="MILOOP member";
      try{const profile=await getDoc(doc(db,"publicProfiles",other));if(profile.exists())name=profile.data().displayName||name;}
      catch(e){console.warn("Could not load chat member profile",e);}
      return '<div class="chat-row"><span class="chat-avatar">'+escapeHtml(name.charAt(0).toUpperCase())+'</span><span class="chat-meta"><b><button type="button" class="profile-name-link" data-profile-uid="'+escapeHtml(other)+'">'+escapeHtml(name)+'</button></b><small>Open conversation</small></span><button type="button" class="action secondary" data-chat-uid="'+escapeHtml(other)+'" data-chat-name="'+escapeHtml(name)+'">Message</button></div>';
    }));
    if($("chatList"))$("chatList").innerHTML=rows.join("")||'<div class="social-item">No conversations yet.</div>';
    $("chatList")?.querySelectorAll("[data-chat-uid]").forEach(el=>el.onclick=()=>openChat(el.dataset.chatUid,el.dataset.chatName));
  },e=>{console.error(e);const target=$("chatList");if(target)target.textContent="Could not load chats: "+(e.code||e.message);});
};

handlers.notifications=()=>{
  openPanel("Notifications",'<p>Your account activity will appear here.</p><div id="notificationsList">Loading…</div>');
  const ref=collection(db,"users",currentUser.uid,"notifications");
  stopListener=onSnapshot(query(ref,orderBy("createdAt","desc"),limit(30)),snap=>{
    const target=$("notificationsList");if(!target)return;
    target.innerHTML=snap.empty?'<div class="social-item">No notifications yet.</div>':snap.docs.map(d=>{
      const n=d.data();
      return '<div class="social-item">'+escapeHtml(n.text||"New activity")+'<small>'+escapeHtml(n.createdAt?.toDate?.().toLocaleString()||"Just now")+' '+(n.read?"· Read":"· New")+'</small></div>';
    }).join("");
  },e=>{console.error(e);$("notificationsList").textContent="Could not load notifications. Publish the latest Rules.";});
};


function storyName(){return currentUser?.displayName||currentUser?.email?.split("@")[0]||"MILOOP member";}
function storyDate(value){return value?.toDate?.()?.toLocaleString?.()||"Just now";}
async function openStoryDetails(storyId,storyData){
 const owner=storyData.uid===currentUser.uid;
 const storyRef=doc(db,"stories",storyId);
 try{
  await setDoc(doc(db,"stories",storyId,"views",currentUser.uid),{
   uid:currentUser.uid,displayName:storyName(),viewedAt:serverTimestamp()
  },{merge:true});
 }catch(e){console.warn("Story view tracking failed:",e);}
 openPanel("Story",'<div class="social-item"><b>'+escapeHtml(storyData.displayName||"MILOOP member")+'</b><p style="white-space:pre-wrap">'+escapeHtml(storyData.text||"")+'</p>'+mediaMarkup(storyData,"miloop-media")+'<small>'+storyDate(storyData.createdAt)+'</small></div>'+
  '<div style="display:flex;gap:8px;margin:10px 0"><button class="action" id="storyLike">♡ Like</button><button class="action secondary" id="storyCommentFocus">Comment</button></div>'+
  '<div id="storyOwnerInsights" class="social-item" style="display:'+(owner?"block":"none")+'"><b>Story insights</b><p id="storyInsightCounts">Loading likes and views…</p><div id="storyLikesList"></div><div id="storyViewsList"></div></div>'+
  '<h3 style="font-size:13px">Comments</h3><div id="storyComments">Loading…</div><form id="storyCommentForm" style="display:flex;gap:7px;margin-top:10px"><input id="storyCommentInput" maxlength="300" placeholder="Write a comment…" required style="flex:1;min-width:0"><button class="action" type="submit">Send</button></form>');
 const likeRef=doc(db,"stories",storyId,"likes",currentUser.uid);
 const likeSnap=await getDoc(likeRef);
 const likeBtn=$("storyLike");
 if(likeBtn){likeBtn.textContent=likeSnap.exists()?"♥ Liked":"♡ Like";likeBtn.onclick=async()=>{
  try{const now=await getDoc(likeRef);if(now.exists())await deleteDoc(likeRef);else await setDoc(likeRef,{uid:currentUser.uid,displayName:storyName(),createdAt:serverTimestamp()});likeBtn.textContent=now.exists()?"♡ Like":"♥ Liked";if(owner)loadStoryInsights();}catch(e){console.error(e);toast("Like failed: "+(e.code||e.message));}
 };}
 $("storyCommentFocus").onclick=()=>$("storyCommentInput")?.focus();
 async function loadComments(){
  const target=$("storyComments");if(!target)return;
  try{
   const snap=await getDocs(query(collection(db,"stories",storyId,"comments"),orderBy("createdAt","asc"),limit(100)));
   target.innerHTML=snap.empty?'<div class="social-item">No comments yet.</div>':snap.docs.map(d=>{const c=d.data();return '<div class="social-item"><b>'+escapeHtml(c.displayName||"MILOOP member")+'</b><p>'+escapeHtml(c.text||"")+'</p><small>'+storyDate(c.createdAt)+'</small></div>';}).join("");
  }catch(e){target.textContent="Could not load comments: "+(e.code||e.message);}
 }
 async function loadStoryInsights(){
  if(!owner)return;
  try{
   const [likes,views]=await Promise.all([
    getDocs(query(collection(db,"stories",storyId,"likes"),limit(200))),
    getDocs(query(collection(db,"stories",storyId,"views"),limit(300)))
   ]);
   const counts=$("storyInsightCounts");if(counts)counts.textContent=likes.size+" likes · "+views.size+" views";
   const ll=$("storyLikesList"),vl=$("storyViewsList");
   if(ll)ll.innerHTML='<b>Liked by</b>'+ (likes.empty?'<p>No likes yet.</p>':likes.docs.map(d=>'<p>'+escapeHtml(d.data().displayName||"MILOOP member")+'</p>').join(""));
   if(vl)vl.innerHTML='<b>Viewed by</b>'+ (views.empty?'<p>No views yet.</p>':views.docs.map(d=>'<p>'+escapeHtml(d.data().displayName||"MILOOP member")+'</p>').join(""));
  }catch(e){const c=$("storyInsightCounts");if(c)c.textContent="Insights unavailable: "+(e.code||e.message);}
 }
 $("storyCommentForm").onsubmit=async e=>{
  e.preventDefault();const input=$("storyCommentInput"),text=input.value.trim();if(!text)return;
  try{await addDoc(collection(db,"stories",storyId,"comments"),{uid:currentUser.uid,displayName:storyName(),text:text.slice(0,300),createdAt:serverTimestamp()});input.value="";await loadComments();if(owner)await loadStoryInsights();}
  catch(err){console.error(err);toast("Comment failed: "+(err.code||err.message));}
 };
 await loadComments();await loadStoryInsights();
}
handlers.allStories=()=>{
 openPanel("Stories",'<p>Stories stay visible for 24 hours.</p><form id="createStoryForm"><textarea id="storyTextInput" maxlength="240" placeholder="Write a story…"></textarea><label class="action secondary" style="display:inline-block">＋ Add photo or video<input id="storyMediaFile" type="file" accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm,video/quicktime" style="display:block;max-width:100%;font-size:10px;margin-top:7px"></label><div id="storyMediaPreview"></div><button class="action" type="submit">Share story</button></form><div id="storiesList">Loading…</div>');
 let storyMediaFile=null;
 $("storyMediaFile").onchange=()=>{storyMediaFile=$("storyMediaFile").files?.[0]||null;const holder=$("storyMediaPreview");holder.innerHTML="";if(storyMediaFile){const node=document.createElement(storyMediaFile.type.startsWith("video/")?"video":"img");node.src=URL.createObjectURL(storyMediaFile);if(node.tagName==="VIDEO"){node.controls=true;node.playsInline=true;}node.style.cssText="display:block;width:100%;max-height:220px;object-fit:contain;margin:8px 0;border-radius:9px;background:#101828";holder.append(node);}};
 $("createStoryForm").onsubmit=async e=>{e.preventDefault();const text=$("storyTextInput").value.trim();if(!text&&!storyMediaFile){toast("Write a story or attach media.");return;}const btn=e.submitter;if(btn)btn.disabled=true;try{let media={};if(storyMediaFile){btn.textContent="Uploading…";media=await uploadMedia(storyMediaFile);}await addDoc(collection(db,"stories"),{uid:currentUser.uid,displayName:storyName(),text:text.slice(0,240),...(media.url?{mediaUrl:media.url,mediaType:media.type,mediaPath:media.publicId}:{}),createdAt:serverTimestamp(),expiresAt:new Date(Date.now()+86400000)});toast("Story shared for 24 hours.");$("storyTextInput").value="";$("storyMediaFile").value="";$("storyMediaPreview").innerHTML="";storyMediaFile=null;}catch(e){console.error(e);toast("Could not publish story: "+(e.message||e.code));}finally{if(btn){btn.disabled=false;btn.textContent="Share story";}}};
 stopListener=onSnapshot(query(collection(db,"stories"),orderBy("createdAt","desc"),limit(60)),snap=>{
  const target=$("storiesList");if(!target)return;
  const active=snap.docs.filter(d=>{const exp=d.data().expiresAt?.toDate?.();return exp&&exp.getTime()>Date.now();});
  target.innerHTML=active.length?active.map(d=>{const x=d.data();return '<div class="social-item"><b>'+escapeHtml(x.displayName||"MILOOP member")+'</b><p>'+escapeHtml(x.text||"")+'</p>'+mediaMarkup(x,"miloop-media")+'<small>Expires in 24 hours</small><div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:8px"><button class="action" data-story-like="'+escapeHtml(d.id)+'">♡ Like</button><button class="action secondary" data-open-story="'+escapeHtml(d.id)+'">Comment / View</button></div></div>';}).join(""):'<div class="social-item">No active stories yet.</div>';
  target.querySelectorAll("[data-open-story]").forEach(b=>b.onclick=()=>{const d=snap.docs.find(x=>x.id===b.dataset.openStory);if(d)openStoryDetails(d.id,d.data());});
  target.querySelectorAll("[data-story-like]").forEach(b=>b.onclick=async()=>{try{const ref=doc(db,"stories",b.dataset.storyLike,"likes",currentUser.uid),existing=await getDoc(ref);if(existing.exists()){await deleteDoc(ref);b.textContent="♡ Like";}else{await setDoc(ref,{uid:currentUser.uid,displayName:storyName(),createdAt:serverTimestamp()});b.textContent="♥ Liked";} }catch(e){console.error(e);toast("Like failed: "+(e.code||e.message));}});
 },e=>{console.error(e);$("storiesList").textContent="Could not load stories: "+(e.code||e.message);});
};


handlers.explore=()=>{
  openPanel("Explore",'<p>Discover what is happening in your MILOOP community.</p><div class="social-item"><b>#MILOOPLaunch</b><small>Community updates</small></div><div class="social-item"><b>#CreativeMinds</b><small>Ideas and creativity</small></div><div class="social-item"><b>#DailyInspiration</b><small>Positive moments</small></div><div class="social-item"><b>#TechAndIdeas</b><small>Technology and learning</small></div>');
};
function openComposerFor(kind){
  const dialog=document.getElementById("postDialog"),picker=document.getElementById("postMediaFile");
  if(kind==="photo"&&picker)picker.accept="image/jpeg,image/png,image/webp,image/gif";
  if(kind==="video"&&picker)picker.accept="video/mp4,video/webm,video/quicktime";
  if(dialog&&!dialog.open)dialog.showModal();
  if((kind==="photo"||kind==="video")&&picker){
    if(typeof picker.showPicker==="function"){try{picker.showPicker();}catch(_){picker.click();}}
    else picker.click();
  }
  if(kind==="feeling")document.getElementById("postFeeling")?.focus();
}
handlers.photo=()=>openComposerFor("photo");
handlers.video=()=>openComposerFor("video");
handlers.feeling=()=>openComposerFor("feeling");

handlers.follow=()=>{
  openPanel("Find and follow members",'<p>Enter a member Profile ID to look up their public profile.</p><input id="memberProfileId" placeholder="Member Profile ID" autocomplete="off"><button class="action" id="lookupMember">Find member</button><div id="memberResult"></div>');
  $("lookupMember").onclick=async()=>{
    const uid=$("memberProfileId").value.trim();if(!uid||uid===currentUser.uid){toast("Enter another member's Profile ID.");return;}
    try{
      const snap=await getDoc(doc(db,"publicProfiles",uid));
      if(!snap.exists()){$("memberResult").textContent="Profile not found.";return;}
      const p=snap.data(),followRef=doc(db,"follows",currentUser.uid,"following",uid);
      let isFollowing=(await getDoc(followRef)).exists();
      $("memberResult").innerHTML='<div class="social-item"><b>'+escapeHtml(p.displayName||"MILOOP member")+'</b><p>'+escapeHtml(p.bio||"No bio yet.")+'</p><small>Profile ID: '+escapeHtml(uid)+'</small><button class="action" id="toggleFollow">'+(isFollowing?"Unfollow":"Follow")+'</button></div>';
      $("toggleFollow").onclick=async()=>{
        try{
          if(isFollowing){await deleteDoc(followRef);isFollowing=false;toast("Unfollowed.");}
          else{
            await setDoc(followRef,{uid,createdAt:serverTimestamp()});
            await addDoc(collection(db,"users",uid,"notifications"),{type:"follow",fromUid:currentUser.uid,text:(currentUser.displayName||"A member")+" started following you.",createdAt:serverTimestamp(),read:false});
            isFollowing=true;toast("You are now following this member.");
          }
          $("toggleFollow").textContent=isFollowing?"Unfollow":"Follow";
        }catch(e){console.error(e);toast("Follow action failed: "+(e.code||e.message));}
      };
    }catch(e){console.error(e);toast("Could not find member: "+(e.code||e.message));}
  };
};
handlers.seePeople=handlers.follow;

document.querySelector(".mobile-nav")?.addEventListener("click",event=>{
  const control=event.target.closest("[data-social-action]");if(!control)return;
  event.preventDefault();event.stopPropagation();
  const action=control.dataset.socialAction;if(!needUser())return;
  handlers[action]?.();
});
/* Desktop sidebar navigation uses hash links; route them to the same social panels. */
document.addEventListener("click",event=>{
  const link=event.target.closest('a[href="#messages"],a[href="#profile"]');
  if(!link)return;
  event.preventDefault();
  event.stopImmediatePropagation();
  const action=link.getAttribute("href").slice(1);
  if(!needUser())return;
  if(typeof handlers[action]==="function")handlers[action]();
  else toast("This section is loading. Please refresh and try again.");
},true);
["profile","messages","notifications","allStories","explore","seePeople","photo","video","feeling"].forEach(button);
async function updateMyPresence(isOnline){if(!currentUser)return;try{await setDoc(doc(db,"presence",currentUser.uid),{uid:currentUser.uid,isOnline,lastSeenAt:serverTimestamp()},{merge:true});}catch(e){console.warn("Presence update failed:",e);}}
document.addEventListener("visibilitychange",()=>{if(currentUser)updateMyPresence(document.visibilityState==="visible");});
window.addEventListener("pagehide",()=>{if(currentUser)updateMyPresence(false);});

let stopHomeStories=null;
function watchHomeStories(){
 const list=$("homeStoriesList");
 if(!list||stopHomeStories)return;
 stopHomeStories=onSnapshot(query(collection(db,"stories"),orderBy("createdAt","desc"),limit(100)),snap=>{
  const now=Date.now(),seen=new Set(),items=[];
  snap.docs.forEach(d=>{
   const x=d.data()||{};
   const expiry=x.expiresAt?.toDate?.() || (x.expiresAt instanceof Date?x.expiresAt:null);
   if(!x.uid||!expiry||expiry.getTime()<=now||seen.has(x.uid))return;
   seen.add(x.uid);items.push({uid:x.uid,storyId:d.id,storyData:x,displayName:x.displayName||"MILOOP member"});
  });
  const own=document.createElement("button");
  own.type="button";own.className="story";own.id="homeAddStory";
  own.innerHTML='<span class="story-ring add">＋</span><small>Your story</small>';
  list.replaceChildren(own);
  items.forEach(x=>{
   const b=document.createElement("button");b.type="button";b.className="story";b.dataset.storyUid=x.uid;
   const initials=x.displayName.trim().split(/\\s+/).slice(0,2).map(v=>v[0]||"").join("").toUpperCase()||"M";
   b.innerHTML='<span class="story-ring blue">'+escapeHtml(initials)+'</span><small>'+escapeHtml(x.displayName)+'</small>';
   b.addEventListener("click",()=>{if(!currentUser){$("authOpen")?.click();return;}openStoryDetails(x.storyId,x.storyData);});
   list.append(b);
  });
 },err=>{console.error("Homepage stories listener failed:",err);});
}
function openStoriesFromHome(){if(currentUser)handlers.allStories?.();else $("authOpen")?.click();}
document.addEventListener("click",e=>{
 if(e.target.closest("#homeAddStory")){e.preventDefault();openStoriesFromHome();}
});
watchHomeStories();
onAuthStateChanged(auth,async user=>{currentUser=user;if(user){updateMyPresence(true);try{await ensurePublicProfile(user);}catch(e){console.error("Public profile sync failed:",e);}const targetProfile=new URLSearchParams(location.search).get("profile");if(targetProfile)showMemberProfile(targetProfile);}else{if(stopHomeStories){stopHomeStories();stopHomeStories=null;}}if(!user&&new URLSearchParams(location.search).has("profile")){toast("Sign in to view this profile.");}});

