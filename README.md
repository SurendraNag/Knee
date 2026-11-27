# Leg Explainer (formerly Knee Injury Explainer)

An interactive 3D model of the **right or left leg, from the hip to the toes**, that doctors and physical therapists can use to show
patients what is injured. The knee has the most detail; the hip and the ankle and foot now have their joints modelled too.
**Educational demo, not for diagnosis.** It stores no patient names or health details.

## Home page and getting around

The site opens on a **home page** (`index.html`) with one tile per body part (Knee and leg, Shoulder and elbow, Hand and wrist,
Spine and pelvis, Skull and face, Whole body) and the common injuries of each part one tap away.
- **Search** (on the home page and in the toolbar of every page) finds structures, injuries and body parts across the whole
  app, including lay words and abbreviations: "rotator cuff", "ACL", "kneecap", "slipped disc", "tennis elbow".
  A result on another page opens that page (an injury opens already placed; a structure opens selected and zoomed in).
- Every page has **Home** and a **body-part menu** at the top left. Old links to the site root (share links, patient links,
  website code from earlier versions) still open the leg page.
- The leg page is now `leg.html`.

## How to use it

**Right leg / Left leg** (next to the title) switches sides. The left leg is the mirror image of the scanned right leg:
views, labels, injuries, share links, saved images and cases all follow the side shown. A link or case made on the
left leg opens on the left leg.

**Explore mode**
- Drag to rotate, pinch or scroll to zoom, two-finger drag (or right-drag) to pan.
- The toolbar keeps the main controls up front: **Front / Back / Inside / Outside** and **Reset**, **Go to…**, **Find** (search),
  **Display**, **Share** (blue) and **⋯** (Save image and Cases).
- **Front / Back / Inside / Outside** jump to standard views (Inside = toward the other leg). **Reset** returns to the whole leg.
- **Go to…** flies to the hip, thigh, knee, calf and shin, or ankle and foot.
- **Display** opens one panel with See through bone, Labels, Vessels and nerves, One joint or tissue…, Layers and Spread apart.
- **Vessels and nerves** shows or hides the arteries, veins and the four main nerves (on in Explore, off in Injury mode).
- **See through bone** fades the bones so the ACL and PCL inside the joint are visible.
- **Layers** slider peels tissue away: skin → muscle → ligaments, tendons, vessels, nerves → cartilage → bone.
- Tap any structure (or use **Find a structure**) to see its name, what it does and common injuries, with Zoom in / Zoom out / Reset view.

**Injury mode**
- **Common injuries** (top of the Injury panel, and on the home page): one tap picks the structure and the injury, places
  the tag at a typical spot and turns the model to a view that shows it (with see-through bone, or the joint cut out, for
  structures hidden inside a joint). Then pick another type, **Move the tag** (tap the right spot), or add more.
  Each page has its own list, for example ACL tear, meniscus tear, ankle sprain, rotator cuff tear, tennis elbow,
  scaphoid fracture, herniated disc L4-L5, broken nose.
- Or do it step by step. The structure list is grouped by part of the body and tissue (for example "Knee · ligaments").
1. Tap a ligament, tendon, meniscus, the hip labrum or a bone (or pick it from the list).
2. Choose the injury type:
   - Ligaments: knee (ACL, PCL, MCL, LCL), hip (iliofemoral, pubofemoral, ischiofemoral, ligamentum teres; the hip has no collateral ligaments), ankle: Grade I (stretched), Grade II (partial tear, frayed fibres), Grade III (complete tear, separated curled ends)
   - Tendons (quadriceps, patellar, Achilles): partial or complete tear
   - Menisci: split, bucket-handle, flap tear
   - Hip labrum: labral tear, flap tear
   - Bones (every leg bone, from the hip bone to the toes): hairline crack, displaced break, shattered break, bone bruise, stress fracture
   - Kneecap: also **chondromalacia patella**, grade I to IV, drawn on the cartilage behind the kneecap (tap the kneecap or that cartilage).
     Grade I softened and slightly swollen, surface still smooth; II small surface cracks less than halfway deep; III deep cracks
     more than halfway, frayed surface; IV worn through, bone showing. A tag placed on the front of the kneecap moves to the
     same height and side on the cartilage behind it.
3. Tap the exact spot. The injury snaps to the nearest surface and gets a numbered red tag with a one-sentence explanation.
   Use the **Undo** and **Redo** arrows at the top left, the **×** next to an injury, or the red **Clear all** button.

**Show… (one joint, chosen tissues)**
- **One joint or tissue…** (in the **Display** panel) picks what is drawn:
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

