# Sachindra Nath Sanyal — The Time Tunnel

An interactive 3D historical exhibition on the life of the Indian revolutionary
**Sachindra Nath Sanyal (1893 – 1942)**.

The visitor walks forward through a masonry road tunnel in which distance *is*
time: the architecture, lighting, exhibits and road markings change with the
period, from Varanasi in 1893 to Gorakhpur in 1942.

It is an educational exhibition, not a game. Every panel carries its date, its
degree of connection to Sanyal, and its sources — and where the historical
record is uncertain or contested, the exhibition says so.

---

## Features

- **3D tunnel world** — swept masonry bore with an arched brick vault, asphalt
  carriageway, kerbs, gutters, raised walkways and repeating arch ribs
- **Seven chronological periods**, each with its own architecture, lighting,
  colour and ambience, separated by engraved archways
- **28 dated milestones** painted on the carriageway in signed typography
- **Wall exhibits** — framed, glazed, bevelled boards with standoff mounts
- **Museum fittings** — information pillars, bronze busts, glass artefact cases,
  cast-iron fingerposts, engraved stones, benches, planters, railings, medallions
- **Interactive panels** — `E` opens a sourced historical record
- **Full timeline overlay** — `T`, with "locate in exhibition" guided walking
- **Archival portrait** of Sanyal, mounted in a gold oval
- **Controls** — WASD, mouse look, Shift to hurry, and touch joystick + look
  areas on mobile
- **Audio** — looping background music, procedural room ambience, footsteps,
  and a narration hook; `M` toggles sound
- **Accessibility** — ESC closes panels, arrow keys page through entries,
  ARIA labels, and `prefers-reduced-motion` support

---

## Run locally

The project uses ES modules, so it must be served over HTTP — opening
`index.html` straight from the file system will be blocked by the browser's
module security rules. Any static server works.

**Windows — easiest:** double-click **`run-local.bat`**, then open
<http://localhost:8000/>

**Python** (already installed on most systems):

```bash
python -m http.server 8000
```

**Node**:

```bash
npx serve .
```

**PHP**:

```bash
php -S localhost:8000
```

Then open <http://localhost:8000/> and click **BEGIN THE JOURNEY**.

There is **no build step**. No bundler, no `npm install`, no backend.

---

## Deploy to GitHub Pages

1. Create a new repository on GitHub (any name — the site works from a
   subpath as well as from a domain root).
2. Put the contents of this folder in the repository, with `index.html` at the
   top level.
3. Commit and push:

```bash
git init
git add .
git commit -m "Sachindra Nath Sanyal — The Time Tunnel"
git branch -M main
git remote add origin https://github.com/USERNAME/REPOSITORY.git
git push -u origin main
```

4. On GitHub open **Settings → Pages**.
5. Under **Build and deployment**, set **Source** to *Deploy from a branch*.
6. Choose branch **main** and folder **/ (root)**. Save.
7. Wait a minute for the first deployment.
8. Open `https://USERNAME.github.io/REPOSITORY/`.

Every asset reference is document-relative (`./assets/…`), so the site works
unchanged at a domain root or inside a repository subpath. A `.nojekyll` file is
included so GitHub Pages serves every file as-is.

---

## Controls

| Input | Action |
| --- | --- |
| `W` `A` `S` `D` | Walk |
| `Shift` + move | Hurry (twice walking pace) |
| Mouse | Look |
| `E` | Explore the exhibit you are facing |
| `Esc` | Close the panel / release the cursor |
| `T` | Full timeline overlay |
| `M` | Music and sound on/off |
| Touch — left half | Movement stick |
| Touch — right half | Look; tap the prompt to explore |

---

## Project structure

```
.
├── index.html                  entry point
├── css/style.css               all interface styling
├── js/main.js                  the exhibition: world, controls, data, audio
├── vendor/three/               Three.js r160, bundled so the site works offline
├── assets/
│   ├── sanyal-portrait.jpg     archival photograph
│   └── audio/background.mp3    background music
├── run-local.bat               one-click local server (Windows)
├── serve.js                    optional Node static server for local use
├── .nojekyll                   tell GitHub Pages to serve files verbatim
└── README.md
```

`js/main.js` is deliberately a single module. The exhibition is data-driven —
the timeline, network, writings and supplementary material are declared as
arrays near the top of the file, and the world is generated from them — so the
content is edited in one place rather than chased across a dozen files.

---

## Dependencies

| What | Where | Why |
| --- | --- | --- |
| Three.js r160 | `vendor/three/` (bundled) | The 3D engine. Bundled so the site runs with no network at all. |
| Cinzel, Cormorant Garamond | jsDelivr CDN | Typography. If the CDN is unreachable the site falls back to Georgia automatically, including the road lettering. |

No API keys, no tokens, no backend, no database, no tracking.

---

## Adding your own material

**Narration.** Every timeline entry has an `audioUrl` field. Set it to a file
you have placed in `assets/audio/` and a *Play narration* button appears on that
entry's panel:

```js
audioUrl: './assets/audio/1893-birth.mp3'
```

**Photographs.** Entries accept an `images` array. Anything listed there is
shown ahead of generated material:

```js
images: [{ src:'./assets/my-scan.jpg', caption:'…', credit:'…' }]
```

**Background music.** Replace `assets/audio/background.mp3`. No code change.

---

## A note on images and sources

The exhibition contains one photograph: the portrait of Sanyal, from the
Calcutta Mahajati Sadan collection, published before 1960 and in the public
domain in India. Everything else pictorial — maps, plans, document and newspaper
plates, the busts — is drawn for this exhibition from the cited sources and
labelled as a reconstruction. No likeness has been invented, and no quotation is
attributed to anyone who is not recorded as having said it.

Sources are listed on each panel and include *Bandi Jivan* (1922), the Sedition
Committee Report (1918), the Kakori Conspiracy Case judgment (1927), Kama
Maclean's *A Revolutionary History of Interwar India*, Sumit Sarkar's
*Modern India*, and the ICHR *Dictionary of Martyrs*.

---

## Browser support

Modern Chrome, Edge, Firefox and Safari. Requires WebGL and ES module support.
Browsers block audio until the visitor interacts with the page; the music starts
on the first genuine gesture rather than trying to work around that.
