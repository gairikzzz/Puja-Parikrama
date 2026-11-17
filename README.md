# Puja Parikrama 🪔

**A community-powered Durga Puja discovery and photo-sharing experience.**

Puja Parikrama brings festival exploration to an interactive, mobile-first map. Discover known pandals, search for places, share photographs with location context, and browse community contributions through a map and story-style feed.

[Open Puja Parikrama](https://puja-parikrama.vercel.app)

## Features

- **Interactive map:** Google Maps experience with a custom dark theme, location recentering, zoom controls, and custom photo markers
- **Pandal discovery:** Search for known pandals and nearby locations, with curated entries for Agartala and Kolkata
- **Location-aware uploads:** Select photos from the camera or gallery; location can be taken from image EXIF metadata, device GPS, or a selected map location
- **Story-style browsing:** Open community photos in a full-screen story view with uploader details, likes, views, and a shortcut to add more photos for the same pandal
- **Community profiles:** Sign in with Google or a passwordless email link, create a profile, and view contribution details
- **Contributor leaderboard:** Browse the community leaderboard by Puja year or all-time view
- **Festival music:** Built-in music player and a generated dhak rhythm experience

## Technology

- **Frontend:** React 19, TypeScript, Vite
- **Mapping & geocoding:** Google Maps JavaScript API and Photon geocoding
- **Authentication & profiles:** Firebase Authentication and Cloud Firestore
- **Submission and content data:** Supabase
- **Upload workflow:** n8n webhook for photo submission and moderation
- **Styling:** Tailwind CSS via CDN and custom CSS

## Run locally

### Requirements

- Node.js
- npm

### 1. Clone the repository

```bash
git clone https://github.com/gairikzzz/Puja-Parikrama.git
cd Puja-Parikrama
```

### 2. Install dependencies

```bash
npm install
```

### 3. Configure environment variables

Copy the example file:

```bash
cp .env.example .env
```

Set the following values in `.env`:

| Variable | Purpose |
|---|---|
| `VITE_N8N_WEBHOOK_URL` | n8n endpoint that receives photo submissions |
| `VITE_SUPABASE_URL` | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Supabase publishable/anonymous key |

The repository also contains Firebase client configuration in `src/firebase.ts` and a Google Maps API key configured in `src/App.tsx`. For your own deployment, use your own Firebase and Google Maps projects, restrict browser API keys to the intended domains and APIs, and keep privileged credentials (such as Supabase service-role keys and n8n secrets) out of the frontend and source control.

### 4. Start the development server

```bash
npm run dev
```

### 5. Create a production build

```bash
npm run build
npm run preview
```

## Supabase setup

The SQL schema is available at [supabase/schema.sql](./supabase/schema.sql). It defines the `submissions` table, status values for moderation, indexes, row-level security policies, and the `pandal-photos` storage bucket and policies used by the submission workflow.

Photo submissions are sent to the configured n8n webhook. Approved submissions are read from the Supabase `submissions` table and displayed on the map.

## Project structure

```text
.
├── public/              # Static images, logos, icons, and splash artwork
├── src/
│   ├── assets/          # Application artwork
│   ├── components/      # Map and UI components
│   ├── lib/             # Supabase client and submission helpers
│   ├── types/           # Shared TypeScript types
│   ├── App.tsx          # Main application experience
│   └── main.tsx         # Application entry point
├── supabase/
│   └── schema.sql       # Database and storage setup
├── .env.example         # Environment variable template
├── index.html           # App shell and external scripts
├── package.json
└── vite.config.ts
```

## Notes

- Location search is scoped in the application to Tripura, Karnataka, Assam, and West Bengal; the curated pandal list currently includes Agartala and Kolkata.
- Photo uploads are image-only and are submitted for moderation before they appear among approved community submissions.
- Browser location access requires user permission. If GPS or EXIF coordinates are unavailable, the upload flow uses a fallback location that can be adjusted through the location search.
- Google Maps, Firebase, Supabase, and n8n integrations require valid project configuration and appropriate access rules.

---

Built by [Gairik Chakraborty](https://github.com/gairikzzz) · [Portfolio](https://gairik.tech) · [LinkedIn](https://www.linkedin.com/in/gairikchakraborty)
