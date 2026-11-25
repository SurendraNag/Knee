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
   - Ligaments: knee (ACL, PCL, MCL, LCL), hip (iliofemoral, pubofemoral, ischiofemoral, ligamentum teres; the hip has no collateral ligaments), ankle: Grade I (stretched), Grade II (partial tear, frayed fibres), Grade III (complete tear, separated curled ends)
   - Tendons (quadriceps, patellar, Achilles): partial or complete tear
   - Menisci: split, bucket-handle, flap tear
   - Hip labrum: labral tear, flap tear
   - Bones (every leg bone, from the hip bone to the toes): hairline crack, displaced break, shattered break, bone bruise, stress fracture
3. Tap the exact spot. The injury snaps to the nearest surface and gets a numbered red tag with a one-sentence explanation.
   Use **Undo last**, the **×** next to an injury, or the red **Clear all** button.

**Show… (one joint, chosen tissues)**
- **Show…** (next to Vessels and nerves; on a phone under **More**) picks what is drawn:
  - **Joint**: the whole leg, or the hip, knee or ankle joint only. Everything outside a box around that joint is cut away,
    and the cut faces of bones show as flat cross-sections. Other pages offer their own joints (wrist, thumb, fingers;
    shoulder, AC joint, elbow; neck, low back, sacroiliac joints; right or left jaw joint, shown as a side slice through the joint).
  - **Tissues**: tick bones, cartilage (with menisci and labrum), ligaments and joint capsule, tendons, fascia (IT band, plantar fascia), discs, muscles, nerves,
    blood vessels, brain and eyes, or skin, or use a preset such as **Bones and ligaments**. While tissues are chosen here the
    Layers slider and Vessels and nerves button are set aside; moving either one goes back to the normal layers.
- A bar at the top says what is shown, with **Change** and **Show all**. The choice is kept in share links and saved cases.

**Double-tap zoom** (double-click with a mouse)
- Double-tap a body part to fly in to it (its name and description show, everything around it stays solid).
- Double-tap again on a spot to go closer to that spot, as many times as you like.
- Zoom out (scroll, pinch or Zoom out) to step back one level at a time, back to the normal view. Double-tap empty space to go straight back.

**Share, Save image and Cases** (on a phone, tap **More** to see them)
- **Share** makes a link that reopens the same view and injuries. The whole view is packed into the part of the link after
  `#`, which browsers never send to the server, so nothing is stored anywhere. Copy it or use the phone's share sheet.
- **Save image** downloads a PNG of the current view with the labels, numbered injury tags, the list of injuries,
  the disclaimer and the BodyParts3D credit.
- **Cases** saves the current view under a name you choose (for example "ACL tear, side view"), in this browser only.
  Open, share, rename or delete saved cases from the same list. Use names that describe the injury, not the patient.

## Hand Explainer (`hand.html`)

