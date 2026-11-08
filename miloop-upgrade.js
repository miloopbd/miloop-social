import {auth,db} from "./firebase.js";
import {onAuthStateChanged} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import {doc,getDoc,collection,getDocs,query,orderBy,limit,updateDoc,deleteDoc} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

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
 const panel=document.getElementById("socialPanel");
 if(!panel){toast("Admin panel is unavailable.");return}
 document.getElementById("socialPanelTitle").textContent="Admin Dashboard";
 document.getElementById("socialPanelBody").innerHTML='<p>Review member reports and moderate reported posts.</p><div id="miloopAdminReports" class="miloop-admin-list">Loading reports…</div>';
 panel.classList.add("open");
 const target=$("miloopAdminReports");
 try{
  const snap=await getDocs(query(collection(db,"reports"),orderBy("createdAt","desc"),limit(100)));
  if(!snap.size){target.innerHTML='<p>No reports yet. Great!</p>';return}
  target.innerHTML=snap.docs.map(d=>{const x=d.data();return '<article class="miloop-report" data-report="'+safe(d.id)+'"><b>'+safe(x.targetType||"Report")+' report · '+safe(x.status||"open")+'</b><p>'+safe(x.reason||"No reason provided")+'</p><small>Reporter: '+safe(x.reporterUid||"unknown")+' · Target: '+safe(x.targetId||"unknown")+'</small><div><button data-review="'+safe(d.id)+'">Mark reviewed</button>'+(x.targetType==="post"?'<button class="danger" data-remove-post="'+safe(d.id)+'" data-post-id="'+safe(x.targetId)+'">Remove reported post</button>':"")+'</div></article>'}).join("");
  target.onclick=async e=>{
   const review=e.target.closest("[data-review]"),remove=e.target.closest("[data-remove-post]");
   try{
    if(review){await updateDoc(doc(db,"reports",review.dataset.review),{status:"reviewed",reviewedBy:user.uid,reviewedAt:new Date()});review.closest(".miloop-report").remove();toast("Report marked reviewed.");}
    if(remove){if(!confirm("Remove this reported post? This cannot be undone."))return;await deleteDoc(doc(db,"posts",remove.dataset.postId));await updateDoc(doc(db,"reports",remove.dataset.removePost),{status:"action_taken",reviewedBy:user.uid,reviewedAt:new Date()});remove.closest(".miloop-report").remove();toast("Post removed and report updated.");}
   }catch(err){console.error(err);toast("Moderation failed: "+(err.code||"try again"))}
  };
 }catch(err){console.error("Admin reports failed:",err);target.textContent="Could not load reports: "+(err.code||"Check Firestore Rules.")}
}
adminButton?.addEventListener("click",openAdmin);
onAuthStateChanged(auth,async next=>{
 user=next;isAdmin=false;adminButton.hidden=true;
 if(!user)return;
 try{const snap=await getDoc(doc(db,"admins",user.uid));isAdmin=snap.exists()&&snap.data().enabled===true&&snap.data().role==="admin";adminButton.hidden=!isAdmin}
 catch(err){console.warn("Admin access check:",err)}
});
