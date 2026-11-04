# Lemonade — PurvaPhalguni cinematic About prototype

Standalone **React + TypeScript + Vite** preview for the eventual `purvaphalguni.com/about` route. Built on the `feature/cinematic-about` branch; `main` remains untouched.

## Local preview

```bash
git clone -b feature/cinematic-about https://github.com/mishranurag01/Lemonade.git
cd Lemonade
npm install
npm run dev
```

Open the local URL printed by Vite (normally http://localhost:5173).

## Build

```bash
npm run build
```

## Integration

Copy `src/features/about` into the host app, install its dependencies if missing, then lazy-load `./features/about/AboutPage` in the **existing** router at `/about`. Do not replace the host router or app entrypoint.

## Important

- This is an **initial runnable prototype**, not a verified pixel-perfect reproduction of the Framer VESPER reference.
- The 3D shape is a Three.js torus knot approximation, not the original asset.
- The founder portrait is intentionally a placeholder; add an authorized image later.
- Feedback is disabled until a verified contact destination is provided.
- No Firebase, Render, Gemini API, or backend is needed for this static preview.
- Visual acceptance, accessibility, device testing, and build verification are still pending.
