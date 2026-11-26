// One list of the app's pages and of the common injuries on each, shared by the home page, the search box on
// every page and the "Common injuries" quick-pick in Injury mode. No three.js here, so the home page stays small.
//
// A common injury: structure id, injury type (numbers from T in injuries.js), and a "best view":
//   from  direction the camera looks from (model coordinates of that page, right side),
//   at    where on the structure the tag goes, as fractions of its bounding box [x, y, z] (default the middle);
//         the tag lands on the first surface of the structure seen from `from`,
//   xray  turn on "See through bone" for structures hidden inside a joint,
//   joint cut everything away outside this joint (as "One joint or tissue…" does), for structures hidden by other bones,
//   hide  structures hidden while this pick is shown (they come back with the next pick or Reset),
//   dist  camera distance (default: fitted to the structure).
// The doctor can still change the type, move the spot or add more after the quick-pick.

export const PAGES = [
  { limb: 'leg', page: 'leg.html', name: 'Knee and leg', short: 'Leg', blurb: 'Hip, thigh, knee, ankle and foot', thumb: 'leg' },
  { limb: 'shoulder', page: 'shoulder.html', name: 'Shoulder and elbow', short: 'Shoulder', blurb: 'Shoulder, upper arm and elbow', thumb: 'shoulder' },
  { limb: 'hand', page: 'hand.html', name: 'Hand and wrist', short: 'Hand', blurb: 'Forearm, wrist, hand and fingers', thumb: 'hand' },
  { limb: 'spine', page: 'spine.html', name: 'Spine and pelvis', short: 'Spine', blurb: 'Neck, back, ribs and pelvis', thumb: 'spine' },
  { limb: 'head', page: 'head.html', name: 'Skull and face', short: 'Skull', blurb: 'Skull, face, jaw and teeth', thumb: 'head' },
  { limb: 'body', page: 'body.html', name: 'Whole body', short: 'Whole body', blurb: 'Every bone, muscle, organ, nerve and vessel (explore only)', thumb: 'body' },
];
export const pageOf = (limb) => PAGES.find((p) => p.limb === limb);

const G1 = 1, G2 = 2, G3 = 3, SPLIT = 11, BUCKET = 12, FLAP = 13, WORN = 14, STENOSIS = 15, STRESS = 22, HAIRLINE = 23, DISPLACED = 24, ARTHRITIS = 26, SLIP = 27, SHATTERED = 25,
  STRAIN = 31, CONTUSION = 33, CRUSH = 34, COMPART = 35, CUT = 41, OPENFX = 42, NBRUISE = 51, CLOT = 54;

