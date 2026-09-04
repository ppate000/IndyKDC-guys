# KDC Space Leaderboard

A static GitHub Pages leaderboard backed by Supabase Auth, Postgres, Row Level Security, and Realtime.

## Included
- 6 animated rocket teams using the supplied rocket + flame artwork
- space background artwork
- live score/rank movement with equal scores at equal heights
- resting bob animation independent of rank position
- point-size boost animation
- Half 1 / Half 2
- persistent countdown timer
- hide scores / individual reveal / reveal all
- Point Surge for 3 renameable rooms
- Admin and Points Master roles
- server-enforced score increments
- reset function
- fullscreen presentation mode
- Realtime synchronization
- persistence across refreshes

## Important security design
The browser contains only a Supabase **publishable key**. Direct database writes are revoked. Score and admin changes are performed through Postgres RPC functions that verify the signed-in user's role in `user_roles` before changing anything. Never put a Supabase secret key or legacy `service_role` key in this repository.

## Quick local preview
After configuring Supabase and `js/config.js`, run from this folder:

```bash
python3 -m http.server 8000
```

Then open `http://localhost:8000`.

Do not double-click `index.html` and use a `file://` URL; the app uses JavaScript modules and should be served over HTTP/HTTPS.

## Supabase setup
1. Create a Supabase project.
2. Open SQL Editor and run `supabase/setup.sql`.
3. Create the Admin and Points Master users under Authentication -> Users.
4. Edit `supabase/assign-roles.sql` with their exact emails and run it.
5. Copy the Project URL and **publishable key** into `js/config.js`.
6. Test locally.
7. Push this folder to a GitHub repository and enable GitHub Pages from the `main` branch `/ (root)`.

See the chat instructions for the detailed walkthrough.
