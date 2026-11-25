// Which body part this page shows. index.html is the leg, hand.html the forearm and hand
// (<html data-limb="hand">). Everything that differs between them lives here.
import * as LEG from './structures.js';
import * as HAND from './hand-structures.js';
import * as SHOULDER from './shoulder-structures.js';

const PAGE = typeof document !== 'undefined' ? document.documentElement.dataset.limb : '';
export const LIMB = ['hand', 'shoulder'].includes(PAGE) ? PAGE : 'leg';

const CONFIGS = {
  leg: {
    set: LEG, part: 'leg', title: 'Leg Explainer', dataDir: 'anatomy', casesKey: 'leg-explainer-cases-v1',
    home: { region: 'leg', target: [-1, -1, 1], dir: [0.35, 0.1, 1], dist: 250 },
    fade: [55, 60.5, 1], // [y0, y1, direction]: the cut at the waist fades out above y0
    regions: {
      leg: { label: 'Whole leg', target: [-1, -1, 1], dir: [0.35, 0.1, 1], dist: 250 },
      hip: { label: 'Hip', target: [-2, 44, 0.5], dir: [0.25, 0.1, 1], dist: 72 },
      thigh: { label: 'Thigh', target: [-1.5, 22, 1.5], dir: [0.35, 0.1, 1], dist: 105 },
      knee: { label: 'Knee', target: [0, 0.8, 0], dir: [0.35, 0.12, 1], dist: 44 },
      calf: { label: 'Calf and shin', target: [-0.8, -20, 0], dir: [0.35, 0.1, 1], dist: 95 },
      foot: { label: 'Ankle and foot', target: [-2.5, -39.5, 4], dir: [0.6, 0.45, 1], dist: 52 },
    },
    views: { front: [0, 0.08, 1], back: [0, 0.08, -1], inside: [1, 0.08, 0], outside: [-1, 0.08, 0] },
    cartilageOf: {
      femur: ['femoral_cartilage', 'femoral_head_cartilage'], tibia: ['tibial_cartilage'], patella: ['patellar_cartilage'],
      hip_bone: ['acetabular_cartilage'], talus: ['ankle_cartilage', 'foot_cartilage'],
      calcaneus: ['foot_cartilage'], navicular: ['foot_cartilage'], cuboid: ['foot_cartilage'], cuneiforms: ['foot_cartilage'],
    },
    spread: {
      femur: [0, 3.2, 0], femoral_cartilage: [0, 3.2, 0],
      patella: [0, 2.2, 4.2], patellar_cartilage: [0, 2.2, 4.2],
      tibia: [0, -2.6, 0], tibial_cartilage: [0, -2.6, 0], fibula: [-1.6, -3.2, -0.6],
      medial_meniscus: [0.4, -0.6, 0], lateral_meniscus: [-0.4, -0.6, 0],
      acl: [-0.2, 0.6, 1.2], pcl: [0.2, 0.6, -1.2],
    },
    modelledNote: 'Cartilage, ligaments, menisci, nerves and most tendons are modelled.',
    injuryScale: 1,
    defaultJoint: 'knee', defaultTearEffect: 'the knee cannot be straightened with force',
  },
  hand: {
    set: HAND, part: 'hand', title: 'Hand Explainer', dataDir: 'hand', casesKey: 'hand-explainer-cases-v1',
    home: { region: 'arm', target: [0.5, -2, 1], dir: [0.3, 0.12, 1], dist: 92 },
    fade: [-18, -21, -1], // the cut below the elbow fades out
    regions: {
      arm: { label: 'Forearm and hand', target: [0.5, -2, 1], dir: [0.3, 0.12, 1], dist: 92 },
      hand: { label: 'Hand', target: [1.2, 6, 2.5], dir: [0.25, 0.1, 1], dist: 52 },
      wrist: { label: 'Wrist', target: [0, 0.5, 0.5], dir: [0.3, 0.15, 1], dist: 26 },
      fingers: { label: 'Fingers', target: [1, 11.5, 4.5], dir: [0.1, 0.1, 1], dist: 30 },
      thumb: { label: 'Thumb', target: [5, 4.5, 3.2], dir: [0.6, 0.2, 0.9], dist: 22 },
      back: { label: 'Back of the hand', target: [1, 6, 1.5], dir: [-0.2, 0.25, -1], dist: 48 },
    },
    // front = palm, back = back of the hand, inside = little-finger side, outside = thumb side
    views: { front: [0, 0.08, 1], back: [0, 0.08, -1], inside: [-1, 0.08, 0], outside: [1, 0.08, 0] },
    viewLabels: { front: 'Palm', back: 'Back', inside: 'Little finger side', outside: 'Thumb side' },
    cubeLabels: { front: 'Palm', back: 'Back', inside: 'Little', outside: 'Thumb' },
    cartilageOf: {
      radius: ['wrist_cartilage'], scaphoid: ['wrist_cartilage'], lunate: ['wrist_cartilage'], capitate: ['wrist_cartilage'],
      index_bones: ['finger_cartilage'], middle_bones: ['finger_cartilage'], ring_bones: ['finger_cartilage'], little_bones: ['finger_cartilage'], thumb_bones: ['finger_cartilage'],
    },
    spread: {
      radius: [0.4, -1.6, 0], ulna: [-0.4, -1.6, 0], tfcc: [-0.2, -0.6, 0],
      scaphoid: [0.5, 0, 0], lunate: [0, 0, 0], triquetrum: [-0.5, 0, 0], pisiform: [-0.6, 0, 0.5],
      trapezium: [0.7, 0.7, 0], trapezoid: [0.3, 0.8, 0], capitate: [0, 0.8, 0], hamate: [-0.4, 0.8, 0],
      metacarpal_1: [1.0, 1.4, 0], metacarpal_2: [0.4, 1.6, 0], metacarpal_3: [0, 1.6, 0], metacarpal_4: [-0.4, 1.6, 0], metacarpal_5: [-0.8, 1.5, 0],
      thumb_bones: [1.4, 2.2, 0], index_bones: [0.6, 2.6, 0], middle_bones: [0, 2.6, 0], ring_bones: [-0.6, 2.5, 0], little_bones: [-1.1, 2.3, 0],
      scapholunate_ligament: [0.25, 0, 0], thumb_ucl: [1.2, 1.8, 0],
    },
    modelledNote: 'Cartilage, wrist and finger ligaments, finger extensor tendons and nerves are modelled.',
    injuryScale: 0.5, // bone fragments and torn fibres are drawn smaller on the small hand structures
    defaultJoint: 'wrist', defaultTearEffect: 'the joint cannot be straightened with force',
    preview: 'Hand anatomy and injuries are a preview, waiting for a doctor to review them.',
    minDistance: 3, zoomPad: 5,
  },
  shoulder: {
    set: SHOULDER, part: 'shoulder', title: 'Shoulder and Elbow Explainer', dataDir: 'shoulder', casesKey: 'shoulder-explainer-cases-v1',
    home: { region: 'arm', target: [1, -15, 0], dir: [-0.35, 0.12, 1], dist: 150 },
    fade: [0, 0, 1], fadeFn: SHOULDER.fade,
    regions: {
      arm: { label: 'Shoulder and arm', target: [1, -15, 0], dir: [-0.35, 0.12, 1], dist: 150 },
      shoulder: { label: 'Shoulder', target: [3, -1.5, 0.5], dir: [-0.45, 0.25, 1], dist: 62 },
      cuff: { label: 'Rotator cuff (from behind)', target: [3, -1, -2], dir: [-0.5, 0.45, -1], dist: 60 },
      collarbone: { label: 'Collarbone and AC joint', target: [8, 3, 2.5], dir: [-0.1, 0.5, 1], dist: 55 },
      upperarm: { label: 'Upper arm', target: [-1.5, -13, 0], dir: [-0.4, 0.1, 1], dist: 80 },
      elbow: { label: 'Elbow', target: [-3.2, -26.5, 0], dir: [-0.2, 0.15, 1], dist: 38 },
      elbowback: { label: 'Back of the elbow', target: [-3.5, -26, -1.5], dir: [0.2, 0.2, -1], dist: 38 },
    },
    // front, back, inside = toward the body (+X), outside = away from it
    views: { front: [0, 0.08, 1], back: [0, 0.08, -1], inside: [1, 0.08, 0], outside: [-1, 0.08, 0] },
    viewLabels: { front: 'Front', back: 'Back', inside: 'Body side', outside: 'Outside' },
    cubeLabels: { front: 'Front', back: 'Back', inside: 'Body', outside: 'Out' },
    cartilageOf: { humerus: ['shoulder_cartilage', 'elbow_cartilage'], scapula: ['shoulder_cartilage'], radius: ['elbow_cartilage'], ulna: ['elbow_cartilage'] },
    spread: {
      clavicle: [0, 2.2, 0.8], ac_ligament: [0, 1.4, 0.4], coracoclavicular_ligaments: [0, 1.1, 0.4],
      scapula: [1.8, 0, -0.6], glenoid_labrum: [1.0, 0, -0.3], coracoacromial_ligament: [1.4, 0.4, -0.4],
      humerus: [-1.6, -0.8, 0], rotator_cuff_tendon: [-0.8, 0.2, 0], biceps_tendon_long_head: [-0.6, -0.2, 0.2],
      radius: [-0.8, -2.4, 0], ulna: [0.2, -2.4, 0], annular_ligament: [-0.6, -1.6, 0], elbow_ucl: [0.3, -1.2, 0], elbow_lcl: [-0.6, -1.2, 0],
      distal_biceps_tendon: [-0.6, -1.6, 0.3],
    },
    modelledNote: 'Cartilage, labrum, shoulder and elbow ligaments, rotator cuff and biceps tendons and nerves are modelled.',
    injuryScale: 0.8,
    defaultJoint: 'shoulder', defaultTearEffect: 'the arm is weak and painful to lift',
    preview: 'Shoulder and elbow anatomy and injuries are a preview, waiting for a doctor to review them.',
    minDistance: 4, zoomPad: 7,
  },
};
export const CFG = CONFIGS[LIMB];
export const { STRUCTURES, LAYERS } = CFG.set;
export const CARTILAGE_OF = CFG.cartilageOf;
