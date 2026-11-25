# BodyParts3D source meshes

BodyParts3D, © The Database Center for Life Science licensed under CC Attribution 4.0 International.
License: https://creativecommons.org/licenses/by/4.0/ · record: https://dbarchive.biosciencedbc.jp/en/bodyparts3d/lic.html

These GLB files are BodyParts3D 4.0 meshes as repackaged (unchanged geometry, region grouping only)
in the npm package `@somakine/bodyparts3d-musculoskeletal` 0.2.0, also CC BY 4.0. See LICENSE.txt.

`leg-extra.json` + `leg-extra.bin` (gzip) hold further right-leg parts (small hip and foot muscles, the leg
arteries and veins, the iliotibial tract and the body skin) taken from BodyParts3D 4.0 as simplified in the npm package
`@dagno/anatomy-model` 0.1.2 (CC BY 4.0), already converted to the app's centimetre frame by `scripts/extract-leg-extra.mjs`.

`scripts/build-anatomy.mjs` reads them, keeps the right leg (hip to toes), converts millimetres (Z up)
to the app's centimetre frame, smooths, and bakes them into `public/anatomy/`. Changes made by
this project: cropping to the right leg, coordinate conversion, subdivision smoothing, generated
cartilage shells, and ligaments, menisci and tendons that BodyParts3D does not include.

`arm-extra.json` + `arm-extra.bin` (gzip) hold the right forearm and hand parts (bones, muscles with their tendons, flexor
retinaculum, interosseous membrane, arteries, veins and the skin around the forearm and hand) from the same whole-body package
(`@dagno/anatomy-model` 0.1.2, CC BY 4.0), converted by `scripts/extract-arm-extra.mjs` to the hand app's frame (cm, origin at
the wrist, fingers up, palm forward: the scan's right hand turned 180 degrees about the front-back axis). `scripts/build-hand.mjs`
reads them, smooths them and adds modelled cartilage, wrist and finger ligaments, finger extensor tendons and nerves.

`shoulder-extra.json` + `shoulder-extra.bin` (gzip) hold the right shoulder girdle, upper arm and elbow parts (bones, ribs 1 to 7 and
breastbone, muscles, arteries, veins, the forearm's interosseous membrane and the skin of the arm, shoulder and right upper chest and
back) from the same package, converted by `scripts/extract-region.mjs` (region `shoulder`) to cm with the origin near the humeral head
and the scan's axes. `scripts/build-shoulder.mjs` smooths them and adds the modelled cartilage, labrum, ligaments, tendons and nerves.

`trunk-extra.json` + `trunk-extra.bin` (gzip) hold the spine, discs, sacrum, hip bones, ribs, breastbone, trunk muscles, the main
trunk arteries and veins and the skin of the trunk, converted by `scripts/extract-region.mjs` (region `trunk`; cm, origin in front of
L5, scan axes). `scripts/build-spine.mjs` rebuilds the discs as rings and adds the modelled spinal cord, nerve roots and ligaments.

`head-extra.json` + `head-extra.bin` (gzip) hold the skull, face and jaw bones, teeth, hyoid, atlas and axis, the brain surface parts,
eyes, cranial nerves, brain arteries, head and upper neck muscles, the skin of the head and the outer ears, converted by
`scripts/extract-region.mjs` (region `head`; cm, origin near the middle of the skull, scan axes). `scripts/build-head.mjs` smooths
them and adds the modelled jaw joint discs.
