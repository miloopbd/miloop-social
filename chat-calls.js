import {auth,db} from "./firebase.js";
import {onAuthStateChanged} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import {collection,doc,setDoc,updateDoc,addDoc,onSnapshot,query,where,limit,serverTimestamp} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
const $=id=>document.getElementById(id);
let user=null,pc=null,localStream=null,remoteStream=null,currentRef=null,callType=null,role=null,callUnsub=null,incomingUnsub=null,candidateUnsubs=[],callDocReady=false,pendingCallerCandidates=[];
const panel=$("chatCallPanel"),voice=$("chatVoiceCall"),video=$("chatVideoCall");
function note(t){window.MILOOPChat?.notify?.(t)||alert(t);}
function chat(){return window.MILOOPChat?.getActiveChat?.();}
function clearSubs(){if(callUnsub)callUnsub();callUnsub=null;candidateUnsubs.forEach(x=>x());candidateUnsubs=[];}
function cleanup(){callDocReady=false;pendingCallerCandidates=[];clearSubs();if(pc){pc.ontrack=null;pc.onicecandidate=null;pc.close();pc=null;}if(localStream){localStream.getTracks().forEach(t=>t.stop());localStream=null;}remoteStream=null;$("chatRemoteVideo").srcObject=null;$("chatLocalVideo").srcObject=null;$("chatRemoteAudio").srcObject=null;currentRef=null;callType=null;role=null;$("chatCallPanel").hidden=true;}
function show(type,status){panel.hidden=false;$("chatCallTitle").textContent=type==="video"?"Video call":"Audio call";$("chatCallStatus").textContent=status;$("chatRemoteVideo").hidden=type!=="video";$("chatLocalVideo").hidden=type!=="video";$("chatRemoteAudio").hidden=type==="video";$("chatCallAccept").hidden=true;$("chatCallDecline").hidden=true;$("chatCallEnd").hidden=false;}
async function startCall(type){
 const c=chat();if(!user||!c||c.isGroup){note("One-to-one calls are available in personal chats only.");return;}
 const peer=c.members.find(x=>x!==user.uid);if(!peer)return;
 try{
  callType=type;role="caller";show(type,"Requesting microphone/camera permission…");
  localStream=await navigator.mediaDevices.getUserMedia({audio:true,video:type==="video"});
  pc=new RTCPeerConnection({iceServers:[{urls:"stun:stun.l.google.com:19302"}]});
  remoteStream=new MediaStream();$("chatRemoteVideo").srcObject=remoteStream;$("chatRemoteAudio").srcObject=remoteStream;$("chatLocalVideo").srcObject=localStream;
  localStream.getTracks().forEach(t=>pc.addTrack(t,localStream));
  pc.ontrack=e=>e.streams[0].getTracks().forEach(t=>remoteStream.addTrack(t));
  pc.onicecandidate=async e=>{if(!e.candidate)return;const item=e.candidate.toJSON();if(!callDocReady){pendingCallerCandidates.push(item);return;}try{await addDoc(collection(db,"calls",currentRef.id,"callerCandidates"),item);}catch(err){console.warn(err);}};
  const offer=await pc.createOffer();await pc.setLocalDescription(offer);
  currentRef=doc(collection(db,"calls"));
  await setDoc(currentRef,{chatId:c.id,callerUid:user.uid,calleeUid:peer,callType:type,status:"ringing",offer:{type:offer.type,sdp:offer.sdp},createdAt:serverTimestamp(),updatedAt:serverTimestamp()});
  callDocReady=true;for(const candidate of pendingCallerCandidates.splice(0))await addDoc(collection(db,"calls",currentRef.id,"callerCandidates"),candidate);
  callUnsub=onSnapshot(currentRef,async snap=>{if(!snap.exists())return;const data=snap.data();if(data.answer&&pc&&pc.signalingState==="have-local-offer")await pc.setRemoteDescription(new RTCSessionDescription(data.answer));if(data.status==="ended"||data.status==="declined"){note(data.status==="declined"?"Call declined.":"Call ended.");cleanup();}else if(data.status==="accepted")$("chatCallStatus").textContent="Connected · "+type+" call";});
  candidateUnsubs.push(onSnapshot(collection(db,"calls",currentRef.id,"calleeCandidates"),snap=>snap.docChanges().forEach(ch=>{if(ch.type==="added"&&pc)pc.addIceCandidate(new RTCIceCandidate(ch.doc.data())).catch(console.warn);})));
  $("chatCallStatus").textContent="Calling… waiting for the other member.";
 }catch(e){cleanup();note("Call could not start: "+e.message);}
}
async function acceptCall(ref,data){
 try{
  currentRef=ref;callType=data.callType;role="callee";show(callType,"Connecting…");
  localStream=await navigator.mediaDevices.getUserMedia({audio:true,video:callType==="video"});
  pc=new RTCPeerConnection({iceServers:[{urls:"stun:stun.l.google.com:19302"}]});
  remoteStream=new MediaStream();$("chatRemoteVideo").srcObject=remoteStream;$("chatRemoteAudio").srcObject=remoteStream;$("chatLocalVideo").srcObject=localStream;
  localStream.getTracks().forEach(t=>pc.addTrack(t,localStream));
  pc.ontrack=e=>e.streams[0].getTracks().forEach(t=>remoteStream.addTrack(t));
  pc.onicecandidate=async e=>{if(e.candidate)try{await addDoc(collection(db,"calls",ref.id,"calleeCandidates"),e.candidate.toJSON());}catch(err){console.warn(err);}};
  await pc.setRemoteDescription(new RTCSessionDescription(data.offer));
  const answer=await pc.createAnswer();await pc.setLocalDescription(answer);
  await updateDoc(ref,{answer:{type:answer.type,sdp:answer.sdp},status:"accepted",updatedAt:serverTimestamp()});
  candidateUnsubs.push(onSnapshot(collection(db,"calls",ref.id,"callerCandidates"),snap=>snap.docChanges().forEach(ch=>{if(ch.type==="added"&&pc)pc.addIceCandidate(new RTCIceCandidate(ch.doc.data())).catch(console.warn);})));
  callUnsub=onSnapshot(ref,s=>{if(s.exists()&&["ended","declined"].includes(s.data().status)){note("Call ended.");cleanup();}});
  $("chatCallStatus").textContent="Connected · "+callType+" call";
 }catch(e){cleanup();note("Could not accept call: "+e.message);}
}
async function endCall(){if(currentRef)try{await updateDoc(currentRef,{status:"ended",updatedAt:serverTimestamp()});}catch(e){console.warn(e);}cleanup();}
$("chatCallAccept").onclick=async()=>{if(window.pendingMiloopCall){const p=window.pendingMiloopCall;window.pendingMiloopCall=null;await acceptCall(p.ref,p.data);}};
$("chatCallDecline").onclick=async()=>{const p=window.pendingMiloopCall;if(p)await updateDoc(p.ref,{status:"declined",updatedAt:serverTimestamp()}).catch(()=>{});window.pendingMiloopCall=null;cleanup();};
$("chatCallEnd").onclick=endCall;$("chatCallClose").onclick=()=>{if(currentRef)endCall();else cleanup();};
voice.onclick=()=>startCall("audio");video.onclick=()=>startCall("video");
function watchIncoming(){
 if(incomingUnsub)incomingUnsub();if(!user)return;
 incomingUnsub=onSnapshot(query(collection(db,"calls"),where("calleeUid","==",user.uid),where("status","==","ringing"),limit(1)),snap=>{
  const d=snap.docs.find(x=>x.data().offer);if(!d||currentRef)return;
  const data=d.data();window.MILOOPChat?.open?.();window.pendingMiloopCall={ref:d.ref,data};
  callType=data.callType;show(callType,"Incoming "+callType+" call");$("chatCallAccept").hidden=false;$("chatCallDecline").hidden=false;$("chatCallEnd").hidden=true;
 });
}
onAuthStateChanged(auth,u=>{user=u;watchIncoming();});
document.addEventListener("miloop:active-chat-changed",()=>{const c=chat();voice.hidden=!c||c.isGroup;video.hidden=!c||c.isGroup;});
document.addEventListener("visibilitychange",()=>{if(document.hidden&&currentRef&&role==="caller")$("chatCallStatus").textContent="Call continues while this tab remains active.";});
