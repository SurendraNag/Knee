// Which body part this page shows. index.html is the leg, hand.html the forearm and hand
// (<html data-limb="hand">). Everything that differs between them lives here.
import * as LEG from './structures.js';
import * as HAND from './hand-structures.js';

export const LIMB = typeof document !== 'undefined' && document.documentElement.dataset.limb === 'hand' ? 'hand' : 'leg';

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
  },
};
export const CFG = CONFIGS[LIMB];
export const { STRUCTURES, LAYERS } = CFG.set;
export const CARTILAGE_OF = CFG.cartilageOf;
