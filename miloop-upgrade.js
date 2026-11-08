import {auth,db} from "./firebase.js";
import {onAuthStateChanged} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import {doc,getDoc,collection,getDocs,query,orderBy,limit,updateDoc,deleteDoc,setDoc,serverTimestamp} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

const $=id=>document.getElementById(id);
const safe=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
let user=null,isAdmin=false;
const style=document.createElement("style");
style.textContent=`
.miloop-welcome{position:fixed;inset:0;z-index:120;background:#14264a99;display:grid;place-items:center;padding:18px}
.miloop-welcome[hidden]{display:none}.miloop-welcome-card{width:min(440px,100%);background:#fff;border-radius:22px;padding:26px;box-shadow:0 22px 70px #14264a44}
.miloop-welcome-card .mw-mark{width:48px;height:48px;border-radius:15px;display:grid;place-items:center;background:linear-gradient(145deg,#3478ff,#1552dc);color:white;font-size:25px;font-weight:900}
.miloop-welcome-card h2{font-size:24px;margin:17px 0 7px;color:#17233d}.miloop-welcome-card p,.miloop-welcome-card li{font-size:13px;line-height:1.65;color:#687790}
.miloop-welcome-card ul{padding-left:19px}.miloop-welcome-card button{border:0;border-radius:10px;background:#155eef;color:white;padding:12px 18px;font-weight:800;width:100%;margin-top:10px}
.miloop-admin-list{display:grid;gap:10px}.miloop-report{border:1px solid #e7edf6;border-radius:12px;padding:12px}.miloop-report b{font-size:12px}.miloop-report p{font-size:12px;line-height:1.5;color:#52617a;overflow-wrap:anywhere}.miloop-report small{color:#8a96a9;font-size:10px}.miloop-report button{border:0;border-radius:8px;padding:8px 10px;margin:6px 5px 0 0;background:#edf3ff;color:#155eef;font-weight:700;font-size:10px}.miloop-report button.danger{background:#fff0f0;color:#b42332}
.miloop-admin-tabs{display:flex;gap:8px;margin:14px 0;flex-wrap:wrap}
.miloop-admin-tabs button{border:1px solid #dce5f3;background:#f5f8ff;color:#344563;border-radius:10px;padding:9px 14px;font-weight:800}
.miloop-admin-tabs button.active{background:#155eef;color:#fff;border-color:#155eef}
.miloop-member{display:flex;align-items:center;gap:10px;border:1px solid #e7edf6;border-radius:12px;padding:12px;min-width:0}
.miloop-member-info{min-width:0;flex:1}.miloop-member-info b{display:block;font-size:13px;overflow-wrap:anywhere}
.miloop-member-info small{display:block;color:#71809a;font-size:10px;overflow-wrap:anywhere;margin-top:3px}
.miloop-member button{border:0;border-radius:8px;padding:8px 10px;background:#fff0f0;color:#b42332;font-weight:800;font-size:10px}
.miloop-member button.restore{background:#eaf8ef;color:#187044}
.miloop-member-status{font-size:10px;font-weight:800;color:#187044}.miloop-member-status.off{color:#b42332}
#miloopMemberSearch{width:100%;box-sizing:border-box;border:1px solid #dce5f3;border-radius:10px;padding:11px;margin:4px 0 12px;font:inherit}
`;
document.head.append(style);
const welcome=document.createElement("div");
welcome.className="miloop-welcome";
welcome.hidden=true;
welcome.innerHTML='<section class="miloop-welcome-card" role="dialog" aria-modal="true" aria-labelledby="mwTitle"><div class="mw-mark">M</div><h2 id="mwTitle">Welcome to MILOOP</h2><p>Your community starts here. Connect, share, and discover people with shared interests.</p><ul><li>Complete your profile and choose which details are public.</li><li>Follow members, share posts, and explore stories.</li><li>Use Messenger respectfully and report content that breaks community rules.</li></ul><button type="button" id="mwContinue">Let’s get started</button></section>';
document.body.append(welcome);
welcome.querySelector("#mwContinue").onclick=()=>{welcome.hidden=true;try{localStorage.setItem("miloop_welcome_seen","1")}catch(e){}};
try{if(!localStorage.getItem("miloop_welcome_seen"))welcome.hidden=false}catch(e){welcome.hidden=false}

