// Structures of the skull, face and jaw (one model, no left/right switch: both sides are scanned), with the brain, the eyes
// and the top of the neck. Frame: centimetres, origin near the middle of the skull, scan axes: +X toward the body's left,
// +Y up, +Z front. Layers: 0 skin, 1 muscle, 2 brain/eyes/nerves/vessels/jaw discs, 3 cartilage, 4 bone.
const ss = (x, a, b) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
export const fade = (x, y) => 1 - ss(-y, 11.8, 13.2); // the neck is cut below the hyoid

// Skull, face and jaw bones are offered a crack (linear), a displaced (depressed) break and a shattered (comminuted) break;
// stress fractures and bone bruises are not injuries of these bones. Teeth and the hyoid get only a crack or a break.
const SKULL_TYPES = [23, 24, 25], TOOTH_TYPES = [23, 24];
const bone = (name, what, injuries, short, joint = 'skull', injuryTypes = SKULL_TYPES) => ({ short: short || name.toLowerCase(), name, group: 'Bone', layer: 4, kind: 'bone', joint, what, injuries, injuryTypes });
const muscle = (name, what, injuries = []) => ({ name, group: 'Muscle', layer: 1, kind: 'muscle', what, injuries });
const SKULL_FX = ['Skull fractures from falls and blows to the head; a depressed fracture pushes bone inward', 'A fracture here can tear the blood vessels underneath and cause bleeding around the brain'];

