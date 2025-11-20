# CUSTOM INSTRUCTIONS — Project CBT (Local Network)

## Tujuan
Repository ini menyiapkan kerangka **CBT (Computer-Based Test)** yang berjalan di local network:
- Frontend: **SvelteKit (Svelte terbaru)**
- Styling: **TailwindCSS + daisyUI v5**
- Database: **PostgreSQL**
- ORM: **Drizzle ORM**
- Package manager: **pnpm**
- Build target: Node (adapter-node) untuk mudah dijalankan di server lokal.

## Kebutuhan Lingkungan (developer)
- Node.js (>= 18, direkomendasikan LTS)
- pnpm (gunakan `npm i -g pnpm` atau `corepack enable`)
- PostgreSQL (local)
- Optional: Docker untuk postgres local

## Cara singkat
- Frontend: SvelteKit, routes + server endpoints (api) untuk CRUD soal dan pencatatan attempt.
- Backend/DB: Drizzle ORM ke PostgreSQL dengan migration menggunakan drizzle-kit.
- UI: Tailwind + daisyUI.

Referensi: Svelte, DaisyUI, Drizzle, PostgreSQL.
