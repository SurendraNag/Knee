# BodyParts3D source meshes

BodyParts3D, © The Database Center for Life Science licensed under CC Attribution 4.0 International.
License: https://creativecommons.org/licenses/by/4.0/ · record: https://dbarchive.biosciencedbc.jp/en/bodyparts3d/lic.html

These GLB files are BodyParts3D 4.0 meshes as repackaged (unchanged geometry, region grouping only)
in the npm package `@somakine/bodyparts3d-musculoskeletal` 0.2.0, also CC BY 4.0. See LICENSE.txt.

`scripts/build-anatomy.mjs` reads them, keeps the right knee region, converts millimetres (Z up)
to the app's centimetre frame, smooths, and bakes them into `public/anatomy/`. Changes made by
this project: cropping to the knee, coordinate conversion, subdivision smoothing, generated
cartilage shells, and ligaments, menisci and tendons that BodyParts3D does not include.
