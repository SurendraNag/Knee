// Plain-language content for each structure. Layer: 0 skin, 1 muscle, 2 ligament/tendon/meniscus, 3 cartilage, 4 bone.
export const STRUCTURES = {
  femur: {
    short: 'thigh bone (femur)', name: 'Thigh bone (femur)', group: 'Bone', layer: 4, kind: 'bone',
    what: 'The lower end of the thigh bone has two rounded knuckles (condyles) that roll and glide on the shin bone when you bend and straighten your knee.',
    injuries: ['Fractures from falls or car accidents', 'Bone bruises, often alongside ligament tears', 'Wear of its cartilage covering (arthritis)'],
  },
  tibia: {
    short: 'shin bone (tibia)', name: 'Shin bone (tibia)', group: 'Bone', layer: 4, kind: 'bone',
    what: 'The flat top of the shin bone (the tibial plateau) carries your body weight from the thigh bone down to the foot.',
    injuries: ['Plateau fractures from falls or twisting', 'Bone bruises', 'Stress fractures in runners'],
  },
  fibula: {
    short: 'fibula', name: 'Fibula (head)', group: 'Bone', layer: 4, kind: 'bone',
    what: 'The thin outer bone of the lower leg. Its top (the head) anchors the outer knee ligament and a hamstring tendon. It carries little weight.',
    injuries: ['Fracture from a direct blow to the outside of the knee', 'A piece can be pulled off when the outer ligaments tear'],
  },
  patella: {
    short: 'kneecap', name: 'Kneecap (patella)', group: 'Bone', layer: 4, kind: 'bone',
    what: 'A bone that sits inside the front thigh muscle tendon. It works like a pulley so the thigh muscles can straighten the knee with less effort.',
    injuries: ['Fracture from falling straight onto the knee', 'Dislocation, where it slips out to the side', 'Pain at the front of the knee from overuse'],
  },
  femoral_cartilage: {
    name: 'Cartilage of the thigh bone', group: 'Cartilage', layer: 3, kind: 'cartilage',
    what: 'A smooth, slippery coating on the end of the thigh bone that lets the joint glide with very little friction.',
    injuries: ['Thinning and wear (osteoarthritis)', 'Flaps or holes after an injury', 'It heals poorly on its own'],
  },
  tibial_cartilage: {
    name: 'Cartilage of the shin bone', group: 'Cartilage', layer: 3, kind: 'cartilage',
    what: 'A smooth coating on the top of the shin bone where the thigh bone and the menisci press on it.',
    injuries: ['Wear (osteoarthritis)', 'Damage from plateau fractures'],
  },
  patellar_cartilage: {
    name: 'Cartilage behind the kneecap', group: 'Cartilage', layer: 3, kind: 'cartilage',
    what: 'The thickest cartilage in the body. It lets the kneecap glide in its groove on the thigh bone.',
    injuries: ['Softening and roughening (chondromalacia)', 'Wear that hurts on stairs or when squatting'],
  },
  acl: {
    short: 'ACL', name: 'Anterior cruciate ligament (ACL)', group: 'Ligament', layer: 2, kind: 'ligament',
    what: 'Runs diagonally through the middle of the knee, from the back of the thigh bone to the front of the shin bone. It stops the shin bone sliding forward and controls twisting.',
    injuries: ['Tears from sudden stops, pivots or awkward landings in sport', 'A complete tear usually does not heal on its own'],
  },
  pcl: {
    short: 'PCL', name: 'Posterior cruciate ligament (PCL)', group: 'Ligament', layer: 2, kind: 'ligament',
    what: 'The strongest knee ligament. It crosses behind the ACL and stops the shin bone sliding backward.',
    injuries: ['Tears from a hard blow to the front of the shin with the knee bent, like hitting a dashboard', 'Falling onto a bent knee'],
  },
  mcl: {
    short: 'MCL (inner side ligament)', name: 'Medial collateral ligament (MCL)', group: 'Ligament', layer: 2, kind: 'ligament',
    what: 'A broad, flat band on the inner side of the knee. It stops the knee from buckling inward.',
    injuries: ['Sprains from a hit to the outside of the knee', 'One of the most common knee injuries; most heal without surgery'],
  },
  lcl: {
    short: 'LCL (outer side ligament)', name: 'Lateral collateral ligament (LCL)', group: 'Ligament', layer: 2, kind: 'ligament',
    what: 'A rope-like cord on the outer side of the knee, from the thigh bone to the fibula. It stops the knee from bowing outward.',
    injuries: ['Sprains from a hit to the inside of the knee', 'Often injured together with other outer-corner structures'],
  },
  medial_meniscus: {
    short: 'inner meniscus', name: 'Medial meniscus (inner)', group: 'Meniscus', layer: 2, kind: 'meniscus',
    what: 'A C-shaped rubbery cushion between the thigh and shin bones on the inner side. It spreads the load, absorbs shock and steadies the joint.',
    injuries: ['Tears from twisting on a bent knee', 'Wear-related tears in older adults', 'Torn pieces can catch or lock the knee'],
  },
  lateral_meniscus: {
    short: 'outer meniscus', name: 'Lateral meniscus (outer)', group: 'Meniscus', layer: 2, kind: 'meniscus',
    what: 'A rounder, almost O-shaped cushion on the outer side. It moves more than the inner meniscus.',
    injuries: ['Tears from twisting, often together with an ACL tear'],
  },
  quad_tendon: {
    short: 'quadriceps tendon', name: 'Quadriceps tendon', group: 'Tendon', layer: 2, kind: 'tendon',
    what: 'Joins the big front thigh muscles to the top of the kneecap, so they can straighten the knee.',
    injuries: ['Tendinitis from overuse', 'Tears, usually after age 40, from a sudden forceful push such as stumbling'],
  },
  patellar_tendon: {
    short: 'patellar tendon', name: 'Patellar tendon', group: 'Tendon', layer: 2, kind: 'tendon',
    what: 'Connects the bottom of the kneecap to the bump at the top of the shin bone, passing the pull of the thigh muscles to the leg.',
    injuries: ["Jumper's knee (tendinitis) from repeated jumping", 'Tears from landing hard'],
  },
  vastus_medialis: {
    name: 'Vastus medialis (inner thigh muscle)', group: 'Muscle', layer: 1, kind: 'muscle', simplified: true,
    what: 'Part of the quadriceps on the inner front of the thigh. It straightens the knee and helps keep the kneecap on track.',
    injuries: ['Weakens quickly after knee injury or surgery', 'Strains'],
  },
  vastus_lateralis: {
    name: 'Vastus lateralis (outer thigh muscle)', group: 'Muscle', layer: 1, kind: 'muscle', simplified: true,
    what: 'The largest quadriceps muscle, on the outer front of the thigh. It straightens the knee.',
    injuries: ['Strains', 'Deep bruises from a direct blow ("dead leg")'],
  },
  rectus_femoris: {
    name: 'Rectus femoris (front thigh muscle)', group: 'Muscle', layer: 1, kind: 'muscle', simplified: true,
    what: 'The central quadriceps muscle. It straightens the knee and helps lift the thigh.',
    injuries: ['Strains from kicking or sprinting'],
  },
  biceps_femoris: {
    name: 'Biceps femoris (outer hamstring)', group: 'Muscle', layer: 1, kind: 'muscle', simplified: true,
    what: 'An outer hamstring muscle at the back of the thigh. It bends the knee, and its tendon attaches to the head of the fibula.',
    injuries: ['Hamstring strains', 'Tendon tears with outer-knee injuries'],
  },
  semimembranosus: {
    name: 'Semimembranosus (inner hamstring)', group: 'Muscle', layer: 1, kind: 'muscle', simplified: true,
    what: 'An inner hamstring muscle. It bends the knee and supports the back inner corner of the joint.',
    injuries: ['Hamstring strains', 'Tendinitis'],
  },
  gastrocnemius_medial: {
    name: 'Calf muscle, inner head', group: 'Muscle', layer: 1, kind: 'muscle', simplified: true,
    what: 'The inner part of the main calf muscle. It starts just above the knee on the back of the thigh bone, helps bend the knee and points the foot.',
    injuries: ['Calf strain ("tennis leg")'],
  },
  gastrocnemius_lateral: {
    name: 'Calf muscle, outer head', group: 'Muscle', layer: 1, kind: 'muscle', simplified: true,
    what: 'The outer part of the main calf muscle. It helps bend the knee and points the foot.',
    injuries: ['Calf strain'],
  },
  sartorius: {
    name: 'Sartorius (strap muscle)', group: 'Muscle', layer: 1, kind: 'muscle', simplified: true,
    what: 'The longest muscle in the body. It crosses the front of the thigh and wraps behind the inner knee, helping bend the knee and turn the leg.',
    injuries: ['Strains', 'Pes anserine bursitis: pain on the inner shin just below the knee'],
  },
  gracilis: {
    name: 'Gracilis', group: 'Muscle', layer: 1, kind: 'muscle', simplified: true,
    what: 'A thin inner-thigh muscle. Its tendon joins sartorius and semitendinosus on the inner shin (the pes anserinus).',
    injuries: ['Groin strains', 'Its tendon is often used to rebuild a torn ACL'],
  },
  semitendinosus: {
    name: 'Semitendinosus (inner hamstring)', group: 'Muscle', layer: 1, kind: 'muscle', simplified: true,
    what: 'An inner hamstring with a long, cord-like tendon that ends on the inner shin. It bends the knee.',
    injuries: ['Hamstring strains', 'Its tendon is a common graft for ACL reconstruction'],
  },
  popliteus: {
    name: 'Popliteus', group: 'Muscle', layer: 1, kind: 'muscle', simplified: true,
    what: 'A small, flat muscle behind the knee. It "unlocks" the straight knee so it can start to bend.',
    injuries: ['Tendinitis on the outer back of the knee', 'Injured with outer-corner ligament tears'],
  },
  it_band: {
    name: 'Iliotibial (IT) band', group: 'Muscle', layer: 1, kind: 'fascia', simplified: true,
    what: 'A thick band of tissue down the outside of the thigh that attaches just below the knee on the outer shin bone. It steadies the outer knee.',
    injuries: ['IT band syndrome: pain on the outer knee in runners and cyclists'],
  },
  skin: {
    name: 'Skin and fat', group: 'Skin', layer: 0, kind: 'skin', simplified: true,
    what: 'The outer covering of the knee. Peel it away with the Layers slider to see inside.',
    injuries: ['Bruises, cuts and swelling show here'],
  },
};

export const LAYERS = ['Skin', 'Muscle', 'Ligaments, tendons, menisci', 'Cartilage', 'Bone'];