Pick **Hand** from the body-part menu (or `/hand.html`). It shows the forearm and hand, from just below the elbow to the fingertips,
as a **Right hand / Left hand** switch (the left hand is the mirror image of the scanned right hand).
It works like the leg app: Explore and Injury modes, layers, labels, see-through bone, spread apart, Share, Save image and Cases
(cases are kept separately from the leg's).

- Views: **Palm**, **Back**, **Thumb side**, **Little side**. **Go to…**: forearm and hand, hand, wrist, fingers, thumb, back of the hand.
- Scanned (BodyParts3D): radius, ulna, all eight wrist bones, the five metacarpals, the finger and thumb bones, 22 forearm and hand muscle
  groups with their tendons, the flexor retinaculum, the interosseous membrane, the radial and ulnar arteries, the palmar arches and
  finger arteries, the forearm and hand veins, and the skin.
- Modelled: wrist and finger cartilage, the TFCC, the scapholunate ligament, the thumb's ulnar collateral ligament, the collateral
  ligaments of the finger middle joints, the extensor tendons over the finger ends, and the median, ulnar and superficial radial nerves.
- Injuries (**preview, waiting for doctor review**): fractures of every bone (for example distal radius, scaphoid, boxer's fracture of the
  fifth metacarpal), ligament sprains grade I to III (scapholunate, skier's thumb, finger collaterals), TFCC central and peripheral tears,
  and extensor tendon tears at the finger end (mallet finger).

The hand data is built by `scripts/build-hand.mjs` into `public/hand/` from `data/bodyparts3d/arm-extra.*`
(extracted by `scripts/extract-arm-extra.mjs` from `@dagno/anatomy-model` 0.1.2, BodyParts3D 4.0, CC BY 4.0).
Shared build helpers are in `scripts/build-lib.mjs`; page differences (regions, views, spread, cases) are in `src/limbs.js`.

## Shoulder and Elbow Explainer (`shoulder.html`)

Pick **Shoulder** from the body-part menu next to Explore and Injury (or open `/shoulder.html`). It shows the shoulder
girdle, upper arm, elbow and the top of the forearm, with the upper ribs and breastbone for context, as a **Right arm / Left arm**
switch (the left arm is the mirror image of the scanned right arm). Everything else works as in the leg and hand apps; its cases
are kept separately.

- Views: **Front**, **Back**, **Outside**, **Body side**. **Go to…**: shoulder and arm, shoulder, rotator cuff (from behind),
  collarbone and AC joint, upper arm, elbow, back of the elbow.
- Scanned (BodyParts3D): collarbone, shoulder blade, humerus, top of the radius and ulna, breastbone, ribs 1 to 7 with their cartilage,
  22 muscle groups (deltoid, the four rotator cuff muscles, biceps, triceps, chest, back and forearm muscles), the axillary and
  brachial arteries and their branches, the deep and superficial veins (including the median cubital vein), and the skin.
- Modelled: shoulder and elbow cartilage, the glenoid labrum, the AC, coracoclavicular and coracoacromial ligaments, the rotator cuff
  (supraspinatus) tendon, the long head and distal biceps tendons, the common extensor and flexor tendons (tennis and golfer's elbow
  sites), the elbow's ulnar and radial collateral ligaments and annular ligament, and the axillary, radial, ulnar, median and
  musculocutaneous nerves.
- Injuries (**preview, waiting for doctor review**): rotator cuff partial and complete tears, labral tears (Bankart and flap),
  AC separation, biceps ruptures at the shoulder and elbow, tennis and golfer's elbow, elbow ligament sprains including the UCL,
  pulled elbow, and fractures of every bone (collarbone, neck and shaft of the humerus, radial head, olecranon and others).

The data is built by `scripts/build-shoulder.mjs` into `public/shoulder/` from `data/bodyparts3d/shoulder-extra.*`
(extracted by `scripts/extract-region.mjs <model> shoulder`). The region's fade at its cut edges is `fade()` in `src/shoulder-structures.js`.

## Spine and Pelvis Explainer (`spine.html`)

Pick **Spine and pelvis** from the body-part menu (or open `/spine.html`). It shows the whole spine from the atlas (C1) to the sacrum
with the ribs, breastbone and both hip bones. Both sides are scanned, so there is no left/right switch; the side views are
**Left side** and **Right side**. **Spread apart** pulls the vertebrae and discs apart level by level.

- **Go to…**: spine, ribs and pelvis, neck, upper back (from behind), chest and ribs, low back (side and behind), pelvis.
- Scanned (BodyParts3D): all 24 vertebrae (C1 to L5, each its own structure), the sacrum, both hip bones, all ribs, the breastbone and
  rib cartilage, the back, neck, belly-wall, rib, hip-flexor and pelvic-floor muscles (16 groups), the aorta and iliac arteries,
  vertebral, intercostal and lumbar arteries, the vena cava and trunk veins, and the skin of the trunk.
- The 23 intervertebral discs (C2-C3 to L5-S1) follow the scanned discs' outlines but are rebuilt as rings so they can show tears.
- Modelled: the spinal cord and cauda equina, a pair of nerve roots at every disc level, the anterior and posterior longitudinal
  ligaments and the posterior sacroiliac ligaments. Not in this version: the coccyx, facet joint cartilage and the smaller spinal ligaments.
- Injuries (**preview, waiting for doctor review**): herniated ("slipped") discs and annular tears at any level, fractures of every
  vertebra (compression fractures, spondylolysis, dens fractures), rib, breastbone, sacral and pelvic fractures, and sprains of the
  spinal and sacroiliac ligaments.

Built by `scripts/build-spine.mjs` into `public/spine/` from `data/bodyparts3d/trunk-extra.*` (`scripts/extract-region.mjs <model> trunk`).

## Skull and Face Explainer (`head.html`)

Pick **Skull and face** from the body-part menu (or open `/head.html`). It shows the skull, face and jaw with the top of the neck.
Both sides are scanned, so there is no left/right switch. **Spread apart** pulls the skull bones apart.

- **Go to…**: head, face, eye socket, jaw and teeth, jaw joint (TMJ), top and back of the skull, base of the skull (from below).
- Scanned (BodyParts3D): the frontal, parietal, temporal, occipital, sphenoid and ethmoid bones, nasal bones, upper jaw, cheekbones,
  palatine bones, vomer, lacrimal bones, lower jaw, upper and lower teeth, hyoid, atlas and axis; the brain (cerebrum, cerebellum,
  brainstem), the eyes, optic and eye nerves, the arteries of the brain; eye, upper neck, floor of the mouth, tongue and soft palate
  muscles; the skin of the head with the ears. Turn on **See through bone** to see the brain inside the skull.
- Modelled: the two jaw joint (TMJ) discs. Not in this version: the chewing muscles (masseter, temporalis) and the face muscles.
- Injuries (**preview, waiting for doctor review**): fractures of every skull and face bone (broken nose, cheekbone and orbital floor
  fractures, jaw fractures, skull fractures, depressed fractures), broken teeth, dens fractures, and a displaced or torn jaw joint disc.

Built by `scripts/build-head.mjs` into `public/head/` from `data/bodyparts3d/head-extra.*` (`scripts/extract-region.mjs <model> head`).

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

## On a clinic website (embedding) and patient links

The **Share** dialog also gives:
- a **patient link** (`?patient=1`): the same view and injuries, view-only. Patients can turn, zoom, double-tap and tap to read,
  but cannot add or remove injuries;
- **website code**: an `<iframe>` snippet to paste into a page of the clinic website, one for doctors and one for patients.
  Inside a website the page hides the Whole body link and shows **Open full screen** (opens the same view in a new tab).

Example: `<iframe src="https://knee.surendranag.workers.dev/hand.html?embed=1&patient=1" title="Hand Explainer" width="100%" height="640" style="border:0" allow="fullscreen; clipboard-write"></iframe>`.
Adding `#c=...` from a share link opens that exact view and injuries. Nothing about the patient is stored or sent anywhere.

## Running it locally

```bash
npm install
npm run dev            # local dev server
npm run build          # production build into dist/
npm run build:anatomy  # regenerate public/anatomy/* from scripts/build-anatomy.mjs
npm run build:hand     # regenerate public/hand/* (forearm and hand)
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

- v0.12.2-preview: anatomy accuracy audit across all pages (Gray's / Netter): corrected the ACL's attachment, the pterion,
  the anatomical snuffbox, the branching of the lower-leg arteries, the sciatic and median nerve areas, the costal cartilages,
  and several smaller descriptions; the knee and ankle "Show… joint only" views now keep the whole collateral ligaments and
  the PTFL; skull and face bones no longer offer stress fractures or bone bruises, teeth and the hyoid only a crack or a break;
  the IT band and plantar fascia are listed as fascia.
