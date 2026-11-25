// Structures of the spine, ribcage and pelvis (one model, no left/right switch: both sides are scanned).
// Frame: centimetres, origin in front of the fifth lumbar vertebra, scan axes: +X toward the body's left, +Y up, +Z front.
// Layers as in the leg: 0 skin, 1 muscle, 2 ligaments/discs/vessels/nerves, 3 cartilage, 4 bone.
// `simplified` marks modelled shapes (BodyParts3D has no spinal cord, nerve roots or spinal ligaments).
const ss = (x, a, b) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
// cut below the hip bones, above the first vertebra and out at the arms; each cut fades out
export const fade = (x, y) => (1 - ss(-y, 16.5, 18.5)) * (1 - ss(y, 57, 60)) * (1 - ss(Math.abs(x), 17.5, 20));

const ORD = ['first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth', 'ninth', 'tenth', 'eleventh', 'twelfth'];
const cap = (s) => s[0].toUpperCase() + s.slice(1);
// [id, scan name, short label, region]
export const VERTEBRAE = [
  ['c1', 'Atlas', 'C1 (atlas)', 'neck'], ['c2', 'Axis', 'C2 (axis)', 'neck'],
  ...[3, 4, 5, 6, 7].map((n) => [`c${n}`, `${cap(ORD[n - 1])} cervical vertebra`, `C${n}`, 'neck']),
  ...[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((n) => [`t${n}`, `${cap(ORD[n - 1])} thoracic vertebra`, `T${n}`, 'chest']),
  ...[1, 2, 3, 4, 5].map((n) => [`l${n}`, `${cap(ORD[n - 1])} lumbar vertebra`, `L${n}`, 'low back']),
];
// discs: [id, scan name, label]; "disk of X" is the disc below vertebra X
export const DISCS = [
  ['disc_c2_c3', 'Intervertebral disk of axis', 'C2-C3'],
  ...[3, 4, 5, 6].map((n) => [`disc_c${n}_c${n + 1}`, `Intervertebral disk of ${ORD[n - 1]} cervical vertebra`, `C${n}-C${n + 1}`]),
  ['disc_c7_t1', 'Intervertebral disk of seventh cervical vertebra', 'C7-T1'],
  ...[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map((n) => [`disc_t${n}_t${n + 1}`, `Intervertebral disk of ${ORD[n - 1]} thoracic vertebra`, `T${n}-T${n + 1}`]),
  ['disc_t12_l1', 'Intervertebral disk', 'T12-L1'],
  ...[1, 2, 3, 4].map((n) => [`disc_l${n}_l${n + 1}`, `Intervertebral disk of ${ORD[n - 1]} lumbar vertebra`, `L${n}-L${n + 1}`]),
  ['disc_l5_s1', 'Intervertebral disk of fifth lumbar vertebra', 'L5-S1'],
];

const VTEXT = {
  neck: { what: 'A neck (cervical) vertebra. The seven neck vertebrae are small and very mobile; the spinal cord runs through the ring behind each body.', injuries: ['Neck fractures from diving into shallow water, falls and car crashes can injure the spinal cord', 'Wear of the joints and discs (cervical spondylosis) with neck pain and stiffness'] },
  chest: { what: 'A chest (thoracic) vertebra. The twelve thoracic vertebrae carry the ribs, which makes this part of the spine stiff and strong.', injuries: ['Compression (wedge) fractures from osteoporosis, sometimes after only a cough or a small fall', 'Fractures from high-energy falls and crashes, most often where the chest meets the low back (T11 to L2)'] },
  'low back': { what: 'A low back (lumbar) vertebra. The five lumbar vertebrae are the largest and carry most of the body weight.', injuries: ['Compression fractures from osteoporosis or falls', 'Spondylolysis: a stress fracture of the bony arch, common in young gymnasts, cricket bowlers and footballers (most often L5)', 'Spondylolisthesis: one vertebra slips forward on the one below'] },
};
const SPECIAL = {
  c1: { what: 'The first neck vertebra (atlas): a ring with no body that carries the skull. Nodding happens between the skull and the atlas.', injuries: ['Jefferson fracture: the ring bursts apart from a blow to the top of the head, for example diving'] },
  c2: { what: 'The second neck vertebra (axis). Its peg (dens) sticks up inside the ring of the atlas; turning the head happens around it.', injuries: ['Dens (odontoid) fractures, especially from falls in older people', "Hangman's fracture of its arch in severe head-first injuries"] },
};

const bone = (name, what, injuries, short, joint = 'spine') => ({ short: short || name.toLowerCase(), name, group: 'Bone', layer: 4, kind: 'bone', joint, what, injuries });
const muscle = (name, what, injuries = []) => ({ name, group: 'Muscle', layer: 1, kind: 'muscle', what, injuries });

export const STRUCTURES = {};
for (const [id, , label, region] of VERTEBRAE) {
  const t = SPECIAL[id] || VTEXT[region];
  STRUCTURES[id] = bone(`${label} vertebra`, t.what, t.injuries, `${label} vertebra`);
}
Object.assign(STRUCTURES, {
  sacrum: bone('Sacrum', 'The triangular bone at the base of the spine, made of five fused vertebrae. It is wedged between the two hip bones at the sacroiliac joints.', ['Sacral insufficiency fractures in older people with osteoporosis', 'Fractures in severe pelvic injuries'], 'sacrum', 'pelvis'),
  right_hip_bone: bone('Right hip bone (pelvis)', 'One half of the pelvis: the ilium (the wing you feel at the waist), the ischium (the sitting bone) and the pubis, fused together. It holds the hip socket.', ['Pelvic fractures in high-energy accidents can bleed heavily', 'Pubic ramus fractures from simple falls in older people', 'Avulsion fractures where muscles pull off a piece of bone in teenage sprinters'], 'right hip bone', 'pelvis'),
  left_hip_bone: bone('Left hip bone (pelvis)', 'One half of the pelvis: the ilium, ischium and pubis fused together. It holds the hip socket.', ['Pelvic fractures in high-energy accidents can bleed heavily', 'Pubic ramus fractures from simple falls in older people'], 'left hip bone', 'pelvis'),
  ribs: bone('Ribs', 'Twelve pairs of curved bones that form the chest cage and protect the heart and lungs. They join the thoracic vertebrae at the back.', ['Rib fractures from falls and blows: sharp pain when breathing or coughing', 'Flail chest: several ribs broken in two places so a segment moves the wrong way when breathing', 'Stress fractures in rowers and golfers'], 'rib', 'chest'),
  sternum: bone('Breastbone (sternum)', 'The flat bone in the middle of the chest, with the manubrium at the top and the small xiphoid at the bottom.', ['Fractures from a hard blow to the chest, such as a seat belt or steering wheel in a car crash'], 'breastbone', 'chest'),
  costal_cartilage: { name: 'Rib cartilage (costal cartilage)', group: 'Cartilage', layer: 3, kind: 'cartilage', what: 'Bars of cartilage that join the front ends of the upper ribs to the breastbone, letting the chest expand when breathing.', injuries: ['Costochondritis: painful, tender rib cartilage, a common cause of chest pain that is not the heart', 'Can be torn from the rib in contact sports'] },
});

const DISC_INJ = ['Herniated (slipped) disc: the soft centre pushes out through a tear in the outer ring and can press on a nerve root', 'Disc degeneration with age: the disc dries out and loses height'];
for (const [id, , label] of DISCS) {
  const low = label.startsWith('L'), neck = label.startsWith('C');
  STRUCTURES[id] = { short: `${label} disc`, name: `${label} disc`, group: 'Disc', layer: 2, kind: 'spinaldisc', joint: 'spine',
    what: `The intervertebral disc between ${label.replace('-', ' and ')}: a tough outer ring (annulus) around a soft, gel-like centre (nucleus). Discs cushion the vertebrae and let the spine bend.`,
    injuries: low ? [...DISC_INJ, label === 'L4-L5' || label === 'L5-S1' ? 'This is one of the two discs that herniate most often, causing sciatica down the leg' : 'Herniation here can cause pain in the thigh or groin'] : neck ? [...DISC_INJ, 'A herniated neck disc can cause pain, tingling or weakness down the arm'] : DISC_INJ };
}

Object.assign(STRUCTURES, {
  // ---------- ligaments, spinal cord and nerves (modelled) ----------
  anterior_longitudinal_ligament: { short: 'anterior longitudinal ligament', name: 'Anterior longitudinal ligament', group: 'Ligament', layer: 2, kind: 'ligament', joint: 'spine', simplified: true, what: 'A long strong band down the front of the vertebral bodies and discs, from the skull to the sacrum. It stops the spine bending too far backward.', injuries: ['Torn in severe whiplash (the neck is thrown backward)', 'Can turn to bone in DISH (diffuse idiopathic skeletal hyperostosis)'] },
  posterior_longitudinal_ligament: { short: 'posterior longitudinal ligament', name: 'Posterior longitudinal ligament', group: 'Ligament', layer: 2, kind: 'ligament', joint: 'spine', simplified: true, what: 'A narrower band down the back of the vertebral bodies, inside the spinal canal in front of the spinal cord. It helps keep discs from bulging backward.', injuries: ['Discs usually herniate just to one side of it, toward a nerve root', 'Can thicken and turn to bone (OPLL), narrowing the canal in the neck'] },
  sacroiliac_ligaments: { short: 'sacroiliac ligaments', name: 'Sacroiliac ligaments', group: 'Ligament', layer: 2, kind: 'ligament', joint: 'sacroiliac joint', simplified: true, what: 'Very strong ligaments across the back of the joints between the sacrum and the hip bones. They lock the sacrum in place.', injuries: ['Sacroiliac joint pain in pregnancy and after falls on the bottom', 'Torn in severe pelvic fractures'] },
  spinal_cord: { name: 'Spinal cord and cauda equina', group: 'Nerve', layer: 2, kind: 'nerve', simplified: true, what: 'The spinal cord runs from the brain down the canal behind the vertebral bodies and ends at about L1 to L2. Below that the nerve roots continue down as a bundle (the cauda equina).', injuries: ['Spinal cord injury from fractures and dislocations of the spine: weakness or paralysis below the level', 'Spinal stenosis: narrowing of the canal with age', 'Cauda equina syndrome: a large disc herniation presses on the bundle (an emergency: numb saddle area, bladder problems)'] },
  nerve_roots: { name: 'Spinal nerve roots', group: 'Nerve', layer: 2, kind: 'nerve', simplified: true, what: 'A pair of nerves leaves the spinal canal at every level through the gaps between the vertebrae (foramina), just behind the discs. Neck roots go to the arms, low back roots to the legs.', injuries: ['Pinched nerve (radiculopathy) from a herniated disc or bone spurs', 'Sciatica: an irritated L4, L5 or S1 root causes pain down the back of the leg'] },

  // ---------- muscles (BodyParts3D, both sides) ----------
  erector_spinae: muscle('Erector spinae', 'Long muscles in columns either side of the spine (iliocostalis, longissimus, spinalis). They straighten the back and hold it upright.', ['Low back strain from lifting and twisting', 'Spasm after injuries to the spine']),
  deep_back_muscles: muscle('Deep back muscles (semispinalis, rotators and small spinal muscles)', 'Short muscles between neighbouring vertebrae that fine-tune and steady each level of the spine.', ['Weak or poorly controlled in long-standing back pain']),
  neck_back_muscles: muscle('Muscles at the back of the neck (splenius and suboccipitals)', 'Hold up and turn the head, including the small muscles just under the skull.', ['Neck strain and whiplash', 'A common source of tension headaches']),
  sternocleidomastoid: muscle('Sternocleidomastoid', 'The strap muscle on each side of the neck from behind the ear to the collarbone and breastbone. It turns and bends the head.', ['Wry neck (torticollis) in babies and adults']),
  scalenes: muscle('Scalene muscles', 'Neck muscles from the neck vertebrae to the first two ribs. They bend the neck and lift the ribs. The nerves to the arm pass between them.', ['Thoracic outlet syndrome: tingling in the arm when the nerves are pinched here']),
  prevertebral_muscles: muscle('Longus colli and longus capitis', 'Deep muscles on the front of the neck vertebrae that bend the neck forward.', ['Strained in whiplash']),
  trapezius: muscle('Trapezius', 'The large flat muscle over the upper back and the back of the neck, to both shoulders.', ['Neck and shoulder tension and strain']),
  rhomboids: muscle('Rhomboids', 'Muscles between the spine and the shoulder blades.', ['Strain between the shoulder blades']),
  serratus_posterior: muscle('Serratus posterior muscles', 'Thin muscles over the upper and lower ribs at the back that help breathing.', []),
  psoas: muscle('Psoas major', 'A long muscle from the sides of the lumbar vertebrae down to the thigh bone. It bends the hip and steadies the low back.', ['Abscesses and bleeding can track along it', 'Tight psoas in people who sit a lot']),
  iliacus: muscle('Iliacus', 'Lines the inside of the wing of the hip bone and joins the psoas to bend the hip.', []),
  piriformis: muscle('Piriformis', 'From the front of the sacrum to the top of the thigh bone. The sciatic nerve passes just below it.', ['Piriformis syndrome: buttock pain and sciatica-like symptoms']),
  pelvic_floor: muscle('Pelvic floor muscles', 'A sling of muscles (levator ani and coccygeus) across the bottom of the pelvis that supports the bladder, bowel and womb.', ['Weakened by childbirth and age, causing leaking or prolapse']),
  external_oblique: muscle('External oblique', 'The outer layer of the side of the belly wall. It bends and twists the trunk.', ['Side strain in throwing and racquet sports']),
  intercostals: muscle('Intercostal muscles', 'Thin muscles between the ribs that move the ribs when breathing.', ['Intercostal strain from coughing or twisting, painful on breathing']),
  transversus_thoracis: muscle('Transversus thoracis', 'A thin muscle on the inside of the front of the chest wall.', []),

  // ---------- blood vessels (BodyParts3D) ----------
  aorta: { name: 'Aorta and iliac arteries', group: 'Blood vessel', layer: 2, kind: 'artery', what: 'The main artery from the heart. It runs down in front of the spine and splits at about L4 into the two common iliac arteries to the legs.', injuries: ['Aortic aneurysm: a weak, widened aorta, often found on scans of the low back', 'Can be injured in severe deceleration accidents'] },
  vertebral_arteries: { name: 'Vertebral arteries', group: 'Blood vessel', layer: 2, kind: 'artery', what: 'Two arteries that run up through holes in the neck vertebrae to supply the back of the brain.', injuries: ['Can tear (dissection) in neck injuries or, rarely, with neck manipulation'] },
  segmental_arteries: { name: 'Intercostal and lumbar arteries', group: 'Blood vessel', layer: 2, kind: 'artery', what: 'Branches of the aorta that run round under each rib and each lumbar vertebra and supply the spine and the spinal cord.', injuries: ['Bleeding with rib and spine fractures'] },
  vena_cava: { name: 'Vena cava and iliac veins', group: 'Blood vessel', layer: 2, kind: 'vein', what: 'The large veins that return blood from the legs and body to the heart, beside the aorta in front of the spine.', injuries: ['Blood clots can extend up from the legs'] },
  trunk_veins: { name: 'Azygos, intercostal and lumbar veins', group: 'Blood vessel', layer: 2, kind: 'vein', what: 'Veins that drain the chest wall, back and spine.', injuries: [] },

  skin: { name: 'Skin', group: 'Skin', layer: 0, kind: 'skin', what: 'The outer covering of the neck, chest, back, belly and hips.', injuries: [] },
});

export const LAYERS = ['Skin', 'Muscle', 'Ligaments, discs, nerves, vessels', 'Cartilage', 'Bone'];