export const STRUCTURES = {
  frontal_bone: bone('Frontal bone', 'The forehead bone. It forms the front of the skull and the roofs of the eye sockets, and holds the frontal sinuses.', [...SKULL_FX, 'Frontal sinus fractures from blows to the forehead'], 'frontal bone'),
  right_parietal_bone: bone('Right parietal bone', 'One of the two large bones that form the top and sides of the skull.', SKULL_FX, 'right parietal bone'),
  left_parietal_bone: bone('Left parietal bone', 'One of the two large bones that form the top and sides of the skull.', SKULL_FX, 'left parietal bone'),
  right_temporal_bone: bone('Right temporal bone', 'The bone at the side of the skull around the ear. It holds the ear canal, the inner ear and the socket of the jaw joint. At the temple it meets the frontal, parietal and sphenoid bones at the pterion, where the skull is thinnest and the middle meningeal artery runs just inside.', ['Temporal bone fractures can cause hearing loss or facial nerve weakness', 'A blow at the temple can tear the middle meningeal artery (extradural haematoma)'], 'right temporal bone'),
  left_temporal_bone: bone('Left temporal bone', 'The bone at the side of the skull around the ear, with the ear canal, inner ear and the socket of the jaw joint.', ['Temporal bone fractures can cause hearing loss or facial nerve weakness', 'A blow at the temple can tear the middle meningeal artery (extradural haematoma)'], 'left temporal bone'),
  occipital_bone: bone('Occipital bone', 'The bone at the back and base of the skull. The spinal cord passes through its large hole (foramen magnum), and it rests on the atlas.', ['Fractures from falls backward', 'Base of skull fractures: bruising behind the ears, fluid leaking from the nose or ears'], 'occipital bone'),
  sphenoid_bone: bone('Sphenoid bone', 'A butterfly-shaped bone in the middle of the skull base, behind the eyes. The pituitary gland sits in a hollow on top of it.', ['Base of skull fractures in severe head injuries'], 'sphenoid bone'),
  ethmoid_bone: bone('Ethmoid bone', 'A light, honeycombed bone between the eye sockets that forms the roof and sides of the nose and holds the ethmoid sinuses.', ['Fractures with severe nose and mid-face injuries, sometimes with leaking brain fluid'], 'ethmoid bone'),
  nasal_bones: bone('Nasal bones', 'Two small bones that form the bridge of the nose.', ['Broken nose: the most common facial fracture, from sports, falls and fights'], 'nasal bones', 'face'),
  maxilla: bone('Upper jaw (maxilla)', 'The two bones of the upper jaw. They hold the upper teeth, form the floor of the eye sockets and the sides of the nose, and contain the maxillary sinuses.', ['Le Fort fractures: the mid-face breaks away from the skull in severe injuries', 'Orbital floor ("blowout") fractures when a ball or fist hits the eye'], 'upper jaw', 'face'),
  right_zygomatic_bone: bone('Right cheekbone (zygomatic bone)', 'The cheekbone. It forms the outer rim of the eye socket and the prominence of the cheek.', ['Cheekbone (tripod) fractures from punches and falls: a flat cheek and numbness of the cheek'], 'right cheekbone', 'face'),
  left_zygomatic_bone: bone('Left cheekbone (zygomatic bone)', 'The cheekbone. It forms the outer rim of the eye socket and the prominence of the cheek.', ['Cheekbone (tripod) fractures from punches and falls: a flat cheek and numbness of the cheek'], 'left cheekbone', 'face'),
  palatine_bones: bone('Palatine bones', 'Two L-shaped bones at the back of the roof of the mouth (hard palate) and the floor of the nose.', ['Fractures with severe mid-face injuries'], 'palatine bones', 'face'),
  vomer: bone('Vomer', 'A thin bone that forms the back and lower part of the wall between the two sides of the nose (nasal septum).', ['Damaged with a deviated or broken nasal septum'], 'vomer', 'face'),
  lacrimal_bones: bone('Lacrimal bones', 'The smallest facial bones, on the inner wall of each eye socket, next to the tear duct.', ['Fractures with injuries to the inner corner of the eye socket can block the tear duct'], 'lacrimal bones', 'face'),
  mandible: bone('Lower jaw (mandible)', 'The lower jaw, the only skull bone that moves (apart from the tiny ear bones). Its two upper ends (condyles) form the jaw joints in front of the ears.', ['Jaw fractures from punches and falls, often in two places (for example the body on one side and the condyle on the other)', 'Condyle fractures from a fall onto the chin'], 'lower jaw', 'jaw'),
  upper_teeth: bone('Upper teeth', 'The sixteen permanent teeth of the upper jaw: incisors, canines, premolars and molars.', ['Broken (fractured) and knocked-out (avulsed) front teeth from falls and sports', 'A knocked-out permanent tooth should be put back or kept in milk and seen by a dentist straight away'], 'upper tooth', 'jaw', TOOTH_TYPES),
  lower_teeth: bone('Lower teeth', 'The permanent teeth of the lower jaw.', ['Broken and knocked-out teeth from falls and sports'], 'lower tooth', 'jaw', TOOTH_TYPES),
  hyoid: bone('Hyoid bone', 'A U-shaped bone in the front of the neck below the jaw. The tongue and throat muscles attach to it; it is not joined to any other bone.', ['Rarely broken; a fracture can come from strangulation or a direct blow'], 'hyoid', 'neck', TOOTH_TYPES),
  c1: bone('C1 (atlas) vertebra', 'The first neck vertebra: a ring that carries the skull. Nodding happens here.', ['Jefferson fracture from a blow to the top of the head'], 'atlas', 'neck'),
  c2: bone('C2 (axis) vertebra', 'The second neck vertebra. Its peg (dens) is the pivot for turning the head.', ['Dens fractures, especially from falls in older people'], 'axis', 'neck'),

  // ---------- jaw joint discs (modelled) ----------
  right_tmj_disc: { short: 'right jaw joint disc', name: 'Right jaw joint (TMJ) disc', group: 'Disc', layer: 2, kind: 'jawdisc', joint: 'jaw', simplified: true, flapToward: [-4.6, -2.6, 4], what: 'A small oval pad of cartilage in the jaw joint (temporomandibular joint) between the top of the lower jaw and the skull, just in front of the ear. It glides forward when the mouth opens.', injuries: ['Disc displacement: the disc slips forward, causing clicking or a jaw that locks', 'TMJ disorders: jaw pain, clicking and headaches, often with teeth clenching or grinding'] },
  left_tmj_disc: { short: 'left jaw joint disc', name: 'Left jaw joint (TMJ) disc', group: 'Disc', layer: 2, kind: 'jawdisc', joint: 'jaw', simplified: true, flapToward: [4.6, -2.6, 4], what: 'A small oval pad of cartilage in the jaw joint between the top of the lower jaw and the skull, just in front of the ear.', injuries: ['Disc displacement: the disc slips forward, causing clicking or a jaw that locks', 'TMJ disorders: jaw pain, clicking and headaches'] },

  // ---------- brain, eyes, nerves and arteries (BodyParts3D) ----------
  brain: { name: 'Brain', group: 'Brain', layer: 2, kind: 'brain', what: 'The cerebrum (the two hemispheres with their folds), the cerebellum at the back and the brainstem that continues into the spinal cord. It sits inside the skull, cushioned by fluid. Turn on See through bone to see it.', injuries: ['Concussion: a brief disturbance of brain function after a blow to the head, often without anything showing on a scan', 'Bleeding around or in the brain after head injuries (extradural, subdural or brain haemorrhage)'] },
  eyes: { name: 'Eyes', group: 'Eye', layer: 2, kind: 'eye', what: 'The eyeballs in their bony sockets (orbits), with the clear cornea at the front, the coloured iris and the lens.', injuries: ['Orbital blowout fractures can trap the eye muscles and cause double vision', 'Any blow to the eye with blurred vision needs an eye check'] },
  eye_nerves: { name: 'Optic and eye nerves', group: 'Nerve', layer: 2, kind: 'nerve', what: 'The optic nerves carry sight from each eye to the brain and cross at the optic chiasm. Smaller nerves move the eye muscles and give feeling to the forehead (supraorbital nerve).', injuries: ['The optic nerve can be damaged in fractures around the eye socket (sudden loss of vision is an emergency)', 'Numb forehead after fractures above the eye'] },
  brain_arteries: { name: 'Arteries of the brain', group: 'Blood vessel', layer: 2, kind: 'artery', what: 'The cerebral arteries that spread over the surface of the brain, fed by the carotid and vertebral arteries through a ring at the base of the brain (circle of Willis).', injuries: ['Stroke: a blocked or burst artery', 'Aneurysms at the base of the brain can burst (subarachnoid haemorrhage)'] },

  // ---------- muscles (BodyParts3D) ----------
  eye_muscles: muscle('Eye muscles', 'Six small muscles around each eye that turn it, and the muscle that lifts the upper eyelid.', ['Can be trapped in orbital floor fractures, causing double vision when looking up']),
  suboccipital_muscles: muscle('Suboccipital and upper neck muscles', 'Small deep muscles between the skull, atlas and axis, with the semispinalis and longissimus at the back of the neck. They nod and turn the head.', ['A common source of tension headaches', 'Strained in whiplash']),
  sternocleidomastoid: muscle('Sternocleidomastoid', 'The strap muscle on each side of the neck from behind the ear to the collarbone and breastbone.', ['Wry neck (torticollis)']),
  prevertebral_muscles: muscle('Longus capitis and rectus capitis anterior', 'Deep muscles on the front of the upper neck vertebrae that bend the head forward.', ['Strained in whiplash']),
  suprahyoid_muscles: muscle('Floor of the mouth muscles (suprahyoid)', 'The digastric, mylohyoid, geniohyoid and stylohyoid muscles between the jaw and the hyoid. They open the jaw and lift the hyoid when swallowing.', []),
  tongue_muscles: muscle('Tongue muscles', 'The genioglossus and hyoglossus, which move the tongue.', []),
  soft_palate_muscles: muscle('Soft palate muscles', 'Muscles that lift and tighten the soft palate when swallowing, and the uvula.', []),

  skin: { name: 'Skin and ears', group: 'Skin', layer: 0, kind: 'skin', what: 'The skin of the head, face and upper neck, and the outer ears.', injuries: ['Scalp wounds bleed heavily'] },
};

export const LAYERS = ['Skin', 'Muscle', 'Brain, eyes, nerves, vessels', 'Cartilage', 'Bone'];