**Share, Save image and Cases** (Save image and Cases are in the **⋯** menu)
- **Share** copies a **view-only link for the patient** first (Send to patient… on phones and iPads), and also gives an
  editable link for you and, under "Put it on a website", the website code. Every link reopens the same view and injuries. The whole view is packed into the part of the link after
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
  ligaments and the posterior sacroiliac ligaments. Not in this version: a separate coccyx (it is part of the scanned sacrum; Spine Movement splits it off), facet joint cartilage and the smaller spinal ligaments.
- Injuries (**preview, waiting for doctor review**): herniated ("slipped") discs and annular tears at any level, fractures of every
  vertebra (compression fractures, spondylolysis, dens fractures), rib, breastbone, sacral and pelvic fractures, and sprains of the
  spinal and sacroiliac ligaments.

Built by `scripts/build-spine.mjs` into `public/spine/` from `data/bodyparts3d/trunk-extra.*` (`scripts/extract-region.mjs <model> trunk`).

## Spine Movement (`spine-move.html`, v0.17.0-preview)

Asked for by an orthopaedic surgeon: the spine from the neck (C1) to the tailbone with the discs and nerves, where the spine and
the discs can be moved. Open it from the home page, the spine page's **⋯** menu, or `/spine-move.html`.

- **Bend**: sliders for bending forward and back, leaning left and right, and turning; **Moves** limits the movement to the
  neck, mid back or low back; **Play bending** loops forward and back. Each vertebra is a solid bone turning about a point in the back
  half of the disc below it, by a share of a typical adult range of motion per level (table `ROM` in `src/spine-move.js`). The discs,
  spinal cord, nerve roots and ligaments follow by blending the two nearest vertebrae, so a disc squeezes on the side that closes.
- **Disc**: tap a disc (or pick one), then drag it with a finger or the mouse, or use **Push toward** and **How far**. Up to 30 % it is a
  bulge, then a protrusion (the outer ring holds), and from 65 % an extrusion (the soft centre breaks through, the ring shows red).
  Nerves in the way are pushed aside; the one usually affected for that level and direction is marked red and named, with where its
  symptoms are usually felt: central (spinal cord or cauda equina), paracentral (neck: the exiting root, e.g. C5-C6 to C6; low back:
  the traversing root, e.g. L4-L5 to L5, L5-S1 to S1), foraminal and far lateral (the exiting root, e.g. L4-L5 to L4), front (no nerve).
  **Look from above** shows a slice at the disc, like a scan. Bending moves the soft centre away from the side that closes.
  Several discs can be pushed out at once.
- **Show**: spinal cord and nerves, spinal ligaments, pelvis, labels, see through bone, **Copy link** (the pose and the discs are kept
  in the address after `#`) and **Save image**.
- Simplified and for doctor review: the ranges of motion, the turning points, how far the disc reaches (it is scaled to the room
  between each disc and the nerve it meets, so it touches at about half way), which root is named, and the bending effect.
