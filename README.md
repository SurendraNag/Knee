# Knee Injury Explainer

An interactive 3D model of the **right knee** that doctors and physical therapists can use to show patients what is injured.
**Educational demo, not for diagnosis.** It stores no patient names or health details.

## How to use it

**Explore mode**
- Drag to rotate, pinch or scroll to zoom, two-finger drag (or right-drag) to pan.
- **Front / Back / Inside / Outside** jump to standard views (Inside = toward the other leg). **Reset** returns home.
- **See through bone** fades the bones so the ACL and PCL inside the joint are visible.
- **Layers** slider peels tissue away: skin → muscle → ligaments, tendons, menisci → cartilage → bone.
- Tap any structure (or use **Find a structure**) to see its name, what it does and common injuries, with Zoom in / Zoom out / Reset view.

**Injury mode**
1. Tap a ligament, tendon, meniscus or bone (or pick it from the list).
2. Choose the injury type:
   - Ligaments: Grade I (stretched), Grade II (partial tear, frayed fibres), Grade III (complete tear, separated curled ends)
   - Tendons: partial or complete tear
   - Menisci: split, bucket-handle, flap tear
   - Bones: hairline crack, displaced break, shattered break, bone bruise, stress fracture
3. Tap the exact spot. The injury snaps to the nearest surface and gets a numbered red tag with a one-sentence explanation.
   Use **Undo last**, the **×** next to an injury, or the red **Clear all** button.

## Running it locally

```bash
npm install
npm run dev            # local dev server
npm run build          # production build into dist/
npm run build:anatomy  # regenerate public/anatomy/* from scripts/build-anatomy.mjs
```

## How the anatomy is made

`scripts/build-anatomy.mjs` builds everything into a quantised binary in `public/anatomy/`
(centimetres, Y up, +Z front, +X inner/medial side of the right knee, joint line near y = 0).

- **Bones and muscles** are real scan-derived meshes from BodyParts3D 4.0 (`data/bodyparts3d/`), cropped to the
  knee region, converted to centimetres and smoothed (Loop subdivision). The tibia and fibula are lowered 3 mm
  to make room for cartilage and menisci.
- **Cartilage** is generated as shells on the scanned joint surfaces (condyles, trochlea, tibial plateaus,
  back of the kneecap), thinning to nothing at the rim.
- **Ligaments, menisci, the quadriceps and patellar tendons and the IT band** are not in BodyParts3D, so they are
  swept along centre-lines through their attachment points on the scanned bones.
- **Skin** is a smooth envelope around the muscles and bones.

The earlier fully hand-built version is kept in `scripts/build-anatomy-procedural.mjs`. Every shape is pending
review by a doctor.

## Credits

Bones and muscles: BodyParts3D, © The Database Center for Life Science licensed under CC Attribution 4.0
International (https://creativecommons.org/licenses/by/4.0/). Changes: cropped to the knee, coordinates converted,
smoothed; see `data/bodyparts3d/README.md`. Source files via the npm package
`@somakine/bodyparts3d-musculoskeletal` (CC BY 4.0, geometry unchanged).

## Versions

Each release is tagged (`v0.1.0`, `v0.2.0-preview`, …) and deployed to its own link so earlier versions stay available.
