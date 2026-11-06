import { auth, db } from "./firebase.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import {
  doc, getDoc, setDoc, addDoc, collection, onSnapshot, query, orderBy,
  limit, where, serverTimestamp, updateDoc
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

const $ = id => document.getElementById(id);
let currentUser = null;
let stopListener = null;
let activeChatId = null;
let stopChat = null;
let activeStoryListener = null;

const panel = document.createElement("section");
panel.id = "socialPanel";
panel.className = "social-panel";
panel.setAttribute("aria-live","polite");
panel.innerHTML = '<div class="social-panel-head"><h2 id="socialPanelTitle">MILOOP</h2><button id="socialPanelClose" type="button" aria-label="Close">×</button></div><div id="socialPanelBody"></div>';
document.body.append(panel);

const styles = document.createElement("style");
styles.textContent = `
.social-panel{display:none;position:fixed;z-index:40;right:16px;top:82px;width:min(430px,calc(100vw - 24px));max-height:78vh;overflow:auto;background:#fff;border:1px solid #e4eaf4;border-radius:16px;box-shadow:0 18px 60px #14264a30;padding:18px}
.social-panel.open{display:block}.social-panel-head{display:flex;justify-content:space-between;align-items:center;margin-bottom:14px}
.social-panel-head h2{font-size:16px;margin:0;color:#17233d}.social-panel-head button{border:0;border-radius:50%;width:30px;height:30px;background:#f1f4fa;font-size:20px;color:#71809a}
.social-panel p{font-size:11px;color:#7d899d;line-height:1.6}.social-panel input,.social-panel textarea{display:block;width:100%;box-sizing:border-box;border:1px solid #e2e8f2;border-radius:9px;padding:11px;margin:8px 0;font:12px 'DM Sans',sans-serif}.social-panel textarea{min-height:80px;resize:vertical}
.social-panel button.action{border:0;border-radius:8px;padding:10px 13px;background:#155eef;color:white;font:700 11px 'DM Sans',sans-serif;cursor:pointer;margin:5px 4px 5px 0}
.social-panel button.secondary{background:#eef4ff;color:#155eef}.social-item{border-top:1px solid #edf0f5;padding:12px 0;font-size:11px;overflow-wrap:anywhere}.social-item small{display:block;color:#8b97aa;margin-top:5px;font-size:9px}
.social-item .muted{color:#8995a8}.social-chat-log{height:220px;overflow:auto;background:#f7f9fc;border-radius:10px;padding:10px;margin:10px 0}
.social-chat-log .mine{text-align:right}.social-chat-log p{display:inline-block;background:#eaf1ff;border-radius:10px;padding:8px 10px;max-width:85%;color:#243653}
@media(max-width:700px){.social-panel{top:68px;right:8px;width:calc(100vw - 16px);max-height:78vh}}
`;
document.head.append(styles);

