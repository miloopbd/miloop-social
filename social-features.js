import { auth, db } from "./firebase.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import { doc, getDoc, setDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
const profileButton = document.getElementById("profile");
let currentUser = null;
onAuthStateChanged(auth, user => { currentUser = user; });
profileButton?.addEventListener("click", async () => {
  if (!currentUser) return;
  const ref = doc(db, "publicProfiles", currentUser.uid);
  const snapshot = await getDoc(ref);
  const old = snapshot.data() || {};
  const displayName = window.prompt("Display name", old.displayName || currentUser.displayName || "");
  if (displayName === null) return;
  const bio = window.prompt("Short bio", old.bio || "");
  if (bio === null) return;
  await setDoc(ref, { uid: currentUser.uid, displayName: displayName.slice(0,60), bio: bio.slice(0,180), updatedAt: serverTimestamp() }, { merge: true });
  window.alert("Profile saved.");
});
