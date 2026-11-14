# MILOOP — Connect. Share. Belong.

Responsive social community built with HTML, CSS, JavaScript modules and Firebase.

## Implemented
- Firebase email/password registration, sign-in and sign-out
- Firestore user profile records
- Live Firestore social feed
- Text posts, likes/unlikes and author-only post deletion
- Live comments with author-only comment deletion
- Search posts and sort by latest/popular
- Responsive blue-and-white layout

## Firebase setup
1. Configure the Firebase Web App in `firebase-config.js`.
2. Enable Email/Password in Authentication.
3. Add the GitHub Pages host to Authentication → Settings → Authorized domains.
4. Create Firestore Database.
5. Publish the rules from `firestore.rules` in Firestore → Rules.

## Security notes
- Browser Firebase config is not a server secret. Never add service-account keys or Admin SDK credentials.
- Current Firestore rules allow public reading of posts and comments; only signed-in users can create them.
- Users can only update their own user document; users can only delete their own posts/comments.
- Review and test rules before inviting the public.

## Community Hub update (2026-11)
- Polls with one vote per signed-in member
- Community Q&A with member answers
- Optional daily check-in streaks and participation badges
- Private saved-post bookmarks
- Community events with member RSVPs
- Weekly knowledge and creative challenges
- Optional birthday sharing (month/day only, explicit opt-in)
- QR code profile sharing
- Fun participation leaderboard

Publish the updated `firestore.rules` in Firebase Console → Firestore Database → Rules. The Community Hub is loaded from `community-hub.js`. Some features require signed-in users. Birthday sharing is optional; users can remove it at any time.

## Not implemented yet
Media uploads, reporting, blocking, admin moderation, and mobile push notifications are future milestones. Do not treat demo UI elements as working features.

## Hosting
GitHub Pages can serve this static project over HTTPS. Firebase domain authorization must include the deployed host.

## MILOOP AI (Gemini)
- Added a separate responsive AI assistant page at `miloop-ai.html`.
- Chat history is stored privately under `users/{uid}/aiChats` in Firestore.
- The Gemini API key is never placed in GitHub Pages code. The Cloudflare Worker verifies Firebase ID tokens before forwarding prompts to Gemini.
- Model: `gemini-3.8-flash`.

### One-time setup required
1. In Cloudflare, create a Worker named `miloop-ai-api` and deploy `cloudflare-worker/src/index.js`.
2. Add a Worker secret named `GEMINI_API_KEY` with an API key created in Google AI Studio.
3. Set Worker variables `FIREBASE_PROJECT_ID=miloop-e0d3a`, `FIREBASE_API_KEY` to the Firebase Web App API key from `firebase-config.js`, and `ALLOWED_ORIGIN=https://miloopbd.github.io`.
4. Copy the deployed Worker URL into `miloop-ai-config.js` as `MILOOP_AI_API_URL`.
5. Publish the updated Firestore rules from `firestore.rules` in Firebase Console → Firestore Database → Rules.

The AI page is available from the MILOOP homepage after deployment. Gemini free-tier quotas and availability are controlled by Google and can change. On the free tier, Google may use submitted content to improve its products; check the current Gemini API terms before sending sensitive information.