function toast(message){
  const el=$("toast");
  if(el){el.textContent=message;el.classList.add("show");setTimeout(()=>el.classList.remove("show"),2500);}
}
function escapeHtml(value){
  return String(value??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
}
function openPanel(title,html){
  if(stopListener){stopListener();stopListener=null;}
  if(stopChat){stopChat();stopChat=null;}
  $("socialPanelTitle").textContent=title;
  $("socialPanelBody").innerHTML=html;
  panel.classList.add("open");
}
function closePanel(){
  panel.classList.remove("open");
  if(stopListener){stopListener();stopListener=null;}
  if(stopChat){stopChat();stopChat=null;}
}
$("socialPanelClose").addEventListener("click",closePanel);
function needUser(){
  if(currentUser)return true;
  $("authOpen")?.click();
  toast("Sign in to use this feature.");
  return false;
}
function button(id,label){
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

handlers.profile=async()=>{
  try{
    await ensurePublicProfile(currentUser);
    const ref=doc(db,"publicProfiles",currentUser.uid);
    const snap=await getDoc(ref),p=snap.data()||{};
    openPanel("My public profile",`<p>Your profile is visible to signed-in MILOOP members. Your email is not shown.</p>
      <label>Display name<input id="profileName" maxlength="60" value="${escapeHtml(p.displayName||"")}" placeholder="Your display name"></label>
      <label>Bio<textarea id="profileBio" maxlength="180" placeholder="A little about you…">${escapeHtml(p.bio||"")}</textarea></label>
      <div class="social-item"><b>Your profile ID</b><small>${escapeHtml(currentUser.uid)}</small></div>
      <button class="action" id="savePublicProfile">Save profile</button>
      <button class="action secondary" id="copyProfileId">Copy profile ID</button>`);
    $("savePublicProfile").onclick=async()=>{
      const displayName=$("profileName").value.trim(),bio=$("profileBio").value.trim();
      if(!displayName){toast("Display name is required.");return;}
      try{await updateDoc(ref,{displayName:displayName.slice(0,60),bio:bio.slice(0,180),updatedAt:serverTimestamp()});await (await import("https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js")).updateProfile(currentUser,{displayName});toast("Profile updated.");}
      catch(e){console.error(e);toast("Could not save profile. Publish the latest Firestore Rules.");}
    };
    $("copyProfileId").onclick=async()=>{try{await navigator.clipboard.writeText(currentUser.uid);toast("Profile ID copied.");}catch(e){toast("Copy is unavailable in this browser.");}};
  }catch(e){console.error(e);toast("Could not open profile. Check Firestore Rules.");}
};

handlers.messages=()=>{
  openPanel("Private messages",`<p>Start a private text chat using another member's Profile ID. Only the two chat participants can read messages.</p>
    <input id="chatRecipient" placeholder="Other member's Profile ID" autocomplete="off">
    <button class="action" id="openPrivateChat">Open chat</button>
    <div id="chatArea"></div>`);
  $("openPrivateChat").onclick=async()=>{
    const recipient=$("chatRecipient").value.trim();
    if(!recipient||recipient===currentUser.uid){toast("Enter another member's valid Profile ID.");return;}
    const members=[currentUser.uid,recipient].sort();
    const chatId=members.join("_");
    try{
      const chatRef=doc(db,"chats",chatId);
      const existingChat=await getDoc(chatRef);
      if(existingChat.exists()) await updateDoc(chatRef,{updatedAt:serverTimestamp()});
      else await setDoc(chatRef,{members,createdAt:serverTimestamp(),updatedAt:serverTimestamp()});
      activeChatId=chatId;
      $("chatArea").innerHTML='<div id="chatLog" class="social-chat-log">Loading messages…</div><form id="chatSendForm"><input id="chatMessage" maxlength="1000" placeholder="Write a message…" required><button class="action" type="submit">Send</button></form>';
      if(stopChat)stopChat();
      stopChat=onSnapshot(query(collection(db,"chats",chatId,"messages"),orderBy("createdAt","asc"),limit(80)),snap=>{
        const log=$("chatLog");if(!log)return;
        log.innerHTML=snap.empty?"<p>No messages yet. Say hello!</p>":snap.docs.map(d=>{
          const m=d.data();return `<div class="${m.uid===currentUser.uid?"mine":""}"><p>${escapeHtml(m.text)}<small>${m.uid===currentUser.uid?"You":"Member"}</small></p></div>`;
        }).join("");
        log.scrollTop=log.scrollHeight;
      },err=>{console.error(err);toast("Could not load chat. Check Firestore Rules.");});
      $("chatSendForm").onsubmit=async e=>{
        e.preventDefault();const text=$("chatMessage").value.trim();if(!text)return;
        try{
          await addDoc(collection(db,"chats",chatId,"messages"),{uid:currentUser.uid,text,createdAt:serverTimestamp()});
          await updateDoc(chatRef,{updatedAt:serverTimestamp()});
          $("chatMessage").value="";
        }catch(err){console.error(err);toast("Message could not be sent.");}
      };
    }catch(e){console.error(e);toast("Could not open this chat. Check the member ID and Rules.");}
  };
};

handlers.notifications=()=>{
  openPanel("Notifications",'<p>Your account activity will appear here.</p><div id="notificationsList">Loading…</div>');
  const ref=collection(db,"users",currentUser.uid,"notifications");
  stopListener=onSnapshot(query(ref,orderBy("createdAt","desc"),limit(30)),snap=>{
    const target=$("notificationsList");if(!target)return;
    target.innerHTML=snap.empty?'<div class="social-item">No notifications yet.</div>':snap.docs.map(d=>{
      const n=d.data();
      return `<div class="social-item">${escapeHtml(n.text||"New activity")}<small>${escapeHtml(n.createdAt?.toDate?.().toLocaleString()||"Just now")} ${n.read?"· Read":"· New"}</small></div>`;
    }).join("");
  },e=>{console.error(e);$("notificationsList").textContent="Could not load notifications. Publish the latest Rules.";});
};

handlers.allStories=()=>{
  openPanel("Stories",'<p>Text stories stay visible for 24 hours. Expired stories are filtered out.</p><button class="action" id="createStory">＋ Add story</button><div id="storiesList">Loading…</div>');
  $("createStory").onclick=async()=>{
    const text=window.prompt("Write a story (maximum 240 characters)");
    if(!text||!text.trim())return;
    try{
      await addDoc(collection(db,"stories"),{uid:currentUser.uid,displayName:currentUser.displayName||"MILOOP member",text:text.trim().slice(0,240),createdAt:serverTimestamp(),expiresAt:new Date(Date.now()+86400000)});
      toast("Story shared for 24 hours.");
    }catch(e){console.error(e);toast("Could not publish story. Check Rules.");}
  };
  stopListener=onSnapshot(query(collection(db,"stories"),orderBy("createdAt","desc"),limit(60)),snap=>{
    const target=$("storiesList");if(!target)return;
    const active=snap.docs.filter(d=>d.data().expiresAt?.toDate?.() ? d.data().expiresAt.toDate().getTime()>Date.now() : false);
    target.innerHTML=active.length?active.map(d=>{const s=d.data();return `<div class="social-item"><b>${escapeHtml(s.displayName||"MILOOP member")}</b><p>${escapeHtml(s.text)}</p><small>Expires in 24 hours after posting</small></div>`;}).join(""):'<div class="social-item">No active stories yet.</div>';
  },e=>{console.error(e);$("storiesList").textContent="Could not load stories. Publish the latest Rules.";});
};

handlers.explore=handlers.photo=handlers.video=handlers.feeling=()=>toast("This feature is planned for a later update.");

handlers.follow=()=>{
  openPanel("Find and follow members",`<p>Ask a member for their Profile ID, then look up their public profile.</p><input id="memberProfileId" placeholder="Member Profile ID" autocomplete="off"><button class="action" id="lookupMember">Find member</button><div id="memberResult"></div>`);
  $("lookupMember").onclick=async()=>{
    const uid=$("memberProfileId").value.trim();if(!uid||uid===currentUser.uid){toast("Enter another member's Profile ID.");return;}
    try{
      const snap=await getDoc(doc(db,"publicProfiles",uid));
      if(!snap.exists()){$("memberResult").textContent="Profile not found.";return;}
      const p=snap.data(),followRef=doc(db,"follows",currentUser.uid,"following",uid);
      let isFollowing=(await getDoc(followRef)).exists();
      $("memberResult").innerHTML=`<div class="social-item"><b>${escapeHtml(p.displayName||"MILOOP member")}</b><p>${escapeHtml(p.bio||"No bio yet.")}</p><small>Profile ID: ${escapeHtml(uid)}</small><button class="action" id="toggleFollow">${isFollowing?"Unfollow":"Follow"}</button></div>`;
      $("toggleFollow").onclick=async()=>{
        try{
          if(isFollowing){
            const {deleteDoc}=await import("https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js");
            await deleteDoc(followRef);isFollowing=false;toast("Unfollowed.");
          }else{
            await setDoc(followRef,{uid,createdAt:serverTimestamp()});
            await addDoc(collection(db,"users",uid,"notifications"),{type:"follow",fromUid:currentUser.uid,text:(currentUser.displayName||"A member")+" started following you.",createdAt:serverTimestamp(),read:false});
            toast("You are now following this member.");
          }
          $("toggleFollow").textContent=isFollowing?"Unfollow":"Follow";
        }catch(e){console.error(e);toast("Follow action failed. Publish the latest Firestore Rules.");}
      };
    }catch(e){console.error(e);toast("Could not find member. Check Rules.");}
  };
};

handlers.seePeople = handlers.follow;

["profile","messages","notifications","allStories","explore","seePeople","photo","video","feeling"].forEach(id=>button(id,id));
onAuthStateChanged(auth,user=>{currentUser=user;});