const adminButton=$("adminOpen");
function toast(message){const el=$("toast");if(el){el.textContent=message;el.classList.add("show");setTimeout(()=>el.classList.remove("show"),2600)}}
async function openAdmin(){
 if(!user||!isAdmin){toast("Admin access is not enabled for this account.");return}
 const panel=$("socialPanel");
 if(!panel){toast("Admin panel is unavailable.");return}
 $("socialPanelTitle").textContent="Admin Dashboard";
 $("socialPanelBody").innerHTML='<p>Manage members and review community reports.</p><div class="miloop-admin-tabs"><button type="button" class="active" data-admin-tab="members">Members</button><button type="button" data-admin-tab="reports">Reports</button></div><section id="miloopAdminMembers"><input id="miloopMemberSearch" type="search" placeholder="Search members by name, school or class"><div id="miloopMemberList" class="miloop-admin-list">Loading members…</div></section><section id="miloopAdminReports" class="miloop-admin-list" hidden>Open Reports to load reports.</section>';
 panel.classList.add("open");
 const membersBox=$("miloopMemberList"),reportsBox=$("miloopAdminReports");
 let memberRows=[];
 async function loadMembers(){
  membersBox.textContent="Loading members…";
  try{
   const [profiles,controls]=await Promise.all([
    getDocs(query(collection(db,"publicProfiles"),limit(200))),
    getDocs(collection(db,"memberControls"))
   ]);
   const status=new Map(controls.docs.map(d=>[d.id,d.data()]));
   memberRows=profiles.docs.map(d=>{const p=d.data(),s=status.get(d.id);return {uid:d.id,name:p.displayName||p.name||"MILOOP member",school:p.school||"",grade:p.class||"",active:!s||s.active!==false};});
   renderMembers();
  }catch(err){console.error(err);membersBox.textContent="Could not load members: "+(err.code||"Check Firestore Rules.");}
 }
 function renderMembers(){
  const term=($("miloopMemberSearch")?.value||"").trim().toLowerCase();
  const rows=memberRows.filter(m=>(m.name+" "+m.school+" "+m.grade+" "+m.uid).toLowerCase().includes(term));
  membersBox.innerHTML=rows.length?rows.map(m=>'<article class="miloop-member"><div class="miloop-member-info"><b>'+safe(m.name)+'</b><small>'+safe(m.school||"School not added")+(m.grade?' · Class '+safe(m.grade):"")+'</small><small>UID: '+safe(m.uid)+'</small><span class="miloop-member-status '+(m.active?"":"off")+'">'+(m.active?"Active":"Suspended")+'</span></div><button type="button" class="'+(m.active?"":"restore")+'" data-member-toggle="'+safe(m.uid)+'" data-active="'+m.active+'">'+(m.active?"Suspend":"Reactivate")+'</button></article>').join(""):'<p>No matching members found.</p>';
 }
 $("miloopMemberSearch").addEventListener("input",renderMembers);
 async function loadReports(){
  reportsBox.textContent="Loading reports…";
  try{
   const snap=await getDocs(query(collection(db,"reports"),orderBy("createdAt","desc"),limit(100)));
   if(!snap.size){reportsBox.innerHTML='<p>No reports yet. Great!</p>';return}
   reportsBox.innerHTML=snap.docs.map(d=>{const x=d.data();return '<article class="miloop-report" data-report="'+safe(d.id)+'"><b>'+safe(x.targetType||"Report")+' report · '+safe(x.status||"open")+'</b><p>'+safe(x.reason||"No reason provided")+'</p><small>Reporter: '+safe(x.reporterUid||"unknown")+' · Target: '+safe(x.targetId||"unknown")+'</small><div><button data-review="'+safe(d.id)+'">Mark reviewed</button>'+(x.targetType==="post"?'<button class="danger" data-remove-post="'+safe(d.id)+'" data-post-id="'+safe(x.targetId)+'">Remove reported post</button>':"")+'</div></article>'}).join("");
  }catch(err){console.error(err);reportsBox.textContent="Could not load reports: "+(err.code||"Check Firestore Rules.");}
 }
 $("socialPanelBody").onclick=async e=>{
  const tab=e.target.closest("[data-admin-tab]");
  if(tab){
   $("socialPanelBody").querySelectorAll("[data-admin-tab]").forEach(b=>b.classList.toggle("active",b===tab));
   $("miloopAdminMembers").hidden=tab.dataset.adminTab!=="members";
   reportsBox.hidden=tab.dataset.adminTab!=="reports";
   if(tab.dataset.adminTab==="reports"&&!reportsBox.dataset.loaded){await loadReports();reportsBox.dataset.loaded="1";}
   return;
  }
  const toggle=e.target.closest("[data-member-toggle]");
  const review=e.target.closest("[data-review]"),remove=e.target.closest("[data-remove-post]");
  try{
   if(toggle){
    const uid=toggle.dataset.memberToggle,wasActive=toggle.dataset.active==="true",nextActive=!wasActive;
    if(uid===user.uid&&!nextActive){toast("You cannot suspend your own admin account.");return;}
    if(!confirm((nextActive?"Reactivate":"Suspend")+" this member?"))return;
    await setDoc(doc(db,"memberControls",uid),{uid,active:nextActive,updatedAt:serverTimestamp(),updatedBy:user.uid},{merge:true});
    const row=memberRows.find(m=>m.uid===uid);if(row)row.active=nextActive;
    renderMembers();toast(nextActive?"Member reactivated.":"Member suspended.");return;
   }
   if(review){await updateDoc(doc(db,"reports",review.dataset.review),{status:"reviewed",reviewedBy:user.uid,reviewedAt:new Date()});review.closest(".miloop-report").remove();toast("Report marked reviewed.");}
   if(remove){if(!confirm("Remove this reported post? This cannot be undone."))return;await deleteDoc(doc(db,"posts",remove.dataset.postId));await updateDoc(doc(db,"reports",remove.dataset.removePost),{status:"action_taken",reviewedBy:user.uid,reviewedAt:new Date()});remove.closest(".miloop-report").remove();toast("Post removed and report updated.");}
  }catch(err){console.error(err);toast("Admin action failed: "+(err.code||"Check Firestore Rules."));}
 };
 await loadMembers();
}
adminButton?.addEventListener("click",openAdmin);
onAuthStateChanged(auth,async next=>{
 user=next;isAdmin=false;adminButton.hidden=true;
 if(!user)return;
 try{const snap=await getDoc(doc(db,"admins",user.uid));isAdmin=snap.exists()&&snap.data().enabled===true&&snap.data().role==="admin";adminButton.hidden=!isAdmin}
 catch(err){console.warn("Admin access check:",err)}
});
