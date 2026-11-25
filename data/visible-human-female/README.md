# Visible Human Female lower limb

`vhf-lower-limb.bin.gz` holds the 128 surface models of the Visible Human Female lower-limb dataset: pelvis (hip bones),
sacrum, coccyx, femur, patella, tibia, fibula, talus, calcaneus, navicular, cuboid, the three cuneiforms and the fused
forefoot bones, joint cartilage (femoral head, acetabulum, distal femur, patella, tibial plateaus, distal tibia, talus),
the four knee ligaments (ACL, PCL, MCL, LCL) and 38 muscles a side, for both sides (sacrum and coccyx once).

Source: "Final 3D STL Models-stl" from https://digitalcommons.du.edu/visiblehuman/1/ (dataset doi
https://doi.org/10.56902/COB.vh.2022.0), Center for Orthopaedic Biomechanics, University of Denver, made from the US
National Library of Medicine Visible Human Female cryosections. Licence: Creative Commons Attribution 4.0
(https://creativecommons.org/licenses/by/4.0/). Please cite:

- Andreassen, T. E., Hume, D. R., Hamilton, L. D., Walker, K. E., Higinbotham, S. E. & Shelburne, K. B. "Three-dimensional
  lower extremity musculoskeletal geometry of the Visible Human Female and Male." Scientific Data (2023).
  https://doi.org/10.1038/s41597-022-01905-2
- Andreassen, T. E., Hume, D. R., Hamilton, L. D., Higinbotham, S. E. & Shelburne, K. B. "An Automated Process for 2D and
  3D Finite Element Overclosure and Gap Adjustment using Radial Basis Function Networks." arXiv (2022).
  https://doi.org/10.48550/arXiv.2209.06948

Changes made here: each model was welded and reduced in size (quadric vertex clustering, about 2.3 million triangles in
all down to about 660 thousand: cells of up to 0.9 mm for cartilage and ligaments, 2.4 mm for bones, 4.5 mm for muscles)
and packed as below. The models are otherwise as published.

Format (after gunzip): u32 header length, a JSON header `{MN: [x,y,z] mm, S: mm per step, meta: [{n: file name, nv, nt}]}`,
then for each model `nv*3` u16 positions (mm = value * S + MN, scan axes: x toward the body's right, y forward, z up) and
`nt*3` i32 triangle index deltas. `scripts/vhf.mjs` reads it.