- Data: `public/spine-move/`, a byte-for-byte subset of `public/spine/` (`node scripts/build-spine-move.mjs`, 3 MB instead of 9 MB).
  The tailbone is split off the scanned sacrum at its narrowest point (BodyParts3D's "Sacrum" includes the coccyx). The soft centre of
  each disc and the traversing roots of the low back are made in the page.

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


**Male / Female** (next to the title) switches the whole-body explorer between the male BodyParts3D body and a female body
(**preview, waiting for doctor review**). The female body is made from the same detailed parts by `scripts/build-body-female.mjs`:
- the pelvis is reshaped toward typical female proportions (wider lower pelvis and pubic arch, rounder inlet, broader sacrum),
  with the hips, soft tissue and skin around it;
- the male reproductive organs and male urethra are removed; the uterus, ovaries, fallopian tubes, vagina and breast
  (mammary gland) tissue come from the Human Reference Atlas 3D reference organs (HuBMAP, CC BY 4.0, via open-anatomy-3d);
  a short female urethra is modelled;
- the pelvis (hip bones, sacrum, coccyx), the hip, knee, ankle and rear-foot bones, their joint cartilage, the four knee
  ligaments (ACL, PCL, MCL, LCL) and 38 hip and leg muscles a side are a real woman's: the Visible Human Female lower-limb
  models (Center for Orthopaedic Biomechanics, University of Denver; Andreassen et al., Sci Data 2023; CC BY 4.0), fitted
  to this body by `scripts/vhf-place.mjs`. The pelvis is fitted as one piece; the thigh and shin bones are placed by their
  joint centres and stretched along their length to the body's leg length, so the hip and knee joints stay closed; the
  foot hinges on the ankle axis. Muscles follow the bones around them. The dataset's muscles are the fleshy bellies, so the
  reference body's tendons are kept at their ends; its forefoot is one fused model, so the separate metatarsals and toe
  bones stay the reference body's;
- the skin is smoothed over the groin and raised over the breast tissue. Height, build and face stay those of the
  reference body. (The ready-made female body in open-anatomy-3d was tried first, but its pelvis and hands are distorted.)

## Where does it hurt? (`pain.html`, for patients)

A page for patients to show their doctor where they feel pain, on a plain 3D body (male or female).
- **Spot**: tap the body where it hurts. **Area**: drag over the body to paint a patch (small, medium or large brush);
  drag the background to turn the body. **Turn only** never marks.
- For each mark: how bad (0 to 10, coloured from yellow to deep red), what it feels like (sharp, dull ache, burning,
  shooting, tingling, numb, …), when it is worse, and a short note. The page names the place automatically
  (for example "Front of the right knee (kneecap)"); names use the patient's own right and left and are approximate.
- Also: when it started, and a message for the doctor.
- **Send to my doctor**: the phone's share menu (picture plus link), email, copy the text and link, or save a picture
  (front and back views with numbered marks and the list).
- **Undo** and **Redo** (arrows over the body, or Ctrl+Z and Ctrl+Shift+Z): each spot, each painted stroke, each removal and
  Clear all is one step, so one wrong stroke can be taken back and brought back again.
- The doctor opens the link and sees the same marks in 3D, read-only, with the list and message, and can tap a mark to fly to it.
- Everything is inside the link (`#p=...`) and the picture. Nothing is stored on a server, and the page asks patients not
  to type their name or other ID.

## Private parts (blurred unless a clinician shows them)

The genitals (male and female) are blurred everywhere they can be seen: the whole-body explorer (skin, and the male
organs and vessels), the skin layer of the Leg and Spine and Pelvis pages, and the patient's Where does it hurt? body.
The blur is drawn into the 3D picture itself, so saved images are blurred too.

- **Show them (clinicians):** Whole body: *Private parts: blurred* under the list of systems. Leg and Spine pages: the
  same switch in **Display**. Tap it twice (the first tap asks "Show private parts? Tap again"). It is off again every
  time a page is opened.
- **Patient links and website codes** stay blurred. Only when the private parts are shown at the time of sharing does
  the Share box offer a tick box, *Show the private parts in these links too*; it starts unticked.
- **Patient view:** has no switch, so a patient cannot turn the blur off. Where does it hurt? is always blurred; a pain
  mark there still shows as colour under the blur, and its number tag stays sharp.
- There is no sign-in yet, so the switch is a clinician setting, not a lock.

## On a clinic website (embedding) and patient links

The **Share** dialog also gives:
- a **patient link** (`?patient=1`): the same view and injuries, view-only, in a simpler patient layout. Patients get
  Front, Back, **My clinician's view** (back to exactly what was sent) and Labels, plus a card "1 injury marked by your
  clinician" that folds down to one line. Tapping a numbered tag or a structure explains it. There is no body-part menu,
  Home link, side switch, Display panel, search, Share or Cases, so a patient cannot leave the page or change the view
  by accident;
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

- v0.20.0-preview: genitals blurred by default on every page that shows them (body, leg and spine skin, pain map,
  saved images, patient and share links), with a clinician-only *Private parts* switch.
- v0.23.0-preview: panel fixes round 3, soft tissue. Muscles, skin, nerves and blood vessels can now be injured:
  muscle strain (partial tear), complete tear, bruised muscle, crush damage and compartment syndrome; skin cut, wound over a
  break (open fracture), graze and skin torn away (degloving); bruised or stretched nerve and nerve cut through; torn blood
  vessel and blood clot (DVT). Picking one brings back its layer (muscle, skin) or the vessels and nerves. New quick picks:
  hamstring strain, calf strain, bruised thigh (dead leg), compartment syndrome of the shin, crushed lower leg (crushed
  muscle, shin bone in several pieces, broken fibula), open fracture of the shin, DVT, fibular nerve injury (foot drop),
  low back muscle strain and crushed fingertip. All soft tissue injuries and their wording are for doctor review.
- v0.27.0-preview: chondromalacia patella. Kneecap injuries now include chondromalacia grade I to IV (softened; small
  cracks; deep cracks and fraying; worn through to bone) on the cartilage behind the kneecap, on both legs. Quick pick
  "Chondromalacia patella" (grade II, seen from behind with the thigh bone and the middle of the joint hidden), and search
  finds it as chondromalacia, runner's knee, patellofemoral pain or anterior knee pain. Tapping the cartilage behind the
  kneecap in Injury mode picks the kneecap. **For doctor review:** the grading follows the modified Outerbridge scale (II
  and III split at half the cartilage depth; the original scale splits by patch size, 1.5 cm); patch sizes and look of
  each grade; the default spot (middle of the cartilage; often the inner facet or central ridge in real life); and the
  patient wording, including "early changes often settle with the right exercises" for grade I and "the same as arthritis
  of the joint between the kneecap and the thigh bone" for grade IV.
- v0.25.0-preview: easier on iPhone. Tapping the 3D model is finger-sized on every page: a tap may wobble a little
  (14 px) before it counts as turning the model, and when the exact point misses a thin part (ligament, nerve, vessel,
  disc) the nearest part within about 20 px is chosen. iPhone Safari no longer zooms the whole page on a pinch over a
  panel or a quick double tap on a button. On phones, while a part's card or the injury steps are open, the toolbar drops
  its Go to and Find row so the model has room; the Body page's folded Systems box no longer covers the chest and head;
  all Spine Movement view buttons fit on screen (two rows); the top row fits on an iPhone SE.
- v0.24.0-preview: panel fixes round 4, after treatment. Bones now have an "After treatment" group: plate and screws, rod
  inside the bone (nail, long bones only), screws, cast, brace or splint, and joint replacement; ligaments can be shown
  reconstructed with a graft (with fixation screws). New quick picks: rod in the thigh bone, screws in a broken hip, hip
  replacement, knee replacement, ACL reconstruction, knee brace, plate on the ankle, plate on a broken wrist and wrist
  fracture in a cast. These are simplified illustrations, not a specific implant or technique, and are for doctor review
  (implant sizes and positions, hip screw angle, how a cast or brace looks).
- v0.22.0-preview: panel fixes round 2. Each finger and thumb bone is its own structure (base, middle and tip bone; the
  thumb has a base and a tip bone), so a break goes on the right one; old links that marked a whole finger move the injury to the
  nearest finger bone. Degenerative conditions: a worn (degenerated) disc, a disc bulge narrowing the canal (spinal stenosis),
  a vertebra slipped forward (spondylolisthesis, vertebrae only) and arthritis with bone spurs on any bone (the joint cartilage is
  worn through at the spot). New quick picks: worn disc L4-L5, spinal stenosis L4-L5 (disc bulge plus bone spurs on L4), slipped
  vertebra L4 on L5, facet joint arthritis L4-L5, knee arthritis (inner side, thigh and shin bone) and hip arthritis.
  A quick pick can now add more than one part (`also` in `src/catalog.js`). All new conditions and their wording are for doctor review.
- v0.21.0-preview: fixes from the simulated doctor and patient panel (26 Nov 2026). Calmer patient wording
  ("Complete tear (grade III)" instead of "Grade III sprain", "Break in several pieces" instead of "Shattered break", no promise
  that a sprain heals); new quick picks: thigh bone (femoral shaft) fracture, ankle fracture (outer ankle bone), thumb fracture at the
  base (Bennett) and thumb bone fracture; hip fracture quick pick now takes the socket and hip ligaments away so the femoral neck
  shows, ACL tear hides the kneecap and menisci; share links and patient links keep the parts a quick pick hid (they were lost before);
  a herniated disc on the spine page links to Spine Movement with that disc pressing on its nerve root; Share shows a QR code of the
  patient link and the pain page's Send shows one of the pain map link; **Larger text** button (AA) in the patient view, the
  Display panel and the pain page (remembered in this browser). New quick picks and views are for doctor review.
- v0.18.0-preview: Where does it hurt? gets Undo and Redo arrows (one step per spot, stroke, removal or Clear all).
- v0.19.0-preview: Undo and Redo arrows at the top left on every screen. On the pain page they moved to the top left on phones too; the leg, hand, shoulder, spine and head pages get them in Injury mode (one step per injury added, moved, removed or cleared; Ctrl+Z and Ctrl+Shift+Z work). They replace the old "Undo last" button in the injury panel.
- v0.16.0-preview: **Where does it hurt?** (`pain.html`): patients mark pain spots and areas on a 3D body, with level, kind
  and notes, and send them to their doctor as a link or picture. Linked from the body-part menu and the home page.
- v0.15.0-preview: easier to get around (from the v0.14 UX review): home page with body-part tiles and common injuries;
  one search box across all pages with lay words; "Common injuries" quick-pick in Injury mode that places the injury in a
  view that shows it; injury list grouped by body part and tissue; slimmer toolbar (Display panel, ⋯ menu, Share in blue);
  simpler patient view (My clinician's view, foldable injury card, tap a tag or a part to read, no way to leave the page);
  Share copies the patient link first; whole-body page uses the same Home and body-part menu (fits on phones) and opens the
  matching detailed page for injuries; the leg page moved to `leg.html` (old links still work); readable header over the model.

- v0.12.2-preview: anatomy accuracy audit across all pages (Gray's / Netter): corrected the ACL's attachment, the pterion,
  the anatomical snuffbox, the branching of the lower-leg arteries, the sciatic and median nerve areas, the costal cartilages,
  and several smaller descriptions; the knee and ankle "Show… joint only" views now keep the whole collateral ligaments and
  the PTFL; skull and face bones no longer offer stress fractures or bone bruises, teeth and the hyoid only a crack or a break;
  the IT band and plantar fascia are listed as fascia.