export const COMMON = [
  // ---- knee and leg (model: right leg, +X toward the inside of the leg, +Z front) ----
  { key: 'acl-tear', limb: 'leg', label: 'ACL tear', id: 'acl', type: G3, from: [-0.75, 0.2, 0.75], xray: true, dist: 30, hide: ['patella', 'patellar_cartilage', 'medial_meniscus', 'lateral_meniscus'], aka: ['torn acl', 'acl rupture', 'cruciate'] },
  { key: 'meniscus-tear', limb: 'leg', label: 'Meniscus tear (inner)', id: 'medial_meniscus', type: FLAP, from: [0.55, 0.75, 0.6], at: [0.6, 0.5, 0.25], xray: true, dist: 26, aka: ['torn meniscus', 'cartilage tear', 'medial meniscus'] },
  { key: 'bucket-handle-tear', limb: 'leg', label: 'Bucket-handle meniscus tear', id: 'medial_meniscus', type: BUCKET, from: [0.55, 0.75, 0.6], at: [0.6, 0.5, 0.25], xray: true, dist: 26, aka: ['locked knee'] },
  { key: 'mcl-sprain', limb: 'leg', label: 'MCL sprain', id: 'mcl', type: G2, from: [1, 0.1, 0.2], dist: 30, aka: ['inner knee ligament', 'medial collateral'] },
  { key: 'lcl-sprain', limb: 'leg', label: 'LCL sprain', id: 'lcl', type: G2, from: [-1, 0.1, 0.2], dist: 30, aka: ['outer knee ligament', 'lateral collateral'] },
  { key: 'pcl-tear', limb: 'leg', label: 'PCL tear', id: 'pcl', type: G3, from: [0.25, 0.1, -1], xray: true, dist: 26, aka: ['posterior cruciate'] },
  { key: 'patellar-tendon-rupture', limb: 'leg', label: 'Patellar tendon rupture', id: 'patellar_tendon', type: G3, from: [0.35, 0.1, 1], dist: 30, aka: ['kneecap tendon'] },
  { key: 'kneecap-fracture', limb: 'leg', label: 'Kneecap fracture', id: 'patella', type: DISPLACED, from: [0.2, 0.1, 1], dist: 28, aka: ['broken kneecap', 'patella fracture'] },
  { key: 'ankle-sprain', limb: 'leg', label: 'Ankle sprain (ATFL)', id: 'atfl', type: G2, from: [-1, 0.25, 0.55], dist: 26, aka: ['sprained ankle', 'rolled ankle', 'twisted ankle'] },
  { key: 'achilles-rupture', limb: 'leg', label: 'Achilles tendon rupture', id: 'achilles_tendon', type: G3, from: [-0.7, 0.1, -1], at: [0.5, 0.35, 0.5], dist: 34, aka: ['torn achilles', 'heel tendon'] },
  { key: 'hip-labral-tear', limb: 'leg', label: 'Hip labral tear', id: 'labrum', type: SPLIT, from: [0.1, 0.15, 1], at: [0.5, 0.75, 0.9], xray: true, dist: 30, aka: ['hip labrum', 'groin pain'] },
  { key: 'hip-fracture', limb: 'leg', label: 'Hip fracture (femoral neck)', id: 'femur', type: DISPLACED, from: [0.35, 0.15, 1], at: [0.78, 0.915, 0.5], dist: 34, hide: ['hip_bone', 'hip_capsule', 'iliofemoral_ligament', 'pubofemoral_ligament', 'ischiofemoral_ligament', 'labrum', 'acetabular_cartilage', 'ligamentum_teres'], aka: ['broken hip', 'neck of femur'] },
  { key: 'shin-fracture', limb: 'leg', label: 'Shin bone fracture', id: 'tibia', type: DISPLACED, from: [0.3, 0.1, 1], at: [0.5, 0.45, 0.5], dist: 50, aka: ['broken leg', 'tibia fracture'] },
  { key: 'metatarsal-stress-fracture', limb: 'leg', label: 'Stress fracture of the foot', id: 'metatarsal_2', type: STRESS, from: [0.1, 0.7, 0.7], dist: 26, aka: ['march fracture', 'second metatarsal'] },
  { key: 'knee-arthritis', limb: 'leg', label: 'Knee arthritis (inner side)', id: 'femur', type: ARTHRITIS, from: [0.7, 0.1, 0.8], at: [0.78, 0.03, 0.55], dist: 30, also: [{ id: 'tibia', type: ARTHRITIS, from: [0.7, 0.1, 0.8], at: [0.75, 0.97, 0.55] }], aka: ['osteoarthritis', 'knee oa', 'wear and tear', 'worn knee'] },
  { key: 'hip-arthritis', limb: 'leg', label: 'Hip arthritis', id: 'femur', type: ARTHRITIS, from: [0.35, 0.15, 1], at: [0.9, 0.985, 0.5], dist: 32, hide: ['hip_bone', 'hip_capsule', 'iliofemoral_ligament', 'pubofemoral_ligament', 'ischiofemoral_ligament', 'labrum', 'acetabular_cartilage', 'ligamentum_teres'], aka: ['hip osteoarthritis', 'worn hip'] },
  // soft tissue (v0.23, for doctor review)
  { key: 'hamstring-strain', limb: 'leg', label: 'Hamstring strain', id: 'biceps_femoris', type: STRAIN, from: [-0.45, 0.1, -1], at: [0.5, 0.55, 0.15], dist: 48, aka: ['pulled hamstring', 'hamstring tear', 'torn hamstring'] },
  { key: 'calf-strain', limb: 'leg', label: 'Calf muscle strain (tennis leg)', id: 'gastrocnemius_medial', type: STRAIN, from: [0.55, 0.1, -1], at: [0.5, 0.45, 0.15], dist: 40, aka: ['pulled calf', 'calf tear', 'tennis leg'] },
  { key: 'thigh-bruise', limb: 'leg', label: 'Bruised thigh muscle (dead leg)', id: 'vastus_lateralis', type: CONTUSION, from: [-1, 0.1, 0.45], at: [0.2, 0.45, 0.6], dist: 48, aka: ['dead leg', 'charley horse', 'cork thigh', 'muscle bruise'] },
  { key: 'compartment-syndrome', limb: 'leg', label: 'Compartment syndrome (front of the shin)', id: 'tibialis_anterior', type: COMPART, from: [-0.35, 0.1, 1], at: [0.5, 0.6, 0.9], dist: 52, aka: ['compartment syndrome', 'fasciotomy', 'swollen tight leg'] },
  { key: 'crushed-lower-leg', limb: 'leg', label: 'Crushed lower leg', id: 'tibialis_anterior', type: CRUSH, from: [-0.35, 0.1, 1], at: [0.5, 0.5, 0.9], dist: 55, also: [{ id: 'tibia', type: SHATTERED, from: [0.6, 0.1, 1], at: [0.6, 0.45, 0.6] }, { id: 'fibula', type: DISPLACED, from: [-1, 0.1, 0.3], at: [0.5, 0.45, 0.5] }], aka: ['crush injury', 'leg crush', 'crushed leg', 'run over'] },
  { key: 'open-fracture-shin', limb: 'leg', label: 'Open fracture of the shin', id: 'skin', type: OPENFX, from: [0.35, 0.1, 1], at: [0.62, 0.21, 0.95], dist: 55, also: [{ id: 'tibia', type: DISPLACED, from: [0.35, 0.1, 1], at: [0.5, 0.45, 0.5] }], aka: ['open fracture', 'compound fracture', 'bone through skin'] },
  { key: 'dvt', limb: 'leg', label: 'Blood clot in a leg vein (DVT)', id: 'popliteal_vein', type: CLOT, from: [0.1, 0.1, -1], dist: 36, aka: ['dvt', 'deep vein thrombosis', 'blood clot', 'clot'] },
  { key: 'fibular-nerve-injury', limb: 'leg', label: 'Fibular nerve injury (foot drop)', id: 'common_fibular_nerve', type: NBRUISE, from: [-1, 0.1, -0.3], at: [0.5, 0.8, 0.5], dist: 34, aka: ['foot drop', 'peroneal nerve', 'nerve injury'] },
  { key: 'femoral-shaft-fracture', limb: 'leg', label: 'Thigh bone fracture (femoral shaft)', id: 'femur', type: DISPLACED, from: [0.25, 0.1, 1], at: [0.5, 0.5, 0.5], dist: 70, aka: ['broken thigh', 'broken femur', 'femur fracture', 'thighbone'] },
  { key: 'ankle-fracture', limb: 'leg', label: 'Ankle fracture (outer ankle bone)', id: 'fibula', type: DISPLACED, from: [-1, 0.15, 0.35], at: [0.5, 0.06, 0.5], dist: 32, aka: ['broken ankle', 'lateral malleolus', 'fibula fracture', 'weber'] },

  // ---- shoulder and elbow (model: right arm, +X toward the body, +Z front) ----
  { key: 'rotator-cuff-tear', limb: 'shoulder', label: 'Rotator cuff tear', id: 'rotator_cuff_tendon', type: G3, from: [-0.55, 0.75, 0.35], dist: 34, aka: ['torn rotator cuff', 'supraspinatus tear', 'cuff'] },
  { key: 'rotator-cuff-partial', limb: 'shoulder', label: 'Partial rotator cuff tear', id: 'rotator_cuff_tendon', type: G2, from: [-0.55, 0.75, 0.35], dist: 34, aka: ['supraspinatus'] },
  { key: 'labral-tear', limb: 'shoulder', label: 'Shoulder labral tear (Bankart)', id: 'glenoid_labrum', type: SPLIT, from: [-1, 0.15, 0.35], at: [0.5, 0.25, 0.7], xray: true, dist: 30, aka: ['dislocated shoulder', 'labrum', 'slap'] },
  { key: 'ac-separation', limb: 'shoulder', label: 'AC joint separation', id: 'ac_ligament', type: G3, from: [-0.15, 0.85, 0.5], dist: 28, aka: ['separated shoulder', 'ac sprain'] },
  { key: 'biceps-long-head-rupture', limb: 'shoulder', label: 'Biceps tendon rupture (shoulder)', id: 'biceps_tendon_long_head', type: G3, from: [-0.3, 0.1, 1], at: [0.5, 0.35, 0.5], dist: 36, aka: ['popeye'] },
  { key: 'distal-biceps-rupture', limb: 'shoulder', label: 'Biceps tendon rupture (elbow)', id: 'distal_biceps_tendon', type: G3, from: [-0.2, 0.1, 1], dist: 28, aka: ['distal biceps'] },
  { key: 'tennis-elbow', limb: 'shoulder', label: 'Tennis elbow', id: 'common_extensor_tendon', type: G2, from: [-1, 0.1, 0.3], dist: 28, aka: ['lateral epicondylitis'] },
  { key: 'golfers-elbow', limb: 'shoulder', label: "Golfer's elbow", id: 'common_flexor_tendon', type: G2, from: [1, 0.1, 0.4], dist: 28, aka: ['medial epicondylitis'] },
  { key: 'elbow-ucl-tear', limb: 'shoulder', label: 'Elbow UCL tear', id: 'elbow_ucl', type: G3, from: [1, 0.1, 0.4], dist: 28, aka: ['tommy john', 'thrower'] },
  { key: 'collarbone-fracture', limb: 'shoulder', label: 'Collarbone fracture', id: 'clavicle', type: DISPLACED, from: [-0.1, 0.45, 1], at: [0.5, 0.5, 0.6], dist: 40, aka: ['broken collarbone', 'clavicle fracture'] },
  { key: 'humerus-neck-fracture', limb: 'shoulder', label: 'Upper arm fracture (humerus neck)', id: 'humerus', type: DISPLACED, from: [-0.45, 0.2, 1], at: [0.5, 0.9, 0.5], dist: 40, aka: ['broken shoulder', 'proximal humerus'] },

  // ---- hand and wrist (model: right forearm, palm toward +Z, thumb toward +X) ----
  { key: 'scaphoid-fracture', limb: 'hand', label: 'Scaphoid fracture', id: 'scaphoid', type: HAIRLINE, from: [0.45, 0.15, 1], dist: 16, aka: ['broken wrist', 'snuffbox'] },
  { key: 'distal-radius-fracture', limb: 'hand', label: 'Wrist fracture (distal radius)', id: 'radius', type: DISPLACED, from: [0.35, 0.1, 1], at: [0.5, 0.88, 0.5], dist: 24, aka: ['broken wrist', 'colles fracture'] },
  { key: 'boxers-fracture', limb: 'hand', label: "Boxer's fracture", id: 'metacarpal_5', type: DISPLACED, from: [-0.3, 0.1, -1], at: [0.5, 0.8, 0.5], dist: 20, aka: ['fifth metacarpal', 'broken hand'] },
  { key: 'skiers-thumb', limb: 'hand', label: "Skier's thumb (thumb UCL tear)", id: 'thumb_ucl', type: G3, from: [0.4, 0.1, 1], dist: 14, aka: ["gamekeeper's thumb", 'thumb sprain'] },
  { key: 'thumb-base-fracture', limb: 'hand', label: 'Thumb fracture at the base (Bennett)', id: 'metacarpal_1', type: DISPLACED, from: [0.6, 0.1, 1], at: [0.5, 0.12, 0.5], dist: 16, aka: ['broken thumb', 'bennett fracture', 'thumb metacarpal'] },
  { key: 'thumb-fracture', limb: 'hand', label: 'Thumb bone fracture (base bone)', id: 'thumb_proximal', type: HAIRLINE, from: [0.6, 0.1, 1], dist: 16, aka: ['broken thumb', 'thumb phalanx', 'fractured thumb'] },
  { key: 'fingertip-crush', limb: 'hand', label: 'Crushed fingertip', id: 'index_distal', type: SHATTERED, from: [0.1, 0.1, -1], dist: 12, aka: ['crushed finger', 'finger caught in door', 'fingertip injury'] },
  { key: 'tfcc-tear', limb: 'hand', label: 'TFCC tear', id: 'tfcc', type: SPLIT, from: [-1, 0.15, 0.35], dist: 18, aka: ['ulnar wrist pain', 'triangular fibrocartilage'] },
  { key: 'scapholunate-tear', limb: 'hand', label: 'Scapholunate ligament tear', id: 'scapholunate_ligament', type: G3, from: [0, 0.15, -1], dist: 16, aka: ['wrist ligament'] },

  // ---- spine and pelvis (+X toward the body's left, +Z front) ----
  { key: 'herniated-disc-l4-l5', limb: 'spine', label: 'Herniated disc L4-L5', id: 'disc_l4_l5', type: FLAP, joint: 'lowback', from: [1, 0.15, -0.45], at: [0.5, 0.5, 0.05], dist: 30, aka: ['slipped disc', 'disc prolapse', 'sciatica', 'bulging disc'] },
  { key: 'herniated-disc-l5-s1', limb: 'spine', label: 'Herniated disc L5-S1', id: 'disc_l5_s1', type: FLAP, joint: 'lowback', hide: ['right_hip_bone', 'left_hip_bone'], from: [1, 0.12, -0.35], at: [0.5, 0.5, 0.05], dist: 30, aka: ['slipped disc', 'sciatica'] },
  { key: 'neck-disc-herniation', limb: 'spine', label: 'Neck disc herniation C5-C6', id: 'disc_c5_c6', type: FLAP, joint: 'neck', from: [1, 0.15, -0.45], at: [0.5, 0.5, 0.05], dist: 24, aka: ['slipped disc neck', 'cervical disc'] },
  { key: 'annular-tear', limb: 'spine', label: 'Annular tear (low back)', id: 'disc_l4_l5', type: SPLIT, joint: 'lowback', from: [1, 0.15, -0.45], at: [0.5, 0.5, 0.05], dist: 30, aka: ['disc tear'] },
  { key: 'compression-fracture', limb: 'spine', label: 'Compression fracture L1', id: 'l1', type: DISPLACED, joint: 'lowback', from: [1, 0.12, 0.35], at: [0.5, 0.5, 0.9], dist: 34, aka: ['vertebral fracture', 'osteoporosis'] },
  { key: 'spondylolysis', limb: 'spine', label: 'Spondylolysis L5 (stress fracture)', id: 'l5', type: STRESS, from: [0.6, 0.2, -1], at: [0.5, 0.5, 0.2], dist: 30, aka: ['pars fracture'] },
  // degenerative low back (v0.22, for doctor review)
  { key: 'worn-disc', limb: 'spine', label: 'Worn disc (degeneration) L4-L5', id: 'disc_l4_l5', type: WORN, joint: 'lowback', from: [1, 0.15, 0.2], dist: 30, aka: ['degenerative disc', 'disc degeneration', 'wear and tear', 'low back pain'] },
  { key: 'spinal-stenosis', limb: 'spine', label: 'Spinal stenosis L4-L5', id: 'disc_l4_l5', type: STENOSIS, joint: 'lowback', xray: true, from: [0.55, 0.75, -0.75], at: [0.5, 0.5, 0.05], dist: 30, also: [{ id: 'l4', type: ARTHRITIS, from: [0.5, 0.15, -1], at: [0.7, 0.2, 0.1] }], aka: ['stenosis', 'narrowing', 'claudication', 'narrow canal'] },
  { key: 'spondylolisthesis', limb: 'spine', label: 'Slipped vertebra L4 on L5 (spondylolisthesis)', id: 'l4', type: SLIP, from: [1, 0.05, 0.1], dist: 40, aka: ['spondylolisthesis', 'slipped vertebra', 'vertebra slipped'] },
  { key: 'facet-arthritis', limb: 'spine', label: 'Facet joint arthritis L4-L5', id: 'l4', type: ARTHRITIS, from: [0.6, 0.15, -1], at: [0.7, 0.2, 0.1], dist: 26, aka: ['facet arthritis', 'spondylosis', 'arthritis of the spine', 'back arthritis'] },
  { key: 'low-back-strain', limb: 'spine', label: 'Low back muscle strain', id: 'erector_spinae', type: STRAIN, from: [0.35, 0.1, -1], at: [0.35, 0.18, 0.1], dist: 50, aka: ['back strain', 'pulled back muscle', 'lumbago', 'muscle spasm', 'low back pain'] },
  { key: 'rib-fracture', limb: 'spine', label: 'Rib fracture', id: 'ribs', type: DISPLACED, from: [-0.7, 0.1, 0.7], at: [0.12, 0.5, 0.7], dist: 50, aka: ['broken rib', 'cracked rib'] },
  { key: 'pelvic-fracture', limb: 'spine', label: 'Pelvic fracture', id: 'right_hip_bone', type: DISPLACED, from: [-0.2, 0.25, 1], at: [0.65, 0.2, 0.8], dist: 50, aka: ['broken pelvis', 'pubic ramus'] },
  { key: 'si-joint-sprain', limb: 'spine', label: 'Sacroiliac joint sprain', id: 'sacroiliac_ligaments', type: G2, from: [0.3, 0.2, -1], dist: 34, aka: ['si joint'] },
  { key: 'whiplash', limb: 'spine', label: 'Whiplash (front neck ligament tear)', id: 'anterior_longitudinal_ligament', type: G2, from: [1, 0.1, 0.6], at: [0.5, 0.82, 0.5], dist: 30, aka: ['neck sprain'] },

  // ---- skull and face (+X toward the left, +Z front) ----
  { key: 'broken-nose', limb: 'head', label: 'Broken nose', id: 'nasal_bones', type: DISPLACED, from: [0.35, 0.1, 1], dist: 18, aka: ['nasal fracture'] },
  { key: 'cheekbone-fracture', limb: 'head', label: 'Cheekbone fracture', id: 'right_zygomatic_bone', type: DISPLACED, from: [-0.7, 0.05, 0.8], dist: 22, aka: ['zygoma', 'zygomatic fracture'] },
  { key: 'jaw-fracture', limb: 'head', label: 'Jaw fracture', id: 'mandible', type: DISPLACED, from: [-0.5, -0.1, 1], at: [0.3, 0.3, 0.75], dist: 26, aka: ['broken jaw', 'mandible fracture'] },
  { key: 'skull-fracture', limb: 'head', label: 'Skull fracture (temple)', id: 'right_temporal_bone', type: HAIRLINE, from: [-1, 0.2, 0.2], at: [0.5, 0.75, 0.5], dist: 30, aka: ['head injury'] },
  { key: 'broken-tooth', limb: 'head', label: 'Broken front tooth', id: 'upper_teeth', type: DISPLACED, from: [0, 0, 1], at: [0.5, 0.5, 0.98], dist: 14, aka: ['chipped tooth'] },
  { key: 'tmj-disc-displaced', limb: 'head', label: 'Jaw joint disc slipped (TMJ)', id: 'right_tmj_disc', type: FLAP, from: [-1, 0.05, 0.25], joint: 'right_tmj', hide: ['brain'], dist: 14, aka: ['jaw clicking', 'tmj', 'tmd'] },
];

