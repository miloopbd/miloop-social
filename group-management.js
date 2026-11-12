import { auth, db } from "./firebase.js";
import { uploadMedia } from "./cloudinary.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import { doc, getDoc, updateDoc, setDoc, runTransaction, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
const $=id=>document.getElementById(id);
let user=null,active=null;
const esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const note=t=>window.MILOOPChat?.notify?.(t)||alert(t);
const creator=()=>active?.createdBy===user?.uid;
const admin=()=>creator()||(active?.groupAdmins||[]).includes(user?.uid);
const nm=p=>p?.displayName||p?.username||p?.name||"MILOOP member";
const root=document.createElement("section");root.className="group-manager-backdrop";root.hidden=true;root.innerHTML='<div class="group-manager-card"><div class="group-manager-head"><h3>Group information</h3><button id="gmClose" class="chat-back">×</button></div><div id="gmBody"></div></div>';document.getElementById("chatDialog")?.append(root);
function close(){root.hidden=true;active=null;}
$("gmClose").onclick=close;
async function profile(uid){try{const s=await getDoc(doc(db,"publicProfiles",uid));return s.exists()?s.data():{};}catch{return {};}}
async function render(){
 const members=await Promise.all((active.members||[]).map(async uid=>({uid,p:await profile(uid)})));
 const memberHtml=members.map(({uid,p})=>'<div class="group-member"><span class="chat-avatar">'+esc(nm(p).slice(0,1).toUpperCase())+'</span><span class="group-member-copy"><b>'+esc(nm(p))+(uid===active.createdBy?' · Creator':(active.groupAdmins||[]).includes(uid)?' · Admin':'')+'</b><small>'+esc(uid)+'</small></span>'+(admin()&&uid!==user.uid&&uid!==active.createdBy?'<button class="secondary" data-remove="'+esc(uid)+'">Remove</button>':'')+(creator()&&uid!==user.uid&&uid!==active.createdBy?'<button data-role="'+esc(uid)+'">'+((active.groupAdmins||[]).includes(uid)?"Remove admin":"Make admin")+'</button>':'')+'</div>').join("");
 $("gmBody").innerHTML='<div style="text-align:center;padding:10px"><div class="chat-avatar" style="width:64px;height:64px;margin:auto;overflow:hidden">'+(active.photoUrl?'<img src="'+esc(active.photoUrl)+'" style="width:100%;height:100%;object-fit:cover">':'M')+'</div><h3>'+esc(active.groupName||"Group")+'</h3><p class="group-manager-note">'+esc(active.description||"No description")+'</p><small>'+members.length+' members</small></div>'+
 (admin()?'<label>Group name<input id="gmName" maxlength="60" value="'+esc(active.groupName||"")+'"></label><label>Description<textarea id="gmDesc" maxlength="300">'+esc(active.description||"")+'</textarea></label><label>Group photo<input id="gmPhoto" type="file" accept="image/jpeg,image/png,image/webp"></label><div class="group-manager-actions"><button id="gmSave">Save changes</button><button class="secondary" id="gmInvite">Create invite link</button></div>':'<div class="group-manager-actions"><button id="gmInvite">Create invite link</button></div>')+
 '<div id="gmInviteOut"></div><h4>Members</h4>'+memberHtml+(creator()?'<div class="group-manager-actions"><button class="secondary" id="gmTransfer">Transfer ownership</button></div>':'')+'<div class="group-manager-actions"><button class="secondary" id="gmLeave">Leave group</button></div><p class="group-manager-note">Only Creator can appoint or remove Admins and transfer ownership. Admins can manage regular members and group details.</p>';
 $("gmSave")?.addEventListener("click",save);
 $("gmInvite").onclick=invite;
 $("gmTransfer")?.addEventListener("click",transfer);
 $("gmLeave").onclick=leave;
 $("gmBody").querySelectorAll("[data-remove]").forEach(b=>b.onclick=()=>removeMember(b.dataset.remove));
 $("gmBody").querySelectorAll("[data-role]").forEach(b=>b.onclick=()=>toggleAdmin(b.dataset.role));
}
async function save(){
 if(!admin())return;
 const patch={groupName:$("gmName").value.trim(),description:$("gmDesc").value.trim(),updatedAt:serverTimestamp()};
 if(!patch.groupName){note("Group name is required.");return;}
 const file=$("gmPhoto").files?.[0];if(file){const up=await uploadMedia(file);if(up.type!=="image")throw Error("Select an image.");patch.photoUrl=up.url;}
 try{await updateDoc(doc(db,"chats",active.id),patch);active={...active,...patch};note("Group updated.");render();}catch(e){note("Update failed: "+e.message);}
}
async function removeMember(uid){
 if(!admin()||!confirm("Remove this member from the group?"))return;
 try{await updateDoc(doc(db,"chats",active.id),{members:active.members.filter(x=>x!==uid),updatedAt:serverTimestamp()});active.members=active.members.filter(x=>x!==uid);note("Member removed.");render();}catch(e){note("Could not remove member: "+e.message);}
}
async function toggleAdmin(uid){
 if(!creator())return;
 const roles=new Set(active.groupAdmins||[active.createdBy]);if(roles.has(uid))roles.delete(uid);else roles.add(uid);
 try{await updateDoc(doc(db,"chats",active.id),{groupAdmins:[...roles],updatedAt:serverTimestamp()});active.groupAdmins=[...roles];note("Admin role updated.");render();}catch(e){note("Could not update role: "+e.message);}
}
async function transfer(){
 if(!creator())return;const candidates=active.members.filter(x=>x!==user.uid);if(!candidates.length)return;
 const n=prompt("Enter member number to transfer ownership:\n"+candidates.map((x,i)=>(i+1)+". "+(active.memberNames?.[x]||x)).join("\n"));const uid=candidates[Number(n)-1];if(!uid||!confirm("Transfer ownership?"))return;
 const admins=new Set(active.groupAdmins||[]);admins.add(user.uid);admins.add(uid);
 try{await updateDoc(doc(db,"chats",active.id),{createdBy:uid,groupAdmins:[...admins],updatedAt:serverTimestamp()});note("Ownership transferred.");close();}catch(e){note("Transfer failed: "+e.message);}
}
async function leave(){
 if(creator()&&active.members.length>1){note("Transfer ownership before leaving.");return;}if(!confirm("Leave this group?"))return;
 try{await updateDoc(doc(db,"chats",active.id),{members:active.members.filter(x=>x!==user.uid),updatedAt:serverTimestamp()});note("You left the group.");close();}catch(e){note("Could not leave group: "+e.message);}
}
async function invite(){
 if(!admin())return;
 try{
  const token=crypto.randomUUID().replace(/-/g,"").slice(0,20),ref=doc(db,"chats",active.id,"invites",token);
  await setDoc(ref,{chatId:active.id,token,createdBy:user.uid,active:true,uses:0,maxUses:50,createdAt:serverTimestamp(),expiresAt:new Date(Date.now()+7*86400000)});
  const url=new URL(location.href);url.searchParams.set("join",active.id+"."+token);url.hash="";
  $("gmInviteOut").innerHTML='<p class="group-manager-note">Valid for 7 days · Up to 50 joins</p><input id="gmInviteUrl" readonly value="'+esc(url.href)+'"><div class="group-manager-actions"><button id="gmCopy">Copy link</button><button class="secondary" id="gmRevoke">Revoke</button></div>';
  $("gmCopy").onclick=async()=>{try{await navigator.clipboard.writeText(url.href);note("Invite link copied.");}catch{note("Copy failed.");}};
  $("gmRevoke").onclick=async()=>{await updateDoc(ref,{active:false});$("gmInviteOut").textContent="Invite revoked.";};
 }catch(e){note("Invite creation failed: "+e.message);}
}
async function join(){
 const value=new URLSearchParams(location.search).get("join");if(!value||!user)return;const [chatId,token]=value.split(".");if(!chatId||!token)return;
 try{
  await runTransaction(db,async tx=>{
   const cr=doc(db,"chats",chatId),ir=doc(db,"chats",chatId,"invites",token),[cs,is]=await Promise.all([tx.get(cr),tx.get(ir)]);
   if(!cs.exists()||!is.exists())throw Error("Invite not found.");
   const c=cs.data(),v=is.data();if(!v.active||v.expiresAt?.toDate?.().getTime()<Date.now()||v.uses>=v.maxUses)throw Error("Invite expired or full.");
   if(c.members.includes(user.uid))return;if(c.members.length>=100)throw Error("Group is full.");
   const ps=await tx.get(doc(db,"publicProfiles",user.uid)),display=nm(ps.exists()?ps.data():{displayName:user.displayName});
   tx.update(cr,{members:[...c.members,user.uid],memberNames:{...(c.memberNames||{}),[user.uid]:display},unreadCounts:{...(c.unreadCounts||{}),[user.uid]:0},lastJoinInviteId:token,updatedAt:serverTimestamp()});
   tx.update(ir,{uses:v.uses+1});
  });
  const u=new URL(location.href);u.searchParams.delete("join");history.replaceState({}, "",u.href);note("Joined group. Open Messages to see it.");
 }catch(e){note("Could not join group: "+e.message);}
}
onAuthStateChanged(auth,u=>{user=u;if(u)join();});
document.addEventListener("miloop:group-manage-open",e=>{active=e.detail?.chat;if(!active)return;root.hidden=false;render().catch(err=>note(err.message));});
$("groupInfoButton")?.addEventListener("click",()=>document.dispatchEvent(new Event("miloop:group-manage")));
document.addEventListener("miloop:open-messages",()=>{const b=$("groupInfoButton");if(b)b.hidden=!window.MILOOPChat?.getActiveChat?.()?.isGroup;});
document.addEventListener("miloop:active-chat-changed",()=>{const b=$("groupInfoButton");if(b)b.hidden=!window.MILOOPChat?.getActiveChat?.()?.isGroup;});
document.addEventListener("click",e=>{if(e.target===root)close();});
