import { auth, db } from "./firebase.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import {
  doc, getDoc, getDocs, setDoc, addDoc, collection, collectionGroup, onSnapshot, query, orderBy,
  limit, where, serverTimestamp, updateDoc, deleteDoc
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

const $ = id => document.getElementById(id);
let currentUser = null;
let stopListener = null;
let stopChat = null;

const panel = document.createElement("section");
panel.id = "socialPanel";
panel.className = "social-panel";
panel.setAttribute("aria-live","polite");
panel.innerHTML = '<div class="social-panel-head"><h2 id="socialPanelTitle">MILOOP</h2><button id="socialPanelClose" type="button" aria-label="Close">×</button></div><div id="socialPanelBody"></div>';
document.body.append(panel);

const styles = document.createElement("style");
styles.textContent = `
.profile-name-link{border:0;background:transparent;color:#155eef;font:inherit;font-weight:700;padding:0;cursor:pointer;text-align:left}.profile-name-link:hover{text-decoration:underline}
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
@media(max-width:700px){.social-panel{top:68px;right:8px;width:calc(100vw - 16px);max-height:82vh;padding:14px}.social-chat-log{height:42vh}}
`;
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
      '<div style="text-align:center;padding:10px"><div class="chat-avatar" style="width:64px;height:64px;margin:auto;font-size:22px">'+escapeHtml((p.displayName||"M").charAt(0).toUpperCase())+'</div><h2>'+escapeHtml(p.displayName||"MILOOP member")+'</h2><p>'+escapeHtml(p.bio||"")+'</p></div>'+
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
    fields.map(x=>'<label>'+x[0]+'<input id="profile_'+x[1]+'" '+(x[1]==="dateOfBirth"?'type="date"':'type="text"')+' maxlength="100" value="'+escapeHtml(p[x[1]]||"")+'"></label>'+(x[1]==="dateOfBirth"?'<small style="color:#7d899d">Private — only you can see your full date of birth.</small>':'<label style="display:flex;align-items:center;gap:8px;font-size:11px"><input type="checkbox" id="public_'+x[1]+'" style="width:auto;margin:0" '+(selectedPublic.includes(x[1])?'checked':'')+'>Show '+x[0]+' on my profile</label>')).join("")+
    '<button class="action" id="savePublicProfile">Save profile</button><button class="action secondary" id="cancelProfileEdit">Cancel</button>');
  $("cancelProfileEdit").onclick=()=>showMemberProfile(currentUser.uid);
  $("savePublicProfile").onclick=async()=>{
    const name=$("profileName").value.trim();if(!name){toast("Display name is required.");return;}
    const data={displayName:name.slice(0,60),bio:$("profileBio").value.trim().slice(0,180),updatedAt:serverTimestamp()};
    fields.forEach(x=>data[x[1]]=$("profile_"+x[1]).value.trim().slice(0,100));
    data.publicFields=fields.filter(x=>x[1]!=="dateOfBirth" && $("public_"+x[1]).checked).map(x=>x[1]);
    try{
      await updateDoc(doc(db,"publicProfiles",currentUser.uid),data);
      await (await import("https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js")).updateProfile(currentUser,{displayName:name});
      toast("Profile saved.");showMemberProfile(currentUser.uid);
    }catch(e){console.error(e);toast("Could not save profile: "+(e.code||e.message));}
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
  const matches=await getDocs(query(collection(db,"chats"),where("members","array-contains",currentUser.uid)));
  const existing=matches.docs.find(item=>(item.data().members||[]).includes(otherUid));
  let chatId,chatRef;
  if(existing){
    chatId=existing.id;chatRef=doc(db,"chats",chatId);
    await updateDoc(chatRef,{updatedAt:serverTimestamp()});
  }else{
    chatId=members.join("_");chatRef=doc(db,"chats",chatId);
    await setDoc(chatRef,{members,createdAt:serverTimestamp(),updatedAt:serverTimestamp()});
  }
  return {chatId,chatRef};
}

