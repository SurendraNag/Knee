// Structures of the right forearm and hand (the left hand is shown as its mirror image).
// Frame: centimetres, origin at the wrist (centre of the lunate), fingers point up (+Y), palm faces front (+Z),
// thumb side +X, little-finger side -X. Layers as in the leg: 0 skin, 1 muscle, 2 ligaments/tendons/vessels/nerves,
// 3 cartilage, 4 bone. `simplified` marks modelled shapes (BodyParts3D has no hand ligaments or arm nerves).
const bone = (name, what, injuries, short) => ({ short: short || name.toLowerCase(), name, group: 'Bone', layer: 4, kind: 'bone', joint: 'wrist', what, injuries });
const muscle = (name, what, injuries = []) => ({ name, group: 'Muscle', layer: 1, kind: 'muscle', what, injuries });

export const STRUCTURES = {
  // ---------- bones ----------
  radius: bone('Radius', 'The forearm bone on the thumb side. Its wide lower end carries most of the wrist joint.', ['Distal radius (wrist) fracture, often from a fall on an outstretched hand: the most common fracture in adults', 'Colles fracture: the broken end tilts toward the back of the hand'], 'radius'),
  ulna: bone('Ulna', 'The forearm bone on the little-finger side. Its small lower end (the ulnar head) sits beside the wrist with a cartilage pad (TFCC) on top.', ['Ulnar styloid fractures often come with wrist fractures', 'Forearm fractures of both bones'], 'ulna'),
  scaphoid: bone('Scaphoid', 'A boat-shaped wrist bone on the thumb side that bridges the two rows of wrist bones.', ['The most often broken wrist bone, from a fall on an outstretched hand', 'Its blood supply is poor, so breaks can heal slowly or not at all'], 'scaphoid'),
  lunate: bone('Lunate', 'A half-moon shaped wrist bone in the middle of the first row, sitting in a hollow of the radius.', ['Can dislocate in severe wrist injuries', 'Kienböck disease: the bone loses its blood supply and slowly collapses'], 'lunate'),
  triquetrum: bone('Triquetrum', 'A pyramid-shaped wrist bone on the little-finger side of the first row.', ['Small chip fractures on its back after falls'], 'triquetrum'),
  pisiform: bone('Pisiform', 'A small pea-shaped bone you can feel at the base of the palm on the little-finger side. It sits inside a tendon.', ['Breaks from a direct blow to the heel of the hand'], 'pisiform'),
  trapezium: bone('Trapezium', 'The wrist bone at the base of the thumb. Its saddle-shaped joint lets the thumb swing across the palm.', ['Arthritis at the base of the thumb is very common'], 'trapezium'),
  trapezoid: bone('Trapezoid', 'A small wedge-shaped wrist bone at the base of the index finger.', ['Rarely injured on its own'], 'trapezoid'),
  capitate: bone('Capitate', 'The largest wrist bone, in the centre of the wrist at the base of the middle finger.', ['Breaks usually come with scaphoid fractures in strong falls'], 'capitate'),
  hamate: bone('Hamate', 'A wrist bone on the little-finger side with a hook you can feel in the palm.', ['Hook of hamate fractures in golf, tennis and baseball players'], 'hamate'),
  metacarpal_1: bone('First metacarpal (thumb)', 'The long bone of the thumb inside the hand.', ['Bennett fracture at its base, into the thumb joint'], 'first metacarpal'),
  metacarpal_2: bone('Second metacarpal (index)', 'The long bone inside the hand that leads to the index finger.', ['Breaks from falls or punches'], 'second metacarpal'),
  metacarpal_3: bone('Third metacarpal (middle)', 'The long bone inside the hand that leads to the middle finger.', ['Breaks from falls or crush injuries'], 'third metacarpal'),
  metacarpal_4: bone('Fourth metacarpal (ring)', 'The long bone inside the hand that leads to the ring finger.', ['Breaks from punching a hard object'], 'fourth metacarpal'),
  metacarpal_5: bone('Fifth metacarpal (little)', 'The long bone inside the hand that leads to the little finger.', ["Boxer's fracture: the neck of this bone breaks when punching a hard object"], 'fifth metacarpal'),
  thumb_bones: bone('Thumb bones (phalanges)', 'The two short bones of the thumb.', ['Breaks from falls and ball sports'], 'thumb bones'),
  index_bones: bone('Index finger bones (phalanges)', 'The three short bones of the index finger.', ['Finger fractures from falls, sports and crush injuries'], 'index finger bones'),
  middle_bones: bone('Middle finger bones (phalanges)', 'The three short bones of the middle finger.', ['Finger fractures from falls, sports and crush injuries'], 'middle finger bones'),
  ring_bones: bone('Ring finger bones (phalanges)', 'The three short bones of the ring finger.', ['Finger fractures from falls, sports and crush injuries'], 'ring finger bones'),
  little_bones: bone('Little finger bones (phalanges)', 'The three short bones of the little finger.', ['Finger fractures from falls, sports and crush injuries'], 'little finger bones'),

  // ---------- cartilage (modelled) ----------
  wrist_cartilage: { name: 'Cartilage of the wrist joints', group: 'Cartilage', layer: 3, kind: 'cartilage', what: 'A thin smooth coating where the radius meets the first row of wrist bones and where the wrist bones meet each other and the hand bones.', injuries: ['Wrist arthritis after old fractures or ligament tears', 'Thumb-base arthritis at the trapezium'] },
  finger_cartilage: { name: 'Cartilage of the finger joints', group: 'Cartilage', layer: 3, kind: 'cartilage', what: 'A thin smooth coating on the knuckle joints and the joints of the fingers and thumb.', injuries: ['Osteoarthritis of the finger joints (bony lumps at the finger ends)', 'Rheumatoid arthritis often starts at the knuckles'] },

  // ---------- ligaments, tendons, nerves (modelled) ----------
  tfcc: { short: 'TFCC', name: 'Triangular fibrocartilage complex (TFCC)', group: 'Ligament', layer: 2, kind: 'meniscus', injury: 'disc', joint: 'wrist', simplified: true, flapToward: [-1.2, 1.2, 0.2], what: 'A triangular pad of cartilage and ligament on top of the end of the ulna. It cushions the little-finger side of the wrist and holds the two forearm bones together.', injuries: ['Tears from falls on an outstretched hand or twisting', 'Wear with age, causing pain on the little-finger side of the wrist'] },
  scapholunate_ligament: { short: 'scapholunate ligament', name: 'Scapholunate ligament', group: 'Ligament', layer: 2, kind: 'ligament', joint: 'wrist', simplified: true, what: 'A short, strong ligament that ties the scaphoid to the lunate so the two bones move together.', injuries: ['The most common wrist ligament tear, from a fall on an outstretched hand', 'If it stays torn, a gap opens between the bones and arthritis can follow'] },
  thumb_ucl: { short: 'thumb UCL', name: 'Ulnar collateral ligament of the thumb (UCL)', group: 'Ligament', layer: 2, kind: 'ligament', joint: 'thumb', simplified: true, what: 'A ligament on the index-finger side of the thumb knuckle. It keeps the thumb steady when you pinch or grip.', injuries: ["Skier's thumb: torn when the thumb is bent back and out, for example in a fall holding a ski pole", "Gamekeeper's thumb: slow stretching over years"] },
  finger_collateral_ligaments: { short: 'collateral ligament', name: 'Collateral ligaments of the finger joints', group: 'Ligament', layer: 2, kind: 'ligament', joint: 'finger', simplified: true, what: 'Two small ligaments on the sides of each middle finger joint that stop the finger bending sideways.', injuries: ['Sprained ("jammed") finger from ball sports', 'A complete tear lets the finger joint wobble sideways'] },
  extensor_tendons: { short: 'extensor tendon', name: 'Extensor tendons over the finger joints', group: 'Tendon', layer: 2, kind: 'tendon', simplified: true, tearEffect: 'the end of the finger droops and cannot be straightened on its own (mallet finger)', what: 'Thin flat tendons on the back of each finger. Their last part straightens the fingertip.', injuries: ['Mallet finger: the tendon tears where it joins the last finger bone, often when a ball hits the fingertip', 'Boutonnière deformity when the middle part is torn'] },
  flexor_retinaculum: { name: 'Flexor retinaculum (roof of the carpal tunnel)', group: 'Ligament', layer: 2, kind: 'ligament', injury: 'none', what: 'A strong band across the front of the wrist bones. It forms the roof of the carpal tunnel, through which the median nerve and the finger flexor tendons pass.', injuries: ['Carpal tunnel syndrome: pressure on the median nerve in the tunnel causes tingling in the thumb and first fingers', 'Cut in carpal tunnel release surgery'] },
  interosseous_membrane: { name: 'Interosseous membrane of the forearm', group: 'Ligament', layer: 2, kind: 'capsule', opacity: 0.55, what: 'A thin sheet joining the radius and the ulna along their length. It holds the bones together and passes force from the wrist up the forearm.', injuries: ['Torn in severe forearm injuries (Essex-Lopresti injury)'] },
  median_nerve: { name: 'Median nerve', group: 'Nerve', layer: 2, kind: 'nerve', simplified: true, what: 'Runs down the middle of the forearm and through the carpal tunnel into the hand. It gives feeling to the thumb, index, middle and half the ring finger, and works the thumb muscles.', injuries: ['Carpal tunnel syndrome: tingling and numbness at night, weak thumb', 'Cut in deep wrist wounds'] },
  ulnar_nerve: { name: 'Ulnar nerve', group: 'Nerve', layer: 2, kind: 'nerve', simplified: true, what: 'Runs down the little-finger side of the forearm and enters the hand beside the pisiform (Guyon canal). It gives feeling to the little finger and half the ring finger and works most small hand muscles.', injuries: ['Pressure at the elbow (cubital tunnel) or wrist (cyclists) causes tingling in the little finger', 'Weak grip and clawing of the ring and little fingers when badly damaged'] },
  radial_nerve: { name: 'Radial nerve (superficial branch)', group: 'Nerve', layer: 2, kind: 'nerve', simplified: true, what: 'The branch of the radial nerve that runs under the brachioradialis muscle and over the thumb side of the wrist. It gives feeling to the back of the thumb and index finger.', injuries: ['Tight watch straps or handcuffs can press on it (tingling on the back of the thumb)'] },

  // ---------- muscles (BodyParts3D; most include their tendons) ----------
  flexor_digitorum_superficialis: muscle('Flexor digitorum superficialis', 'Bends the middle joints of the four fingers. Its tendons run through the carpal tunnel.', ['Tendon cuts in deep palm or finger wounds']),
  flexor_digitorum_profundus: muscle('Flexor digitorum profundus', 'Bends the fingertips. Its four tendons run through the carpal tunnel to the last finger bones.', ["Jersey finger: the tendon pulls off the fingertip when grabbing a shirt", 'Trigger finger: the tendon catches in its tunnel']),
  flexor_pollicis_longus: muscle('Flexor pollicis longus', 'Bends the tip of the thumb. Its tendon runs through the carpal tunnel.', ['Tendon cuts in thumb wounds']),
  flexor_carpi_radialis: muscle('Flexor carpi radialis', 'Bends the wrist forward and toward the thumb side.', ['Tendinitis at the wrist']),
  flexor_carpi_ulnaris: muscle('Flexor carpi ulnaris', 'Bends the wrist forward and toward the little-finger side. Its tendon holds the pisiform.', ['Tendinitis on the little-finger side of the wrist']),
  palmaris_longus: muscle('Palmaris longus', 'A thin muscle with a long tendon to the palm. About one person in seven does not have it.', ['Often used as a spare tendon for reconstructions']),
  pronator_teres: muscle('Pronator teres', 'Turns the palm to face down.', ['Pronator syndrome: pressure on the median nerve near the elbow']),
  pronator_quadratus: muscle('Pronator quadratus', 'A square muscle just above the wrist that turns the palm down.', ['Seen behind distal radius fractures on scans']),
  supinator: muscle('Supinator', 'Turns the palm to face up.', ['Can press on the deep branch of the radial nerve']),
  brachioradialis: muscle('Brachioradialis', 'Bends the elbow, best with the thumb pointing up.', ['Strained when lifting']),
  extensor_carpi_radialis: muscle('Extensor carpi radialis (longus and brevis)', 'Lift the wrist back and toward the thumb side.', ["Tennis elbow: the brevis tendon is irritated where it starts at the elbow"]),
  extensor_digitorum: muscle('Extensor digitorum', 'Straightens the four fingers. Its tendons fan out over the back of the hand.', ['Tendon cuts on the back of the hand']),
  extensor_digiti_minimi: muscle('Extensor digiti minimi', 'Straightens the little finger.', []),
  extensor_carpi_ulnaris: muscle('Extensor carpi ulnaris', 'Lifts the wrist back and toward the little-finger side.', ['Its tendon can slip out of its groove on the ulna']),
  extensor_indicis: muscle('Extensor indicis', 'Straightens the index finger on its own (for pointing).', []),
  thumb_extensors: muscle('Thumb extensors and abductor (APL, EPB, EPL)', 'Three muscles that lift and straighten the thumb. Two of their tendons form the snuffbox at the base of the thumb.', ["De Quervain's tenosynovitis: painful tendons at the thumb side of the wrist", 'EPL tendon can rupture after a wrist fracture']),
  anconeus: muscle('Anconeus', 'A small muscle at the back of the elbow that helps straighten it.', []),
  thenar_muscles: muscle('Thenar muscles (ball of the thumb)', 'The muscles of the ball of the thumb that move the thumb across the palm to pinch and grip.', ['Waste away in severe carpal tunnel syndrome']),
  adductor_pollicis: muscle('Adductor pollicis', 'Pulls the thumb against the index finger for a strong pinch.', ['Weak in ulnar nerve damage']),
  hypothenar_muscles: muscle('Hypothenar muscles (little-finger side of the palm)', 'Move the little finger and form the padded edge of the palm.', ['Bruised in falls on the side of the hand']),
  interossei: muscle('Interosseous muscles', 'Small muscles between the hand bones that spread the fingers apart and bring them together.', ['Weak in ulnar nerve damage']),
  lumbricals: muscle('Lumbrical muscles', 'Four small muscles in the palm that bend the knuckles while straightening the fingers.', []),

  // ---------- blood vessels (BodyParts3D) ----------
  radial_artery: { name: 'Radial artery', group: 'Blood vessel', layer: 2, kind: 'artery', what: 'Runs down the thumb side of the forearm. It is where the pulse is taken at the wrist, then it winds round the back of the thumb base into the palm.', injuries: ['Cut in wrist wounds', 'Used for blood tests and heart catheters'] },
  ulnar_artery: { name: 'Ulnar artery', group: 'Blood vessel', layer: 2, kind: 'artery', what: 'Runs down the little-finger side of the forearm into the palm, where it forms the superficial palmar arch.', injuries: ['Hypothenar hammer syndrome: damaged by using the heel of the hand as a hammer'] },
  hand_arteries: { name: 'Palmar arches and finger arteries', group: 'Blood vessel', layer: 2, kind: 'artery', what: 'Two arches of arteries in the palm, fed by the radial and ulnar arteries, with branches running along the sides of each finger.', injuries: ['Finger arteries can be cut together with the finger nerves'] },
  forearm_arteries: { name: 'Interosseous and recurrent arteries', group: 'Blood vessel', layer: 2, kind: 'artery', what: 'Deeper arteries of the forearm that run along the interosseous membrane and around the elbow.', injuries: [] },
  deep_veins: { name: 'Deep veins of the forearm', group: 'Blood vessel', layer: 2, kind: 'vein', what: 'Paired veins that run beside the radial and ulnar arteries.', injuries: [] },
  superficial_veins: { name: 'Veins of the forearm and hand', group: 'Blood vessel', layer: 2, kind: 'vein', what: 'The veins under the skin of the forearm and the back of the hand, used for drips and blood tests, and the palmar venous arches.', injuries: ['Bruising after blood tests or drips'] },

  skin: { name: 'Skin', group: 'Skin', layer: 0, kind: 'skin', what: 'The outer covering of the forearm and hand.', injuries: ['Cuts over tendons and nerves need careful checking'] },
};

export const LAYERS = ['Skin', 'Muscle', 'Ligaments, tendons, vessels', 'Cartilage', 'Bone'];