// Extra words people type for a structure (lay words, abbreviations), by structure id on any page.
export const SYNONYMS = {
  femur: 'thighbone', tibia: 'shinbone', patella: 'knee cap', acl: 'cruciate', pcl: 'cruciate', mcl: 'medial collateral', lcl: 'lateral collateral',
  medial_meniscus: 'cartilage', lateral_meniscus: 'cartilage', achilles_tendon: 'heel cord', plantar_fascia: 'plantar fasciitis heel pain',
  atfl: 'ankle sprain', it_band: 'itb', hip_bone: 'pelvis', talus: 'ankle', calcaneus: 'heel',
  clavicle: 'collar bone', scapula: 'shoulder blade', humerus: 'arm bone', rotator_cuff_tendon: 'rotator cuff supraspinatus',
  glenoid_labrum: 'shoulder labrum', common_extensor_tendon: 'tennis elbow', common_flexor_tendon: "golfer's elbow", elbow_ucl: 'tommy john',
  scaphoid: 'wrist bone snuffbox', radius: 'wrist', tfcc: 'triangular fibrocartilage', thumb_ucl: "skier's thumb gamekeeper",
  ribs: 'rib cage', sternum: 'breast bone', sacrum: 'tailbone', spinal_cord: 'cord', nerve_roots: 'sciatica', erector_spinae: 'back muscles',
  mandible: 'jaw', maxilla: 'jaw', right_zygomatic_bone: 'cheek', left_zygomatic_bone: 'cheek', nasal_bones: 'nose',
  right_tmj_disc: 'tmj jaw joint', left_tmj_disc: 'tmj jaw joint', upper_teeth: 'tooth', lower_teeth: 'tooth',
};

// keep patient and embed mode when moving between pages
export function keepParams(extra = {}) {
  const qs = new URLSearchParams(location.search), keep = new URLSearchParams();
  for (const k of ['patient', 'embed']) if (qs.get(k)) keep.set(k, qs.get(k));
  for (const [k, v] of Object.entries(extra)) if (v != null) keep.set(k, v);
  const q = keep.toString();
  return q ? `?${q}` : '';
}
export const commonUrl = (c) => `./${pageOf(c.limb).page}${keepParams({ pick: c.key })}`;