async function openChat(otherUid,otherName){
  try{
    const chat=await getOrCreateChat(otherUid);
    const chatId=chat.chatId,chatRef=chat.chatRef;
    $("socialPanelTitle").innerHTML='<button type="button" class="profile-name-link" id="chatHeaderProfile" style="font-size:15px" data-profile-uid="'+escapeHtml(otherUid)+'">'+escapeHtml(otherName||"Private chat")+'</button>';
    $("socialPanelBody").innerHTML='<button class="action secondary" id="backToChats">← All chats</button>'+
      '<div class="social-chat-log" id="chatLog">Loading messages…</div>'+
      '<form id="chatSendForm" class="chat-send"><input id="chatMessage" maxlength="1000" placeholder="Write a message…" required><button class="action" type="submit">Send</button></form>';
    $("backToChats").onclick=handlers.messages;
    const messagesRef=collection(db,"chats",chatId,"messages");
    if(stopChat)stopChat();
    let messageCache={};
    stopChat=onSnapshot(query(messagesRef,orderBy("createdAt","asc"),limit(100)),snap=>{
      const log=$("chatLog");if(!log)return;
      messageCache={};
      log.innerHTML=snap.empty?"<p>No messages yet. Say hello!</p>":snap.docs.map(d=>{
        const m=d.data();messageCache[d.id]=m;
        const mine=m.uid===currentUser.uid;
        const time=m.createdAt?.toDate?.().toLocaleString()||"Sending…";
        const tools=(mine?'<button data-msg-action="edit" data-id="'+escapeHtml(d.id)+'">Edit</button><button data-msg-action="delete" data-id="'+escapeHtml(d.id)+'">Delete</button>':'')+
          '<button data-msg-action="forward" data-id="'+escapeHtml(d.id)+'">Forward</button>';
        return '<div class="'+(mine?"mine":"theirs")+'"><div class="bubble"><p>'+escapeHtml(m.text)+(m.forwarded?'<small>↪ Forwarded</small>':"")+'</p><small>'+time+(m.edited?" · Edited":"")+'</small><div class="msg-tools">'+tools+'</div></div></div>';
      }).join("");
      log.scrollTop=log.scrollHeight;
    },err=>{console.error(err);toast("Could not load messages: "+(err.code||err.message));});
    $("chatLog").onclick=async event=>{
      const control=event.target.closest("[data-msg-action]");if(!control)return;
      const id=control.dataset.id,action=control.dataset.msgAction,m=messageCache[id];if(!m)return;
      if(action==="edit"){
        if(m.uid!==currentUser.uid)return;
        const edited=window.prompt("Edit your message",m.text);
        if(edited===null)return;
        if(!edited.trim()){toast("Message cannot be empty.");return;}
        try{await updateDoc(doc(db,"chats",chatId,"messages",id),{text:edited.trim().slice(0,1000),edited:true,editedAt:serverTimestamp()});}
        catch(e){console.error(e);toast("Edit failed: "+(e.code||e.message));}
      }else if(action==="delete"){
        if(m.uid!==currentUser.uid)return;
        if(!window.confirm("Delete this message?"))return;
        try{await deleteDoc(doc(db,"chats",chatId,"messages",id));toast("Message deleted.");}
        catch(e){console.error(e);toast("Delete failed: "+(e.code||e.message));}
      }else if(action==="forward"){
        const target=window.prompt("Enter the recipient's Profile ID to forward this message");
        if(!target||!target.trim())return;
        try{
          const forwardChat=await getOrCreateChat(target.trim());
          await addDoc(collection(db,"chats",forwardChat.chatId,"messages"),{uid:currentUser.uid,text:m.text,createdAt:serverTimestamp(),forwarded:true});
          await updateDoc(forwardChat.chatRef,{updatedAt:serverTimestamp()});
          toast("Message forwarded.");
        }catch(e){console.error(e);toast("Forward failed: "+(e.code||e.message));}
      }
    };
    $("chatSendForm").onsubmit=async e=>{
      e.preventDefault();const input=$("chatMessage"),text=input.value.trim();if(!text)return;
      const send=e.submitter;if(send)send.disabled=true;
      try{
        await addDoc(messagesRef,{uid:currentUser.uid,text,createdAt:serverTimestamp()});
        await updateDoc(chatRef,{updatedAt:serverTimestamp()});
        const chatData=(await getDoc(chatRef)).data();
        const recipientUid=(chatData.members||[]).find(uid=>uid!==currentUser.uid);
        if(recipientUid){
          await addDoc(collection(db,"users",recipientUid,"notifications"),{
            type:"message",fromUid:currentUser.uid,toUid:recipientUid,chatId,
            text:(currentUser.displayName||"A member")+" sent you a message.",
            createdAt:serverTimestamp(),read:false
          });
        }
        input.value="";
      }catch(err){console.error("MILOOP message send error:",err);toast("Message failed: "+(err.code||err.message||"unknown error"));}
      finally{if(send)send.disabled=false;}
    };
  }catch(e){console.error("MILOOP chat open error:",e);toast("Could not open chat: "+(e.code||e.message||"unknown error"));}
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

handlers.allStories=()=>{
  openPanel("Stories",'<p>Text stories stay visible for 24 hours. Expired stories are filtered out.</p><button class="action" id="createStory">＋ Add story</button><div id="storiesList">Loading…</div>');
  $("createStory").onclick=async()=>{
    const text=window.prompt("Write a story (maximum 240 characters)");
    if(!text||!text.trim())return;
    try{await addDoc(collection(db,"stories"),{uid:currentUser.uid,displayName:currentUser.displayName||"MILOOP member",text:text.trim().slice(0,240),createdAt:serverTimestamp(),expiresAt:new Date(Date.now()+86400000)});toast("Story shared for 24 hours.");}
    catch(e){console.error(e);toast("Could not publish story. Check Rules.");}
  };
  stopListener=onSnapshot(query(collection(db,"stories"),orderBy("createdAt","desc"),limit(60)),snap=>{
    const target=$("storiesList");if(!target)return;
    const active=snap.docs.filter(d=>d.data().expiresAt?.toDate?.()?d.data().expiresAt.toDate().getTime()>Date.now():false);
    target.innerHTML=active.length?active.map(d=>{const s=d.data();return '<div class="social-item"><b>'+escapeHtml(s.displayName||"MILOOP member")+'</b><p>'+escapeHtml(s.text)+'</p><small>Expires in 24 hours after posting</small></div>';}).join(""):'<div class="social-item">No active stories yet.</div>';
  },e=>{console.error(e);$("storiesList").textContent="Could not load stories. Publish the latest Rules.";});
};

handlers.explore=()=>{
  openPanel("Explore",'<p>Discover what is happening in your MILOOP community.</p><div class="social-item"><b>#MILOOPLaunch</b><small>Community updates</small></div><div class="social-item"><b>#CreativeMinds</b><small>Ideas and creativity</small></div><div class="social-item"><b>#DailyInspiration</b><small>Positive moments</small></div><div class="social-item"><b>#TechAndIdeas</b><small>Technology and learning</small></div>');
};
handlers.photo=handlers.video=handlers.feeling=()=>toast("This feature is not available yet.");

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
["profile","messages","notifications","allStories","explore","seePeople","photo","video","feeling"].forEach(button);
onAuthStateChanged(auth,async user=>{currentUser=user;if(user){try{await ensurePublicProfile(user);}catch(e){console.error("Public profile sync failed:",e);}const targetProfile=new URLSearchParams(location.search).get("profile");if(targetProfile)showMemberProfile(targetProfile);}else if(new URLSearchParams(location.search).has("profile")){toast("Sign in to view this profile.");}});


// Account settings: profile, password reset, appearance and sign out.
handlers.settings=()=>{
  const theme=localStorage.getItem("miloop-theme")||"light";
  openPanel("Settings",'<div class="settings-layout"><div class="settings-section"><h3>Account</h3><div class="social-item"><b>Signed in as</b><small>'+escapeHtml(currentUser?.email||"Email unavailable")+'</small></div><button class="action" id="settingsEditProfile">✎ Edit profile details</button><button class="action secondary" id="settingsPasswordReset">Send password reset email</button></div><div class="settings-section"><h3>Appearance</h3><p>Choose how MILOOP looks on this device.</p><label class="settings-choice"><span>Light mode</span><input type="radio" name="miloopTheme" value="light" '+(theme==="light"?"checked":"")+'></label><label class="settings-choice"><span>Dark mode</span><input type="radio" name="miloopTheme" value="dark" '+(theme==="dark"?"checked":"")+'></label></div><div class="settings-section"><h3>Privacy & safety</h3><p>Your full date of birth should remain private. Only profile fields you choose to share are shown to other signed-in members. Avoid posting personal contact details publicly.</p><button class="action secondary" id="settingsPrivacyProfile">Review profile visibility</button></div><div class="settings-section"><h3>Session</h3><p>Sign out of MILOOP on this device.</p><button class="action settings-signout" id="settingsSignOut">Sign out</button></div></div>');
  $("settingsEditProfile").onclick=()=>{closePanel();$("profile")?.click();};
  $("settingsPrivacyProfile").onclick=()=>{closePanel();$("profile")?.click();};
  $("settingsPasswordReset").onclick=async()=>{
    const email=currentUser?.email;if(!email){toast("No email address is linked to this account.");return;}
    try{const {sendPasswordResetEmail}=await import("https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js");await sendPasswordResetEmail(auth,email);toast("Password reset email sent to "+email+".");}
    catch(e){console.error(e);toast("Could not send reset email: "+(e.code||e.message));}
  };
  document.querySelectorAll('input[name="miloopTheme"]').forEach(input=>input.onchange=()=>{
    const selected=input.value;localStorage.setItem("miloop-theme",selected);document.documentElement.dataset.theme=selected;toast(selected==="dark"?"Dark mode enabled.":"Light mode enabled.");
  });
  $("settingsSignOut").onclick=async()=>{
    if(!confirm("Sign out of MILOOP on this device?"))return;
    try{const {signOut}=await import("https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js");await signOut(auth);closePanel();toast("You have signed out.");}
    catch(e){console.error(e);toast("Could not sign out: "+(e.code||e.message));}
  };
};
const settingsButton=document.createElement("button");
settingsButton.type="button";settingsButton.id="settingsTopButton";settingsButton.className="icon-btn";
settingsButton.setAttribute("aria-label","Settings");settingsButton.title="Settings";settingsButton.textContent="⚙";
settingsButton.addEventListener("click",()=>{if(needUser())handlers.settings();});
const topActions=document.querySelector(".top-actions");
if(topActions&&!document.getElementById("settingsTopButton"))topActions.insertBefore(settingsButton,topActions.querySelector("#profile"));
const sidebarSettings=document.querySelector('.left nav a[href="#settings"]');
if(sidebarSettings)sidebarSettings.addEventListener("click",event=>{event.preventDefault();if(needUser())handlers.settings();});
const settingsStyle=document.createElement("style");
settingsStyle.textContent=`
/* Responsive settings panel */
#socialPanel:has(.settings-layout){
  width:min(760px,calc(100vw - 40px));
  max-height:min(84vh,820px);
  padding:clamp(18px,2.4vw,28px);
  right:20px;top:88px;
}
#socialPanel:has(.settings-layout) .social-panel-head{margin-bottom:20px}
#socialPanel:has(.settings-layout) #socialPanelTitle{font-size:clamp(19px,2vw,24px);letter-spacing:-.4px}
.settings-layout{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px;align-items:stretch}
.settings-section{min-width:0;box-sizing:border-box;border:1px solid #e6ebf3;border-radius:15px;padding:clamp(14px,1.8vw,20px);margin:0;background:#fff}
.settings-section h3{font-size:13px;margin:0 0 12px;color:#243653;letter-spacing:.1px}
.settings-section p{font-size:11px;line-height:1.65;margin:6px 0 12px;color:#7b879a}
.settings-section .social-item{font-size:12px;padding:9px 0}
.settings-section .action{font-size:11px;padding:11px 14px;margin:5px 5px 3px 0;min-height:38px}
.settings-choice{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px 2px;border-top:1px solid #edf0f5;font-size:12px;color:#53617a}
.settings-choice input{accent-color:#155eef;width:18px;height:18px;flex:none}
.settings-signout{background:#d94862!important}
#settingsTopButton{width:38px;height:38px;display:inline-grid;place-items:center;font-size:19px;line-height:1;flex:none}
#settingsTopButton:focus-visible{outline:3px solid #9bbcff;outline-offset:2px}
@media(min-width:1100px){
 #socialPanel:has(.settings-layout){right:max(24px,calc((100vw - 1180px)/2));}
}
@media(max-width:700px){
 #socialPanel:has(.settings-layout){top:72px;left:10px;right:10px;width:auto;max-width:none;max-height:calc(100dvh - 92px);padding:14px;border-radius:16px}
 #socialPanel:has(.settings-layout) .social-panel-head{margin-bottom:13px}
 .settings-layout{grid-template-columns:minmax(0,1fr);gap:10px}
 .settings-section{padding:13px 14px;border-radius:12px}
 .settings-section h3{font-size:12px;margin-bottom:8px}
 .settings-section p{font-size:10px;line-height:1.55}
 .settings-section .action{width:100%;margin:5px 0;min-height:40px;font-size:11px}
 .settings-choice{font-size:11px;padding:10px 2px}
 #settingsTopButton{width:34px;height:36px;font-size:18px}
}
@media(max-width:360px){
 #socialPanel:has(.settings-layout){left:7px;right:7px;padding:11px}
 .settings-section{padding:11px}
 .settings-section .action{padding:9px 10px}
}

html[data-theme="dark"] body{background:#101827!important;color:#e7edf8!important}
html[data-theme="dark"] .topbar,html[data-theme="dark"] .panel,html[data-theme="dark"] .post,html[data-theme="dark"] .social-panel{background:#182438!important;color:#e7edf8!important;border-color:#2c3a50!important}
html[data-theme="dark"] .left nav a,html[data-theme="dark"] .post-text,html[data-theme="dark"] .section-head h2,html[data-theme="dark"] .feed-heading h2{color:#d6e0f0}
html[data-theme="dark"] .search,html[data-theme="dark"] .compose-prompt,html[data-theme="dark"] .mobile-nav{background:#202e43!important;color:#d6e0f0!important}
html[data-theme="dark"] .social-panel input,html[data-theme="dark"] .social-panel textarea{background:#202e43;color:#e7edf8;border-color:#35445b}
html[data-theme="dark"] .settings-section{border-color:#35445b}
`;
document.head.append(settingsStyle);
const savedTheme=localStorage.getItem("miloop-theme");if(savedTheme==="dark"||savedTheme==="light")document.documentElement.dataset.theme=savedTheme;
