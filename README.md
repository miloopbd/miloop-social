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

## Not implemented yet
Media uploads, stories, follow graph, public profile pages, private/group messaging, notifications, saved posts, reporting, blocking, and admin moderation are future milestones. Do not treat demo UI elements as working features.

## Hosting
GitHub Pages can serve this static project over HTTPS. Firebase domain authorization must include the deployed host.
