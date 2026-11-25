# Leg Explainer (formerly Knee Injury Explainer)

An interactive 3D model of the **right or left leg, from the hip to the toes**, that doctors and physical therapists can use to show
patients what is injured. The knee has the most detail; the hip and the ankle and foot now have their joints modelled too.
**Educational demo, not for diagnosis.** It stores no patient names or health details.

## How to use it

**Right leg / Left leg** (next to the title) switches sides. The left leg is the mirror image of the scanned right leg:
views, labels, injuries, share links, saved images and cases all follow the side shown. A link or case made on the
left leg opens on the left leg.

**Explore mode**
- Drag to rotate, pinch or scroll to zoom, two-finger drag (or right-drag) to pan.
- **Front / Back / Inside / Outside** jump to standard views (Inside = toward the other leg). **Reset** returns to the whole leg.
- **Go to…** flies to the hip, thigh, knee, calf and shin, or ankle and foot.
- **Vessels and nerves** shows or hides the arteries, veins and the four main nerves (on in Explore, off in Injury mode).
- **See through bone** fades the bones so the ACL and PCL inside the joint are visible.
- **Layers** slider peels tissue away: skin → muscle → ligaments, tendons, vessels, nerves → cartilage → bone.
- Tap any structure (or use **Find a structure**) to see its name, what it does and common injuries, with Zoom in / Zoom out / Reset view.

**Injury mode**
1. Tap a ligament, tendon, meniscus, the hip labrum or a bone (or pick it from the list).
2. Choose the injury type:
   - Ligaments (knee, hip, ankle): Grade I (stretched), Grade II (partial tear, frayed fibres), Grade III (complete tear, separated curled ends)
   - Tendons (quadriceps, patellar, Achilles): partial or complete tear
   - Menisci: split, bucket-handle, flap tear
   - Hip labrum: labral tear, flap tear
   - Bones (every leg bone, from the hip bone to the toes): hairline crack, displaced break, shattered break, bone bruise, stress fracture
3. Tap the exact spot. The injury snaps to the nearest surface and gets a numbered red tag with a one-sentence explanation.
   Use **Undo last**, the **×** next to an injury, or the red **Clear all** button.

**Share, Save image and Cases** (on a phone, tap **More** to see them)
- **Share** makes a link that reopens the same view and injuries. The whole view is packed into the part of the link after
  `#`, which browsers never send to the server, so nothing is stored anywhere. Copy it or use the phone's share sheet.
- **Save image** downloads a PNG of the current view with the labels, numbered injury tags, the list of injuries,
  the disclaimer and the BodyParts3D credit.
- **Cases** saves the current view under a name you choose (for example "ACL tear, side view"), in this browser only.
  Open, share, rename or delete saved cases from the same list. Use names that describe the injury, not the patient.

## Whole-body explorer (`body.html`)

Open **Whole body** from the leg app (or `/body.html`). It shows the full BodyParts3D adult male model, about 2,200 parts.

- **Systems** panel: switch skin, muscles, skeleton, ligaments and tendons, brain and nerves, arteries, veins, organs, and eyes and ears
  on or off. Each system downloads the first time it is switched on (the skeleton is about 3 MB, muscles about 7 MB).
- **Tap a part** to see its name and system. Then use *Zoom to it*, *Show only this* or *Hide it*. *Glass focus* turns everything
  else see-through. *Show all parts* brings back hidden parts.
- **Find a part**: type a name such as `left femur`, `stomach` or `vagus`.
- **Go to…** flies to a region (head, chest, abdomen, pelvis, right shoulder, elbow, hand, knee, foot).
- Injury mode is on the right leg only for now; right knee parts link to it.

The body data is built by `scripts/build-body.mjs` from the npm package `@dagno/anatomy-model` 0.1.2
(BodyParts3D 4.0 simplified for the web, CC BY 4.0) into `public/body/`.

## Running it locally

```bash
npm install
npm run dev            # local dev server
npm run build          # production build into dist/
npm run build:anatomy  # regenerate public/anatomy/* from scripts/build-anatomy.mjs
```

## How the anatomy is made

`scripts/build-anatomy.mjs` builds everything into a gzip-compressed, quantised binary in `public/anatomy/`
(centimetres, Y up, +Z front, +X inner/medial side of the right leg, knee joint line near y = 0, sole near y = -44,
top of the hip bone near y = 59). About 100 structures, 500,000 vertices, about 8 MB download
(positions, texture coordinates and triangle indices are delta-coded and byte-split before gzip).

- **Bones, muscles, blood vessels, skin and the IT band** are scan-derived meshes from BodyParts3D 4.0
  (`data/bodyparts3d/`), converted to centimetres and smoothed (Loop subdivision). The tibia and everything below it
  are lowered 3 mm to make room for knee cartilage and menisci; soft tissue follows that smoothly across the knee.
  Small parts missing from the region files (some foot and hip muscles, the vessels and the skin) come from the
  whole-body package and are extracted by `scripts/extract-leg-extra.mjs` into `leg-extra.{json,bin}`.
- **Cartilage** is generated as shells on the scanned joint surfaces: knee (condyles, trochlea, plateaus, kneecap),
  hip (femoral head, fitted as a 4.6 cm sphere, and the horseshoe of the socket), ankle (talar dome, tibial plafond,
  malleoli) and the foot joints (wherever two foot bones meet).
- **Ligaments, menisci, the hip labrum and capsule, the quadriceps, patellar and Achilles tendons, the plantar fascia and
  the nerves** are not in BodyParts3D as usable shapes, so they are swept along centre-lines placed on the scanned bones,
  muscles and vessels. The three hip ligaments are
  thickened bands lying on the capsule that thin out where they blend in. The hip capsule and the nerves are marked "simplified" in the app.

The earlier fully hand-built knee is kept in `scripts/build-anatomy-procedural.mjs`. Every shape is pending
review by a doctor.

## Credits

Bones, muscles, vessels and skin: BodyParts3D, © The Database Center for Life Science licensed under CC Attribution 4.0
International (https://creativecommons.org/licenses/by/4.0/). Changes: cropped to the right leg, coordinates converted,
smoothed; see `data/bodyparts3d/README.md`. Source files via the npm package
`@somakine/bodyparts3d-musculoskeletal` (CC BY 4.0, geometry unchanged).

## Versions

Each release is tagged (`v0.1.0`, `v0.2.0-preview`, …) and deployed to its own link so earlier versions stay available.
