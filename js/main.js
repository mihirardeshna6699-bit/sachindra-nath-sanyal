/* ═══════════════════════════════════════════════════════════════════════════
   SACHINDRA NATH SANYAL — THE TIME TUNNEL
   One continuous 3D corridor in which forward distance IS chronological time.
   Educational exhibition. No scores, no combat, no objectives.
   ═══════════════════════════════════════════════════════════════════════════ */

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
/* Road lettering is built from a shared high-resolution glyph atlas rather than
   one baked canvas per label. Each glyph is drawn once at ~300 px and reused, so
   every marking gets the same resolution regardless of how long it is, no label
   is ever stretched to fit its quad, and the whole system costs one texture.
   (troika/SDF was tried first; its WebGL SDF generator returns a blank atlas in
   some embedded GL contexts, which would have shipped as solid blocks.) */
const ROAD_FACE = '"Cinzel", Georgia, "Times New Roman", serif';

/* ───────────────────────────── configuration ───────────────────────────── */

const CFG = {
  eyeHeight:     1.68,
  walkSpeed:     4.15,
  runSpeed:      8.30,      // Shift — twice walking pace
  fov:           62,
  runFov:        4.5,       // degrees added at full sprint
  accel:         26,
  damping:       9.5,
  lookSens:      0.0021,
  lookSmooth:    0.24,      // 0..1 — higher is snappier
  pitchLimit:    Math.PI * 0.46,
  interactRange: 8.0,
  wallMargin:    0.72,
  maxPixelRatio: 1.85,
  fogDensity:    0.0105
};

/* Tunnel cross-section constants (metres). The roadway sits inside a masonry
   bore: crowned asphalt → gutter → curb → raised walkway → wall → sprung arch. */
const SEC = {
  camber:    0.075,   // road crown
  shoulder:  1.35,    // gutter + curb + walkway, each side
  wallInset: 0.42,    // wall face inboard of the nominal half-width
  plinthTop: 0.68,
  walkTop:   0.22,
  gutterLow:-0.11,
  archSegs:  16      // enough that the vault reads as a curve, not a polygon
};
const BAND = { ROAD:0, GUTTER:1, CURB:2, WALK:3, PLINTH:4, WALL:5, ARCH:6 };

/* ───────────────────────────── zone architecture ─────────────────────────
   Each zone owns a stretch of corridor. Its length is its historical weight:
   longer periods are literally longer walks.
   ------------------------------------------------------------------------ */

const ZONES = [
  {
    key:'entrance', name:'THE THRESHOLD', years:'', yearFrom:1893, yearTo:1893,
    length:16, halfW:3.6, height:5.0,
    fog:0x241d16, ambient:0x8f8878, ambientI:0.46,
    lamp:0xffd9a8, lampI:16, lampGap:8, line:0xd8c9a4,
    frame:0x2e2419, frameMetal:0.15, frameRough:0.72
  },
  {
    key:'early', name:'EARLY LIFE', years:'1893 — 1912', yearFrom:1893, yearTo:1912,
    length:54, halfW:4.2, height:5.5,
    fog:0x2b2318, ambient:0xa39274, ambientI:0.54,
    lamp:0xffcf94, lampI:21, lampGap:9, line:0xe0cfa2,
    frame:0x3b2c1c, frameMetal:0.12, frameRough:0.68
  },
  {
    key:'revolution', name:'REVOLUTIONARY ACTIVITIES', years:'1912 — 1920', yearFrom:1912, yearTo:1920,
    length:86, halfW:4.6, height:5.7,
    fog:0x252017, ambient:0x9a8c70, ambientI:0.50,
    lamp:0xffc78a, lampI:20, lampGap:9.5, line:0xd8c496,
    frame:0x2a2016, frameMetal:0.25, frameRough:0.6
  },
  {
    key:'network', name:'REVOLUTIONARY NETWORK', years:'1920 — 1925', yearFrom:1920, yearTo:1925,
    length:74, halfW:5.6, height:6.3,
    fog:0x20242a, ambient:0x929aa2, ambientI:0.52,
    lamp:0xf3e2c2, lampI:20, lampGap:10, line:0xd9d2bd,
    frame:0x272524, frameMetal:0.55, frameRough:0.42
  },
  {
    key:'kakori', name:'KAKORI-ERA CONTEXT', years:'1925 — 1927', yearFrom:1925, yearTo:1927,
    length:78, halfW:4.8, height:5.9,
    fog:0x241f16, ambient:0x9a9078, ambientI:0.49,
    lamp:0xf0dcb4, lampI:18, lampGap:9, line:0xcdb98d,
    frame:0x171514, frameMetal:0.65, frameRough:0.38
  },
  {
    key:'prison', name:'IMPRISONMENT', years:'1927 — 1937', yearFrom:1927, yearTo:1937,
    length:68, halfW:3.5, height:5.1,
    fog:0x191f27, ambient:0x808e9c, ambientI:0.42,
    lamp:0xd7dfe8, lampI:14, lampGap:11, line:0xa8b2bb,
    frame:0x14161a, frameMetal:0.7, frameRough:0.45
  },
  {
    key:'writings', name:'WRITINGS', years:'1922 — 1941', yearFrom:1937, yearTo:1941,
    length:74, halfW:5.2, height:6.5,
    fog:0x2e2313, ambient:0xac9573, ambientI:0.58,
    lamp:0xffcd8c, lampI:22, lampGap:9, line:0xe6cea0,
    frame:0x412e1b, frameMetal:0.14, frameRough:0.6
  },
  {
    key:'legacy', name:'LEGACY', years:'1942 — ', yearFrom:1941, yearTo:1942,
    length:48, halfW:5.6, height:7.0,
    fog:0x3a3020, ambient:0xbcae92, ambientI:0.66,
    lamp:0xfff0d6, lampI:24, lampGap:9, line:0xf0e0b6,
    frame:0x33291c, frameMetal:0.45, frameRough:0.4
  }
];

// cumulative distance ("d") from the threshold, and matching world z (negative)
let acc = 0;
for (const z of ZONES){ z.startD = acc; acc += z.length; z.endD = acc; }
const CORRIDOR_LEN = acc;                    // 498
const ROT_RADIUS   = 14;
const ROT_HEIGHT   = 9.4;
const ROT_CENTER_Z = -CORRIDOR_LEN - 11;     // rotunda swallows the corridor mouth
const THROAT_HALFW = Math.sqrt(ROT_RADIUS*ROT_RADIUS - 11*11); // 8.66
const FLARE_START  = CORRIDOR_LEN - 20;      // corridor opens out into the rotunda
const BACK_WALL_Z  = 2.2;

/* ────────────────────────────── the history ──────────────────────────────
   involvement:
     'direct'  — Sanyal's own documented act or circumstance
     'broader' — a real event of the movement that was NOT his act
     'context' — surrounding historical or institutional context
   `note` is used wherever the record is contested, thin, or commonly confused.
   `audioUrl` is the hook for future narration (e.g. ElevenLabs output).
   ------------------------------------------------------------------------ */

const SRC = {
  bandi:   'Sachindranath Sanyal, <i>Bandi Jivan</i> (Bengali, 1922); Hindi and English editions thereafter — the principal first-person source, and a memoir, with the limits that implies.',
  sedition:'Government of India, <i>Report of the Committee appointed to investigate Revolutionary Conspiracies in India</i> (the Rowlatt / Sedition Committee Report), Calcutta, 1918.',
  bipan:   'Bipan Chandra, Mridula Mukherjee, Aditya Mukherjee, K. N. Panikkar, Sucheta Mahajan, <i>India\'s Struggle for Independence 1857–1947</i> (Penguin, 1989).',
  sarkar:  'Sumit Sarkar, <i>Modern India 1885–1947</i> (Macmillan, 1983).',
  maclean: 'Kama Maclean, <i>A Revolutionary History of Interwar India: Violence, Image, Voice and Text</i> (Hurst / Oxford University Press, 2015).',
  heehs:   'Peter Heehs, <i>The Bomb in Bengal: The Rise of Revolutionary Terrorism in India 1900–1910</i> (Oxford University Press, 1993).',
  ichr:    'Indian Council of Historical Research, <i>Dictionary of Martyrs: India\'s Freedom Struggle 1857–1947</i>.',
  nai:     'Home (Political) Department proceedings and conspiracy-case records, National Archives of India, New Delhi.',
  cwmg:    '<i>The Collected Works of Mahatma Gandhi</i>, Publications Division, Government of India — <i>Young India</i>, February 1925.',
  kakori:  'Judgment, King-Emperor v. Ram Prasad and others (the Kakori Conspiracy Case), Special Sessions Court, Lucknow, 6 April 1927.',
  andaman: 'R. C. Majumdar, <i>Penal Settlement in Andamans</i> (Gazetteers Unit, Government of India, 1975); Cellular Jail National Memorial records, Port Blair.',
  portrait:'Photograph: <i>Freedom fighter Sachindranath Sanyal</i>, Calcutta Mahajati Sadan; published before 1960 and in the public domain in India, via Wikimedia Commons.',
  gupta:   'Manmathnath Gupta, <i>They Lived Dangerously / Bharatiya Krantikari Andolan ka Itihas</i> — participant history, to be read as testimony rather than as neutral record.'
};

const TIMELINE = [
  /* ───────────── ZONE 1 · EARLY LIFE ───────────── */
  {
    id:'birth', zone:'early', d:14, side:'left',
    year:'1893', date:'3 April 1893', title:'Born at Varanasi',
    place:'Varanasi (Benares), North-Western Provinces, British India',
    involvement:'direct',
    what:'Sachindranath Sanyal was born on 3 April 1893 into a Bengali family settled at Varanasi. He grew up in the Bengali quarter of a city that was simultaneously a centre of Sanskrit learning, of pilgrimage, and — because of its railway links and its student population — a convenient node for political organising in the United Provinces.',
    why:'His birthplace matters to everything that follows. Sanyal was Bengali by community and North Indian by geography, and that double position is precisely why he became the person who carried Bengal\'s revolutionary organisational methods westward into Bihar, the United Provinces and the Punjab.',
    sources:[SRC.bandi, SRC.ichr, SRC.nai], audioUrl:''
  },
  {
    id:'swadeshi', zone:'early', d:30, side:'right',
    year:'1905–1911', date:'1905 — 1911', title:'The Swadeshi Years',
    place:'Bengal and the United Provinces',
    involvement:'context',
    what:'The partition of Bengal announced by Lord Curzon in 1905 produced the Swadeshi and Boycott movement: mass petitioning, the boycott of British goods, national schools, and — at its margins — the first Indian secret societies organised on a cellular model. The partition was annulled in 1911. Sanyal came of age inside this atmosphere.',
    why:'This is the seedbed, not a personal event. The generation that formed the Anushilan Samiti and Jugantar was radicalised here, and the organisational grammar Sanyal later used — small cells, oaths, physical training, a written manifesto — was worked out in Bengal in these years.',
    sources:[SRC.sarkar, SRC.heehs, SRC.bipan], audioUrl:''
  },
  {
    id:'benares-node', zone:'early', d:44, side:'left',
    year:'c. 1908–1912', date:'c. 1908 — 1912', title:'Benares as an Organising Centre',
    place:'Varanasi',
    involvement:'direct',
    what:'In his late teens Sanyal was drawn into revolutionary circles at Varanasi and began the work he would do for the rest of his life: recruiting, sheltering, moving people and money between provinces, and holding a network together across long distances.',
    why:'Almost every later episode — the 1915 plan, the founding of the Hindustan Republican Association in 1924 — depends on this quiet, unglamorous capacity for organisation rather than on any single act.',
    note:'Memoir literature is the main source for this period and it gives few firm dates. The exhibition therefore gives a range rather than a year.',
    sources:[SRC.bandi, SRC.sedition, SRC.gupta], audioUrl:''
  },

  /* ───────────── ZONE 2 · REVOLUTIONARY ACTIVITIES ───────────── */
  {
    id:'anushilan-patna', zone:'revolution', d:12, side:'left',
    year:'c. 1913', date:'c. 1913', title:'A Branch of the Anushilan Samiti at Patna',
    place:'Patna, Bihar',
    involvement:'direct',
    what:'Sanyal is credited with establishing a branch of the Anushilan Samiti at Patna, extending a Bengal-based revolutionary organisation outward into Bihar. The Anushilan Samiti had begun in Calcutta in 1902 as a physical-culture and self-discipline society and had, in some of its branches, become an underground political body.',
    why:'This is the moment the Bengal network stopped being a Bengal network. Carrying the Samiti\'s methods into Bihar and the United Provinces created the geography that made a coordinated northern Indian plan conceivable two years later.',
    note:'The exact year is given differently in different accounts; "c. 1913" reflects that spread rather than a settled date.',
    sources:[SRC.sedition, SRC.heehs, SRC.bandi], audioUrl:''
  },
  {
    id:'delhi-1912', zone:'revolution', d:22, side:'right',
    year:'1912', date:'23 December 1912', title:'The Delhi Conspiracy — Bomb Thrown at Lord Hardinge',
    place:'Chandni Chowk, Delhi',
    involvement:'broader',
    what:'As the Viceroy, Lord Hardinge, entered Delhi in state procession on 23 December 1912 to mark the transfer of the capital from Calcutta, a bomb was thrown at his howdah. Hardinge was wounded and his attendant killed. The subsequent Delhi–Lahore Conspiracy Case identified Rash Behari Bose as a principal organiser; Bose evaded arrest for years.',
    why:'It is included here as context for the network Sanyal worked inside — Rash Behari Bose became his closest revolutionary associate — and because the manhunt that followed pushed Bose into the north Indian underground where Sanyal operated.',
    note:'This was not Sanyal\'s act, and he was not among those charged for it. It appears in this exhibition strictly as the event that shaped the circle he belonged to.',
    sources:[SRC.sedition, SRC.nai, SRC.sarkar], audioUrl:''
  },
  {
    id:'rashbehari', zone:'revolution', d:34, side:'left',
    year:'1913–1915', date:'1913 — 1915', title:'Working with Rash Behari Bose',
    place:'Varanasi, Lahore, Punjab and the United Provinces',
    involvement:'direct',
    what:'Sanyal became the close associate of Rash Behari Bose in the north Indian revolutionary underground, with Varanasi serving as one of the movement\'s safe centres. The pair worked on linking scattered groups — Bengal, Bihar, the United Provinces, the Punjab — into something that could act together.',
    why:'The partnership is the hinge of Sanyal\'s political life. It converted a set of provincial secret societies into a single attempted operation, and it is the reason his name appears in the official record of 1915 at all.',
    sources:[SRC.bandi, SRC.sedition, SRC.heehs], audioUrl:''
  },
  {
    id:'feb1915', zone:'revolution', d:44, side:'right',
    year:'1915', date:'February 1915', title:'The February 1915 Plan',
    place:'Punjab, United Provinces and Bengal',
    involvement:'direct',
    what:'Indian revolutionaries — the Ghadar Party returning from North America, the north Indian underground led by Rash Behari Bose, and Bengal groups — planned a coordinated rising in the Indian Army timed for February 1915, while Britain was at war. The date was brought forward to 19 February after the plan was penetrated by an informer, and the rising was suppressed before it could begin. Mass arrests, the Lahore Conspiracy Case trials and the Defence of India Act, 1915 followed.',
    why:'It is the largest attempt at an armed pan-Indian rising between 1857 and 1942, and its failure defined a generation. Sanyal was one of its organisers in the north, and his arrest flows directly from it.',
    note:'Contemporary intelligence records and later histories describe this plan under several names — the Ghadar Conspiracy, the Hindu–German Conspiracy, the February Plan. They refer to the same failed attempt.',
    sources:[SRC.sedition, SRC.bipan, SRC.sarkar, SRC.nai], audioUrl:''
  },
  {
    id:'rbb-escape', zone:'revolution', d:56, side:'left',
    year:'1915', date:'12 May 1915', title:'Rash Behari Bose Leaves for Japan',
    place:'Calcutta → Japan',
    involvement:'broader',
    what:'With the February plan broken and the police closing in, Rash Behari Bose sailed from Calcutta in May 1915 under an assumed name and reached Japan, where he spent the rest of his life and where he would later be involved in the origins of the Indian National Army.',
    why:'His departure left the north Indian network without its leading organiser, and left those who remained — Sanyal among them — exposed to the arrests that followed within months.',
    note:'Sanyal\'s personal role in arranging the escape is described in memoir literature rather than established by court record; it is reported here as testimony, not as a proven fact.',
    sources:[SRC.bandi, SRC.sedition, SRC.gupta], audioUrl:''
  },
  {
    id:'benares-case', zone:'revolution', d:66, side:'right',
    year:'1915–1916', date:'1915 — 1916', title:'Arrest and the Benares Conspiracy Case',
    place:'Varanasi; tried in the United Provinces',
    involvement:'direct',
    what:'Sanyal was arrested in the sweep that followed the collapse of the February plan and tried in the Benares Conspiracy Case. He was sentenced to transportation for life and sent to the Cellular Jail at Port Blair in the Andaman Islands. The family property at Varanasi was confiscated by the Government.',
    why:'Transportation for life was the heaviest sentence short of hanging. Confiscation extended the punishment to a household that had committed no offence — a routine instrument of colonial policing that is easy to overlook beside the sentence itself.',
    sources:[SRC.sedition, SRC.nai, SRC.bandi, SRC.ichr], audioUrl:''
  },
  {
    id:'cellular-1', zone:'revolution', d:78, side:'left',
    year:'1916–1920', date:'1916 — 1920', title:'Cellular Jail — The First Term',
    place:'Port Blair, Andaman Islands',
    involvement:'direct',
    what:'The Cellular Jail, completed in 1906, was built as seven wings radiating from a central tower, with 693 single cells arranged so that no prisoner faced another. It was reserved largely for political convicts transported from the mainland. Sanyal served here from 1916.',
    why:'The building was designed to make organisation impossible: solitude was the punishment. That a body of political writing came out of the Andamans at all is a fact about its prisoners, not about the institution.',
    sources:[SRC.andaman, SRC.bandi, SRC.nai], audioUrl:''
  },

  /* ───────────── ZONE 3 · NETWORK ───────────── */
  {
    id:'amnesty-1920', zone:'network', d:12, side:'right',
    year:'1920', date:'1920', title:'Released under the Royal Amnesty',
    place:'Port Blair → Varanasi',
    involvement:'direct',
    what:'Following the Government of India Act 1919 and the Royal Proclamation of 23 December 1919, a general amnesty released large numbers of political prisoners. Sanyal returned to the mainland in 1920, into an India transformed by the Rowlatt Satyagraha, the Jallianwala Bagh massacre of 13 April 1919, and the beginning of Gandhi\'s Non-Cooperation Movement.',
    why:'He walked out of an eighteenth-century punishment into a twentieth-century mass movement. Everything he did afterwards — the memoir, the manifesto, the argument with Gandhi — is an attempt to work out what armed revolutionaries were now for.',
    sources:[SRC.nai, SRC.bipan, SRC.sarkar], audioUrl:''
  },
  {
    id:'bandi-jivan', zone:'network', d:26, side:'left',
    year:'1922', date:'1922', title:'Bandi Jivan is Published',
    place:'Bengal; later editions across northern India',
    involvement:'direct',
    what:'Sanyal published <i>Bandi Jivan</i> — "A Life of Captivity" — in Bengali in 1922, an account of the revolutionary underground and of the Andamans written by someone who had been inside both. It was translated into Hindi and other Indian languages and circulated widely, including among readers the Government would rather it had not reached.',
    why:'It made the revolutionary underground legible to a mass readership for the first time in its own words. Its influence on the younger revolutionaries of the 1920s is the single most-cited fact about Sanyal, and it is the reason he is remembered as a writer as much as an organiser.',
    sources:[SRC.bandi, SRC.maclean, SRC.gupta], audioUrl:''
  },
  {
    id:'hra-founded', zone:'network', d:44, side:'right',
    year:'1924', date:'October 1924', title:'The Hindustan Republican Association is Founded',
    place:'Kanpur, United Provinces',
    involvement:'direct',
    what:'At a meeting in Kanpur in October 1924, Sanyal — with Jogesh Chandra Chatterjee, Ram Prasad Bismil and others including Pratul Ganguly and Narendra Mohan Sen — founded the Hindustan Republican Association. Its stated object was a federal republic of the United States of India, to be brought about by organised armed revolution.',
    why:'The HRA is the organisational parent of almost everything that follows in north Indian revolutionary history: Kakori in 1925, and the reconstituted HSRA of 1928 to which Bhagat Singh and Chandrashekhar Azad belonged.',
    note:'Some accounts date the association\'s beginnings to 1923 and its formal constitution to October 1924. The 1924 Kanpur meeting is the point on which the sources agree.',
    sources:[SRC.maclean, SRC.bipan, SRC.gupta, SRC.kakori], audioUrl:''
  },
  {
    id:'manifesto', zone:'network', d:58, side:'left',
    year:'1925', date:'1 January 1925', title:'“The Revolutionary” — the HRA Manifesto',
    place:'Distributed across cities of northern India',
    involvement:'direct',
    what:'A four-page manifesto titled <i>The Revolutionary</i>, dated 1 January 1925 and signed with a pseudonym, was distributed in several north Indian cities. It set out the association\'s republican and anti-imperial aims and addressed itself to the reading public rather than to a secret membership. Its authorship is attributed to Sanyal, and it was central to the case later made against him.',
    why:'It is the clearest surviving statement of what the HRA thought it was doing, and it marks a deliberate shift: a secret society arguing in public, in print, for a republic.',
    sources:[SRC.maclean, SRC.nai, SRC.kakori], audioUrl:''
  },
  {
    id:'gandhi-exchange', zone:'network', d:68, side:'right',
    year:'1925', date:'February 1925', title:'The Exchange with Gandhi in Young India',
    place:'Published in <i>Young India</i>, Ahmedabad',
    involvement:'direct',
    what:'Gandhi published in <i>Young India</i> a long letter from Sanyal defending revolutionary methods, together with his own reply rejecting them. The two men argued in print, at length, and without pretending to agree.',
    why:'It is a rare, dateable, documented meeting between the two wings of the freedom struggle — argued as an argument, on the record, in a paper anyone could buy. It is also the best evidence that Sanyal thought of himself as making a case, not merely acting.',
    note:'Read the exchange in full in the Collected Works before characterising either man\'s position; both are routinely simplified.',
    sources:[SRC.cwmg, SRC.maclean, SRC.bipan], audioUrl:''
  },

  /* ───────────── ZONE 4 · KAKORI-ERA CONTEXT ───────────── */
  {
    id:'sanyal-1925-arrest', zone:'kakori', d:14, side:'left',
    year:'1925', date:'1925', title:'Sanyal is Arrested Again',
    place:'Bengal / United Provinces',
    involvement:'direct',
    what:'Sanyal was arrested in 1925, principally in connection with the HRA and the circulation of <i>The Revolutionary</i>. He was sentenced to transportation for life a second time and returned to the Cellular Jail — he is commonly described as the only Indian revolutionary transported to the Andamans twice.',
    why:'The date matters for reading everything in this zone. By the time of the Kakori action of 9 August 1925 Sanyal was already in custody, which is why he does not appear among its participants.',
    note:'Accounts differ on the exact month of arrest and on precisely which proceedings produced the second life sentence. What is consistent across sources is that he was in custody from 1925 and was transported a second time.',
    sources:[SRC.nai, SRC.maclean, SRC.ichr, SRC.kakori], audioUrl:''
  },
  {
    id:'kakori', zone:'kakori', d:30, side:'right',
    year:'1925', date:'9 August 1925', title:'The Kakori Action',
    place:'Near Kakori, between Shahjahanpur and Lucknow',
    involvement:'broader',
    what:'On 9 August 1925 a party of HRA members stopped the 8 Down train near Kakori and took the government treasury cash it carried. Among those involved were Ram Prasad Bismil, Ashfaqullah Khan, Rajendra Lahiri, Chandrashekhar Azad, Sachindra Nath Bakshi and Manmathnath Gupta. A passenger was killed by a shot fired during the action — a death the accused maintained was not intended.',
    why:'The action funded almost nothing and cost the HRA nearly everything: it triggered the arrests that broke the organisation and led to four executions. It also made the HRA nationally famous, which is why its name survived into the HSRA.',
    note:'This was NOT Sanyal\'s act. He had been arrested earlier in 1925 and was not present. Note also the persistent confusion of two different men: Sachindra Nath BAKSHI took part in the raid and was sentenced to transportation for life; Sachindra Nath SANYAL, the subject of this exhibition, did not.',
    sources:[SRC.kakori, SRC.maclean, SRC.bipan, SRC.gupta], audioUrl:''
  },
  {
    id:'kakori-trial', zone:'kakori', d:46, side:'left',
    year:'1926–1927', date:'1926 — 6 April 1927', title:'The Kakori Conspiracy Case',
    place:'Special Sessions Court, Lucknow',
    involvement:'broader',
    what:'The Kakori Conspiracy Case was tried at Lucknow through 1926 and into 1927, judgment being delivered on 6 April 1927. Four men — Ram Prasad Bismil, Ashfaqullah Khan, Rajendra Lahiri and Roshan Singh — were sentenced to death; others, including Sachindra Nath Bakshi and Jogesh Chandra Chatterjee, received transportation for life or long terms of imprisonment.',
    why:'The trial record is one of the fullest documentary sources on the HRA that exists, because the prosecution had to describe the organisation in order to convict it. Much of what is known about the association comes, awkwardly, from the papers of the case that destroyed it.',
    note:'Court records state the prosecution case. They are evidence of what was alleged and found, not an impartial history of the movement.',
    sources:[SRC.kakori, SRC.maclean, SRC.nai], audioUrl:''
  },
  {
    id:'executions', zone:'kakori', d:60, side:'right',
    year:'1927', date:'17 and 19 December 1927', title:'The Executions',
    place:'Gonda, Gorakhpur, Faizabad and Naini (Allahabad) jails',
    involvement:'broader',
    what:'Rajendra Lahiri was hanged at Gonda on 17 December 1927. Ram Prasad Bismil was hanged at Gorakhpur, Ashfaqullah Khan at Faizabad and Roshan Singh at Naini, Allahabad, on 19 December 1927. Appeals and petitions for mercy had been refused.',
    why:'The executions ended the first HRA and turned its members into a public memory that the reorganised HSRA would draw on directly. Bismil and Ashfaqullah Khan — a Hindu and a Muslim hanged in the same cause within two days — became a fixed image of the movement.',
    note:'Sanyal was in custody, not on trial for the Kakori action. He is connected to these men as the co-founder of the organisation they belonged to, and no further.',
    sources:[SRC.kakori, SRC.ichr, SRC.bipan], audioUrl:''
  },
  {
    id:'attribution', zone:'kakori', d:72, side:'left',
    year:'—', date:'A note on attribution', title:'What This Exhibition Does Not Claim',
    place:'—',
    involvement:'context',
    what:'Sanyal\'s name is frequently attached to events he did not carry out — sometimes through confusion with Sachindra Nath Bakshi, sometimes because founding an organisation is read as authorising every later act of its members, and sometimes because popular retellings compress a decade into a paragraph.',
    why:'Overstating a life does not honour it. Sanyal\'s documented record — organiser of a pan-Indian network, founder of the HRA, author of <i>Bandi Jivan</i> and of <i>The Revolutionary</i>, twice transported for life — needs no additions.',
    note:'Every panel in this exhibition is tagged DIRECT INVOLVEMENT, BROADER EVENT or HISTORICAL CONTEXT so that the distinction stays visible while you walk.',
    sources:[SRC.maclean, SRC.kakori, SRC.ichr], audioUrl:''
  },

  /* ───────────── ZONE 5 · IMPRISONMENT ───────────── */
  {
    id:'cellular-2', zone:'prison', d:14, side:'left',
    year:'1927–1937', date:'from 1927', title:'The Second Term',
    place:'Cellular Jail, Port Blair',
    involvement:'direct',
    what:'Sanyal returned to the Andamans under his second sentence of transportation for life. Conditions in the Cellular Jail — solitary confinement, forced labour at the oil mill, restricted correspondence and poor diet — were the subject of repeated prisoner protest throughout the period.',
    why:'The second term is the part of his life least visible in the record, because the record was written by the institution holding him. What survives is largely official: jail files, petitions, medical remarks.',
    sources:[SRC.andaman, SRC.nai, SRC.bandi], audioUrl:''
  },
  {
    id:'hunger-1933', zone:'prison', d:28, side:'right',
    year:'1933', date:'1933', title:'The Cellular Jail Hunger Strikes',
    place:'Port Blair',
    involvement:'broader',
    what:'Political prisoners in the Cellular Jail conducted hunger strikes demanding recognition as political prisoners and an end to forced labour. During the strike of 1933 three prisoners died — among them Mahavir Singh, in May 1933 — and the deaths, once reported on the mainland, produced sustained public pressure on the Government.',
    why:'These strikes are the reason the Andamans penal settlement was wound down as a political prison. They are context for Sanyal\'s captivity rather than an episode attributed to him.',
    sources:[SRC.andaman, SRC.ichr, SRC.nai], audioUrl:''
  },
  {
    id:'hsra-1928', zone:'prison', d:40, side:'left',
    year:'1928', date:'8–9 September 1928', title:'The HRA becomes the HSRA',
    place:'Feroz Shah Kotla, Delhi',
    involvement:'broader',
    what:'Surviving members of the Hindustan Republican Association met at the ruins of Feroz Shah Kotla in Delhi in September 1928 and reconstituted it as the Hindustan Socialist Republican Association, adding an explicitly socialist object. Chandrashekhar Azad, Bhagat Singh, Sukhdev, Bhagwati Charan Vohra and others were present.',
    why:'The organisation Sanyal founded outlived his liberty and changed its politics without him. The HSRA — Lahore 1928, the Assembly bomb of April 1929, the hunger strikes and the executions of March 1931 — belongs to a later chapter he had no part in.',
    note:'Sanyal was imprisoned in the Andamans at this date. He was not present and had no role in the reorganisation.',
    sources:[SRC.maclean, SRC.bipan, SRC.gupta], audioUrl:''
  },
  {
    id:'repatriation', zone:'prison', d:52, side:'right',
    year:'1937–1938', date:'1937 — 1938', title:'The Andamans Political Prisoners are Brought Back',
    place:'Port Blair → mainland jails',
    involvement:'broader',
    what:'After years of hunger strikes, press campaigns and pressure from Indian legislators, the Government repatriated the political prisoners of the Cellular Jail to mainland prisons in 1937–38, effectively ending the settlement\'s use as a political penal colony.',
    why:'It is the institutional end of the punishment that shaped Sanyal\'s adult life, and it returned him — ill — to the mainland for his final years.',
    sources:[SRC.andaman, SRC.nai, SRC.bipan], audioUrl:''
  },
  {
    id:'illness', zone:'prison', d:62, side:'left',
    year:'1930s', date:'1930s — 1942', title:'Tuberculosis',
    place:'Port Blair; later Gorakhpur',
    involvement:'direct',
    what:'Sanyal contracted tuberculosis during his imprisonment in the Andamans. The disease was untreatable by any reliable means at the time and was widespread in Indian jails, where crowding, poor diet and poor ventilation made it close to endemic.',
    why:'It is the cause of his death in 1942, and it is the plainest measure of what two life sentences of transportation actually cost.',
    note:'This exhibition describes the medical and institutional facts and does not dramatise them.',
    sources:[SRC.nai, SRC.andaman, SRC.ichr], audioUrl:''
  },

  /* ───────────── ZONE 6 · WRITINGS ───────────── */
  {
    id:'writing-room', zone:'writings', d:16, side:'left',
    year:'1922–1941', date:'1922 — 1941', title:'The Written Record',
    place:'—',
    involvement:'direct',
    what:'Sanyal\'s surviving output is small and consequential: <i>Bandi Jivan</i> (1922), the manifesto <i>The Revolutionary</i> (1925), his published exchange with Gandhi, and scattered articles and letters. Between them they are the reason a man who spent so much of his adult life in cells remains readable at all.',
    why:'Organisations were broken and members were hanged; the text outlasted both. The HSRA generation encountered the earlier movement largely through what Sanyal had written about it.',
    note:'The cases in this room summarise these works and quote from them only briefly. Read the originals.',
    sources:[SRC.bandi, SRC.maclean, SRC.cwmg], audioUrl:''
  },
  {
    id:'reading-note', zone:'writings', d:52, side:'right',
    year:'—', date:'How to read these works', title:'Memoir, Manifesto, and Evidence',
    place:'—',
    involvement:'context',
    what:'<i>Bandi Jivan</i> is a memoir written for publication under colonial censorship by a participant with a case to make. <i>The Revolutionary</i> is a manifesto — a statement of intent, not a record of events. The court papers that describe the HRA were produced by a prosecution. None of these is a neutral source, and each is indispensable.',
    why:'Historical honesty about this period means reading partisan sources against one another rather than choosing one. The most useful modern scholarship does exactly that.',
    sources:[SRC.maclean, SRC.sarkar, SRC.gupta], audioUrl:''
  },

  /* ───────────── ZONE 7 · LEGACY ───────────── */
  {
    id:'death', zone:'legacy', d:16, side:'left',
    year:'1942', date:'7 February 1942', title:'Death at Gorakhpur',
    place:'Gorakhpur, United Provinces',
    involvement:'direct',
    what:'Sachindranath Sanyal died on 7 February 1942, aged 48, of the tuberculosis he had contracted in the Cellular Jail. He died in custody at Gorakhpur, months before the Quit India resolution of August 1942 and five years before independence.',
    why:'He did not live to see the republic argued for in the manifesto he wrote in 1925. His death is the end of a specific revolutionary tradition — pre-Gandhian in origin, organisational in method, and by 1942 largely superseded.',
    note:'Accounts of his final years differ on the dates of release and re-detention; that he was in custody at Gorakhpur and died there on 7 February 1942 is consistently recorded.',
    sources:[SRC.ichr, SRC.nai, SRC.bandi], audioUrl:''
  }
];

/* ─────────── Zone 3 · the network installation (relationships only) ─────────── */

const NETWORK = {
  nodes:[
    { id:'sns',    x:0.50, y:0.52, r:1.0, label:'SACHINDRA NATH SANYAL', role:'1893 — 1942 · the subject of this exhibition',
      context:'Organiser, founder of the Hindustan Republican Association, author of Bandi Jivan and of The Revolutionary; transported for life twice.',
      source:SRC.bandi },
    { id:'rbb',    x:0.26, y:0.30, label:'RASH BEHARI BOSE', role:'Closest revolutionary associate, 1913 — 1915',
      context:'Principal organiser of the north Indian underground and of the February 1915 plan; named in the Delhi–Lahore Conspiracy Case; left for Japan in May 1915.',
      source:SRC.sedition },
    { id:'anu',    x:0.13, y:0.55, label:'ANUSHILAN SAMITI', role:'Organisation Sanyal extended to Patna, c. 1913',
      context:'Founded at Calcutta in 1902 as a physical-culture society; parts of it became an underground political organisation across Bengal and Bihar.',
      source:SRC.heehs },
    { id:'ghadar', x:0.15, y:0.20, label:'GHADAR PARTY', role:'Partner organisation in the February 1915 plan',
      context:'Formed among Indian migrants in North America in 1913; its returning members were central to the attempted rising of 1915 in which Sanyal organised in the north.',
      source:SRC.bipan },
    { id:'cell',   x:0.34, y:0.79, label:'CELLULAR JAIL, PORT BLAIR', role:'Place of both of Sanyal\'s life sentences',
      context:'Completed 1906; 693 solitary cells in seven radiating wings, used chiefly for political convicts transported from the mainland. Sanyal was held there from 1916 and again from 1927.',
      source:SRC.andaman },
    { id:'bandi',  x:0.62, y:0.79, label:'BANDI JIVAN (1922)', role:'Written by Sanyal',
      context:'His memoir of the underground and of the Andamans, published in Bengali in 1922 and widely translated; the most influential revolutionary text of its decade.',
      source:SRC.bandi },
    { id:'gandhi', x:0.85, y:0.80, label:'M. K. GANDHI', role:'Public interlocutor, February 1925',
      context:'Published Sanyal\'s letter defending revolutionary methods in Young India together with his own reply rejecting them.',
      source:SRC.cwmg },
    { id:'hra',    x:0.62, y:0.30, label:'HINDUSTAN REPUBLICAN ASSOCIATION', role:'Co-founded by Sanyal, Kanpur, October 1924',
      context:'Object: a federal republic of the United States of India, to be achieved by organised armed revolution. Broken by the Kakori arrests of 1925–27.',
      source:SRC.maclean },
    { id:'bismil', x:0.76, y:0.14, label:'RAM PRASAD BISMIL', role:'Co-founder of the HRA; led the Kakori action',
      context:'Poet and organiser; sentenced to death in the Kakori Conspiracy Case and hanged at Gorakhpur on 19 December 1927.',
      source:SRC.kakori },
    { id:'jcc',    x:0.58, y:0.13, label:'JOGESH CHANDRA CHATTERJEE', role:'Co-founder of the HRA, 1924',
      context:'Present at the Kanpur founding; convicted in the Kakori Conspiracy Case and sentenced to transportation for life.',
      source:SRC.kakori },
    { id:'pg',     x:0.44, y:0.13, label:'PRATUL GANGULY', role:'Associated with the founding of the HRA',
      context:'Named in accounts of the association\'s formation alongside Sanyal and Narendra Mohan Sen.',
      source:SRC.gupta },
    { id:'ashfaq', x:0.88, y:0.24, label:'ASHFAQULLAH KHAN', role:'HRA member; Kakori participant',
      context:'Close associate of Bismil; sentenced to death in the Kakori Conspiracy Case and hanged at Faizabad on 19 December 1927.',
      source:SRC.kakori },
    { id:'lahiri', x:0.90, y:0.40, label:'RAJENDRA LAHIRI', role:'HRA member; Kakori participant',
      context:'Sentenced to death in the Kakori Conspiracy Case and hanged at Gonda on 17 December 1927.',
      source:SRC.kakori },
    { id:'roshan', x:0.80, y:0.52, label:'ROSHAN SINGH', role:'Convicted in the Kakori Conspiracy Case',
      context:'Sentenced to death and hanged at Naini, Allahabad, on 19 December 1927.',
      source:SRC.kakori },
    { id:'bakshi', x:0.70, y:0.63, label:'SACHINDRA NATH BAKSHI', role:'A DIFFERENT MAN — Kakori participant',
      context:'Took part in the Kakori action of 9 August 1925 and was sentenced to transportation for life. He is regularly and wrongly confused with Sachindra Nath SANYAL, who was already in custody and was not present.',
      source:SRC.kakori },
    { id:'mng',    x:0.55, y:0.66, label:'MANMATHNATH GUPTA', role:'HRA member; Kakori convict; later historian',
      context:'Convicted in the Kakori case; afterwards wrote extensively on the revolutionary movement — a participant\'s history rather than a neutral one.',
      source:SRC.gupta },
    { id:'azad',   x:0.74, y:0.44, label:'CHANDRASHEKHAR AZAD', role:'HRA member; later HSRA commander',
      context:'Escaped the Kakori arrests; central to the reorganisation of the HRA as the HSRA in 1928. Killed at Alfred Park, Allahabad, on 27 February 1931.',
      source:SRC.maclean },
    { id:'hsra',   x:0.86, y:0.66, label:'HSRA (1928)', role:'The HRA reconstituted — without Sanyal',
      context:'Formed at Feroz Shah Kotla, Delhi, in September 1928 with an explicitly socialist object, while Sanyal was imprisoned in the Andamans.',
      source:SRC.maclean },
    { id:'bhagat', x:0.95, y:0.58, label:'BHAGAT SINGH', role:'HSRA member; reader of Bandi Jivan',
      context:'Belonged to the organisation the HRA became. Sanyal\'s memoir is repeatedly named among the texts that shaped his generation; the two men were not organisational contemporaries.',
      source:SRC.maclean }
  ],
  links:[
    ['sns','rbb'],['sns','anu'],['sns','hra'],['sns','bandi'],['sns','cell'],['sns','gandhi'],
    ['rbb','ghadar'],['anu','ghadar'],['sns','ghadar'],
    ['hra','bismil'],['hra','jcc'],['hra','pg'],['hra','ashfaq'],['hra','lahiri'],
    ['hra','roshan'],['hra','bakshi'],['hra','mng'],['hra','azad'],['hra','hsra'],
    ['bismil','ashfaq'],['hsra','azad'],['hsra','bhagat'],['bandi','bhagat'],['cell','bandi']
  ]
};

/* ─────────── Zone 6 · the writings ─────────── */

const BOOKS = [
  {
    id:'bk-bandi', title:'BANDI JIVAN', period:'Bengali, 1922; later Hindi and other editions',
    spine:'BANDI JIVAN · 1922', colour:0x6b3a26,
    description:'Sanyal\'s account of the revolutionary underground and of imprisonment in the Andamans, written after his release under the 1920 amnesty. It moves between political argument and description of captivity, and it was written knowing the censor would read it.',
    importance:'The most widely circulated Indian revolutionary memoir of its period. It carried the pre-1915 movement to a readership that had never met it, and later revolutionaries repeatedly named it among the books that formed them.',
    source:SRC.bandi
  },
  {
    id:'bk-revolutionary', title:'THE REVOLUTIONARY', period:'Manifesto dated 1 January 1925',
    spine:'THE REVOLUTIONARY · 1925', colour:0x7a2f24,
    description:'The four-page manifesto of the Hindustan Republican Association, distributed in north Indian cities and signed pseudonymously. It argues for a federal republic of the United States of India and addresses the general reader rather than a secret membership.',
    importance:'The clearest surviving statement of HRA aims, and a document the prosecution relied on. It also marks the moment a clandestine organisation chose to argue its case in public print.',
    source:SRC.maclean
  },
  {
    id:'bk-gandhi', title:'THE YOUNG INDIA EXCHANGE', period:'February 1925',
    spine:'YOUNG INDIA · 1925', colour:0x3f4a55,
    description:'Sanyal\'s letter defending revolutionary methods and Gandhi\'s reply rejecting them, printed together in <i>Young India</i>. Both texts are reproduced in the Collected Works of Mahatma Gandhi.',
    importance:'A documented, dated argument between the constitutional-mass and revolutionary wings of the freedom struggle, conducted publicly and at length rather than through intermediaries.',
    source:SRC.cwmg
  },
  {
    id:'bk-translations', title:'TRANSLATIONS AND LATER EDITIONS', period:'1920s onward',
    spine:'EDITIONS & TRANSLATIONS', colour:0x5b4a2c,
    description:'<i>Bandi Jivan</i> passed into Hindi and other Indian languages and has been reprinted many times since. Editions differ in their arrangement, and some later printings carry added prefaces and material.',
    importance:'The translation history is the transmission history: it explains how a Bengali memoir became a north Indian revolutionary text within a few years of publication.',
    source:SRC.maclean
  },
  {
    id:'bk-records', title:'THE OFFICIAL RECORD', period:'1915 — 1938',
    spine:'CONSPIRACY CASE PAPERS', colour:0x2f3438,
    description:'Conspiracy-case judgments, Home (Political) Department files and the Sedition Committee Report of 1918 describe the same organisations from the other side. They are detailed, hostile, and often the only surviving documentation.',
    importance:'Much of what can be dated about the HRA is dateable only because a court had to prove it. Reading these against the memoirs is how the period is actually reconstructed.',
    source:SRC.sedition
  }
];

/* ─────────── Zone 7 · the legacy displays ─────────── */

const LEGACY_PANELS = [
  { id:'lg-org', title:'THE ORGANISATIONAL LINE', body:'Hindustan Republican Association, Kanpur, October 1924 → broken by the Kakori arrests of 1925–27 → reconstituted as the Hindustan Socialist Republican Association at Delhi in September 1928. Sanyal founded the first and was imprisoned during the third.', source:SRC.maclean },
  { id:'lg-text', title:'THE WRITTEN LINE', body:'Bandi Jivan (1922) and The Revolutionary (1925) outlived the organisations they came from. They are the reason the pre-1915 movement remained legible to the revolutionaries of the late 1920s.', source:SRC.bandi },
  { id:'lg-prison', title:'THE ANDAMANS', body:'Transported for life in 1916 and again from 1925. The Cellular Jail ceased to hold political prisoners after the repatriations of 1937–38 and was declared a National Memorial in 1979. Three of its seven wings survive.', source:SRC.andaman },
  { id:'lg-caution', title:'READING THIS LIFE HONESTLY', body:'Sanyal\'s record is regularly inflated by attribution errors — most often the confusion with Sachindra Nath Bakshi over Kakori. The documented life is substantial enough: organiser across four provinces, founder of the HRA, author of two texts that mattered, twice sentenced to transportation for life, dead of tuberculosis contracted in prison.', source:SRC.maclean },
  { id:'lg-sources', title:'WHERE TO READ FURTHER', body:'Start with Bandi Jivan itself, then Kama Maclean\'s A Revolutionary History of Interwar India for the HRA and Kakori, Sumit Sarkar\'s Modern India for the wider period, and the Sedition Committee Report of 1918 for the official view of 1912–15.', source:SRC.sarkar },
  { id:'lg-context', title:'WHAT CAME AFTER', body:'Sanyal died on 7 February 1942, six months before the Quit India resolution and five years before independence. The federal republic named in his 1925 manifesto was constituted in 1950.', source:SRC.bipan }
];

/* ═══════════════════════════ helpers & textures ═══════════════════════════ */

const clamp = (v,a,b)=> v<a?a:(v>b?b:v);
const lerp  = (a,b,t)=> a+(b-a)*t;
const smoothstep = t => { t = clamp(t,0,1); return t*t*(3-2*t); };
const $ = id => document.getElementById(id);

const texCache = [];

/** Draw onto a fresh canvas and hand it back — shared by the 3-D textures and
    the panel's archive plates, so a motif is only ever authored once. */
function canvasOf(w, h, draw){
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  return c;
}

function canvasTexture(w, h, draw, { srgb = true, aniso = 8 } = {}){
  const c = canvasOf(w, h, draw);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = aniso;
  t.needsUpdate = true;
  texCache.push(t);
  return t;
}

function noiseOverlay(ctx, w, h, amount, alpha){
  const img = ctx.getImageData(0,0,w,h), d = img.data;
  for (let i=0;i<d.length;i+=4){
    const n = (Math.random()-0.5)*amount;
    d[i]   = clamp(d[i]  +n,0,255);
    d[i+1] = clamp(d[i+1]+n,0,255);
    d[i+2] = clamp(d[i+2]+n,0,255);
    if (alpha) d[i+3] = clamp(d[i+3]+ (Math.random()-0.5)*alpha, 0, 255);
  }
  ctx.putImageData(img,0,0);
}

function blotches(ctx, w, h, count, colours, rMin, rMax, alpha){
  for (let i=0;i<count;i++){
    const x = Math.random()*w, y = Math.random()*h;
    const r = rMin + Math.random()*(rMax-rMin);
    const g = ctx.createRadialGradient(x,y,0,x,y,r);
    const col = colours[(Math.random()*colours.length)|0];
    g.addColorStop(0, `rgba(${col},${alpha})`);
    g.addColorStop(1, `rgba(${col},0)`);
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(x,y,r,0,Math.PI*2); ctx.fill();
  }
}

/* text layout on canvas -------------------------------------------------- */

function wrapLines(ctx, text, maxW){
  const words = String(text).split(/\s+/);
  const lines = []; let line = '';
  for (const wd of words){
    const test = line ? line+' '+wd : wd;
    if (ctx.measureText(test).width > maxW && line){ lines.push(line); line = wd; }
    else line = test;
  }
  if (line) lines.push(line);
  return lines;
}

/** Letter-spaced text that shrinks until it fits `maxW`, so long labels
    ("1905–1911") are never clipped by the edge of a decal canvas. */
function drawFitted(ctx, text, cx, y, maxW, px, spacing, weight, family){
  let size = px, sp = spacing;
  for (let i=0;i<24;i++){
    ctx.font = `${weight} ${Math.round(size)}px ${family}`;
    let total = -sp;
    for (const ch of [...String(text)]) total += ctx.measureText(ch).width + sp;
    if (total <= maxW) break;
    size *= 0.92; sp *= 0.92;
  }
  drawSpaced(ctx, text, cx, y, sp, 'center');
}

function drawSpaced(ctx, text, x, y, spacing, align='left'){
  const chars = [...String(text)];
  let total = 0;
  for (const ch of chars) total += ctx.measureText(ch).width + spacing;
  total -= spacing;
  let cx = align === 'center' ? x - total/2 : (align === 'right' ? x - total : x);
  for (const ch of chars){
    ctx.fillText(ch, cx, y);
    cx += ctx.measureText(ch).width + spacing;
  }
  return total;
}

const stripTags = s => String(s).replace(/<[^>]+>/g,'');

/* base materials --------------------------------------------------------- */

const TEX = {};

function buildTextures(){
  // aged plaster / stone wall
  TEX.plaster = canvasTexture(512,512,(x,w,h)=>{
    x.fillStyle='#6a6055'; x.fillRect(0,0,w,h);
    blotches(x,w,h,120,['122,112,98','88,79,66','104,94,80','70,63,53'],20,150,0.28);
    x.globalAlpha=.12;
    for(let i=0;i<70;i++){
      x.strokeStyle = Math.random()>.5 ? '#4a4238' : '#7f7566';
      x.lineWidth = Math.random()*1.6;
      x.beginPath();
      const y0=Math.random()*h; x.moveTo(0,y0);
      x.bezierCurveTo(w*.33,y0+(Math.random()-.5)*40,w*.66,y0+(Math.random()-.5)*40,w,y0+(Math.random()-.5)*30);
      x.stroke();
    }
    x.globalAlpha=1;
    noiseOverlay(x,w,h,26);
  });
  TEX.plaster.repeat.set(1,1);

  // cut-stone floor
  TEX.stone = canvasTexture(512,512,(x,w,h)=>{
    x.fillStyle='#4a4239'; x.fillRect(0,0,w,h);
    const tiles=4, s=w/tiles;
    for(let i=0;i<tiles;i++) for(let j=0;j<tiles;j++){
      const shade = 58 + Math.random()*26;
      x.fillStyle=`rgb(${shade+8},${shade},${shade-10})`;
      x.fillRect(i*s+2,j*s+2,s-4,s-4);
      const g=x.createLinearGradient(i*s,j*s,i*s+s,j*s+s);
      g.addColorStop(0,'rgba(255,240,215,.05)'); g.addColorStop(1,'rgba(0,0,0,.14)');
      x.fillStyle=g; x.fillRect(i*s+2,j*s+2,s-4,s-4);
    }
    blotches(x,w,h,90,['40,35,28','96,86,72'],10,70,0.3);
    noiseOverlay(x,w,h,20);
  });

  // dark wood
  TEX.wood = canvasTexture(512,512,(x,w,h)=>{
    x.fillStyle='#3a2a1a'; x.fillRect(0,0,w,h);
    for(let i=0;i<260;i++){
      const y=Math.random()*h;
      x.strokeStyle=`rgba(${20+Math.random()*70},${12+Math.random()*46},${6+Math.random()*26},${.12+Math.random()*.3})`;
      x.lineWidth=.6+Math.random()*2.6;
      x.beginPath(); x.moveTo(0,y);
      x.bezierCurveTo(w*.3,y+(Math.random()-.5)*7,w*.7,y+(Math.random()-.5)*7,w,y+(Math.random()-.5)*5);
      x.stroke();
    }
    for(let k=0;k<3;k++){
      const cx=Math.random()*w, cy=Math.random()*h;
      for(let r=3;r<34;r+=3.2){
        x.strokeStyle=`rgba(24,14,6,${.22-r*.005})`; x.lineWidth=1.2;
        x.beginPath(); x.ellipse(cx,cy,r,r*.55,Math.random(),0,Math.PI*2); x.stroke();
      }
    }
    noiseOverlay(x,w,h,14);
  });

  // parchment (panel backing)
  TEX.parchment = canvasTexture(512,512,(x,w,h)=>{
    x.fillStyle='#ddd0b0'; x.fillRect(0,0,w,h);
    blotches(x,w,h,80,['196,180,146','214,201,172','168,150,116'],20,120,0.35);
    noiseOverlay(x,w,h,16);
  });

  /* ── asphalt: dark charcoal base, visible aggregate, wheel polish, dust ── */
  TEX.asphalt = canvasTexture(512,512,(x,w,h)=>{
    x.fillStyle='#34332f'; x.fillRect(0,0,w,h);
    // aggregate
    for (let i=0;i<26000;i++){
      const r = Math.random()*1.7 + 0.3;
      const v = Math.random();
      x.fillStyle = v > 0.78 ? `rgba(126,122,112,${0.16+Math.random()*0.3})`
                  : v > 0.42 ? `rgba(72,70,65,${0.3+Math.random()*0.35})`
                             : `rgba(26,25,23,${0.25+Math.random()*0.4})`;
      x.beginPath(); x.arc(Math.random()*w, Math.random()*h, r, 0, Math.PI*2); x.fill();
    }
    // repair patches
    for (let i=0;i<5;i++){
      const px=Math.random()*w, py=Math.random()*h, pw=50+Math.random()*130, ph=40+Math.random()*110;
      x.fillStyle = `rgba(${34+Math.random()*22|0},${33+Math.random()*20|0},${30+Math.random()*18|0},.55)`;
      x.beginPath();
      x.moveTo(px,py);
      for (let k=1;k<7;k++){
        const a=k/7*Math.PI*2;
        x.lineTo(px+Math.cos(a)*pw*(0.4+Math.random()*0.2), py+Math.sin(a)*ph*(0.4+Math.random()*0.2));
      }
      x.closePath(); x.fill();
    }
    // hairline cracks
    for (let i=0;i<22;i++){
      x.strokeStyle=`rgba(18,17,16,${0.25+Math.random()*0.3})`; x.lineWidth=0.6+Math.random()*1.1;
      let cx=Math.random()*w, cy=Math.random()*h;
      x.beginPath(); x.moveTo(cx,cy);
      for (let k=0;k<6;k++){ cx+=(Math.random()-0.5)*70; cy+=(Math.random()-0.5)*70; x.lineTo(cx,cy); }
      x.stroke();
    }
    // dust drift
    blotches(x,w,h,26,['104,96,80','88,82,70'],30,150,0.10);
    noiseOverlay(x,w,h,16);
  });

  /* ── aged brick: muted terracotta / dusty clay with warm grey mortar ── */
  TEX.brick = canvasTexture(512,512,(x,w,h)=>{
    const COURSES = 16, PER = 6;
    const bh = h/COURSES, bw = w/PER, m = 2.6;
    x.fillStyle='#8a8074'; x.fillRect(0,0,w,h);          // mortar bed
    blotches(x,w,h,60,['122,114,104','96,89,80'],14,60,0.4);
    // muted terracotta and dusty clay — deliberately desaturated, never pillar-box red
    const clays = [[142,114,96],[132,106,90],[124,102,88],[148,122,104],[128,108,94],[118,96,82],[138,116,100]];
    for (let r=0;r<COURSES;r++){
      const off = (r % 2) * bw/2;                          // running bond
      for (let c=-1;c<=PER;c++){
        const bx = c*bw + off, by = r*bh;
        const cl = clays[(Math.random()*clays.length)|0];
        const j  = (Math.random()-0.5)*9;
        x.fillStyle = `rgb(${clamp(cl[0]+j,0,255)|0},${clamp(cl[1]+j,0,255)|0},${clamp(cl[2]+j,0,255)|0})`;
        x.fillRect(bx+m, by+m, bw-m*2, bh-m*2);
        // face mottling — kept weak, or every brick reads as a chequer square
        const g = x.createLinearGradient(bx,by,bx+bw,by+bh);
        g.addColorStop(0,'rgba(255,238,214,.045)'); g.addColorStop(1,'rgba(20,12,8,.085)');
        x.fillStyle=g; x.fillRect(bx+m, by+m, bw-m*2, bh-m*2);
        for (let k=0;k<7;k++){
          x.fillStyle=`rgba(${70+Math.random()*70|0},${52+Math.random()*50|0},${40+Math.random()*40|0},.10)`;
          x.beginPath();
          x.arc(bx+m+Math.random()*(bw-m*2), by+m+Math.random()*(bh-m*2), 1+Math.random()*5, 0, Math.PI*2);
          x.fill();
        }
      }
    }
    // soot / weathering wash — broad and soft, so it never reads as a tile edge
    blotches(x,w,h,22,['58,50,42','76,68,58'],70,190,0.13);
    noiseOverlay(x,w,h,12);
  });

  /* ── cut ashlar for walkway, kerb and plinth ── */
  TEX.ashlar = canvasTexture(512,512,(x,w,h)=>{
    x.fillStyle='#6e6659'; x.fillRect(0,0,w,h);
    const R=4, Cn=3, sh=h/R, sw=w/Cn;
    for (let r=0;r<R;r++) for (let c=0;c<Cn;c++){
      const off=(r%2)*sw/2, sx=c*sw+off, sy=r*sh;
      const v = 108 + Math.random()*36;
      x.fillStyle=`rgb(${v|0},${(v-6)|0},${(v-18)|0})`;
      x.fillRect(sx+3, sy+3, sw-6, sh-6);
      const g=x.createLinearGradient(sx,sy,sx+sw,sy+sh);
      g.addColorStop(0,'rgba(255,246,226,.08)'); g.addColorStop(1,'rgba(0,0,0,.20)');
      x.fillStyle=g; x.fillRect(sx+3, sy+3, sw-6, sh-6);
    }
    blotches(x,w,h,70,['62,58,50','132,124,110'],14,80,0.3);
    noiseOverlay(x,w,h,18);
  });

  /* ── damp gutter stone ── */
  TEX.gutter = canvasTexture(256,256,(x,w,h)=>{
    x.fillStyle='#413f39'; x.fillRect(0,0,w,h);
    blotches(x,w,h,80,['30,30,28','78,76,68','54,58,52'],10,60,0.45);
    for (let i=0;i<400;i++){
      x.fillStyle=`rgba(${20+Math.random()*60|0},${20+Math.random()*58|0},${18+Math.random()*50|0},.5)`;
      x.beginPath(); x.arc(Math.random()*w,Math.random()*h,0.4+Math.random()*1.6,0,Math.PI*2); x.fill();
    }
    noiseOverlay(x,w,h,22);
  });

  /* ── soft radial falloff, reused for every light pool and contact shadow ── */
  TEX.pool = canvasTexture(128,128,(c,cw,ch)=>{
    const g=c.createRadialGradient(cw/2,ch/2,0,cw/2,ch/2,cw/2);
    g.addColorStop(0,'rgba(255,255,255,1)');
    g.addColorStop(.35,'rgba(255,255,255,.55)');
    g.addColorStop(.72,'rgba(255,255,255,.14)');
    g.addColorStop(1,'rgba(255,255,255,0)');
    c.fillStyle=g; c.fillRect(0,0,cw,ch);
  },{ srgb:false });
  TEX.pool.wrapS = TEX.pool.wrapT = THREE.ClampToEdgeWrapping;

  // rough concrete / prison render
  TEX.render = canvasTexture(512,512,(x,w,h)=>{
    x.fillStyle='#4c4d4e'; x.fillRect(0,0,w,h);
    blotches(x,w,h,140,['62,64,66','40,41,43','78,80,82'],14,90,0.3);
    x.globalAlpha=.10;
    for(let i=0;i<28;i++){
      x.strokeStyle='#2a2b2c'; x.lineWidth=Math.random()*1.2;
      x.beginPath(); const sx=Math.random()*w, sy=Math.random()*h;
      x.moveTo(sx,sy); x.lineTo(sx+(Math.random()-.5)*140, sy+(Math.random()-.5)*140); x.stroke();
    }
    x.globalAlpha=1;
    noiseOverlay(x,w,h,30);
  });
}

/* ═══════════════════════════ runtime state ═══════════════════════════ */

let renderer, scene, camera, clock;
let ambient, hemi;
const lampPool = [], lampFixtures = [];
const interactables = [];
const colliders = [];
const zoneGroups = {};

const player = {
  pos: new THREE.Vector3(0, CFG.eyeHeight, -3),
  vel: new THREE.Vector3(),
  yaw: 0,                    // yaw 0 faces -Z, i.e. forward into the tunnel
  pitch: 0,
  targetYaw: 0,
  targetPitch: 0,
  ground: 0,                 // smoothed height of the road under the visitor
  speedCap: 4.15             // interpolated between walk and run
};

const state = {
  started: false,
  locked: false,
  mode: 'walk',              // walk | focusing | reading | returning | guided
  hovered: null,
  activeItem: null,
  zoneKey: 'entrance',
  muted: false,
  guideTargetD: null,
  raf: 0
};

const keys = Object.create(null);
const focusCam = {
  from: new THREE.Vector3(), to: new THREE.Vector3(),
  fromQ: new THREE.Quaternion(), toQ: new THREE.Quaternion(),
  t: 0, dur: 1.15
};

/* the corridor cross-section as a function of distance from the threshold */
function profileAt(d){
  d = clamp(d, 0, CORRIDOR_LEN);
  let i = ZONES.length - 1;
  for (let k=0;k<ZONES.length;k++){ if (d < ZONES[k].endD){ i = k; break; } }
  let hw = ZONES[i].halfW, ht = ZONES[i].height;

  const B = 11;
  for (let k=0;k<ZONES.length-1;k++){
    const b = ZONES[k].endD;
    if (Math.abs(d-b) < B){
      const t = smoothstep((d-b+B)/(2*B));
      hw = lerp(ZONES[k].halfW, ZONES[k+1].halfW, t);
      ht = lerp(ZONES[k].height, ZONES[k+1].height, t);
      break;
    }
  }
  if (d > FLARE_START){                       // open out into the rotunda
    const t = smoothstep((d-FLARE_START)/(CORRIDOR_LEN-FLARE_START));
    hw = lerp(hw, THROAT_HALFW, t);
    ht = lerp(ht, ROT_HEIGHT*0.82, t);
  }
  return { hw, ht };
}

const dOf = z => -z;                            // world z (negative) → distance
const zOf = d => -d;

/* ── the tunnel bore, as an ordered polyline round the inside ──────────────
   Walked anticlockwise from the left springing, down the left wall, across the
   roadway, up the right wall and over the arch. Traversed in that order every
   face normal comes out pointing into the tunnel, so nothing needs flipping.
   Each point carries the material band of the segment that STARTS at it.      */

function springingAt(ht){ return clamp(ht * 0.52, 2.45, 3.30); }
function wallXAt(d){ return profileAt(d).hw - SEC.wallInset; }
function roadHalfAt(d){ return Math.max(1.5, profileAt(d).hw - SEC.shoulder); }

function sectionPoints(d){
  const { hw, ht } = profileAt(d);
  const rw  = Math.max(1.5, hw - SEC.shoulder);
  const WX  = hw - SEC.wallInset;
  const SPR = springingAt(ht);
  const C   = SEC.camber, G = SEC.gutterLow, WT = SEC.walkTop, PT = SEC.plinthTop;
  const p = [];
  const add = (x,y,band) => p.push({ x, y, band });

  add(-WX, SPR, BAND.WALL);
  add(-WX, 1.55, BAND.WALL);
  add(-WX, PT,   BAND.PLINTH);
  add(-WX, 0.26, BAND.WALK);
  add(-(WX-0.07), WT, BAND.WALK);
  add(-(rw+0.42), WT-0.02, BAND.CURB);
  add(-(rw+0.40), 0.02, BAND.GUTTER);
  add(-(rw+0.30), G,    BAND.GUTTER);
  add(-(rw+0.12), G+0.05, BAND.GUTTER);
  add(-rw, 0.0, BAND.ROAD);
  add(-rw*0.55, C*0.62, BAND.ROAD);
  add(0, C, BAND.ROAD);
  add(rw*0.55, C*0.62, BAND.ROAD);
  add(rw, 0.0, BAND.GUTTER);
  add(rw+0.12, G+0.05, BAND.GUTTER);
  add(rw+0.30, G,      BAND.GUTTER);
  add(rw+0.40, 0.02,   BAND.CURB);
  add(rw+0.42, WT-0.02, BAND.WALK);
  add(WX-0.07, WT, BAND.WALK);
  add(WX, 0.26, BAND.PLINTH);
  add(WX, PT,   BAND.WALL);
  add(WX, 1.55, BAND.WALL);
  add(WX, SPR,  BAND.ARCH);
  for (let k=1; k<=SEC.archSegs; k++){
    const phi = (k/SEC.archSegs) * Math.PI;      // right springing → crown → left springing
    add(WX*Math.cos(phi), SPR + (ht-SPR)*Math.sin(phi), k === SEC.archSegs ? -1 : BAND.ARCH);
  }
  return p;
}

/** Height of the walking surface at (x, d) — camber, gutter dip and kerb step. */
function surfaceYAt(x, d){
  const pts = sectionPoints(clamp(d, 0, CORRIDOR_LEN));
  // only the floor half of the loop matters: indices 3 .. 19
  for (let i=3; i<19; i++){
    const a = pts[i], b = pts[i+1];
    const lo = Math.min(a.x,b.x), hi = Math.max(a.x,b.x);
    if (x >= lo && x <= hi){
      const t = Math.abs(b.x-a.x) < 1e-5 ? 0 : (x-a.x)/(b.x-a.x);
      return a.y + (b.y-a.y)*t;
    }
  }
  return 0;
}

function zoneAtD(d){
  for (const z of ZONES) if (d < z.endD) return z;
  return ZONES[ZONES.length-1];
}

/* absolute distance of an event marker */
for (const ev of TIMELINE){
  const z = ZONES.find(q => q.key === ev.zone);
  ev.absD = z.startD + ev.d;
}

/* ═══════════════════════════ geometry builders ═══════════════════════════ */

/**
 * A quad strip swept along the corridor. `fn(d)` returns the two edge points
 * (a,b) plus their UVs and an optional vertex colour. Winding a→b→next is
 * what decides which way the surface faces.
 */
function quadStrip(dStart, dEnd, step, fn){
  const pos = [], uv = [], col = [], idx = [];
  const n = Math.max(2, Math.ceil((dEnd - dStart)/step) + 1);
  let hasCol = false;
  for (let i=0;i<n;i++){
    const d = dStart + (dEnd - dStart) * (i/(n-1));
    const s = fn(d);
    pos.push(s.a.x,s.a.y,s.a.z, s.b.x,s.b.y,s.b.z);
    uv.push(s.ua,s.va, s.ub,s.vb);
    if (s.col){ hasCol = true; col.push(s.col.r,s.col.g,s.col.b, s.col.r,s.col.g,s.col.b); }
    if (i < n-1){ const k = i*2; idx.push(k,k+1,k+2, k+1,k+3,k+2); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos,3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv,2));
  if (hasCol) g.setAttribute('color', new THREE.Float32BufferAttribute(col,3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

const evalP = (v,p) => (typeof v === 'function' ? v(p) : v);

/** A decorative band running along one wall. Rendered double-sided. */
function bandGeom(side, insetA, yA, insetB, yB, uvScale, d0=0, d1=CORRIDOR_LEN){
  return quadStrip(d0, d1, 2.5, d => {
    const p = profileAt(d), z = zOf(d);
    const ax = side*(p.hw - evalP(insetA,p)), ay = evalP(yA,p);
    const bx = side*(p.hw - evalP(insetB,p)), by = evalP(yB,p);
    const u = d/uvScale;
    return { a:new THREE.Vector3(ax,ay,z), b:new THREE.Vector3(bx,by,z),
             ua:u, va:0, ub:u, vb:Math.hypot(bx-ax, by-ay)/uvScale };
  });
}

function mat(opts){ return new THREE.MeshStandardMaterial(opts); }

/** Bake a pile of repeated props into a single draw call. */
function mergeInto(parent, geos, material){
  if (!geos.length) return null;
  const m = new THREE.Mesh(mergeGeometries(geos, false), material);
  parent.add(m);
  for (const g of geos) g.dispose();
  return m;
}

/** Give a geometry a flat vertex colour so many of them can share one material. */
function tint(geo, hex){
  const n = geo.attributes.position.count;
  const c = new THREE.Color(hex), arr = new Float32Array(n*3);
  for (let i=0;i<n;i++){ arr[i*3]=c.r; arr[i*3+1]=c.g; arr[i*3+2]=c.b; }
  geo.setAttribute('color', new THREE.Float32BufferAttribute(arr,3));
  return geo;
}

/* ═══════════════════════════ scene ═══════════════════════════ */

function initScene(){
  const canvas = $('scene');
  renderer = new THREE.WebGLRenderer({ canvas, antialias:true, powerPreference:'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, CFG.maxPixelRatio));
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = false;          // fake contact shadows instead

  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x080706);
  scene.fog = new THREE.FogExp2(0x0a0908, CFG.fogDensity);

  // far plane sits where the fog has already taken everything to black
  camera = new THREE.PerspectiveCamera(CFG.fov, window.innerWidth/window.innerHeight, 0.08, 200);
  camera.position.copy(player.pos);
  camera.rotation.order = 'YXZ';

  clock = new THREE.Clock();

  for (const z of ZONES) zoneGroups[z.key] = new THREE.Group();
  Object.values(zoneGroups).forEach(g => scene.add(g));

  window.addEventListener('resize', onResize);
}

function onResize(){
  if (!renderer) return;
  camera.aspect = window.innerWidth/window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, CFG.maxPixelRatio));
  renderer.setSize(window.innerWidth, window.innerHeight, false);
}

/* ═══════════════════════════ lighting ═══════════════════════════ */

function createLighting(){
  ambient = new THREE.AmbientLight(0x8f8878, 0.46);
  scene.add(ambient);

  // ground colour is deliberately warm and not dark: it is what lights the vault,
  // whose faces all point downward into the bore.
  hemi = new THREE.HemisphereLight(0x968a76, 0x5c5244, 0.34);
  scene.add(hemi);

  // eight pooled point lights follow the visitor and snap to the nearest lanterns
  for (let i=0;i<8;i++){
    const l = new THREE.PointLight(0xffcf94, 0, 26, 2.0);
    scene.add(l);
    lampPool.push(l);
  }

  /* Period wall lantern: iron bracket, tapered glass box, finial.
     Everything merges per zone, so a hundred lanterns cost four draw calls. */
  const armGeo    = new THREE.BoxGeometry(0.34, 0.055, 0.055);
  const stayGeo   = new THREE.BoxGeometry(0.24, 0.045, 0.045).rotateZ(-0.7);
  const capGeo    = new THREE.ConeGeometry(0.19, 0.16, 4).rotateY(Math.PI/4);
  const hoodGeo   = new THREE.CylinderGeometry(0.155, 0.115, 0.06, 4).rotateY(Math.PI/4);
  const baseGeo   = new THREE.CylinderGeometry(0.115, 0.145, 0.05, 4).rotateY(Math.PI/4);
  const finialGeo = new THREE.SphereGeometry(0.038, 8, 6);
  const glassGeo  = new THREE.CylinderGeometry(0.115, 0.088, 0.26, 4).rotateY(Math.PI/4);
  const plateGeo  = new THREE.BoxGeometry(0.05, 0.34, 0.22);

  const ironMat = mat({ color:0x25201a, roughness:0.5, metalness:0.72 });
  const poolMatCache = {};

  for (const zone of ZONES){
    const glassMat = new THREE.MeshBasicMaterial({ color:zone.lamp, toneMapped:false, fog:true });
    const poolMat = poolMatCache[zone.lamp] || (poolMatCache[zone.lamp] = new THREE.MeshBasicMaterial({
      map:TEX.pool, color:zone.lamp, transparent:true, opacity:0.15,
      blending:THREE.AdditiveBlending, depthWrite:false, toneMapped:false, side:THREE.DoubleSide
    }));

    const vaultMat = new THREE.MeshBasicMaterial({
      map:TEX.pool, color:zone.lamp, transparent:true, opacity:0.055,
      blending:THREE.AdditiveBlending, depthWrite:false, toneMapped:false, side:THREE.DoubleSide
    });
    const iron = [], glass = [], pools = [], vaultPools = [];
    let flip = 0;
    for (let dBase = zone.startD + zone.lampGap*0.5; dBase < zone.endD; dBase += zone.lampGap*0.5){
      const side = (flip++ % 2) ? 1 : -1;                   // staggered, left then right

      /* A lantern hangs 40 cm off the wall, right across the top of a poster.
         Slide it along the wall until it is clear; if this whole bay is taken
         by an exhibit, skip the fitting rather than bury the poster behind it. */
      const { ht: ht0 } = profileAt(dBase);
      const y0 = springingAt(ht0) - 0.42;
      const d = findWallSlot(side, dBase, 0.55, y0 - 0.30, y0 + 0.42,
                             zone.startD + 0.8, zone.endD - 0.8, 3.6);
      if (d === null) continue;

      const { ht } = profileAt(d);
      const WX = wallXAt(d);
      const y  = springingAt(ht) - 0.42;
      claimWall(side, d, 0.55, y - 0.30, y + 0.42, 'lantern');
      const xw = side * WX;                                  // wall face
      const xl = side * (WX - 0.40);                         // lantern body
      const z  = zOf(d);

      iron.push(plateGeo.clone().translate(xw - side*0.02, y + 0.02, z));
      iron.push(armGeo.clone().translate(xw - side*0.19, y + 0.15, z));
      iron.push(stayGeo.clone().translate(xw - side*0.12, y - 0.06, z));
      iron.push(hoodGeo.clone().translate(xl, y + 0.10, z));
      iron.push(capGeo.clone().translate(xl, y + 0.20, z));
      iron.push(baseGeo.clone().translate(xl, y - 0.19, z));
      iron.push(finialGeo.clone().translate(xl, y + 0.30, z));
      glass.push(glassGeo.clone().translate(xl, y - 0.04, z));

      // wall wash behind the lantern
      pools.push(new THREE.PlaneGeometry(3.4, 3.2)
        .rotateY(side < 0 ? Math.PI/2 : -Math.PI/2)
        .translate(side*(WX - 0.03), y - 0.45, z));
      // pool on the carriageway below it
      pools.push(new THREE.PlaneGeometry(4.6, 6.4)
        .rotateX(-Math.PI/2)
        .translate(side*(roadHalfAt(d)*0.62), 0.03, z));
      // faint wash carried up onto the vault so the arch never goes to black
      const SPR = springingAt(ht);
      vaultPools.push(new THREE.PlaneGeometry(5.6, 5.0)
        .rotateX(Math.PI/2)
        .rotateZ(side < 0 ? -0.72 : 0.72)
        .translate(side*(WX*0.58), SPR + (ht - SPR)*0.55, z));

      lampFixtures.push({
        pos:new THREE.Vector3(xl - side*0.05, y - 0.05, z),
        colour:new THREE.Color(zone.lamp), power:zone.lampI, d
      });
    }
    mergeInto(zoneGroups[zone.key], iron, ironMat);
    mergeInto(zoneGroups[zone.key], glass, glassMat);
    mergeInto(zoneGroups[zone.key], pools, poolMat);
    mergeInto(zoneGroups[zone.key], vaultPools, vaultMat);
  }

  // rotunda: a ring of wall fixtures plus a soft wash off the oculus
  for (let i=0;i<10;i++){
    const a = (i/10)*Math.PI*2;
    lampFixtures.push({
      pos:new THREE.Vector3(Math.sin(a)*(ROT_RADIUS-2.2), 4.2, ROT_CENTER_Z + Math.cos(a)*(ROT_RADIUS-2.2)),
      colour:new THREE.Color(0xfff0d6), power:30, d:CORRIDOR_LEN + 12
    });
  }
  lampFixtures.push({ pos:new THREE.Vector3(0, ROT_HEIGHT + 1.2, ROT_CENTER_Z),
                      colour:new THREE.Color(0xfff6e4), power:120, d:CORRIDOR_LEN + 12 });
  // the daylight beyond the portal, as a light rather than just a bright quad
  const dayLight = new THREE.DirectionalLight(0xf4ead4, 0.55);
  dayLight.position.set(0, 6, BACK_WALL_Z + 12);
  dayLight.target.position.set(0, 0, -14);
  scene.add(dayLight, dayLight.target);
}

/* ── airborne dust ────────────────────────────────────────────────────
   One Points cloud that follows the visitor, so a few hundred motes cover the
   whole tunnel. Additive and depth-tested, no sorting, negligible cost.    */
let dust = null;
function createDust(){
  const N = 420, R = 16;
  const pos = new Float32Array(N*3), seed = new Float32Array(N);
  for (let i=0;i<N;i++){
    pos[i*3]   = (Math.random()-0.5)*R*1.4;
    pos[i*3+1] = Math.random()*4.2 + 0.3;
    pos[i*3+2] = (Math.random()-0.5)*R*2.4;
    seed[i] = Math.random()*Math.PI*2;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos,3));
  dust = new THREE.Points(g, new THREE.PointsMaterial({
    map: TEX.pool, color: 0xffe6bd, size: 0.055, sizeAttenuation: true,
    transparent: true, opacity: 0.30, depthWrite: false,
    blending: THREE.AdditiveBlending, toneMapped: false
  }));
  dust.frustumCulled = false;
  dust.userData = { seed, base: pos.slice(), R };
  scene.add(dust);
}

function updateDust(t){
  if (!dust) return;
  const { seed, base, R } = dust.userData;
  const p = dust.geometry.attributes.position;
  // keep the cloud centred on the visitor, wrapping motes as they fall behind
  dust.position.set(
    Math.round(camera.position.x / (R*1.4)) * (R*1.4),
    0,
    Math.round(camera.position.z / (R*2.4)) * (R*2.4)
  );
  for (let i=0;i<seed.length;i++){
    p.array[i*3]     = base[i*3]     + Math.sin(t*0.21 + seed[i]) * 0.5;
    p.array[i*3 + 1] = base[i*3 + 1] + Math.sin(t*0.13 + seed[i]*1.7) * 0.28;
    p.array[i*3 + 2] = base[i*3 + 2] + Math.cos(t*0.17 + seed[i]) * 0.5;
  }
  p.needsUpdate = true;
}

/** Move the pooled lights onto the fixtures nearest the visitor. */
function updateLampPool(){
  // true 3-D distance, not just along the tunnel: inside the rotunda the ring
  // fixtures are off to the sides, and a z-only metric never picked them.
  const near = [];
  const cx = camera.position.x, cy = camera.position.y, cz = camera.position.z;
  for (const f of lampFixtures){
    const dx = f.pos.x-cx, dy = f.pos.y-cy, dz = f.pos.z-cz;
    const d2 = dx*dx + dy*dy + dz*dz;
    if (d2 < 34*34) near.push({ f, d:Math.sqrt(d2) });
  }
  near.sort((a,b)=> a.d - b.d);
  for (let i=0;i<lampPool.length;i++){
    const l = lampPool[i], n = near[i];
    if (!n){ l.intensity = 0; continue; }
    l.position.copy(n.f.pos);
    l.color.copy(n.f.colour);
    l.intensity = n.f.power * clamp(1 - n.d/36, 0, 1);
  }
}

/* ═══════════════════════════ the tunnel ═══════════════════════════ */

/* Materials for the seven bands of the bore. Vertex colours carry the grime
   gradient (dirtier low down) so one texture serves the whole wall height. */
const BAND_MAT = {}, BAND_UV = {
  [BAND.ROAD]:4.2, [BAND.GUTTER]:1.0, [BAND.CURB]:0.9,
  [BAND.WALK]:1.1, [BAND.PLINTH]:1.2, [BAND.WALL]:1.5, [BAND.ARCH]:1.5
};

function buildBandMaterials(){
  BAND_MAT[BAND.ROAD]   = mat({ map:TEX.asphalt, color:0xb4b2ac, roughness:0.97, metalness:0.0, vertexColors:true });
  BAND_MAT[BAND.GUTTER] = mat({ map:TEX.gutter,  color:0xa6a49c, roughness:0.72, metalness:0.02, vertexColors:true });
  BAND_MAT[BAND.CURB]   = mat({ map:TEX.ashlar,  color:0xa9a294, roughness:0.86, metalness:0.0, vertexColors:true });
  BAND_MAT[BAND.WALK]   = mat({ map:TEX.ashlar,  color:0x9e9789, roughness:0.9,  metalness:0.0, vertexColors:true });
  BAND_MAT[BAND.PLINTH] = mat({ map:TEX.ashlar,  color:0x7d776c, roughness:0.92, metalness:0.0, vertexColors:true });
  BAND_MAT[BAND.WALL]   = mat({ map:TEX.brick,   color:0x8b8377, roughness:0.94, metalness:0.0, vertexColors:true });
  BAND_MAT[BAND.ARCH]   = mat({ map:TEX.brick,   color:0x7f786d, roughness:0.95, metalness:0.0, vertexColors:true });
}

/** How dirty/dark a point on the bore is — low walls and gutters take the grime.
    The `d` term is a slow pseudo-random drift that breaks up texture tiling, so
    the same 1.2 m brick tile never reads as a repeating checker down the bore. */
function grimeAt(y, band, d){
  if (band === BAND.ROAD) return lerp(0.92, 1.06, hash1(d * 0.031));
  const t = smoothstep((y + 0.25) / 1.5);            // 0 at the gutter, 1 by ~1.25 m
  let g = lerp(0.52, 1.06, t);
  if (band === BAND.ARCH) g *= 0.94;                 // vault keeps its own soot
  const drift = hash1(d * 0.047) * 0.30 + hash1(d * 0.0113 + 7.3) * 0.22;
  return g * (0.84 + drift);
}

/** Cheap deterministic 1-D value noise, smoothed. */
function hash1(x){
  const i = Math.floor(x), f = x - i;
  const r = n => { const s = Math.sin(n * 127.1) * 43758.5453; return s - Math.floor(s); };
  return lerp(r(i), r(i+1), f*f*(3-2*f));
}

function createTunnel(){
  buildBandMaterials();

  const STEP = 2.0;
  const rows = [], ds = [];
  for (let d = 0; d <= CORRIDOR_LEN + 0.001; d += STEP){
    const dd = Math.min(d, CORRIDOR_LEN);
    ds.push(dd); rows.push(sectionPoints(dd));
  }
  const nPts = rows[0].length;

  // cumulative arc length across each section, so textures never stretch
  const arc = rows.map(pts => {
    const a = [0];
    for (let i=1;i<nPts;i++) a.push(a[i-1] + Math.hypot(pts[i].x-pts[i-1].x, pts[i].y-pts[i-1].y));
    return a;
  });

  const buckets = {};
  for (const k of Object.values(BAND)) buckets[k] = { pos:[], uv:[], col:[], idx:[], n:0 };

  for (let s = 0; s < nPts-1; s++){
    const band = rows[0][s].band;
    if (band < 0) continue;
    const B = buckets[band], uvS = BAND_UV[band];
    const base = B.n;
    for (let r = 0; r < rows.length; r++){
      const z = zOf(ds[r]);
      const a = rows[r][s], b = rows[r][s+1];
      B.pos.push(a.x,a.y,z, b.x,b.y,z);
      B.uv.push(arc[r][s]/uvS, ds[r]/uvS, arc[r][s+1]/uvS, ds[r]/uvS);
      const ga = grimeAt(a.y, band, ds[r]), gb = grimeAt(b.y, band, ds[r]);
      B.col.push(ga,ga,ga, gb,gb,gb);
      if (r < rows.length-1){ const k = base + r*2; B.idx.push(k,k+1,k+2, k+1,k+3,k+2); }
    }
    B.n += rows.length*2;
  }

  for (const key of Object.values(BAND)){
    const B = buckets[key];
    if (!B.pos.length) continue;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(B.pos,3));
    g.setAttribute('uv',       new THREE.Float32BufferAttribute(B.uv,2));
    g.setAttribute('color',    new THREE.Float32BufferAttribute(B.col,3));
    g.setIndex(B.idx);
    g.computeVertexNormals();
    scene.add(new THREE.Mesh(g, BAND_MAT[key]));
  }

  createRibs();
  createPortal();
  createRotunda();
}

/* ── repeating masonry ribs, so the bore never reads as one smooth pipe ── */
function createRibs(){
  const RIB_HALF = 0.26, OUT = 0.17;
  const batch = {};
  for (const z of ZONES) batch[z.key] = [];

  for (let dBase = 9; dBase < CORRIDOR_LEN - 3; dBase += 9){
    // A rib stands 17 cm proud of the wall and would cut straight through any
    // poster it met. Shift it clear, or drop it for this bay. The loop counter
    // is never moved, so one nudge cannot cascade down the tunnel.
    let d = dBase, blocked = false;
    for (const side of [-1, 1]){
      if (wallFree(side, d, RIB_HALF + 0.05, 0.2, 3.4, 0.06)) continue;
      const alt = findWallSlot(side, d, RIB_HALF + 0.05, 0.2, 3.4,
                               dBase - 3.0, dBase + 3.0, 3.0);
      if (alt === null){ blocked = true; break; }
      d = alt;
    }
    if (blocked) continue;
    const key = zoneAtD(d).key;
    for (const side of [-1, 1]) claimWall(side, d, RIB_HALF + 0.05, 0.2, 3.4, 'rib');
    const base = sectionPoints(d);
    const n = base.length;

    // inward offsets along the 2-D section normal
    const off = base.map((p,i) => {
      const a = base[Math.max(i-1,0)], b = base[Math.min(i+1,n-1)];
      const tx = b.x-a.x, ty = b.y-a.y, L = Math.hypot(tx,ty) || 1;
      return { x: p.x + (-ty/L)*OUT, y: p.y + (tx/L)*OUT };
    });

    const pos = [], uv = [], idx = [];
    let v = 0;
    const quad = (p0,p1,p2,p3, u0,u1) => {           // p0-p1 near edge, p2-p3 far
      pos.push(p0.x,p0.y,p0.z, p1.x,p1.y,p1.z, p2.x,p2.y,p2.z, p3.x,p3.y,p3.z);
      uv.push(u0,0, u1,0, u0,1, u1,1);
      idx.push(v,v+1,v+2, v+1,v+3,v+2); v += 4;
    };
    const P = (x,y,z) => ({x,y,z});
    const zN = zOf(d - RIB_HALF), zF = zOf(d + RIB_HALF);

    for (let i=0;i<n-1;i++){
      const band = base[i].band;
      if (band !== BAND.WALL && band !== BAND.ARCH && band !== BAND.PLINTH) continue;
      const u0 = i*0.34, u1 = (i+1)*0.34;
      // inner face
      quad(P(off[i].x,off[i].y,zN), P(off[i+1].x,off[i+1].y,zN),
           P(off[i].x,off[i].y,zF), P(off[i+1].x,off[i+1].y,zF), u0, u1);
      // the two cheeks back to the bore
      quad(P(base[i].x,base[i].y,zN), P(base[i+1].x,base[i+1].y,zN),
           P(off[i].x,off[i].y,zN),  P(off[i+1].x,off[i+1].y,zN), u0, u1);
      quad(P(off[i].x,off[i].y,zF),  P(off[i+1].x,off[i+1].y,zF),
           P(base[i].x,base[i].y,zF), P(base[i+1].x,base[i+1].y,zF), u0, u1);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos,3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv,2));
    g.setIndex(idx);
    g.computeVertexNormals();
    batch[key].push(g);
  }

  const ribMat = mat({ map:TEX.ashlar, color:0x8d8578, roughness:0.9, side:THREE.DoubleSide });
  for (const z of ZONES) mergeInto(zoneGroups[z.key], batch[z.key], ribMat);
}

/* ── the masonry portal behind the visitor, with daylight beyond it ── */
function createPortal(){
  const pts = sectionPoints(0);
  const { ht } = profileAt(0);

  // outer face: a big stone wall with the bore cut out of it
  const shape = new THREE.Shape();
  const HW = 16, HH = 11;
  shape.moveTo(-HW, -1.2); shape.lineTo(HW, -1.2); shape.lineTo(HW, HH); shape.lineTo(-HW, HH);
  const hole = new THREE.Path();
  hole.moveTo(pts[0].x, pts[0].y);
  for (let i=1;i<pts.length;i++) hole.lineTo(pts[i].x, pts[i].y);
  hole.closePath();
  shape.holes.push(hole);

  const faceGeo = new THREE.ShapeGeometry(shape, 24);
  faceGeo.computeBoundingBox();
  const bb = faceGeo.boundingBox;
  const uvAttr = faceGeo.attributes.uv, posAttr = faceGeo.attributes.position;
  for (let i=0;i<uvAttr.count;i++){
    uvAttr.setXY(i, (posAttr.getX(i)-bb.min.x)/1.2, (posAttr.getY(i)-bb.min.y)/1.2);
  }

  const face = new THREE.Mesh(faceGeo,
    mat({ map:TEX.brick, color:0x968d80, roughness:0.95, side:THREE.DoubleSide }));
  face.position.z = BACK_WALL_Z;
  scene.add(face);

  // voussoir arch ring around the opening
  const ring = [];
  for (let i=0;i<pts.length-1;i++){
    if (pts[i].band !== BAND.ARCH && pts[i].band !== BAND.WALL) continue;
    const a = pts[i], b = pts[i+1];
    const cx = (a.x+b.x)/2, cy = (a.y+b.y)/2;
    const len = Math.hypot(b.x-a.x, b.y-a.y);
    const ang = Math.atan2(b.y-a.y, b.x-a.x);
    ring.push(new THREE.BoxGeometry(len*1.06, 0.46, 0.5)
      .rotateZ(ang).translate(cx - Math.sin(ang)*-0.23, cy + Math.cos(ang)*-0.23, BACK_WALL_Z + 0.24));
  }
  mergeInto(scene, ring, mat({ map:TEX.ashlar, color:0x9c9284, roughness:0.86 }));

  // impost band + coping
  for (const sx of [-1,1]){
    const imp = box(0.9, 0.3, 0.7, mat({ map:TEX.ashlar, color:0x9c9284, roughness:0.86 }));
    imp.position.set(sx*(profileAt(0).hw - SEC.wallInset + 0.1), springingAt(ht), BACK_WALL_Z + 0.2);
    scene.add(imp);
  }
  const coping = box(HW*2, 0.5, 0.9, mat({ map:TEX.ashlar, color:0x9c9284, roughness:0.86 }));
  coping.position.set(0, HH - 0.2, BACK_WALL_Z + 0.25);
  scene.add(coping);

  /* Daylight beyond the portal — the present day, which the visitor is walking
     away from. Deliberately NOT a flat white rectangle: it tone-maps like the
     rest of the scene and carries a graded sky-to-ground wash, so the opening
     reads as an outside rather than a hole punched in the render. */
  const skyTex = canvasTexture(64, 256, (x,w,h)=>{
    const g = x.createLinearGradient(0,0,0,h);
    g.addColorStop(0.00,'#c9d2da');            // pale sky at the top
    g.addColorStop(0.46,'#c2bfb2');
    g.addColorStop(0.68,'#a89e88');            // haze along the horizon
    g.addColorStop(1.00,'#7d7261');            // ground beyond the portal
    x.fillStyle=g; x.fillRect(0,0,w,h);
    noiseOverlay(x,w,h,10);
  });
  skyTex.wrapS = skyTex.wrapT = THREE.ClampToEdgeWrapping;

  const day = new THREE.Mesh(new THREE.PlaneGeometry(44, 26),
    new THREE.MeshBasicMaterial({ map:skyTex, fog:false }));
  day.position.set(0, 7, BACK_WALL_Z + 15);
  day.rotation.y = Math.PI;
  scene.add(day);

  // soft bloom around the opening rather than a hard clipped edge
  const dayGlow = new THREE.Mesh(new THREE.PlaneGeometry(22, 17),
    new THREE.MeshBasicMaterial({ map:TEX.pool, color:0xe8dcc2, transparent:true, opacity:0.30,
      blending:THREE.AdditiveBlending, depthWrite:false, fog:false }));
  dayGlow.position.set(0, 3.0, BACK_WALL_Z + 2.6);
  dayGlow.rotation.y = Math.PI;
  scene.add(dayGlow);

  const plaque = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 1.75),
    new THREE.MeshBasicMaterial({ map: entranceTexture(), transparent:true, toneMapped:false }));
  plaque.position.set(0, springingAt(ht) + 1.5, BACK_WALL_Z + 0.5);
  plaque.rotation.y = Math.PI;
  scene.add(plaque);
}

function createRotunda(){
  const g = zoneGroups.legacy;
  const openHalf = Math.atan2(THROAT_HALFW, 11);          // angular half-width of the mouth

  const wall = new THREE.Mesh(
    new THREE.CylinderGeometry(ROT_RADIUS, ROT_RADIUS, ROT_HEIGHT, 72, 1, true,
      openHalf, Math.PI*2 - openHalf*2),
    mat({ map:TEX.plaster, color:0x8b8274, roughness:0.92, side:THREE.DoubleSide })
  );
  wall.material.map = TEX.plaster.clone();
  wall.material.map.wrapS = wall.material.map.wrapT = THREE.RepeatWrapping;
  wall.material.map.repeat.set(14, 3);
  wall.material.map.colorSpace = THREE.SRGBColorSpace;
  wall.position.set(0, ROT_HEIGHT/2, ROT_CENTER_Z);
  g.add(wall);

  const floorTex = TEX.stone.clone();
  floorTex.wrapS = floorTex.wrapT = THREE.RepeatWrapping;
  floorTex.repeat.set(10,10);
  floorTex.colorSpace = THREE.SRGBColorSpace;
  const floor = new THREE.Mesh(
    new THREE.CircleGeometry(ROT_RADIUS, 72),
    mat({ map:floorTex, color:0x8a8175, roughness:0.84 })
  );
  floor.rotation.x = -Math.PI/2;
  floor.position.set(0, 0.002, ROT_CENTER_Z);
  g.add(floor);

  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(ROT_RADIUS, 64, 24, 0, Math.PI*2, 0, Math.PI/2),
    mat({ map:TEX.plaster, color:0x453d33, roughness:0.96, side:THREE.BackSide })
  );
  dome.position.set(0, ROT_HEIGHT, ROT_CENTER_Z);
  dome.scale.y = 0.44;
  g.add(dome);

  // oculus glow
  const oculus = new THREE.Mesh(
    new THREE.CircleGeometry(2.6, 48),
    new THREE.MeshBasicMaterial({ color:0xfff2da, transparent:true, opacity:0.5 })
  );
  oculus.rotation.x = Math.PI/2;
  oculus.position.set(0, ROT_HEIGHT + ROT_RADIUS*0.42 - 0.15, ROT_CENTER_Z);
  g.add(oculus);

  // wainscot ring + cornice ring
  const ringMat = mat({ map:TEX.wood, color:0x7d6a4e, roughness:0.62 });
  const wainscot = new THREE.Mesh(
    new THREE.CylinderGeometry(ROT_RADIUS-0.05, ROT_RADIUS-0.05, 1.2, 72, 1, true, openHalf, Math.PI*2-openHalf*2),
    ringMat
  );
  wainscot.material.side = THREE.DoubleSide;
  wainscot.position.set(0, 0.6, ROT_CENTER_Z);
  g.add(wainscot);

  const cornice = new THREE.Mesh(
    new THREE.TorusGeometry(ROT_RADIUS-0.12, 0.13, 8, 80),
    mat({ color:0x6a5a3a, roughness:0.4, metalness:0.55 })
  );
  cornice.rotation.x = Math.PI/2;
  cornice.position.set(0, ROT_HEIGHT-0.5, ROT_CENTER_Z);
  g.add(cornice);

  // the corridor mouth is shorter than the rotunda wall — close the gap above it
  const mouthTop = ROT_HEIGHT*0.82;
  const filler = new THREE.Mesh(
    new THREE.PlaneGeometry(THROAT_HALFW*2 + 0.4, ROT_HEIGHT - mouthTop + 0.1),
    mat({ map:TEX.plaster, color:0x6f6759, roughness:0.94, side:THREE.DoubleSide })
  );
  filler.position.set(0, (ROT_HEIGHT + mouthTop)/2, zOf(CORRIDOR_LEN) + 0.02);
  g.add(filler);
}

function entranceTexture(){
  // an opaque stone tablet — it has to read against the daylight behind the portal
  return canvasTexture(768, 396, (x,w,h)=>{
    x.fillStyle = '#4b463d'; x.fillRect(0,0,w,h);
    blotches(x,w,h,60,['92,86,76','44,40,34'],20,120,0.5);
    noiseOverlay(x,w,h,16);
    x.strokeStyle = 'rgba(214,196,150,.5)'; x.lineWidth = 3; x.strokeRect(18,18,w-36,h-36);
    x.fillStyle = '#e2d4ac';
    x.textAlign = 'center';
    x.font = '600 30px Georgia, serif';
    drawSpaced(x, 'THE PRESENT DAY', w/2, 108, 10, 'center');
    x.strokeStyle = 'rgba(214,196,150,.45)'; x.lineWidth = 1;
    x.beginPath(); x.moveTo(w*0.22,142); x.lineTo(w*0.78,142); x.stroke();
    x.fillStyle = 'rgba(226,212,172,.78)';
    x.font = '22px Georgia, serif';
    x.fillText('The road runs forward through time.', w/2, 194);
    x.fillText('1893 lies ahead. Walk on.', w/2, 232);
    x.fillStyle = 'rgba(214,196,150,.5)';
    x.font = '600 15px Helvetica, Arial, sans-serif';
    drawSpaced(x, 'HISTORICALLY INSPIRED RECONSTRUCTION', w/2, 300, 3.4, 'center');
  });
}

/* ═══════════════════════ the floor timeline ═══════════════════════ */

/** A decal that follows the road camber instead of floating flat above it. */
function roadStrip(d0, d1, xFn, halfW, opts){
  const step = opts.step || 1.2;
  const geo = quadStrip(d0, d1, step, d => {
    const cx = xFn(d), z = zOf(d);
    const t = (d - d0) / (d1 - d0);
    const v = opts.vRepeat ? t * opts.vRepeat : t;
    const y0 = surfaceYAt(cx - halfW, d) + 0.007;
    const y1 = surfaceYAt(cx + halfW, d) + 0.007;
    const col = opts.colFn ? opts.colFn(d) : null;
    // `flip` rotates the decal 180° in UV space — used for the lane whose
    // traffic runs the other way, so its paint reads for that direction.
    const u0 = opts.flip ? 1 : 0, u1 = opts.flip ? 0 : 1;
    const vv = opts.flip ? (opts.vRepeat ? opts.vRepeat - v : 1 - v) : v;
    return { a:new THREE.Vector3(cx-halfW, y0, z), b:new THREE.Vector3(cx+halfW, y1, z),
             ua:u0, va:vv, ub:u1, vb:vv, col };
  });
  return new THREE.Mesh(geo, opts.material);
}

/* ═══════════════════════ road markings ═══════════════════════
   All markings are flat decals generated from the SAME road model as the
   asphalt: `roadHalfAt(d)` for the width, `surfaceYAt(x,d)` for the camber.
   They can therefore never drift off-centre or float above the surface.

   Orientation, once, so no mesh needs a compensating rotation:
     · the visitor walks towards −z, so increasing d is "further away"
     · roadStrip writes v = 0 at the near end and v = 1 at the far end
     · CanvasTexture keeps flipY = true, so v = 1 samples the TOP of the canvas
   ⇒ canvas drawn normally (left→right, top = far) lands the right way up.
   Nothing here rotates the canvas.                                        */

const PAINT_NEAR_OFFSET = 0.006;        // just proud of the asphalt, invisible

function paintCanvasWear(x, w, h, amount){
  x.globalCompositeOperation = 'destination-out';
  for (let i=0;i<44;i++){
    x.fillStyle = `rgba(0,0,0,${amount*Math.random()})`;
    x.fillRect(0, Math.random()*h, w, 2 + Math.random()*16);
  }
  x.globalCompositeOperation = 'source-over';
}

/** One tile = one dash + one gap. `dutyCycle` is the painted fraction. */
function laneTexture({ dashed = true, dutyCycle = 0.58, wear = 0.16 } = {}){
  const t = canvasTexture(64, 256, (x,w,h)=>{
    x.clearRect(0,0,w,h);
    x.fillStyle = 'rgba(228,220,197,0.90)';
    x.fillRect(0, 0, w, dashed ? h*dutyCycle : h);
    paintCanvasWear(x, w, h, wear);
    const edge = x.createLinearGradient(0,0,w,0);       // paint thins at the edges
    edge.addColorStop(0,'rgba(0,0,0,.62)'); edge.addColorStop(.30,'rgba(0,0,0,0)');
    edge.addColorStop(.70,'rgba(0,0,0,0)'); edge.addColorStop(1,'rgba(0,0,0,.62)');
    x.globalCompositeOperation='destination-out';
    x.fillStyle = edge; x.fillRect(0,0,w,h);
    x.globalCompositeOperation='source-over';
  });
  t.wrapT = THREE.RepeatWrapping;
  t.wrapS = THREE.ClampToEdgeWrapping;
  return t;
}

function paintMaterial(map, { tint = 0xd8d0b8, glow = 0.0 } = {}){
  return mat({
    map, transparent:true, color:tint,
    roughness:0.95, metalness:0.0,
    emissive: glow > 0 ? 0xffffff : 0x000000,
    emissiveMap: glow > 0 ? map : null,
    emissiveIntensity: glow,
    depthWrite:false, side:THREE.FrontSide,
    polygonOffset:true, polygonOffsetFactor:-4, polygonOffsetUnits:-4
  });
}

/** A single flat marking centred on (dCentre, xCentre), lying on the camber. */
function roadDecal(dCentre, along, xCentre, across, material, flip){
  return roadStrip(dCentre - along/2, dCentre + along/2, () => xCentre, across/2,
    { material, step: Math.min(0.5, along/4), flip });
}

const DASH_TILE = 4.4;                  // metres of road per dash+gap cycle

/* ── glyph atlas ────────────────────────────────────────────────────────
   Every glyph is rendered once, as large as will fit, into one shared texture.
   Labels are then per-glyph quads with exact UVs — so a long label and a short
   one carry identical resolution, and nothing is ever squashed to fit.        */

const ROAD_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 .,:'&/()–—-·";
const ATLAS = { size: 2048, px: 0, map: new Map(), texture: null };
const roadTexts = [];
const PAINT_COLOUR = 0xe6dfc6;

function buildGlyphAtlas(){
  const S = ATLAS.size;
  const probe = document.createElement('canvas').getContext('2d');

  // shrink the nominal glyph size until the whole set packs into one page
  let px = 340, layout = null;
  while (px >= 140 && !layout){
    probe.font = `${px}px ${ROAD_FACE}`;
    const pad = Math.round(px * 0.06) + 5;
    const rowH = Math.round(px * 1.40);
    const cells = [];
    let cx = pad, cy = pad, fits = true;
    for (const ch of ROAD_CHARS){
      const m = probe.measureText(ch);
      const lsb  = m.actualBoundingBoxLeft  || 0;      // ink extending left of the pen
      const rsb  = m.actualBoundingBoxRight || m.width;
      const asc  = m.actualBoundingBoxAscent  || px * 0.72;
      const desc = m.actualBoundingBoxDescent || 0;
      const inkW = Math.ceil(lsb + rsb) + 2;
      if (cx + inkW + pad > S){ cx = pad; cy += rowH; }
      if (cy + rowH + pad > S){ fits = false; break; }
      cells.push({ ch, x:cx, y:cy, inkW, adv:m.width, lsb, rsb, asc, desc });
      cx += inkW + pad;
    }
    if (fits) layout = { px, pad, rowH, cells };
    else px -= 20;
  }
  if (!layout) return false;
  ATLAS.px = layout.px;

  const canvas = canvasOf(S, S, (x)=>{
    x.fillStyle = '#000'; x.fillRect(0,0,S,S);          // coverage lives in the colour
    x.font = `${layout.px}px ${ROAD_FACE}`;
    x.fillStyle = '#fff';
    x.textBaseline = 'alphabetic';
    x.textAlign = 'left';
    for (const c of layout.cells){
      // pen sits `lsb` right of the cell edge, so the ink box starts exactly at c.x
      c.penX = c.x + c.lsb + 1;
      c.base = c.y + Math.round(layout.px * 1.02);
      x.fillText(c.ch, c.penX, c.base);
    }
  });

  const t = new THREE.CanvasTexture(canvas);
  t.colorSpace = THREE.SRGBColorSpace;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.magFilter = THREE.LinearFilter;
  t.anisotropy = maxAniso();
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  t.needsUpdate = true;
  ATLAS.texture = t;
  texCache.push(t);

  for (const c of layout.cells){
    const left = c.penX - c.lsb, right = c.penX + c.rsb;
    const top  = c.base - c.asc, bot   = c.base + c.desc;
    ATLAS.map.set(c.ch, {
      u0: left / S,  u1: right / S,
      v0: 1 - bot / S, v1: 1 - top / S,      // v0 is the glyph's bottom edge
      wPx: right - left,
      ascPx: c.asc, descPx: c.desc,
      lsbPx: c.lsb,                          // ink starts this far left of the pen
      adv: c.adv
    });
  }
  return true;
}

function maxAniso(){
  return renderer ? renderer.capabilities.getMaxAnisotropy() : 8;
}

/* Geometry for a line-broken label, centred on its INKED bounding box.
   Centring on the advance box (pen start to pen end) leaves every label very
   slightly off — a glyph's ink does not fill its advance, and the trailing
   side bearing of the last character is not the leading bearing of the first.
   With letterspacing applied the bias is consistent and visible, so the block
   is measured after it is built and shifted onto its true optical centre.
   `geo.userData.size` reports the real inked extent for layout to use. */
function textGeometry(text, cap, letterSpacing){
  const unit = cap / ATLAS.px;                     // metres per atlas pixel
  const lines = String(text).toUpperCase().split('\n');
  const pos = [], uv = [], idx = [];
  const lineH = ATLAS.px * 1.28 * unit;
  const widths = lines.map(ln => {
    let w = 0;
    for (const ch of ln){
      const g = ATLAS.map.get(ch);
      w += (g ? g.adv * unit : cap * 0.4) + letterSpacing * cap;
    }
    return w - letterSpacing * cap;
  });
  const totalH = lines.length * lineH;
  let v = 0;

  lines.forEach((ln, li) => {
    let penX = -widths[li] / 2;
    const baseY = totalH/2 - lineH*(li + 0.82);      // baseline of this line
    for (const ch of ln){
      const g = ATLAS.map.get(ch);
      if (g && ch !== ' '){
        const x0 = penX - g.lsbPx * unit, x1 = x0 + g.wPx * unit;
        const yBot = baseY - g.descPx * unit, yTop = baseY + g.ascPx * unit;
        pos.push(x0,yBot,0, x1,yBot,0, x0,yTop,0, x1,yTop,0);
        uv.push(g.u0,g.v0, g.u1,g.v0, g.u0,g.v1, g.u1,g.v1);
        idx.push(v,v+1,v+2, v+1,v+3,v+2); v += 4;
      }
      penX += (g ? g.adv * unit : cap * 0.4) + letterSpacing * cap;
    }
  });

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos,3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv,2));
  geo.setIndex(idx);

  // measure what was actually inked, then move it onto its true centre
  geo.computeBoundingBox();
  const bb = geo.boundingBox;
  if (bb && pos.length){
    geo.translate(-(bb.min.x + bb.max.x)/2, -(bb.min.y + bb.max.y)/2, 0);
    geo.userData.size = { w: bb.max.x - bb.min.x, h: bb.max.y - bb.min.y };
  } else {
    geo.userData.size = { w: 0, h: 0 };
  }
  geo.computeVertexNormals();
  return geo;
}

let roadPaintMat = null;
function roadPaintMaterial(){
  if (!roadPaintMat){
    roadPaintMat = mat({
      map: ATLAS.texture, alphaMap: ATLAS.texture,
      color: PAINT_COLOUR, transparent: true, opacity: 0.9,
      roughness: 0.5, metalness: 0.14,               // paint catches the lamps
      emissive: PAINT_COLOUR, emissiveIntensity: 0.05,
      depthWrite: false, side: THREE.FrontSide,
      polygonOffset: true, polygonOffsetFactor: -6, polygonOffsetUnits: -6
    });
  }
  return roadPaintMat;
}

/** Widest line of a label, in metres, without building any geometry. */
function measureLabel(text, cap, letterSpacing){
  const unit = cap / ATLAS.px;
  let widest = 0;
  for (const ln of String(text).toUpperCase().split('\n')){
    let w = 0;
    for (const ch of ln) {
      const g = ATLAS.map.get(ch);
      w += (g ? g.adv * unit : cap * 0.4) + letterSpacing * cap;
    }
    widest = Math.max(widest, w - letterSpacing * cap);
  }
  return widest;
}

/* Canonical orientation for carriageway lettering, expressed once.
   The visitor walks towards −Z, so a label lying flat on the road must have:
       its own +X  →  world +X   (reads left to right)
       its own +Y  →  world −Z   (runs away down the tunnel)
       its normal  →  world +Y   (faces up out of the asphalt)
   A single holder rotated −90° about X produces exactly that, and nothing
   else in the system is allowed to add rotations on top. */
const ROAD_TEXT_PITCH = -Math.PI/2;

/** A label painted flat on the carriageway, always facing the direction of travel. */
function roadLabel(text, { d, x, size, letterSpacing = 0.14,
                           opacity = 0.9, maxWidth = 0 } = {}){
  if (!ATLAS.texture) return new THREE.Group();
  if (maxWidth > 0){                      // never let a long label outgrow its frame
    const w = measureLabel(text, size, letterSpacing);
    if (w > maxWidth) size *= maxWidth / w;
  }
  const mesh = new THREE.Mesh(textGeometry(text, size, letterSpacing), roadPaintMaterial());
  if (opacity !== 0.9){
    mesh.material = roadPaintMaterial().clone();
    mesh.material.opacity = opacity;
  }
  const holder = new THREE.Group();
  holder.rotation.x = ROAD_TEXT_PITCH;
  holder.add(mesh);
  holder.position.set(x, surfaceYAt(x, d) + 0.012, zOf(d));
  mesh.userData.textMount = { kind:'road', holder };   // checked at init
  roadTexts.push(mesh);
  return holder;
}

/* ── orientation validation ──────────────────────────────────────────────
   Runs once at start-up over every label the road system produced. It derives
   each mesh's actual world basis and compares it with the canonical one above;
   anything that does not match is reset rather than nudged. Labels added later
   inherit the check for free, so a new milestone cannot ship inverted.      */
function validateRoadTextOrientation(){
  const rot = new THREE.Matrix4();
  const ex = new THREE.Vector3(), ey = new THREE.Vector3(), ez = new THREE.Vector3();
  let checked = 0, corrected = 0;

  for (const mesh of roadTexts){
    const mount = mesh.userData.textMount;
    if (!mount) continue;
    checked++;
    mesh.updateWorldMatrix(true, false);
    rot.extractRotation(mesh.matrixWorld);
    ex.set(1,0,0).applyMatrix4(rot);
    ey.set(0,1,0).applyMatrix4(rot);
    ez.set(0,0,1).applyMatrix4(rot);

    let ok;
    if (mount.kind === 'road'){
      // reads +X, runs away down-tunnel, faces up
      ok = ex.x > 0.995 && ey.z < -0.995 && ez.y > 0.995;
      if (!ok){
        mount.holder.rotation.set(ROAD_TEXT_PITCH, 0, 0);
        mesh.rotation.set(0, 0, 0);
        mesh.scale.set(1, 1, 1);
        mount.holder.updateMatrixWorld(true);
      }
    } else {
      // wall plate: upright, normal turned in towards the carriageway
      const inward = -Math.sign(mount.side);
      ok = ey.y > 0.995 && Math.abs(ez.x - inward) < 0.05;
      if (!ok){
        mesh.rotation.set(0, mount.side < 0 ? Math.PI/2 : -Math.PI/2, 0);
        mesh.updateMatrixWorld(true);
      }
    }
    if (!ok) corrected++;
  }
  if (corrected) console.warn(`[road text] corrected ${corrected} of ${checked} labels`);
  return { checked, corrected };
}

/* ── milestone layout ────────────────────────────────────────────────────
   One container, one origin. Rows are measured, not guessed: the frame is
   sized from the widest inked row plus equal padding, and the rows are stacked
   with the same leading everywhere. A longer title, a two-line title or a
   wider year range re-flows the whole plaque instead of overflowing it, so a
   milestone added to TIMELINE later needs no layout code of its own.       */

const PLAQUE = {
  padX:  0.42,     // clear space left and right of the longest row
  padZ:  0.34,     // clear space fore and aft of the text block
  lead:  0.20,     // gap between rows
  minHalfW: 0.85
};

/**
 * @param rows [{ text, size, letterSpacing, opacity }] — ordered far → near
 * @param laneHalf half-width of the lane the plaque must sit inside
 */
function milestonePlaque(d, x, laneHalf, rows, mtl){
  const g = new THREE.Group();

  const build = scale => rows.map(r => {
    const geo = textGeometry(r.text, r.size * scale, r.letterSpacing);
    return { geo, r, size: geo.userData.size };
  });

  let built = build(1);
  let contentW = Math.max(...built.map(b => b.size.w));

  // shrink the whole block uniformly if it cannot sit inside the lane with
  // its padding — every row keeps its relative weight
  const maxW = Math.max(0.6, laneHalf * 2 - PLAQUE.padX * 2);
  if (contentW > maxW && contentW > 0){
    const s = maxW / contentW;
    built.forEach(b => b.geo.dispose());
    built = build(s);
    contentW = Math.max(...built.map(b => b.size.w));
  }

  const contentH = built.reduce((a,b) => a + b.size.h, 0)
                 + PLAQUE.lead * (built.length - 1);
  const halfW = Math.max(PLAQUE.minHalfW, contentW/2 + PLAQUE.padX);
  const halfL = contentH/2 + PLAQUE.padZ;

  // stack from the far edge inward; +d is further down the tunnel
  let cursor = contentH / 2;
  for (const b of built){
    cursor -= b.size.h / 2;
    const mesh = new THREE.Mesh(b.geo, roadPaintMaterial());
    if (b.r.opacity !== undefined && b.r.opacity !== 0.9){
      mesh.material = roadPaintMaterial().clone();
      mesh.material.opacity = b.r.opacity;
    }
    const holder = new THREE.Group();
    holder.rotation.x = ROAD_TEXT_PITCH;
    holder.add(mesh);
    // local z is negative going away, and the row sits on the road's camber
    holder.position.set(0, surfaceYAt(x, d + cursor) + 0.012, -cursor);
    mesh.userData.textMount = { kind:'road', holder };
    roadTexts.push(mesh);
    g.add(holder);
    cursor -= b.size.h / 2 + PLAQUE.lead;
  }

  g.add(milestoneFrame(d, x, halfW, halfL, mtl));
  g.position.set(x, 0, zOf(d));
  g.userData.layout = { halfW, halfL, contentW, contentH };
  return g;
}

/** Painted rules and corner ticks framing a milestone, built about the
    plaque's own origin so the container alone decides where it sits. */
function milestoneFrame(d, x, halfW, halfL, mtl){
  const g = new THREE.Group();
  const bars = [];                       // merged: a frame is one draw call
  const bar = (w, l, ox, oz) => {
    bars.push(new THREE.PlaneGeometry(w, l).rotateX(-Math.PI/2)
      // absolute height so the rule follows the road camber across its width
      .translate(ox, surfaceYAt(x + ox, d) + 0.009, oz));
  };
  bar(halfW*2, 0.075,  0,  halfL);            // rule ahead
  bar(halfW*2, 0.075,  0, -halfL);            // rule behind
  for (const sx of [-1,1]){                    // corner ticks
    for (const sz of [-1,1]){
      bar(0.07, 0.34, sx*halfW*0.97, sz*(halfL - 0.24));
    }
  }
  mergeInto(g, bars, mtl);
  return g;
}

function createTimeline(){
  const centreTex = laneTexture({ dashed:true,  dutyCycle:0.58, wear:0.14 });
  const edgeTex   = laneTexture({ dashed:false, wear:0.30 });

  // The chronological line IS the carriageway's centre line — same width and
  // spacing as real paint, with only a trace of luminosity so it stays legible
  // in the darkest stretches without reading as a glowing strip.
  const centre = roadStrip(1, CORRIDOR_LEN + 22, () => 0, 0.07, {
    material: paintMaterial(centreTex, { tint:0xd9cfa8, glow:0.07 }),
    vRepeat: (CORRIDOR_LEN + 21) / DASH_TILE,
    step: 1.1
  });
  scene.add(centre);

  // continuous faded edge lines, set in from the gutters
  const edgeMat = paintMaterial(edgeTex, { tint:0xc0bcae });
  for (const s of [-1,1]){
    scene.add(roadStrip(3, CORRIDOR_LEN - 2, d => s*(roadHalfAt(d) - 0.42), 0.05,
      { material:edgeMat, vRepeat:(CORRIDOR_LEN-5)/DASH_TILE, step:1.5 }));
  }

  /* ── period thresholds ──────────────────────────────────────────────
     A painted rule pair across the carriageway with the period name set in
     SDF type, so it stays sharp however close the visitor stands.        */
  const ruleMat = paintMaterial(laneRuleTexture(), { tint:0xcfc7ae });

  for (const zone of ZONES){
    if (zone.key === 'entrance') continue;
    const rw = roadHalfAt(zone.startD);
    const across = Math.min(rw * 1.72, 7.6);

    {
      // period threshold: centred on the road's own centre line
      const rows = [{ text: zone.name, size: 0.70, letterSpacing: 0.20 }];
      if (zone.years) rows.push({ text: zone.years, size: 0.42, letterSpacing: 0.16, opacity: 0.66 });
      zoneGroups[zone.key].add(
        milestonePlaque(zone.startD + 2.6, 0, across/2, rows, ruleMat));
    }

    /* Between milestones each lane repeats the period, so the carriageway never
       runs blank. Bays already occupied by a dated milestone are skipped. */
    const taken = TIMELINE.filter(e => e.zone === zone.key).map(e => e.absD);
    const free = dd => taken.every(t => Math.abs(t - dd) > 7.5)
                    && Math.abs(dd - zone.startD - 5) > 7.5;
    for (let d = zone.startD + 17; d < zone.endD - 9; d += 19){
      const rw2 = roadHalfAt(d), lane = rw2 * 0.52, wide = rw2 * 0.80;
      if (free(d)) zoneGroups[zone.key].add(roadLabel(zone.name.replace(/ /g, '\n'), {
        d, x: -lane, size: 0.52, letterSpacing: 0.16, opacity: 0.46, maxWidth: wide
      }));
      if (free(d + 9)) zoneGroups[zone.key].add(roadLabel(zone.name.replace(/ /g, '\n'), {
        d: d + 9, x: lane, size: 0.52, letterSpacing: 0.16, opacity: 0.46,
        maxWidth: wide
      }));
    }
  }

  /* ── dated milestones, one per event ─────────────────────────────────
     Placed on the centre line of its own lane, so the frame carries equal
     road either side of it. The lane centre is rw/2, not an offset from the
     kerb — that difference is what left the plaques looking off-square.   */
  for (const ev of TIMELINE){
    const side = ev.side === 'left' ? -1 : 1;
    const rw   = roadHalfAt(ev.absD);
    const laneCentre = side * (rw / 2);
    const laneHalf   = rw / 2 - 0.12;          // keep clear of centre line and edge line
    zoneGroups[ev.zone].add(milestonePlaque(ev.absD, laneCentre, laneHalf, [
      { text: zoneAtD(ev.absD).name || '', size: 0.26, letterSpacing: 0.22, opacity: 0.62 },
      { text: ev.year,                     size: 0.86, letterSpacing: 0.10 }
    ], ruleMat));
  }

  createChainage();
}

/** The rule/tick paint used by every milestone frame. */
function laneRuleTexture(){
  const t = canvasTexture(32, 32, (x,w,h)=>{
    x.fillStyle = 'rgba(232,225,203,0.88)';
    x.fillRect(0,0,w,h);
    x.globalCompositeOperation = 'destination-out';
    for (let i=0;i<26;i++){
      x.fillStyle = `rgba(0,0,0,${0.06 + Math.random()*0.28})`;
      x.fillRect(Math.random()*w, Math.random()*h, 2+Math.random()*7, 2+Math.random()*7);
    }
    x.globalCompositeOperation = 'source-over';
  });
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}

/* ── kerbside distance stones ──────────────────────────────────────────
   Real roads carry milestones; here they count years elapsed since 1893,
   which makes the walk's pace legible as time rather than metres.       */
function createChainage(){
  const stoneMat = mat({ map:TEX.ashlar, color:0x9a9384, roughness:0.9 });
  const batch = {};
  for (const z of ZONES) batch[z.key] = [];

  for (let d = 24; d < CORRIDOR_LEN - 12; d += 28){
    const key = zoneAtD(d).key;
    const side = (Math.round(d/28) % 2) ? 1 : -1;
    const x = side * (wallXAt(d) - 0.30);
    const y = surfaceYAt(x, d);

    // a low rounded stone, like a kilometre marker
    batch[key].push(new THREE.CylinderGeometry(0.15, 0.17, 0.62, 12, 1, false, 0, Math.PI)
      .rotateY(side < 0 ? Math.PI/2 : -Math.PI/2).translate(x, y + 0.31, zOf(d)));
    batch[key].push(new THREE.SphereGeometry(0.15, 12, 8, 0, Math.PI)
      .rotateY(side < 0 ? Math.PI/2 : -Math.PI/2).translate(x, y + 0.62, zOf(d)));

    const zone = zoneAtD(d);
    const yr = Math.round(lerp(zone.yearFrom, zone.yearTo, clamp((d - zone.startD)/zone.length, 0, 1)));
    if (ATLAS.texture){
      const label = new THREE.Mesh(textGeometry(String(yr), 0.14, 0.06), roadPaintMaterial());
      label.position.set(x - side*0.088, y + 0.44, zOf(d));
      label.rotation.y = side < 0 ? Math.PI/2 : -Math.PI/2;
      label.userData.textMount = { kind:'wall', side };
      roadTexts.push(label);
      zoneGroups[key].add(label);
    }

    addCollider(x, y + 0.35, zOf(d), 0.4, 0.7, 0.4);
  }
  for (const z of ZONES) mergeInto(zoneGroups[z.key], batch[z.key], stoneMat);

}


/* ═══════════════════════ exhibit panel textures ═══════════════════════ */

const TAG_TEXT = { direct:'DIRECT INVOLVEMENT', broader:'BROADER EVENT', context:'HISTORICAL CONTEXT' };
const TAG_COL  = { direct:'#8a6a1e', broader:'#8b4a37', context:'#4c5a63' };

function exhibitTexture(ev, style){
  const W = 512, H = 696;                       // matches the 1.40 × 1.904 m frame
  return canvasTexture(W, H, (x,w,h)=>{
    // ── surface ──
    if (style === 'news'){
      x.fillStyle='#d8d0bc'; x.fillRect(0,0,w,h);
      blotches(x,w,h,60,['186,176,152','204,196,176'],20,110,0.4);
    } else if (style === 'plate'){
      x.fillStyle='#22262a'; x.fillRect(0,0,w,h);
      blotches(x,w,h,60,['46,52,58','16,18,20'],20,120,0.5);
    } else if (style === 'doc'){
      x.fillStyle='#e2dac4'; x.fillRect(0,0,w,h);
      blotches(x,w,h,50,['206,196,168','226,220,200'],24,120,0.4);
    } else {
      x.fillStyle='#ddd0b0'; x.fillRect(0,0,w,h);
      blotches(x,w,h,60,['198,182,148','216,204,176','170,152,118'],22,120,0.35);
    }
    const dark = style === 'plate';
    const ink  = dark ? '#d6dde4' : '#2b2318';
    const dim  = dark ? 'rgba(214,221,228,.62)' : 'rgba(43,35,24,.62)';
    const line = dark ? 'rgba(160,180,200,.4)' : 'rgba(70,56,36,.45)';

    x.strokeStyle = line; x.lineWidth = 2;
    x.strokeRect(24,24,w-48,h-48);
    x.lineWidth = 1;
    x.strokeRect(31,31,w-62,h-62);

    let y = 78;

    if (style === 'news'){
      x.textAlign='center'; x.fillStyle=ink; x.font='600 19px Georgia, serif';
      drawSpaced(x,'ARCHIVE PLATE', w/2, y, 6, 'center');
      x.strokeStyle=line; x.beginPath(); x.moveTo(52,y+15); x.lineTo(w-52,y+15); x.stroke();
      x.fillStyle=dim; x.font='10px Helvetica, Arial, sans-serif';
      x.fillText('REPRESENTATION — NOT A FACSIMILE', w/2, y+34);
      y += 70;
    }

    x.textAlign='left';
    const tagLabel = TAG_TEXT[ev.involvement] || 'RECORD';
    x.font='600 12px Helvetica, Arial, sans-serif';
    const tw = tagLabel.length * 8.8 + 20;
    x.strokeStyle = TAG_COL[ev.involvement] || line;
    x.strokeRect(52, y-18, tw, 26);
    x.fillStyle = TAG_COL[ev.involvement] || dim;
    drawSpaced(x, tagLabel, 63, y, 2.2);
    y += 54;

    x.fillStyle = dark ? '#9fb4c6' : '#8a6a1e';
    x.font='600 14px Helvetica, Arial, sans-serif';
    drawSpaced(x, (ev.date || ev.year || '').toUpperCase(), 52, y, 3.8);
    y += 38;

    x.fillStyle = ink;
    x.font='400 33px Georgia, serif';
    for (const ln of wrapLines(x, stripTags(ev.title), w-108)){ x.fillText(ln, 52, y); y += 41; }
    y += 6;

    x.strokeStyle=line; x.beginPath(); x.moveTo(52,y); x.lineTo(w-52,y); x.stroke();
    y += 36;

    if (ev.place && ev.place !== '—'){
      x.fillStyle = dim; x.font='600 11px Helvetica, Arial, sans-serif';
      drawSpaced(x, 'LOCATION', 52, y, 3.2); y += 22;
      x.fillStyle = ink; x.font='18px Georgia, serif';
      for (const ln of wrapLines(x, stripTags(ev.place), w-108)){ x.fillText(ln, 52, y); y += 25; }
      y += 24;
    }

    x.fillStyle = dim; x.font='600 11px Helvetica, Arial, sans-serif';
    drawSpaced(x, 'WHAT HAPPENED', 52, y, 3.2); y += 26;
    x.fillStyle = dark ? 'rgba(214,221,228,.86)' : 'rgba(43,35,24,.86)';
    x.font='18px Georgia, serif';
    const body = wrapLines(x, stripTags(ev.what), w-108);
    const room = Math.floor((h - 140 - y) / 26);
    for (let i=0;i<Math.min(body.length, room); i++){
      let ln = body[i];
      if (i === room-1 && body.length > room) ln = ln.replace(/\s\S*$/,'') + ' …';
      x.fillText(ln, 52, y); y += 26;
    }

    x.strokeStyle = line; x.beginPath(); x.moveTo(52,h-100); x.lineTo(w-52,h-100); x.stroke();
    x.fillStyle = dim; x.font='600 10px Helvetica, Arial, sans-serif';
    drawSpaced(x, 'PRESS  E  FOR THE FULL RECORD AND SOURCES', 52, h-74, 2.4);
    x.fillStyle = dark ? 'rgba(160,180,200,.55)' : 'rgba(70,56,36,.5)';
    x.font='italic 14px Georgia, serif';
    x.fillText(`${ev.sources.length} source${ev.sources.length===1?'':'s'} cited`, 52, h-50);
  }, { aniso:16 });
}

function simpleTexture(title, lines, opts = {}){
  const W = opts.w || 512, H = opts.h || 640;
  const dark = !!opts.dark;
  return canvasTexture(W, H, (x,w,h)=>{
    if (dark){ x.fillStyle='#20242a'; x.fillRect(0,0,w,h); blotches(x,w,h,40,['44,50,58','14,16,18'],20,110,0.5); }
    else { x.fillStyle='#ddd0b0'; x.fillRect(0,0,w,h); blotches(x,w,h,50,['198,182,148','216,204,176'],22,110,0.35); }
    const ink = dark ? '#dbe3ea' : '#2b2318';
    const dim = dark ? 'rgba(219,227,234,.6)' : 'rgba(43,35,24,.6)';
    x.strokeStyle = dark ? 'rgba(160,180,200,.35)' : 'rgba(70,56,36,.4)';
    x.lineWidth=2; x.strokeRect(22,22,w-44,h-44);
    let y = 78;
    x.textAlign='left'; x.fillStyle = opts.accent || (dark?'#9fb4c6':'#8a6a1e');
    x.font='600 14px Helvetica, Arial, sans-serif';
    drawSpaced(x, title, 46, y, 3.6); y += 44;
    x.strokeStyle = dark ? 'rgba(160,180,200,.3)' : 'rgba(70,56,36,.35)'; x.lineWidth=1;
    x.beginPath(); x.moveTo(46,y-14); x.lineTo(w-46,y-14); x.stroke();
    x.fillStyle = ink; x.font = (opts.font || '20px Georgia, serif');
    for (const raw of lines){
      if (raw === ''){ y += 14; continue; }
      if (raw.startsWith('##')){
        x.fillStyle = dim; x.font='600 12px Helvetica, Arial, sans-serif';
        drawSpaced(x, raw.slice(2).trim(), 46, y, 3.2); y += 30;
        x.fillStyle = ink; x.font = (opts.font || '20px Georgia, serif');
        continue;
      }
      for (const ln of wrapLines(x, raw, w-92)){ x.fillText(ln, 46, y); y += 27; }
      y += 8;
    }
  }, { aniso:16 });
}

/* ═══════════════════════ framed exhibits ═══════════════════════ */

const haloMat = new THREE.MeshBasicMaterial({
  color:0xd4a94a, transparent:true, opacity:0, side:THREE.DoubleSide,
  blending:THREE.AdditiveBlending, depthWrite:false, toneMapped:false
});

/** A framed wall exhibit. Returns the group; `.userData.face` is the raycast target. */
function framedPanel(w, h, tex, zone, { glass=false } = {}){
  const grp = new THREE.Group();
  const frameMat = mat({ color:zone.frame, roughness:zone.frameRough, metalness:zone.frameMetal, map:zone.frameMetal < 0.3 ? TEX.wood : null });
  const t = 0.10, dpt = 0.11;

  const bars = [
    [w + t*2, t, dpt,  0,  h/2 + t/2],
    [w + t*2, t, dpt,  0, -h/2 - t/2],
    [t, h, dpt, -w/2 - t/2, 0],
    [t, h, dpt,  w/2 + t/2, 0]
  ];
  mergeInto(grp, bars.map(([bw,bh,bd,bx,by]) =>
    new THREE.BoxGeometry(bw,bh,bd).translate(bx,by,0.03)), frameMat);

  /* Mounted as a museum board rather than a decal:
       wall → shadow → standoff brackets → backing → bevel → artwork → glass  */

  // soft contact shadow cast onto the wall behind the board
  const shadow = new THREE.Mesh(new THREE.PlaneGeometry(w + 0.62, h + 0.62),
    new THREE.MeshBasicMaterial({ map:TEX.pool, color:0x000000, transparent:true,
                                  opacity:0.42, depthWrite:false }));
  shadow.position.set(0.012, -0.03, -0.038);
  grp.add(shadow);

  // four standoff brackets hold the board 3.5 cm off the plaster
  const brkMat = mat({ color:0x4a412f, roughness:0.34, metalness:0.85 });
  const brk = [];
  for (const sx of [-1,1]) for (const sy of [-1,1]){
    brk.push(new THREE.CylinderGeometry(0.022, 0.026, 0.035, 8).rotateX(Math.PI/2)
      .translate(sx*(w/2 - 0.06), sy*(h/2 - 0.06), -0.018));
  }
  mergeInto(grp, brk, brkMat);

  const mount = new THREE.Mesh(new THREE.BoxGeometry(w+t*2, h+t*2, 0.04),
    mat({ color:0x14100b, roughness:0.9 }));
  mount.position.z = -0.005;
  grp.add(mount);

  // bevelled inner lip catching the light between frame and artwork
  const bevelMat = mat({ color:zone.frame, roughness:Math.max(0.22, zone.frameRough - 0.28),
                         metalness:Math.min(0.9, zone.frameMetal + 0.3) });
  const lips = [];
  for (const [bw,bh,bx,by,rx,ry] of [
        [w + 0.03, 0.032, 0,  h/2 + 0.008, -0.55, 0],
        [w + 0.03, 0.032, 0, -h/2 - 0.008,  0.55, 0],
        [0.032, h + 0.03, -w/2 - 0.008, 0, 0,  0.55],
        [0.032, h + 0.03,  w/2 + 0.008, 0, 0, -0.55]]){
    lips.push(new THREE.PlaneGeometry(bw,bh).rotateX(rx).rotateY(ry).translate(bx, by, 0.021));
  }
  mergeInto(grp, lips, bevelMat);

  const face = new THREE.Mesh(new THREE.PlaneGeometry(w,h),
    mat({ map:tex, roughness:0.72, metalness:0.02, color:0xffffff }));
  face.position.z = 0.022;
  grp.add(face);

  if (glass){
    const gl = new THREE.Mesh(new THREE.PlaneGeometry(w,h),
      new THREE.MeshPhysicalMaterial({ color:0xf2f6f8, transparent:true, opacity:0.055,
        roughness:0.045, metalness:0, clearcoat:1, clearcoatRoughness:0.05,
        depthWrite:false }));
    gl.position.z = 0.062;
    grp.add(gl);

    // one restrained diagonal sheen, the giveaway that a board is glazed
    const sheen = new THREE.Mesh(new THREE.PlaneGeometry(w*0.42, h*1.5),
      new THREE.MeshBasicMaterial({ map:TEX.pool, color:0xdfe8f0, transparent:true,
        opacity:0.052, blending:THREE.AdditiveBlending, depthWrite:false, toneMapped:false }));
    sheen.position.set(-w*0.17, h*0.05, 0.064);
    sheen.rotation.z = -0.42;
    grp.add(sheen);
  }

  const halo = new THREE.Mesh(new THREE.PlaneGeometry(w + 0.5, h + 0.5), haloMat.clone());
  halo.position.z = -0.02;
  grp.add(halo);

  // picture light above
  const lampBar = new THREE.Mesh(new THREE.BoxGeometry(w*0.5, 0.06, 0.1),
    mat({ color:0x7a6330, roughness:0.35, metalness:0.85 }));
  lampBar.position.set(0, h/2 + 0.32, 0.2);
  grp.add(lampBar);
  const wash = new THREE.Mesh(new THREE.PlaneGeometry(w*0.5, 0.05),
    new THREE.MeshBasicMaterial({ color:0xffe6bd, transparent:true, opacity:0.75, toneMapped:false }));
  wash.position.set(0, h/2 + 0.29, 0.25);
  wash.rotation.x = -0.9;
  grp.add(wash);

  grp.userData.face = face;
  grp.userData.halo = halo;
  grp.userData.wash = wash;
  return grp;
}

/* ═══════════════════ wall occupancy ═══════════════════
   Posters, lanterns and arch ribs all live on the same two wall faces, and
   they are generated by three independent passes that know nothing about each
   other — which is exactly how a lantern ends up hanging in front of a poster.

   Everything mounted on a wall now claims its footprint here. Posters claim
   first (they are anchored to a dated milestone and to the road marking that
   names it), then ribs and lanterns place themselves around what is taken.
   Resolved once at build time and baked into the transform — nothing is
   re-checked per frame.                                                     */

const wallSlots = [];

function claimWall(side, d, halfLen, y0, y1, kind){
  wallSlots.push({ side, d0:d - halfLen, d1:d + halfLen, y0, y1, kind });
}

function wallFree(side, d, halfLen, y0, y1, gap = 0.12){
  return !wallSlots.some(s =>
    s.side === side &&
    d - halfLen - gap < s.d1 && d + halfLen + gap > s.d0 &&
    y0 - gap < s.y1 && y1 + gap > s.y0);
}

/** Nearest free spot along the wall, searching outward from `d`. */
function findWallSlot(side, d, halfLen, y0, y1, lo, hi, reach = 6){
  if (wallFree(side, d, halfLen, y0, y1)) return d;
  for (let step = 0.35; step <= reach; step += 0.35){
    for (const cand of [d + step, d - step]){
      if (cand < lo || cand > hi) continue;
      if (wallFree(side, cand, halfLen, y0, y1)) return cand;
    }
  }
  return null;                       // caller decides: skip, or keep and accept
}

/** Mount a group flat on the tunnel wall at distance `d`, clear of other fittings. */
function mountOnWall(grp, d, side, y, size){
  const halfLen = size ? size.w/2 + 0.10 : 0.85;    // frame bars overhang the art
  const y0 = size ? y - size.h/2 - 0.10 : y - 1.05;
  const y1 = size ? y + size.h/2 + 0.42 : y + 1.05; // headroom for the picture light
  const zone = zoneAtD(clamp(d, 0, CORRIDOR_LEN - 1));
  const moved = findWallSlot(side, d, halfLen, y0, y1,
                             zone.startD + halfLen + 0.5, zone.endD - halfLen - 0.5, 5);
  const dd = moved === null ? d : moved;
  claimWall(side, dd, halfLen, y0, y1, 'poster');
  // 1.6 m either side, 3 m of road in front: the approach stays clear
  claimPosterZone(side, dd, halfLen + 1.6, 3.0);

  const x = side * (wallXAt(dd) - 0.02);
  grp.position.set(x, y, zOf(dd));
  grp.rotation.y = side < 0 ? Math.PI/2 : -Math.PI/2;
  // camera stand-off + look target for [E]
  const back = side * Math.max(wallXAt(dd) - 2.9, 0.9);
  grp.userData.stand  = new THREE.Vector3(back, CFG.eyeHeight + surfaceYAt(back, dd), zOf(dd));
  grp.userData.lookAt = new THREE.Vector3(x, y, zOf(dd));
  grp.userData.mountD = dd;
  return grp;
}

/* Wall exhibits live between the plinth (0.68 m) and the springing, so they
   never foul the arch. These two constants set every framed panel in the bore. */
const PANEL_Y = 1.62, PANEL_W = 1.40, PANEL_H = 1.904;

function registerInteractive(grp, payload){
  const face = grp.userData.face;
  face.userData.owner = grp;
  face.userData.payload = payload;
  interactables.push(face);
}

/* ═══════════════════════ createEvent ═══════════════════════ */

const STYLE_BY_ZONE = {
  early:'panel', revolution:'doc', network:'panel',
  kakori:'news', prison:'plate', writings:'panel', legacy:'panel'
};

function createEvent(ev){
  const zone = ZONES.find(z => z.key === ev.zone);
  const side = ev.side === 'left' ? -1 : 1;
  const style = STYLE_BY_ZONE[ev.zone] || 'panel';

  const grp = framedPanel(PANEL_W, PANEL_H, exhibitTexture(ev, style), zone, { glass: ev.zone !== 'prison' });
  mountOnWall(grp, ev.absD, side, PANEL_Y, { w:PANEL_W, h:PANEL_H });
  zoneGroups[ev.zone].add(grp);
  registerInteractive(grp, { kind:'event', event:ev });
  ev.marker = grp;

  // brass marker post standing on the walkway in front of the exhibit — it is
  // the poster's caption, so it follows the poster if placement moved it
  const postD = grp.userData.mountD;
  const postX = side * (wallXAt(postD) - 0.34);
  const postY = surfaceYAt(postX, postD);
  const post = new THREE.Group();
  const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.035,0.05,1.0,10),
    mat({ color:0x4a3c22, roughness:0.42, metalness:0.75 }));
  stem.position.y = 0.5;
  post.add(stem);
  const plate = new THREE.Mesh(new THREE.BoxGeometry(0.62,0.34,0.03),
    mat({ color:0x8a6f2c, roughness:0.32, metalness:0.9 }));
  plate.position.set(0,1.06,0); plate.rotation.x = -0.55;
  post.add(plate);
  const yearTex = canvasTexture(256,140,(x,w,h)=>{
    x.clearRect(0,0,w,h);
    x.textAlign='center'; x.fillStyle='#211a0d'; x.font='600 40px Georgia, serif';
    drawSpaced(x, ev.year, w/2, 62, 3, 'center');
    x.fillStyle='rgba(33,26,13,.7)'; x.font='600 15px Helvetica, Arial, sans-serif';
    drawSpaced(x, (TAG_TEXT[ev.involvement]||'').split(' ')[0], w/2, 100, 3, 'center');
  });
  yearTex.wrapS = yearTex.wrapT = THREE.ClampToEdgeWrapping;
  const yl = new THREE.Mesh(new THREE.PlaneGeometry(0.58,0.32),
    new THREE.MeshBasicMaterial({ map:yearTex, transparent:true, toneMapped:false }));
  yl.position.set(0,1.062,0.017); yl.rotation.x = -0.55;
  post.add(yl);
  post.position.set(postX, postY, zOf(postD));
  zoneGroups[ev.zone].add(post);
  addCollider(postX, postY + 0.6, zOf(postD), 0.5, 1.2, 0.5);
  return grp;
}

/* ═══════════════════════ shared props ═══════════════════════ */

let shadowTex = null;
function contactShadow(w, d, x, y, z, parent){
  if (!shadowTex){
    shadowTex = canvasTexture(128,128,(c,cw,ch)=>{
      const g = c.createRadialGradient(cw/2,ch/2,0,cw/2,ch/2,cw/2);
      g.addColorStop(0,'rgba(0,0,0,.62)'); g.addColorStop(.6,'rgba(0,0,0,.24)'); g.addColorStop(1,'rgba(0,0,0,0)');
      c.fillStyle=g; c.fillRect(0,0,cw,ch);
    },{ srgb:false });
    shadowTex.wrapS = shadowTex.wrapT = THREE.ClampToEdgeWrapping;
  }
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w,d),
    new THREE.MeshBasicMaterial({ map:shadowTex, transparent:true, depthWrite:false, opacity:0.8 }));
  m.rotation.x = -Math.PI/2;
  m.position.set(x, y + 0.006, z);
  parent.add(m);
  return m;
}

function box(w,h,d,material){ return new THREE.Mesh(new THREE.BoxGeometry(w,h,d), material); }

function addCollider(cx,cy,cz,w,h,d){
  colliders.push(new THREE.Box3().setFromCenterAndSize(
    new THREE.Vector3(cx,cy,cz), new THREE.Vector3(w,h,d)));
}

/** desk / table used in the prison and library zones */
function makeDesk(topMat, legMat, w=2.0, dp=1.0, hgt=0.76){
  const g = new THREE.Group();
  const top = box(w, 0.07, dp, topMat); top.position.y = hgt;
  g.add(top);
  const apron = box(w-0.2, 0.12, dp-0.2, legMat); apron.position.y = hgt-0.1;
  g.add(apron);
  for (const sx of [-1,1]) for (const sz of [-1,1]){
    const leg = box(0.09, hgt, 0.09, legMat);
    leg.position.set(sx*(w/2-0.12), hgt/2, sz*(dp/2-0.12));
    g.add(leg);
  }
  return g;
}

function makeBook(w,h,d,colour, tex){
  const g = new THREE.Group();
  const cover = box(w,h,d, mat({ color:colour, roughness:0.66, metalness:0.04 }));
  g.add(cover);
  const pages = box(w*0.94, h*0.8, d*0.94, mat({ color:0xd8ceb2, roughness:0.9 }));
  pages.position.x = w*0.03;
  g.add(pages);
  if (tex){
    const lbl = new THREE.Mesh(new THREE.PlaneGeometry(d*0.86, w*0.7),
      new THREE.MeshBasicMaterial({ map:tex, transparent:true, toneMapped:false }));
    lbl.rotation.x = -Math.PI/2; lbl.rotation.z = Math.PI/2;
    lbl.position.y = h/2 + 0.002;
    g.add(lbl);
  }
  g.userData.face = cover;
  return g;
}

/* ═══════════════════════ createExhibits ═══════════════════════ */

function createExhibits(){
  TIMELINE.forEach(createEvent);
  exhibitsEarly();
  exhibitsRevolution();
  exhibitsNetwork();
  exhibitsKakori();
  exhibitsPrison();
  exhibitsWritings();
  exhibitsLegacy();
}

/* ── Zone 1 ─────────────────────────────────────────────────────────── */

/* ── portraits ────────────────────────────────────────────────────────
   Keyed per subject, so a photograph supplied for one person is never used
   for another. Drop the file in ./assets/ under the name below and it appears
   on the board; if the file is absent the engraved plate is drawn instead and
   the caption stays honest about it. Nothing here generates a face.        */
const PORTRAITS = {
  'sanyal': {
    // tried in order, so the file can be saved in whichever format you have
    src:     ['./assets/sanyal-portrait.jpg', './assets/sanyal-portrait.jpeg',
              './assets/sanyal-portrait.png', './assets/sanyal-portrait.webp'],
    name:    'SACHINDRA NATH SANYAL',
    dates:   '1893 — 1942',
    credit:  'ARCHIVAL PHOTOGRAPH — CALCUTTA MAHAJATI SADAN',
    focusY:  0.42          // crop bias: keeps the top of the head in frame
  }
};

/** Try each candidate path in turn; call `ok` with the first that decodes. */
function loadFirstImage(paths, ok, fail){
  let i = 0;
  const next = () => {
    if (i >= paths.length){ fail && fail(); return; }
    const img = new Image();
    img.onload  = () => ok(img, paths[i]);
    img.onerror = () => { i++; next(); };
    img.src = paths[i];
  };
  next();
}

/** Cover-crop `img` into the rect, preserving aspect — never stretched. */
function drawCover(x, img, rx, ry, rw, rh, focusY = 0.5){
  const s = Math.max(rw / img.naturalWidth, rh / img.naturalHeight);
  const dw = img.naturalWidth * s, dh = img.naturalHeight * s;
  const dx = rx + (rw - dw) / 2;
  const dy = ry + (rh - dh) * focusY;
  x.save();
  x.beginPath(); x.rect(rx, ry, rw, rh); x.clip();
  x.drawImage(img, dx, dy, dw, dh);
  x.restore();
}

function portraitTexture(key = 'sanyal'){
  const P = PORTRAITS[key];
  const OV = { x: 560/2, y: 300, rx: 182, ry: 222 };      // the existing gold oval

  const tex = canvasTexture(560,760,(x,w,h)=>{
    x.fillStyle='#1d1811'; x.fillRect(0,0,w,h);
    blotches(x,w,h,70,['48,38,26','28,22,15'],30,180,0.5);
    // engraved oval
    x.save();
    x.translate(w/2, 300);
    const g = x.createRadialGradient(0,-30,10,0,0,230);
    g.addColorStop(0,'rgba(198,170,116,.34)'); g.addColorStop(1,'rgba(198,170,116,0)');
    x.fillStyle=g; x.beginPath(); x.ellipse(0,0,190,230,0,0,Math.PI*2); x.fill();
    x.strokeStyle='rgba(198,170,116,.5)'; x.lineWidth=2;
    x.beginPath(); x.ellipse(0,0,182,222,0,0,Math.PI*2); x.stroke();
    // stylised head-and-shoulders line-work — shown only until a photograph loads
    x.strokeStyle='rgba(214,190,140,.62)'; x.lineWidth=2.2;
    x.beginPath(); x.ellipse(0,-58,72,92,0,0,Math.PI*2); x.stroke();
    x.beginPath();
    x.moveTo(-140,190); x.quadraticCurveTo(-108,58,-42,34);
    x.lineTo(42,34); x.quadraticCurveTo(108,58,140,190);
    x.stroke();
    x.globalAlpha=.30;
    for(let i=-160;i<=160;i+=7){
      x.strokeStyle='rgba(198,170,116,.5)'; x.lineWidth=1;
      x.beginPath(); x.moveTo(i,-210); x.lineTo(i,215); x.stroke();
    }
    x.globalAlpha=1;
    x.restore();
    // caption
    x.textAlign='center';
    x.fillStyle='#e7d7ad'; x.font='400 30px Georgia, serif';
    drawSpaced(x, P.name, w/2, 600, 2.4, 'center');   // tighter: 5 split SACHINDRA into SACH INDRA
    x.strokeStyle='rgba(198,170,116,.5)'; x.lineWidth=1;
    x.beginPath(); x.moveTo(120,626); x.lineTo(w-120,626); x.stroke();
    x.fillStyle='rgba(214,190,140,.8)'; x.font='22px Georgia, serif';
    drawSpaced(x, P.dates, w/2, 664, 6, 'center');
    x.fillStyle='rgba(198,170,116,.55)'; x.font='600 11px Helvetica, Arial, sans-serif';
    drawSpaced(x,'STYLISED REPRESENTATION — NOT A PHOTOGRAPH', w/2, 706, 2.2, 'center');
  },{ aniso:16 });

  /* Repaint with the real photograph as soon as it arrives. The board, its
     frame, the lettering and the [E] interaction are already built by then and
     are untouched — only the pixels inside the oval change. */
  loadFirstImage(P.src, (img, path) => {
    console.info(`[portrait] using ${path}`);
    const c = tex.image, x = c.getContext('2d');
    x.save();
    // clip to the existing oval so the gold frame still reads as the mount
    x.beginPath(); x.ellipse(OV.x, OV.y, OV.rx - 3, OV.ry - 3, 0, 0, Math.PI*2); x.clip();
    x.fillStyle = '#100d09'; x.fillRect(OV.x-OV.rx, OV.y-OV.ry, OV.rx*2, OV.ry*2);
    drawCover(x, img, OV.x-OV.rx, OV.y-OV.ry, OV.rx*2, OV.ry*2, P.focusY);
    // a restrained warm grade so the print sits in the gold-and-dark scheme,
    // kept off the face by a centre-weighted mask
    const grade = x.createRadialGradient(OV.x, OV.y-40, 40, OV.x, OV.y, OV.ry*1.15);
    grade.addColorStop(0,   'rgba(58,40,18,0)');
    grade.addColorStop(0.55,'rgba(58,40,18,.12)');
    grade.addColorStop(1,   'rgba(30,20,10,.55)');
    x.fillStyle = grade; x.fillRect(OV.x-OV.rx, OV.y-OV.ry, OV.rx*2, OV.ry*2);
    x.restore();
    // inner bevel back on top of the photograph
    x.strokeStyle='rgba(198,170,116,.62)'; x.lineWidth=2.5;
    x.beginPath(); x.ellipse(OV.x, OV.y, OV.rx-2, OV.ry-2, 0, 0, Math.PI*2); x.stroke();
    // the caption is now a credit rather than a disclaimer
    x.fillStyle='#1d1811'; x.fillRect(60, 690, 440, 26);
    x.textAlign='center';
    x.fillStyle='rgba(198,170,116,.62)'; x.font='600 11px Helvetica, Arial, sans-serif';
    drawSpaced(x, P.credit, 280, 706, 2.2, 'center');
    tex.needsUpdate = true;
  }, () => {
    console.warn(`[portrait] no file found at ${P.src[0]} — showing the engraved plate instead.`);
  });

  return tex;
}

function exhibitsEarly(){
  const zone = ZONES[1], g = zoneGroups.early;

  const portrait = framedPanel(PANEL_W, PANEL_H, portraitTexture(), zone, { glass:true });
  mountOnWall(portrait, zone.startD + 22, 1, PANEL_Y, { w:PANEL_W, h:PANEL_H });
  g.add(portrait);
  registerInteractive(portrait, { kind:'record', record:{
    kicker:'PORTRAIT', tag:'direct', title:'Sachindra Nath Sanyal, 1893 — 1942',
    date:'—', place:'—',
    what:'The board carries the archival photograph supplied with this exhibition — a studio portrait of Sanyal in early adulthood. It is shown unretouched apart from a crop and a restrained warm grade applied to sit it in the case lighting.',
    why:'A face changes how a life is read. Set beside the dates, the sentences and the jail returns elsewhere in this exhibition, the portrait is a reminder that the record belongs to a man in his twenties when most of it was made.',
    note:'Photographs identified as Sanyal circulate online with inconsistent provenance. If you are citing this image, trace it to a holding institution — the National Archives of India and the Nehru Memorial Museum and Library are the places to start — rather than to a web search or to this exhibition.',
    sources:[SRC.portrait, SRC.nai, SRC.ichr], audioUrl:''
  }});

  const ctx1 = framedPanel(1.8, 1.0, simpleTexture('THE CITY OF VARANASI, c. 1893', [
    '##POPULATION AND ROLE',
    'A pilgrimage and learning centre of roughly two hundred thousand people, on the Ganges in the North-Western Provinces.',
    '##WHY IT MATTERS HERE',
    'Its railway links, its student population and its settled Bengali quarter made it a natural node of a network that had to move people and money quietly between provinces.'
  ], { h:400, w:720 }), zone);
  mountOnWall(ctx1, zone.startD + 38, 1, 1.72, { w:1.8, h:1.0 });
  g.add(ctx1);
  registerInteractive(ctx1, { kind:'record', record:{
    kicker:'HISTORICAL CONTEXT', tag:'context', title:'Varanasi at the End of the Nineteenth Century',
    date:'c. 1893', place:'Varanasi, North-Western Provinces',
    what:'Varanasi was a major pilgrimage and Sanskrit-learning centre, connected by rail to Calcutta, Lucknow, Allahabad and Patna, with a long-settled Bengali community in the Bengali Tola quarter.',
    why:'Sanyal\'s later usefulness to the movement rested on exactly this: a Bengali family network inside a well-connected North Indian city, at the junction between Bengal\'s revolutionary organisations and the United Provinces and Punjab where they had no presence.',
    sources:[SRC.sarkar, SRC.nai], audioUrl:''
  }});

  // benches, stood on the raised walkway beside the carriageway
  const woodM = mat({ map:TEX.wood, color:0x8a7250, roughness:0.6 });
  for (const d of [zone.startD+18, zone.startD+40]){
    const bx = -(wallXAt(d) - 0.42), by = surfaceYAt(bx, d);
    const bench = new THREE.Group();
    const seat = box(1.7,0.09,0.42, woodM); seat.position.y = 0.46; bench.add(seat);
    for (const sx of [-1,1]){
      const leg = box(0.1,0.46,0.36, woodM); leg.position.set(sx*0.72,0.23,0); bench.add(leg);
    }
    bench.position.set(bx, by, zOf(d));
    bench.rotation.y = Math.PI/2;
    contactShadow(1.1, 2.1, bx, by, zOf(d), g);
    g.add(bench);
    addCollider(bx, by+0.3, zOf(d), 0.6, 0.6, 1.9);
  }
}

/* ── Zone 2 ─────────────────────────────────────────────────────────── */

const CITIES = [
  ['LAHORE',        0.16,0.20], ['DELHI',      0.30,0.35],
  ['KANPUR',        0.46,0.47], ['LUCKNOW',    0.52,0.42],
  ['SHAHJAHANPUR',  0.44,0.36], ['KAKORI',     0.495,0.415],
  ['VARANASI',      0.62,0.53], ['GORAKHPUR',  0.62,0.40],
  ['PATNA',         0.71,0.50], ['CALCUTTA',   0.84,0.66]
];

function mapTexture(){ return canvasTexture(1024, 640, mapPlate, { aniso:16 }); }

/** Drawn once, used both on the wall and as an archive plate in the panel. */
function mapPlate(x, w, h){
  {
    x.fillStyle='#ddd0b0'; x.fillRect(0,0,w,h);
    blotches(x,w,h,80,['198,182,148','214,202,174','176,158,124'],30,180,0.35);
    // graticule
    x.strokeStyle='rgba(70,56,36,.14)'; x.lineWidth=1;
    for(let i=1;i<10;i++){ x.beginPath(); x.moveTo(w*i/10,0); x.lineTo(w*i/10,h); x.stroke(); }
    for(let i=1;i<7;i++){ x.beginPath(); x.moveTo(0,h*i/7); x.lineTo(w,h*i/7); x.stroke(); }
    // rivers (indicative)
    x.strokeStyle='rgba(70,90,110,.42)'; x.lineWidth=3;
    x.beginPath(); x.moveTo(w*.12,h*.16);
    x.bezierCurveTo(w*.34,h*.34,w*.56,h*.46,w*.9,h*.7); x.stroke();
    x.lineWidth=2;
    x.beginPath(); x.moveTo(w*.30,h*.12);
    x.bezierCurveTo(w*.40,h*.30,w*.50,h*.40,w*.62,h*.53); x.stroke();
    // rail links between the cities of the network
    x.strokeStyle='rgba(120,60,40,.5)'; x.lineWidth=1.6; x.setLineDash([7,5]);
    x.beginPath();
    const path = ['LAHORE','DELHI','SHAHJAHANPUR','LUCKNOW','VARANASI','PATNA','CALCUTTA'];
    path.forEach((nm,i)=>{
      const c = CITIES.find(q=>q[0]===nm);
      const px = c[1]*w, py = c[2]*h;
      if (i===0) x.moveTo(px,py); else x.lineTo(px,py);
    });
    x.stroke(); x.setLineDash([]);
    // cities
    for (const [nm,cx,cy] of CITIES){
      const px = cx*w, py = cy*h;
      const key = nm==='VARANASI';
      x.fillStyle = key ? '#8a2b1c' : '#2b2318';
      x.beginPath(); x.arc(px,py,key?6:4,0,Math.PI*2); x.fill();
      if (key){ x.strokeStyle='rgba(138,43,28,.6)'; x.lineWidth=1.4;
        x.beginPath(); x.arc(px,py,13,0,Math.PI*2); x.stroke(); }
      x.fillStyle = key ? '#8a2b1c' : 'rgba(43,35,24,.85)';
      x.font = key ? '600 19px Georgia, serif' : '16px Georgia, serif';
      x.textAlign = cx > 0.7 ? 'right' : 'left';
      x.fillText(nm, px + (cx>0.7 ? -12 : 12), py + 5);
    }
    // title block
    x.textAlign='left'; x.fillStyle='#2b2318'; x.font='600 24px Georgia, serif';
    drawSpaced(x,'NORTHERN INDIA — THE GEOGRAPHY OF THE NETWORK', 40, 52, 3.2);
    x.fillStyle='rgba(43,35,24,.6)'; x.font='15px Georgia, serif';
    x.fillText('Indicative schematic. Places named in this exhibition; railway links shown as dashed lines.', 40, 80);
    x.strokeStyle='rgba(70,56,36,.5)'; x.lineWidth=2; x.strokeRect(18,18,w-36,h-36);
  }
}

function exhibitsRevolution(){
  const zone = ZONES[2], g = zoneGroups.revolution;

  const mapD = zone.startD + 67;
  const map = framedPanel(2.94, 1.84, mapTexture(), zone, { glass:true });
  mountOnWall(map, mapD, -1, PANEL_Y, { w:2.94, h:1.84 });
  map.userData.stand.set(-(wallXAt(mapD) - 3.6), CFG.eyeHeight, zOf(mapD));
  g.add(map);
  registerInteractive(map, { kind:'record', record:{
    kicker:'MAP', tag:'context', title:'The Geography of the Network',
    date:'1913 — 1927', place:'Punjab, Delhi, United Provinces, Bihar, Bengal',
    what:'The places named in this exhibition sit along the main railway line of northern India: Lahore, Delhi, Shahjahanpur, Kakori and Lucknow, Varanasi, Gorakhpur, Patna and Calcutta. Every organisational act described here — the 1913 Patna branch, the coordination of February 1915, the 1924 Kanpur founding, the 1925 Kakori action — happened along it.',
    why:'The railway is not scenery. It is what made a network across four provinces administratively possible for people with no money and no legal standing, and it is equally what let the police follow them.',
    note:'The map is an indicative schematic drawn for this exhibition, not a survey document.',
    sources:[SRC.maclean, SRC.sarkar, SRC.sedition], audioUrl:''
  }});

  const org = framedPanel(1.9, 1.05, simpleTexture('ORGANISATIONS ACTIVE IN THIS PERIOD', [
    '##ANUSHILAN SAMITI · from 1902',
    'Calcutta physical-culture society; parts became an underground political body across Bengal and Bihar.',
    '##JUGANTAR · from 1906',
    'The other principal Bengal revolutionary grouping of the period.',
    '##GHADAR PARTY · from 1913',
    'Formed among Indian migrants in North America; central to the attempted rising of February 1915.'
  ], { h:420, w:760 }), zone);
  mountOnWall(org, zone.startD + 33, 1, 1.72, { w:1.9, h:1.05 });
  g.add(org);
  registerInteractive(org, { kind:'record', record:{
    kicker:'ORGANISATIONAL CONTEXT', tag:'context', title:'The Organisations of the Pre-1915 Movement',
    date:'1902 — 1915', place:'Bengal, Bihar, Punjab, North America',
    what:'The Anushilan Samiti (Calcutta, 1902) and Jugantar (1906) were the two principal Bengal revolutionary formations. The Ghadar Party was founded among Indian migrant workers and students on the Pacific coast of North America in 1913. The February 1915 plan was an attempt to make these separate bodies act at one moment.',
    why:'Understanding Sanyal means understanding that he was an organiser between organisations rather than the leader of one. His documented contribution before 1924 is connective.',
    sources:[SRC.heehs, SRC.sedition, SRC.bipan], audioUrl:''
  }});

  // document table, stood on the carriageway clear of the gutter
  const dT = zone.startD + 34;
  const tx = roadHalfAt(dT) - 1.3, ty = surfaceYAt(tx, dT);
  const tbl = makeDesk(mat({ map:TEX.wood, color:0x7a6446, roughness:0.6 }),
                       mat({ color:0x2a2016, roughness:0.7 }), 2.3, 1.05, 0.82);
  tbl.position.set(tx, ty, zOf(dT));
  tbl.rotation.y = -Math.PI/2;
  g.add(tbl);
  contactShadow(2.0, 2.9, tx, ty, zOf(dT), g);
  addCollider(tx, ty+0.45, zOf(dT), 1.2, 0.9, 2.4);
  for (let i=0;i<4;i++){
    const sheet = box(0.42, 0.008, 0.58, mat({ color:0xd9cfb4, roughness:0.92 }));
    sheet.position.set(tx + (Math.random()-0.5)*0.4, ty + 0.83 + i*0.01,
                       zOf(dT) + (Math.random()-0.5)*1.4);
    sheet.rotation.y = (Math.random()-0.5)*0.5;
    g.add(sheet);
  }
}

/* ── Zone 3 · the network installation ──────────────────────────────── */

function nodeLabelTexture(node){
  return canvasTexture(512, 128, (x,w,h)=>{
    x.clearRect(0,0,w,h);
    x.textAlign='left';
    x.fillStyle = node.primary ? '#f0dfb2' : 'rgba(226,214,186,.86)';
    x.font = node.primary ? '600 34px Georgia, serif' : '28px Georgia, serif';
    const lines = wrapLines(x, node.label, w-16);
    let y = lines.length > 1 ? 44 : 58;
    for (const ln of lines){ x.fillText(ln, 6, y); y += 34; }
  },{ aniso:8 });
}

function exhibitsNetwork(){
  const zone = ZONES[3], g = zoneGroups.network;
  const D0 = zone.startD + 32, D1 = zone.startD + 48;
  const midD = (D0+D1)/2;
  const W = D1 - D0, H = 1.86, Y0 = 0.74;      // sits between plinth and springing
  const X = -(wallXAt(midD) - 0.03);

  claimWall(-1, midD, W/2 + 0.2, Y0 - 0.2, Y0 + H + 0.3, 'installation');
  const wall = new THREE.Group();
  wall.position.set(X, 0, zOf(midD));
  wall.rotation.y = Math.PI/2;                       // local +x → -z (deeper into tunnel)
  g.add(wall);

  const backing = box(W, H, 0.06, mat({ color:0x1a1c1e, roughness:0.55, metalness:0.35 }));
  backing.position.set(0, Y0 + H/2, 0);
  wall.add(backing);

  const trim = mat({ color:0x6d5a2e, roughness:0.34, metalness:0.9 });
  for (const [bw,bh,bx,by] of [[W+0.16,0.09,0,Y0+H+0.045],[W+0.16,0.09,0,Y0-0.045],
                               [0.09,H+0.18,-W/2-0.045,Y0+H/2],[0.09,H+0.18,W/2+0.045,Y0+H/2]]){
    const b = box(bw,bh,0.13,trim); b.position.set(bx,by,0.02); wall.add(b);
  }

  const head = new THREE.Mesh(new THREE.PlaneGeometry(W*0.88, 0.34),
    new THREE.MeshBasicMaterial({ map: canvasTexture(1400,120,(x,w,h)=>{
      x.clearRect(0,0,w,h);
      x.textAlign='center'; x.fillStyle='#e8d6a8'; x.font='600 46px Georgia, serif';
      drawSpaced(x,'THE REVOLUTIONARY NETWORK', w/2, 52, 12, 'center');
      x.fillStyle='rgba(200,186,152,.6)'; x.font='22px Georgia, serif';
      x.fillText('Documented associations only. Look at a node and press E.', w/2, 96);
    }), transparent:true, toneMapped:false, depthWrite:false }));
  head.position.set(0, Y0 + H - 0.22, 0.05);
  wall.add(head);

  const pos = {};
  for (const n of NETWORK.nodes){
    pos[n.id] = new THREE.Vector3(
      (n.x - 0.5) * (W - 1.6),
      Y0 + 0.26 + n.y * (H - 0.72),
      0.055
    );
  }

  // connective lines
  const pts = [];
  for (const [a,b] of NETWORK.links){
    if (!pos[a] || !pos[b]) continue;
    pts.push(pos[a].x,pos[a].y,pos[a].z, pos[b].x,pos[b].y,pos[b].z);
  }
  const lg = new THREE.BufferGeometry();
  lg.setAttribute('position', new THREE.Float32BufferAttribute(pts,3));
  wall.add(new THREE.LineSegments(lg, new THREE.LineBasicMaterial({
    color:0xb9963f, transparent:true, opacity:0.34, toneMapped:false })));

  const discGeo  = new THREE.CylinderGeometry(0.085,0.085,0.05,18);
  const bigGeo   = new THREE.CylinderGeometry(0.14,0.14,0.06,22);
  const nodeMat  = mat({ color:0xc7a44e, roughness:0.3, metalness:0.9, emissive:0x3a2c0a });
  const mainMat  = mat({ color:0xe0c477, roughness:0.24, metalness:0.9, emissive:0x6a4f14 });

  for (const n of NETWORK.nodes){
    const grp = new THREE.Group();
    grp.position.copy(pos[n.id]);
    const disc = new THREE.Mesh(n.primary ? bigGeo : discGeo, n.primary ? mainMat : nodeMat);
    disc.rotation.x = Math.PI/2;
    grp.add(disc);

    const ring = new THREE.Mesh(new THREE.TorusGeometry(n.primary?0.28:0.19, 0.012, 6, 28),
      new THREE.MeshBasicMaterial({ color:0xb9963f, transparent:true, opacity:0.5, toneMapped:false }));
    grp.add(ring);

    const lbl = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 0.3),
      new THREE.MeshBasicMaterial({ map:nodeLabelTexture(n), transparent:true, toneMapped:false, depthWrite:false }));
    lbl.position.set(n.x > 0.72 ? -0.78 : 0.78, n.primary ? -0.27 : -0.21, 0.01);
    grp.add(lbl);

    const halo = new THREE.Mesh(new THREE.CircleGeometry(n.primary?0.42:0.3, 20), haloMat.clone());
    halo.position.z = 0.004;
    grp.add(halo);

    grp.userData.face = disc;
    grp.userData.halo = halo;
    wall.add(grp);

    const wp = new THREE.Vector3(); grp.getWorldPosition(wp);
    grp.userData.lookAt = wp.clone();
    grp.userData.stand  = new THREE.Vector3(X + 2.6, clamp(wp.y + 0.35, 1.4, 2.1), wp.z);
    registerInteractive(grp, { kind:'node', node:n });
  }

  // key
  const key = framedPanel(1.8, 1.0, simpleTexture('HOW TO READ THIS DIAGRAM', [
    'Each line marks a documented association — membership, co-founding, authorship or a recorded public exchange.',
    '',
    'A line is not an endorsement and not a claim of shared responsibility. Founding an organisation is not the same as taking part in what its members later did.',
    '',
    'Sachindra Nath BAKSHI appears here specifically because he is so often mistaken for Sanyal.'
  ], { h:400, w:720 }), zone);
  mountOnWall(key, zone.startD + 52, 1, 1.72, { w:1.8, h:1.0 });
  g.add(key);
  registerInteractive(key, { kind:'record', record:{
    kicker:'INSTALLATION KEY', tag:'context', title:'Reading the Network Wall',
    date:'1913 — 1928', place:'—',
    what:'The wall shows people, organisations, texts and places that are connected to Sanyal by documented association: membership, co-founding, authorship, imprisonment in the same institution, or a recorded public exchange.',
    why:'Revolutionary history is routinely drawn as a single heroic line. It was in fact a sparse, interrupted network held together by a few people who could travel, write and keep quiet — which is exactly what Sanyal did.',
    note:'No relationship has been inferred for effect. Where a connection is asserted only in memoir literature, the node text says so.',
    sources:[SRC.maclean, SRC.sedition, SRC.gupta], audioUrl:''
  }});
}

/* ── Zone 4 · newspaper archive ─────────────────────────────────────── */

function newsSheetTexture(headline, sub, kicker){
  return canvasTexture(700, 900, (x,w,h) => newsPlate(x,w,h,headline,sub,kicker), { aniso:16 });
}

/** Drawn once, used both in the Kakori frames and as an archive plate. */
function newsPlate(x, w, h, headline, sub, kicker){
  {
    x.fillStyle='#d9d1bd'; x.fillRect(0,0,w,h);
    blotches(x,w,h,70,['184,175,152','206,199,180'],25,140,0.4);
    x.strokeStyle='rgba(60,52,38,.5)'; x.lineWidth=2; x.strokeRect(20,20,w-40,h-40);
    x.textAlign='center'; x.fillStyle='#2b2318';
    x.font='600 26px Georgia, serif';
    drawSpaced(x,'ARCHIVE PLATE', w/2, 74, 8, 'center');
    x.strokeStyle='rgba(60,52,38,.45)'; x.lineWidth=1;
    x.beginPath(); x.moveTo(52,92); x.lineTo(w-52,92); x.stroke();
    x.fillStyle='rgba(43,35,24,.6)'; x.font='11px Helvetica, Arial, sans-serif';
    x.fillText('REPRESENTATION PREPARED FOR THIS EXHIBITION — NOT A FACSIMILE', w/2, 116);
    x.fillStyle='#8a3a24'; x.font='600 13px Helvetica, Arial, sans-serif';
    drawSpaced(x, kicker, w/2, 152, 3.4, 'center');
    x.fillStyle='#221b12'; x.font='400 44px Georgia, serif';
    let y = 208;
    for (const ln of wrapLines(x, headline, w-100)){ x.fillText(ln, w/2, y); y += 50; }
    y += 6;
    x.fillStyle='rgba(43,35,24,.75)'; x.font='italic 21px Georgia, serif';
    for (const ln of wrapLines(x, sub, w-120)){ x.fillText(ln, w/2, y); y += 28; }
    y += 22;
    x.strokeStyle='rgba(60,52,38,.4)';
    x.beginPath(); x.moveTo(52,y); x.lineTo(w-52,y); x.stroke();
    y += 26;
    // abstract column rules — no invented article text
    const colW = (w - 130)/3;
    for (let c=0;c<3;c++){
      const cx0 = 65 + c*(colW+15);
      let cy = y;
      while (cy < h - 90){
        const lw = colW * (0.72 + Math.random()*0.28);
        x.fillStyle = `rgba(43,35,24,${0.13 + Math.random()*0.1})`;
        x.fillRect(cx0, cy, lw, 4);
        cy += 11;
        if (Math.random() < 0.05) cy += 12;
      }
      if (c < 2){ x.strokeStyle='rgba(60,52,38,.28)';
        x.beginPath(); x.moveTo(cx0+colW+7, y); x.lineTo(cx0+colW+7, h-90); x.stroke(); }
    }
    x.fillStyle='rgba(43,35,24,.5)'; x.font='12px Helvetica, Arial, sans-serif';
    x.textAlign='center';
    x.fillText('Column rules are abstract. No text has been invented for this plate.', w/2, h-52);
  }
}

function exhibitsKakori(){
  const zone = ZONES[4], g = zoneGroups.kakori;

  const sheets = [
    { d: zone.startD + 22, side:-1, kicker:'9 AUGUST 1925',
      head:'TRAIN STOPPED NEAR KAKORI', sub:'Government treasury cash removed from the 8 Down between Shahjahanpur and Lucknow.' },
    { d: zone.startD + 38, side: 1, kicker:'6 APRIL 1927',
      head:'JUDGMENT IN THE KAKORI CASE', sub:'Four sentences of death; others transported for life. Special Sessions Court, Lucknow.' },
    { d: zone.startD + 54, side:-1, kicker:'17 & 19 DECEMBER 1927',
      head:'FOUR EXECUTIONS CARRIED OUT', sub:'Lahiri at Gonda; Bismil at Gorakhpur, Ashfaqullah Khan at Faizabad, Roshan Singh at Naini.' }
  ];
  for (const s of sheets){
    const fr = framedPanel(1.32, 1.7, newsSheetTexture(s.head, s.sub, s.kicker), zone, { glass:true });
    mountOnWall(fr, s.d, s.side, 1.66, { w:1.32, h:1.7 });
    g.add(fr);
    registerInteractive(fr, { kind:'record', record:{
      kicker:'ARCHIVE PLATE', tag:'broader', title:s.head,
      date:s.kicker, place:'United Provinces',
      what:s.sub + ' The plate is a representation prepared for this exhibition; no wording has been invented and no original newspaper has been reproduced.',
      why:'The Kakori case was a press event as much as a legal one. Public knowledge of the HRA was largely formed by newspaper coverage of the trial, which is one reason the organisation is remembered through this single action.',
      note:'Sanyal was in custody from earlier in 1925 and took no part in the action of 9 August 1925.',
      sources:[SRC.kakori, SRC.maclean], audioUrl:''
    }});
  }

  // dated brass rail of the Kakori sequence
  const railD = zone.startD + 64;
  const railWX = wallXAt(railD);
  claimWall(1, railD, 1.5, 0.6, 2.9, 'poster');
  const railGrp = new THREE.Group();
  railGrp.position.set(railWX - 0.03, 0, zOf(railD));
  railGrp.rotation.y = -Math.PI/2;
  g.add(railGrp);
  const rows = [
    ['9 AUG 1925','The action near Kakori'],
    ['26 SEP 1925','First arrests begin'],
    ['1926','Trial opens at Lucknow'],
    ['6 APR 1927','Judgment delivered'],
    ['17 & 19 DEC 1927','Four executions']
  ];
  const railTex = canvasTexture(900, 620, (x,w,h)=>{
    x.fillStyle='#191b1d'; x.fillRect(0,0,w,h);
    blotches(x,w,h,50,['38,42,46','10,11,12'],25,140,0.5);
    x.strokeStyle='rgba(185,150,63,.5)'; x.lineWidth=2; x.strokeRect(22,22,w-44,h-44);
    x.textAlign='left'; x.fillStyle='#c9ac60'; x.font='600 22px Helvetica, Arial, sans-serif';
    drawSpaced(x,'THE KAKORI SEQUENCE', 56, 84, 5);
    let y = 150;
    for (const [dt, tx] of rows){
      x.strokeStyle='rgba(185,150,63,.35)'; x.lineWidth=1;
      x.beginPath(); x.moveTo(56,y-26); x.lineTo(w-56,y-26); x.stroke();
      x.fillStyle='#c9ac60'; x.font='600 19px Helvetica, Arial, sans-serif';
      drawSpaced(x, dt, 56, y, 3);
      x.fillStyle='rgba(226,226,220,.86)'; x.font='24px Georgia, serif';
      x.fillText(tx, 330, y);
      y += 88;
    }
  },{ aniso:16 });
  const railPanel = framedPanel(2.6, 1.79, railTex, zone);
  railPanel.position.set(0, 1.66, 0);
  railGrp.add(railPanel);
  railPanel.userData.stand = new THREE.Vector3(railWX - 3.3, CFG.eyeHeight, zOf(railD));
  railPanel.userData.lookAt = new THREE.Vector3(railWX - 0.1, 1.66, zOf(railD));
  registerInteractive(railPanel, { kind:'record', record:{
    kicker:'SEQUENCE', tag:'broader', title:'The Kakori Sequence, 1925 — 1927',
    date:'9 August 1925 — 19 December 1927', place:'United Provinces',
    what:'The action near Kakori on 9 August 1925; arrests from late September 1925; the trial at Lucknow through 1926; judgment on 6 April 1927; executions on 17 and 19 December 1927.',
    why:'Twenty-eight months separate the action from the executions. In that time the Hindustan Republican Association ceased to exist in its original form; what re-formed at Delhi in September 1928 was a different organisation with a different politics.',
    note:'Sanyal appears nowhere in this sequence as a participant. He had been arrested earlier in 1925 and was transported to the Andamans for a second time.',
    sources:[SRC.kakori, SRC.maclean, SRC.nai], audioUrl:''
  }});

  // document cases down the middle
  const caseMat = mat({ map:TEX.wood, color:0x5e4c33, roughness:0.6 });
  const glassMat = new THREE.MeshPhysicalMaterial({ color:0xdfe8ee, transparent:true, opacity:0.12, roughness:0.06, metalness:0 });
  for (const [dd, cx] of [[zone.startD+30, -2.4], [zone.startD+46, 2.4]]){
    const cs = new THREE.Group();
    const body = box(1.5,0.86,0.8, caseMat); body.position.y = 0.43; cs.add(body);
    const top = box(1.56,0.06,0.86, caseMat); top.position.y = 0.9; cs.add(top);
    const lid = box(1.4,0.3,0.7, glassMat); lid.position.y = 1.08; cs.add(lid);
    for (let i=0;i<3;i++){
      const sh = box(0.34,0.006,0.46, mat({ color:0xd7cdb2, roughness:0.9 }));
      sh.position.set(-0.4+i*0.4, 0.945, (Math.random()-0.5)*0.2);
      sh.rotation.y = (Math.random()-0.5)*0.4;
      cs.add(sh);
    }
    cs.position.set(cx, 0, zOf(dd));
    cs.rotation.y = cx < 0 ? 0.25 : -0.25;
    g.add(cs);
    contactShadow(2.2,1.6,cx,0,zOf(dd),g);
    addCollider(cx, 0.55, zOf(dd), 1.8, 1.1, 1.2);
  }
}

/* ── Zone 5 · imprisonment ──────────────────────────────────────────── */

function exhibitsPrison(){
  const zone = ZONES[5], g = zoneGroups.prison;

  // the bore is rendered over in institutional grey through this stretch
  const renderMat = mat({ map:TEX.render, color:0x8d9299, roughness:0.95, metalness:0.02, side:THREE.DoubleSide });
  const skins = [];
  for (let d = zone.startD + 2; d <= zone.endD - 2; d += 2){
    // nothing to sweep here — the rendered skin is applied as tall flat panels
    // between the plinth and the springing on both walls
    for (const side of [-1,1]){
      const WX = wallXAt(d), SPR = springingAt(profileAt(d).ht);
      skins.push(new THREE.PlaneGeometry(2.02, SPR - SEC.plinthTop)
        .rotateY(side < 0 ? Math.PI/2 : -Math.PI/2)
        .translate(side*(WX - 0.05), (SPR + SEC.plinthTop)/2, zOf(d)));
    }
  }
  mergeInto(g, skins, renderMat);

  // high barred windows with restrained light shafts
  for (const d of [zone.startD+18, zone.startD+34, zone.startD+50]){
    claimWall(-1, d, 0.6, 1.9, 2.7, 'window');
    const x = -(wallXAt(d) - 0.09);
    const wf = new THREE.Group();
    wf.position.set(x, 2.28, zOf(d));
    wf.rotation.y = Math.PI/2;
    g.add(wf);
    const recess = box(0.9, 0.62, 0.08, mat({ color:0x0b0d10, roughness:1 }));
    wf.add(recess);
    const sky = new THREE.Mesh(new THREE.PlaneGeometry(0.84,0.56),
      new THREE.MeshBasicMaterial({ color:0xc6d4e0, toneMapped:false }));
    sky.position.z = 0.03; wf.add(sky);
    for (let i=0;i<4;i++){
      const bar = box(0.035,0.62,0.05, mat({ color:0x13161a, roughness:0.5, metalness:0.7 }));
      bar.position.set(-0.32 + i*0.215, 0, 0.06); wf.add(bar);
    }
    const shaft = new THREE.Mesh(new THREE.ConeGeometry(1.1, 3.6, 16, 1, true),
      new THREE.MeshBasicMaterial({ color:0x9fb3c6, transparent:true, opacity:0.05,
        blending:THREE.AdditiveBlending, depthWrite:false, side:THREE.DoubleSide, toneMapped:false }));
    shaft.position.set(x + 0.95, 0.7, zOf(d) + 0.2);
    shaft.rotation.z = 0.42; shaft.rotation.x = 0.1;
    g.add(shaft);
    lampFixtures.push({ pos:new THREE.Vector3(x + 0.4, 2.1, zOf(d)),
                        colour:new THREE.Color(0xbcd0e2), power:9, d });
  }

  // the writing corner: desk, stool, books, manuscript stand
  const dDesk = zone.startD + 44;
  const rwD = roadHalfAt(dDesk);
  const woodM = mat({ map:TEX.wood, color:0x5d4a31, roughness:0.7 });
  const ironM = mat({ color:0x22262b, roughness:0.55, metalness:0.6 });
  const dx = rwD - 1.0, dy = surfaceYAt(dx, dDesk);

  const desk = makeDesk(woodM, ironM, 1.5, 0.78, 0.72);
  desk.position.set(dx, dy, zOf(dDesk));
  desk.rotation.y = -Math.PI/2;
  g.add(desk);
  contactShadow(1.6, 2.2, dx, dy, zOf(dDesk), g);
  addCollider(dx, dy+0.4, zOf(dDesk), 0.95, 0.8, 1.6);

  const stool = new THREE.Group();
  const seat = new THREE.Mesh(new THREE.CylinderGeometry(0.19,0.19,0.05,14), woodM);
  seat.position.y = 0.44; stool.add(seat);
  for (let i=0;i<3;i++){
    const a = i/3*Math.PI*2;
    const lg2 = box(0.04,0.44,0.04, ironM);
    lg2.position.set(Math.sin(a)*0.13, 0.22, Math.cos(a)*0.13);
    stool.add(lg2);
  }
  stool.position.set(dx - 0.9, surfaceYAt(dx-0.9, dDesk), zOf(dDesk));
  g.add(stool);
  contactShadow(0.7,0.7, dx-0.9, dy, zOf(dDesk), g);

  // papers and a small lamp on the desk
  for (let i=0;i<5;i++){
    const sheet = box(0.3,0.005,0.42, mat({ color:0xcfc5a9, roughness:0.94 }));
    sheet.position.set(dx + (Math.random()-0.5)*0.35, dy + 0.73 + i*0.006, zOf(dDesk) + (Math.random()-0.5)*0.9);
    sheet.rotation.y = (Math.random()-0.5)*0.6;
    g.add(sheet);
  }
  const lampBase = new THREE.Mesh(new THREE.CylinderGeometry(0.07,0.1,0.05,12), ironM);
  lampBase.position.set(dx, dy + 0.76, zOf(dDesk) - 0.5); g.add(lampBase);
  const lampGlow = new THREE.Mesh(new THREE.SphereGeometry(0.06,10,8),
    new THREE.MeshBasicMaterial({ color:0xffd9a0, toneMapped:false }));
  lampGlow.position.set(dx, dy + 0.88, zOf(dDesk) - 0.5); g.add(lampGlow);
  lampFixtures.push({ pos:lampGlow.position.clone(), colour:new THREE.Color(0xffd9a0), power:5, d:dDesk });

  // manuscript display stand
  const stand = new THREE.Group();
  const slope = box(0.9,0.04,0.6, woodM);
  slope.rotation.x = -0.62; slope.position.y = 0.95;
  stand.add(slope);
  const post = box(0.08,0.95,0.08, ironM); post.position.y = 0.475; stand.add(post);
  const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.28,0.3,0.05,16), ironM);
  foot.position.y = 0.025; stand.add(foot);
  const msTex = simpleTexture('MANUSCRIPT DISPLAY', [
    '##WHAT SURVIVES FROM THE CELLS',
    'Very little of what political prisoners wrote in the Andamans survives, because writing materials were restricted and outgoing correspondence was censored.',
    '##WHY THAT MATTERS',
    'Sanyal\'s memoir was written after release, not in captivity. His second term left almost no personal record at all.'
  ], { w:560, h:420, dark:true });
  const ms = new THREE.Mesh(new THREE.PlaneGeometry(0.8,0.6),
    mat({ map:msTex, roughness:0.8 }));
  ms.rotation.x = -0.62 - Math.PI/2; ms.position.y = 0.975; ms.position.z = 0.012;
  stand.add(ms);
  const dS = zone.startD + 24, sx = -(roadHalfAt(dS) - 0.9), sy = surfaceYAt(sx, dS);
  stand.position.set(sx, sy, zOf(dS));
  stand.rotation.y = 1.4;
  g.add(stand);
  contactShadow(0.9,0.9, sx, sy, zOf(dS), g);
  addCollider(sx, sy+0.5, zOf(dS), 0.8, 1.0, 0.8);
  stand.userData.face = ms;
  stand.userData.stand = new THREE.Vector3(sx + 1.5, CFG.eyeHeight, zOf(dS) + 0.6);
  stand.userData.lookAt = new THREE.Vector3(sx, sy + 1.0, zOf(dS));
  registerInteractive(stand, { kind:'record', record:{
    kicker:'DISPLAY', tag:'context', title:'What Survives From the Cells',
    date:'1916 — 1938', place:'Cellular Jail, Port Blair',
    what:'Writing materials in the Cellular Jail were restricted and correspondence was censored and rationed. Most of what is known about conditions there comes from petitions, jail administration files, the reports of official enquiries, and memoirs written after release.',
    why:'Bandi Jivan was written on the mainland after the 1920 amnesty, not smuggled out of a cell. Sanyal\'s second term, from 1927, produced almost no personal record — which is itself evidence of how the punishment worked.',
    sources:[SRC.andaman, SRC.nai, SRC.bandi], audioUrl:''
  }});
}

/* ── Zone 6 · the library ───────────────────────────────────────────── */

// ponytail: a shelf unit is ~200 boxes and the library holds two dozen of them,
// so the carcass and the books each bake down to a single draw call.
const SHELF_BOOK_MAT = mat({ vertexColors:true, roughness:0.72, metalness:0.02 });

function bookshelf(w, h, dp, woodM){
  const g = new THREE.Group();
  const carcass = [], books = [];
  const palette = [0x6b3a26,0x3f4a55,0x5b4a2c,0x7a2f24,0x2f3a2c,0x4a3350,0x2e3a44];

  carcass.push(new THREE.BoxGeometry(w, h, 0.06).translate(0, h/2, -dp/2));
  for (const sx of [-1,1]){
    carcass.push(new THREE.BoxGeometry(0.08, h, dp).translate(sx*(w/2-0.04), h/2, 0));
  }

  const shelves = 4;
  for (let s=0; s<=shelves; s++){
    const y = 0.18 + s*((h-0.3)/shelves);
    carcass.push(new THREE.BoxGeometry(w-0.1, 0.05, dp).translate(0, y, 0));
    if (s === shelves) continue;
    let x = -w/2 + 0.16;
    while (x < w/2 - 0.2){
      const bw = 0.045 + Math.random()*0.055;
      const bh = 0.24 + Math.random()*0.1;
      const bg = new THREE.BoxGeometry(bw, bh, dp*0.72);
      if (Math.random() < 0.08) bg.rotateZ(0.15);
      bg.translate(x + bw/2, y + 0.025 + bh/2, 0.02);
      books.push(tint(bg, palette[(Math.random()*palette.length)|0]));
      x += bw + 0.008;
    }
  }
  carcass.push(new THREE.BoxGeometry(w+0.12, 0.12, dp+0.08).translate(0, h+0.04, 0));

  mergeInto(g, carcass, woodM);
  mergeInto(g, books, SHELF_BOOK_MAT);
  return g;
}

function exhibitsWritings(){
  const zone = ZONES[6], g = zoneGroups.writings;
  const woodM = mat({ map:TEX.wood, color:0x7a6244, roughness:0.62 });

  // shelving down both walls, skipping the bays occupied by framed exhibits
  const wallBusy = [
    { d: zone.startD + 4,  side:-1 },
    ...TIMELINE.filter(e => e.zone === 'writings')
               .map(e => ({ d:e.absD, side: e.side === 'left' ? -1 : 1 }))
  ];
  for (let d = zone.startD + 8; d < zone.endD - 8; d += 4.4){
    for (const side of [-1,1]){
      if (wallBusy.some(b => b.side === side && Math.abs(b.d - d) < 3.4)) continue;
      const sx = side*(wallXAt(d) - 0.24), sy = surfaceYAt(sx, d);
      const sh = bookshelf(3.9, springingAt(profileAt(d).ht) - sy - 0.25, 0.42, woodM);
      sh.position.set(sx, sy, zOf(d));
      sh.rotation.y = side < 0 ? Math.PI/2 : -Math.PI/2;
      g.add(sh);
      addCollider(sx, sy+1.4, zOf(d), 0.6, 2.8, 4.0);
    }
  }

  // reading table, set off the centre line so the floor timeline stays visible
  const dTable = zone.startD + 36, tx = 2.5;
  const table = makeDesk(woodM, mat({ map:TEX.wood, color:0x4a3a26, roughness:0.7 }), 2.2, 1.1, 0.78);
  table.position.set(tx, 0, zOf(dTable));
  g.add(table);
  contactShadow(2.8, 1.7, tx, 0, zOf(dTable), g);
  addCollider(tx, 0.45, zOf(dTable), 2.3, 0.9, 1.2);
  const gl = new THREE.Mesh(new THREE.SphereGeometry(0.07,10,8),
    new THREE.MeshBasicMaterial({ color:0xffd9a0, toneMapped:false }));
  gl.position.set(tx+0.7, 0.95, zOf(dTable)); g.add(gl);
  const shade = new THREE.Mesh(new THREE.CylinderGeometry(0.08,0.2,0.2,14,1,true),
    mat({ color:0x2c4a3a, roughness:0.5, metalness:0.4, side:THREE.DoubleSide }));
  shade.position.set(tx+0.7, 1.06, zOf(dTable)); g.add(shade);
  const stem2 = box(0.03,0.32,0.03, mat({ color:0x6a5a3a, metalness:0.8, roughness:0.35 }));
  stem2.position.set(tx+0.7, 0.94, zOf(dTable)); g.add(stem2);
  lampFixtures.push({ pos:new THREE.Vector3(tx+0.7,0.95,zOf(dTable)), colour:new THREE.Color(0xffd9a0), power:3.2, d:dTable });

  // display cases holding the works
  const glassMat = new THREE.MeshPhysicalMaterial({ color:0xdfe8ee, transparent:true, opacity:0.11, roughness:0.05, metalness:0 });
  BOOKS.forEach((bk, i) => {
    const d = zone.startD + 14 + i*11;
    const side = i % 2 === 0 ? -1 : 1;
    const x = side*(roadHalfAt(d) - 1.0);
    const yb = surfaceYAt(x, d);

    const cs = new THREE.Group();
    const body = box(1.15,0.82,0.72, woodM); body.position.y = 0.41; cs.add(body);
    const rim  = box(1.22,0.06,0.79, mat({ color:0x4a3a26, roughness:0.6 })); rim.position.y = 0.86; cs.add(rim);
    const lid  = box(1.06,0.26,0.62, glassMat); lid.position.y = 1.02; cs.add(lid);

    const spineTex = canvasTexture(512,128,(c,cw,ch)=>{
      c.clearRect(0,0,cw,ch);
      c.textAlign='center'; c.fillStyle='rgba(240,226,190,.92)';
      c.font='600 30px Georgia, serif';
      drawSpaced(c, bk.spine, cw/2, 78, 3, 'center');
    });
    spineTex.wrapS = spineTex.wrapT = THREE.ClampToEdgeWrapping;
    const book = makeBook(0.34, 0.075, 0.46, bk.colour, spineTex);
    book.position.set(0, 0.93, 0);
    book.rotation.y = 0.18;
    cs.add(book);

    const cap = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 0.3),
      new THREE.MeshBasicMaterial({ map: canvasTexture(600,180,(c,cw,ch)=>{
        c.clearRect(0,0,cw,ch);
        c.textAlign='center'; c.fillStyle='rgba(232,214,168,.9)'; c.font='600 30px Georgia, serif';
        for (const ln of wrapLines(c, bk.title, cw-30)) { c.fillText(ln, cw/2, 56); break; }
        c.fillStyle='rgba(185,150,63,.8)'; c.font='19px Helvetica, Arial, sans-serif';
        c.fillText('PRESS  E', cw/2, 118);
      }), transparent:true, toneMapped:false, depthWrite:false }));
    cap.position.set(0, 0.62, 0.37);
    cs.add(cap);

    const halo = new THREE.Mesh(new THREE.BoxGeometry(1.3,0.42,0.78), haloMat.clone());
    halo.position.y = 0.98; cs.add(halo);

    cs.position.set(x, yb, zOf(d));
    cs.rotation.y = side < 0 ? 0.32 : -0.32;
    g.add(cs);
    contactShadow(1.7,1.4,x,yb,zOf(d),g);
    addCollider(x, yb+0.55, zOf(d), 1.4, 1.1, 1.0);

    cs.userData.face = book.userData.face;
    cs.userData.halo = halo;
    cs.userData.stand  = new THREE.Vector3(x - side*1.7, CFG.eyeHeight, zOf(d) + 0.9);
    cs.userData.lookAt = new THREE.Vector3(x, yb + 0.95, zOf(d));
    registerInteractive(cs, { kind:'book', book:bk });
  });

  // room title
  const title = framedPanel(2.05, 1.0, simpleTexture('THE WRITINGS', [
    'Five works and bodies of record. Each case may be opened with E.',
    '',
    'Extracts are avoided; the exhibition summarises rather than reproduces, and names an edition to read instead.'
  ], { w:820, h:400 }), zone);
  mountOnWall(title, zone.startD + 4, -1, 1.72, { w:2.05, h:1.0 });
  g.add(title);
  registerInteractive(title, { kind:'record', record:{
    kicker:'THIS ROOM', tag:'context', title:'Five Works and Bodies of Record',
    date:'1918 — 1938', place:'—',
    what:'The cases in this room hold Bandi Jivan (1922), the manifesto The Revolutionary (1925), the Young India exchange of February 1925, the translation and edition history of the memoir, and the official conspiracy-case record that describes the same organisations from the prosecution\'s side.',
    why:'Between them these five bodies of text are almost the whole documentary basis for what can be said about Sanyal with confidence. Everything else in this exhibition is built on them.',
    note:'No copyrighted text is reproduced here. Each case names an edition to read instead.',
    sources:[SRC.bandi, SRC.maclean, SRC.cwmg, SRC.sedition], audioUrl:''
  }});
}

/* ── Zone 7 · the rotunda ───────────────────────────────────────────── */

function exhibitsLegacy(){
  const zone = ZONES[7], g = zoneGroups.legacy;

  // central memorial
  const stoneM = mat({ map:TEX.stone, color:0x8f867a, roughness:0.8 });
  const drum = new THREE.Mesh(new THREE.CylinderGeometry(2.6, 2.95, 0.5, 48), stoneM);
  drum.position.set(0, 0.25, ROT_CENTER_Z);
  g.add(drum);
  const drum2 = new THREE.Mesh(new THREE.CylinderGeometry(2.05, 2.35, 0.42, 48), stoneM);
  drum2.position.set(0, 0.68, ROT_CENTER_Z);
  g.add(drum2);
  addCollider(0, 1.2, ROT_CENTER_Z, 6.0, 2.4, 6.0);

  const steleTex = canvasTexture(900, 1150, (x,w,h)=>{
    x.fillStyle='#1e1b15'; x.fillRect(0,0,w,h);
    blotches(x,w,h,80,['46,40,30','12,11,8'],40,220,0.5);
    x.strokeStyle='rgba(200,168,90,.55)'; x.lineWidth=3; x.strokeRect(40,40,w-80,h-80);
    x.strokeStyle='rgba(200,168,90,.3)'; x.lineWidth=1; x.strokeRect(56,56,w-112,h-112);
    x.textAlign='center';
    x.fillStyle='#f2e3ba'; x.font='400 62px Georgia, serif';
    drawSpaced(x,'SACHINDRA', w/2, 330, 8, 'center');
    drawSpaced(x,'NATH SANYAL', w/2, 410, 8, 'center');
    x.strokeStyle='rgba(200,168,90,.6)'; x.lineWidth=2;
    x.beginPath(); x.moveTo(w*0.26,470); x.lineTo(w*0.74,470); x.stroke();
    x.fillStyle='rgba(226,206,158,.9)'; x.font='400 46px Georgia, serif';
    drawSpaced(x,'1893 — 1942', w/2, 545, 12, 'center');
    x.fillStyle='rgba(200,186,152,.62)'; x.font='24px Georgia, serif';
    const lines = [
      'Organiser across four provinces.',
      'Founder of the Hindustan Republican',
      'Association, Kanpur, October 1924.',
      'Author of Bandi Jivan, 1922.',
      'Transported for life twice.',
      'Died of tuberculosis contracted',
      'in the Cellular Jail, 7 February 1942.'
    ];
    let y = 660;
    for (const ln of lines){ x.fillText(ln, w/2, y); y += 40; }
    x.fillStyle='rgba(185,150,63,.7)'; x.font='600 17px Helvetica, Arial, sans-serif';
    drawSpaced(x,'PRESS  E', w/2, 1030, 4, 'center');
  },{ aniso:16 });

  // inscription on the two broad faces only; plain stone on the edges
  const steleFace = mat({ map:steleTex, roughness:0.72, metalness:0.06 });
  const stele = new THREE.Mesh(new THREE.BoxGeometry(3.1, 4.1, 0.85),
    [stoneM, stoneM, stoneM, stoneM, steleFace, steleFace]);
  stele.position.set(0, 2.95, ROT_CENTER_Z);
  g.add(stele);
  const cap = box(3.45, 0.22, 1.2, stoneM);
  cap.position.set(0, 5.12, ROT_CENTER_Z); g.add(cap);

  const ringGlow = new THREE.Mesh(new THREE.RingGeometry(3.3, 3.9, 64),
    new THREE.MeshBasicMaterial({ color:0xd9b75a, transparent:true, opacity:0.28,
      blending:THREE.AdditiveBlending, depthWrite:false, side:THREE.DoubleSide, toneMapped:false }));
  ringGlow.rotation.x = -Math.PI/2;
  ringGlow.position.set(0, 0.02, ROT_CENTER_Z);
  g.add(ringGlow);

  const steleHalo = new THREE.Mesh(new THREE.BoxGeometry(3.5,4.5,1.2), haloMat.clone());
  steleHalo.position.copy(stele.position); g.add(steleHalo);

  const centre = new THREE.Group();
  centre.userData.face = stele;
  centre.userData.halo = steleHalo;
  centre.userData.stand  = new THREE.Vector3(0, CFG.eyeHeight, ROT_CENTER_Z + 6.2);
  centre.userData.lookAt = new THREE.Vector3(0, 3.0, ROT_CENTER_Z);
  g.add(centre);
  registerInteractive(centre, { kind:'record', record:{
    kicker:'MEMORIAL', tag:'direct', title:'Sachindra Nath Sanyal, 1893 — 1942',
    date:'3 April 1893 — 7 February 1942', place:'Varanasi to Gorakhpur, by way of Port Blair',
    what:'Born at Varanasi in 1893. Organised revolutionary work across Bengal, Bihar, the United Provinces and the Punjab. Sentenced to transportation for life in the Benares Conspiracy Case and imprisoned in the Cellular Jail from 1916; released under the 1920 amnesty. Published Bandi Jivan in 1922. Co-founded the Hindustan Republican Association at Kanpur in October 1924 and wrote its manifesto, The Revolutionary, dated 1 January 1925. Arrested again in 1925 and transported for life a second time. Died at Gorakhpur on 7 February 1942 of tuberculosis contracted in prison.',
    why:'He is the connective figure of the north Indian revolutionary movement: the organiser who linked Bengal to the Punjab, the writer who made that movement legible to the generation that followed, and the founder of the organisation that became the HSRA. He did not live to see the republic his manifesto described.',
    note:'Everything in this summary is drawn from the panels behind you, each of which carries its own sources.',
    sources:[SRC.bandi, SRC.maclean, SRC.ichr, SRC.nai, SRC.kakori], audioUrl:''
  }});

  // ring of legacy displays
  const openHalf = Math.atan2(THROAT_HALFW, 11);
  LEGACY_PANELS.forEach((lp, i) => {
    const span = Math.PI*2 - openHalf*2 - 0.5;
    const th = openHalf + 0.25 + span*((i + 0.5)/LEGACY_PANELS.length);
    const R = ROT_RADIUS - 0.18;
    const px = Math.sin(th)*R, pz = ROT_CENTER_Z + Math.cos(th)*R;

    const tex = simpleTexture(lp.title, [lp.body], { w:760, h:520 });
    const fr = framedPanel(2.5, 1.7, tex, zone, { glass:true });
    fr.position.set(px, 2.15, pz);
    fr.rotation.y = th + Math.PI;
    fr.userData.stand  = new THREE.Vector3(Math.sin(th)*(R-3.4), CFG.eyeHeight, ROT_CENTER_Z + Math.cos(th)*(R-3.4));
    fr.userData.lookAt = new THREE.Vector3(px, 2.15, pz);
    g.add(fr);
    registerInteractive(fr, { kind:'record', record:{
      kicker:'LEGACY', tag:'context', title:lp.title,
      date:'—', place:'—', what:lp.body,
      why:'The legacy room gathers what outlasted him: an organisation, two texts, a prison that became a memorial, and a habit of overstatement that the record does not need.',
      sources:[lp.source], audioUrl:''
    }});

    const bx = Math.sin(th)*(R-2.0), bz = ROT_CENTER_Z + Math.cos(th)*(R-2.0);
    const bench = box(1.8, 0.42, 0.5, mat({ map:TEX.wood, color:0x6a5638, roughness:0.65 }));
    bench.position.set(bx, 0.21, bz);
    bench.rotation.y = th;
    g.add(bench);
    contactShadow(2.2, 1.0, bx, 0, bz, g);
    addCollider(bx, 0.25, bz, 1.9, 0.5, 1.9);
  });
}


/* ═══════════════════════════ museum fittings ═══════════════════════════
   Everything in this section is placed by one mechanism rather than by hand.
   A fitting declares its footprint; `findBay` walks the verge or the shoulder
   looking for a stretch that is clear of the road furniture already built —
   marker posts, benches, cases, bookshelves, chainage stones — and clear of
   the wall fittings registered in `wallSlots`. Nothing is positioned by eye,
   so nothing can clip, and a new exhibit added later is placed by the same
   rules. Decorative repeats are merged per zone into single draw calls.

   On sources: the exhibition holds no photographs and invents no quotations.
   Busts are abstracted sculptural forms, not likenesses; engraved stones carry
   documented titles and facts drawn from the data already in this file.     */

const FIT = {};
const walkColliders = [];          // footprints claimed by fittings this pass

/* ── palette ─────────────────────────────────────────────────────────── */
function fittingPalette(){
  FIT.bronze     = mat({ color:0x7d6132, roughness:0.46, metalness:0.9 });
  FIT.bronzeWorn = mat({ color:0x54452a, roughness:0.62, metalness:0.8 });
  FIT.sandstone  = mat({ map:TEX.ashlar, color:0x9c917c, roughness:0.94 });
  FIT.granite    = mat({ map:TEX.render, color:0x53514e, roughness:0.74, metalness:0.06 });
  FIT.iron       = mat({ color:0x1b1d1f, roughness:0.52, metalness:0.74 });
  FIT.timber     = mat({ map:TEX.wood, color:0x6d5940, roughness:0.72 });
  FIT.hedge      = mat({ color:0x2c3a26, roughness:0.95 });
  FIT.glass      = new THREE.MeshPhysicalMaterial({
    color:0xeaf1f4, transparent:true, opacity:0.075, roughness:0.05,
    metalness:0, clearcoat:1, clearcoatRoughness:0.05, depthWrite:false });
  FIT.label      = mat({ color:0x8d7038, roughness:0.4, metalness:0.88 });
}

/* ── placement ───────────────────────────────────────────────────────── */

/** x of the raised walkway centre, and of the road shoulder just inside the kerb. */
const vergeX    = (d, side) => side * (wallXAt(d) - 0.26);
const shoulderX = (d, side) => side * (roadHalfAt(d) - 0.72);

/* Interactive boards own the ground in front of them. Nothing decorative may
   stand inside that box, so the visitor always has a clear approach and an
   unobstructed [E] prompt. Built from the boards themselves, so a board added
   later is protected without any extra code. */
const posterZones = [];

function claimPosterZone(side, d, halfLen, reachIntoRoad){
  posterZones.push({ side, d0:d - halfLen, d1:d + halfLen, reach:reachIntoRoad });
}

function inPosterZone(x, z, halfW, halfL){
  const d = dOf(z);
  for (const p of posterZones){
    if (d + halfL < p.d0 || d - halfL > p.d1) continue;
    if (Math.sign(x) !== p.side) continue;
    const wall = wallXAt(d);
    if (Math.abs(x) - halfW < wall && Math.abs(x) + halfW > wall - p.reach) return true;
  }
  return false;
}

/** Is this footprint clear of everything already built? */
function bayFree(x, z, halfW, halfL, topY){
  if (inPosterZone(x, z, halfW, halfL)) return false;
  for (const b of colliders){
    if (x + halfW < b.min.x || x - halfW > b.max.x) continue;
    if (z + halfL < b.min.z || z - halfL > b.max.z) continue;
    return false;
  }
  for (const b of walkColliders){
    if (x + halfW < b.x0 || x - halfW > b.x1) continue;
    if (z + halfL < b.z0 || z - halfL > b.z1) continue;
    return false;
  }
  // a tall fitting hard against the wall must also clear the boards and lanterns
  if (topY > 0.9){
    const d = dOf(z), side = Math.sign(x) || 1;
    if (Math.abs(x) > wallXAt(d) - 0.75){
      if (!wallFree(side, d, halfL + 0.15, 0.4, topY, 0.15)) return false;
    }
  }
  return true;
}

function claimBay(x, z, halfW, halfL){
  walkColliders.push({ x0:x-halfW, x1:x+halfW, z0:z-halfL, z1:z+halfL });
}

/** Nearest free bay to `d` on the given line, or null. */
function findBay(d, side, halfW, halfL, topY, xFn, lo, hi, reach = 9){
  for (let step = 0; step <= reach; step += 0.6){
    for (const cand of (step === 0 ? [d] : [d + step, d - step])){
      if (cand < lo || cand > hi) continue;
      const x = xFn(cand, side), z = zOf(cand);
      if (bayFree(x, z, halfW, halfL, topY)) return { d:cand, x, z };
    }
  }
  return null;
}

/** Place a built fitting, registering it so nothing later lands on top of it. */
function placeFitting(zoneKey, bay, group, halfW, halfL, height, opts = {}){
  group.position.set(bay.x, surfaceYAt(bay.x, bay.d), bay.z);
  zoneGroups[zoneKey].add(group);
  claimBay(bay.x, bay.z, halfW, halfL);
  if (opts.solid !== false){
    addCollider(bay.x, surfaceYAt(bay.x, bay.d) + height/2, bay.z,
                halfW*2, height, halfL*2);
  }
  if (opts.light){
    lampFixtures.push({ pos:new THREE.Vector3(bay.x, surfaceYAt(bay.x,bay.d) + height + 0.5, bay.z),
                        colour:new THREE.Color(opts.light), power:opts.lightPower || 7, d:bay.d });
  }
  return group;
}

/* ── engraved lettering, reusing the road glyph atlas ─────────────────── */

function engrave(text, size, letterSpacing = 0.10, colour = 0xd9c48a, opacity = 0.95){
  if (!ATLAS.texture) return null;
  const m = new THREE.Mesh(textGeometry(text, size, letterSpacing),
    mat({ map:ATLAS.texture, alphaMap:ATLAS.texture, color:colour,
          transparent:true, opacity, roughness:0.42, metalness:0.7,
          emissive:colour, emissiveIntensity:0.07, depthWrite:false,
          polygonOffset:true, polygonOffsetFactor:-4, polygonOffsetUnits:-4 }));
  return m;
}

/* ── 1 · information pillar ──────────────────────────────────────────── */

function pillarPlateTexture(ev){
  return canvasTexture(420, 620, (x,w,h)=>{
    x.fillStyle = '#5d4a26'; x.fillRect(0,0,w,h);
    blotches(x,w,h,70,['122,98,52','58,44,22'],26,150,0.5);
    x.strokeStyle = 'rgba(232,214,166,.55)'; x.lineWidth = 3;
    x.strokeRect(20,20,w-40,h-40);
    x.strokeStyle = 'rgba(232,214,166,.28)'; x.lineWidth = 1;
    x.strokeRect(30,30,w-60,h-60);
    x.textAlign = 'center';
    x.fillStyle = '#f0dfae';
    drawFitted(x, ev.year, w/2, 108, w*0.74, 56, 5, '600', 'Cinzel, Georgia, serif');
    x.strokeStyle = 'rgba(232,214,166,.5)'; x.lineWidth = 2;
    x.beginPath(); x.moveTo(w*0.2,134); x.lineTo(w*0.8,134); x.stroke();
    x.fillStyle = '#e8d5a4';
    let y = 186;
    for (const ln of wrapLines(Object.assign(x, { font:'600 25px Cinzel, Georgia, serif' }),
                               stripTags(ev.title).toUpperCase(), w-80)){
      x.fillText(ln, w/2, y); y += 32;
    }
    y += 18;
    x.strokeStyle='rgba(232,214,166,.32)';
    x.beginPath(); x.moveTo(w*0.3,y-14); x.lineTo(w*0.7,y-14); x.stroke();
    x.fillStyle = 'rgba(238,222,182,.86)';
    x.font = '21px "Cormorant Garamond", Georgia, serif';
    const body = wrapLines(x, stripTags(ev.what), w-84);
    for (let i=0;i<Math.min(body.length, 9); i++){
      let ln = body[i];
      if (i === 8 && body.length > 9) ln = ln.replace(/\s\S*$/,'') + ' …';
      x.fillText(ln, w/2, y); y += 27;
    }
    x.fillStyle = 'rgba(232,214,166,.5)';
    x.font = '600 11px Helvetica, Arial, sans-serif';
    drawSpaced(x, 'PRESS  E', w/2, h-46, 3, 'center');
    noiseOverlay(x,w,h,14);
  }, { aniso:16 });
}

function buildPillar(ev){
  const g = new THREE.Group();
  const H = 1.62, W = 0.66, D = 0.24;
  const st = { granite:[], sandstone:[], bronze:[] };

  st.granite.push(new THREE.BoxGeometry(W + 0.14, 0.14, D + 0.14).translate(0, 0.07, 0));
  st.granite.push(new THREE.BoxGeometry(W, H - 0.28, D).translate(0, H/2 - 0.02, 0));
  st.sandstone.push(new THREE.BoxGeometry(W + 0.12, 0.10, D + 0.12).translate(0, H - 0.05, 0));
  for (const [bw,bh,bx,by] of [[W-0.02,0.045,0,H-0.20],[W-0.02,0.045,0,0.30],
                               [0.045,H-0.56,-W/2+0.03,(H-0.14)/2],[0.045,H-0.56,W/2-0.03,(H-0.14)/2]]){
    st.bronze.push(new THREE.BoxGeometry(bw,bh,0.03).translate(bx, by, D/2 + 0.005));
  }
  st.bronze.push(new THREE.CylinderGeometry(0.055,0.055,0.012,16)
    .rotateX(Math.PI/2).translate(0, H - 0.30, D/2 + 0.016));

  const face = new THREE.Mesh(new THREE.PlaneGeometry(W - 0.10, H - 0.60),
    mat({ map: pillarPlateTexture(ev), roughness:0.52, metalness:0.55 }));
  face.position.set(0, (H - 0.14)/2, D/2 + 0.014);
  g.add(face);

  const halo = new THREE.Mesh(new THREE.PlaneGeometry(W + 0.5, H + 0.4), haloMat.clone());
  halo.position.set(0, H/2, D/2 + 0.02);
  g.add(halo);

  g.userData.face = face;
  g.userData.halo = halo;
  return { group:g, w:W/2 + 0.12, l:D/2 + 0.12, h:H, statics:st };
}

/* ── 3 · bronze bust ─────────────────────────────────────────────────── */

function buildBust(node){
  const g = new THREE.Group();
  const H = 1.02;
  const st = { granite:[], sandstone:[], bronzeWorn:[] };
  st.granite.push(new THREE.BoxGeometry(0.52, H, 0.46).translate(0, H/2, 0));
  st.sandstone.push(new THREE.BoxGeometry(0.60, 0.07, 0.54).translate(0, H + 0.035, 0));

  /* Deliberately an abstracted sculptural mass, not a portrait: the exhibition
     has no verified likeness for any of these figures. */
  st.bronzeWorn.push(new THREE.CylinderGeometry(0.20, 0.26, 0.20, 14).translate(0, H + 0.16, 0));
  st.bronzeWorn.push(new THREE.CylinderGeometry(0.075, 0.10, 0.11, 12).translate(0, H + 0.31, 0));
  st.bronzeWorn.push(new THREE.SphereGeometry(0.135, 18, 14)
    .scale(0.86, 1.12, 0.94).translate(0, H + 0.46, 0));

  const plateTex = canvasTexture(512, 200, (x,w,h)=>{
    x.fillStyle='#5d4a26'; x.fillRect(0,0,w,h);
    blotches(x,w,h,40,['120,96,50','56,42,20'],20,110,0.5);
    x.strokeStyle='rgba(236,220,176,.5)'; x.lineWidth=2; x.strokeRect(12,12,w-24,h-24);
    x.textAlign='center'; x.fillStyle='#f2e2b4';
    drawFitted(x, node.label, w/2, 76, w*0.86, 34, 3, '600', 'Cinzel, Georgia, serif');
    x.fillStyle='rgba(238,224,184,.74)';
    x.font='20px \"Cormorant Garamond\", Georgia, serif';
    x.fillText(stripTags(node.role).slice(0, 58), w/2, 116);
    x.fillStyle='rgba(236,220,176,.45)';
    x.font='600 11px Helvetica, Arial, sans-serif';
    drawSpaced(x,'STYLISED FORM — NOT A LIKENESS   ·   PRESS  E', w/2, 160, 2.2, 'center');
  }, { aniso:16 });
  const plate = new THREE.Mesh(new THREE.PlaneGeometry(0.46, 0.18),
    mat({ map:plateTex, roughness:0.44, metalness:0.7 }));
  plate.position.set(0, H*0.66, 0.232);
  g.add(plate);

  const halo = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 1.7), haloMat.clone());
  halo.position.set(0, H*0.8, 0.24); g.add(halo);
  g.userData.face = plate;
  g.userData.halo = halo;
  return { group:g, w:0.34, l:0.32, h:H + 0.6, statics:st };
}

/* ── 2 · glass artefact case ─────────────────────────────────────────── */

function buildCase(af){
  const g = new THREE.Group(), st = { iron:[], timber:[], bronze:[] };
  const H = 0.86, W = 0.86, D = 0.52;
  for (const sx of [-1,1]) for (const sz of [-1,1])
    st.iron.push(new THREE.BoxGeometry(0.055,H,0.055).translate(sx*(W/2-0.05), H/2, sz*(D/2-0.05)));
  st.timber.push(new THREE.BoxGeometry(W,0.06,D).translate(0,H,0));
  st.bronze.push(new THREE.BoxGeometry(W+0.05,0.035,D+0.05).translate(0,H+0.045,0));

  // the artefact itself, abstracted by kind
  const inner = new THREE.Group(); inner.position.y = H + 0.07;
  if (af.kind === 'book'){
    const bk = box(0.28, 0.07, 0.38, mat({ color:af.tint || 0x6b3a26, roughness:0.7 }));
    bk.rotation.y = 0.2; inner.add(bk);
  } else if (af.kind === 'map'){
    const mp = new THREE.Mesh(new THREE.PlaneGeometry(0.46, 0.30),
      mat({ map:canvasTexture(512,340,mapPlate,{aniso:8}), roughness:0.9 }));
    mp.rotation.x = -Math.PI/2; mp.position.y = 0.006; inner.add(mp);
  } else {
    const sheets = [];
    for (let i=0;i<3;i++){
      sheets.push(new THREE.BoxGeometry(0.30, 0.006, 0.40)
        .rotateY((Math.random()-0.5)*0.28)
        .translate((Math.random()-0.5)*0.05, i*0.008, (Math.random()-0.5)*0.05));
    }
    mergeInto(inner, sheets, mat({ color:0xd6cbae, roughness:0.92 }));
  }
  g.add(inner);

  const hood = box(W-0.06, 0.34, D-0.06, FIT.glass); hood.position.y = H + 0.24; g.add(hood);

  const labTex = canvasTexture(512, 190, (x,w,h)=>{
    x.fillStyle='#ded3b6'; x.fillRect(0,0,w,h);
    blotches(x,w,h,40,['198,186,158','216,208,186'],18,90,0.4);
    x.strokeStyle='rgba(70,56,36,.5)'; x.lineWidth=2; x.strokeRect(10,10,w-20,h-20);
    x.textAlign='center'; x.fillStyle='#2b2318';
    drawFitted(x, af.name, w/2, 62, w*0.86, 30, 3, '600', 'Cinzel, Georgia, serif');
    x.fillStyle='rgba(43,35,24,.72)'; x.font='19px \"Cormorant Garamond\", Georgia, serif';
    x.fillText(af.year, w/2, 96);
    for (const [i,ln] of wrapLines(x, af.note, w-52).slice(0,2).entries()) x.fillText(ln, w/2, 124 + i*24);
  }, { aniso:16 });
  const label = new THREE.Mesh(new THREE.PlaneGeometry(0.44, 0.165),
    mat({ map:labTex, roughness:0.85 }));
  label.rotation.x = -0.95;
  label.position.set(0, H + 0.075, D/2 - 0.10);
  g.add(label);

  const halo = new THREE.Mesh(new THREE.PlaneGeometry(W+0.4, 0.9), haloMat.clone());
  halo.position.set(0, H + 0.2, D/2 + 0.02); g.add(halo);
  g.userData.face = label;
  g.userData.halo = halo;
  return { group:g, w:W/2 + 0.08, l:D/2 + 0.08, h:H + 0.45, statics:st };
}

/* ── 8 · cast-iron fingerpost ────────────────────────────────────────── */

function buildFingerpost(places){
  const g = new THREE.Group();
  const H = 2.25;
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.062, H, 10), FIT.iron);
  post.position.y = H/2; g.add(post);
  const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.17, 0.10, 12), FIT.iron);
  foot.position.y = 0.05; g.add(foot);
  const finial = new THREE.Mesh(new THREE.SphereGeometry(0.055, 10, 8), FIT.bronze);
  finial.position.y = H + 0.03; g.add(finial);

  places.forEach((p, i) => {
    const dir = i % 2 ? 1 : -1;
    const y = H - 0.28 - i*0.30;
    const arm = box(0.78, 0.135, 0.028, FIT.iron);
    arm.position.set(dir*0.40, y, 0);
    g.add(arm);
    const t = engrave(p, 0.072, 0.10, 0xe6d5a6, 0.95);
    if (t){ t.position.set(dir*0.40, y, 0.019); g.add(t); }
    const tip = box(0.06, 0.135, 0.03, FIT.bronze);
    tip.position.set(dir*0.79, y, 0); g.add(tip);
  });
  return { group:g, w:0.85, l:0.16, h:H };
}

/* ── 9 · engraved stone ──────────────────────────────────────────────── */

function buildStone(line, sub){
  const g = new THREE.Group();
  const W = 1.35, H = 0.60, D = 0.22;
  const body = box(W, H, D, FIT.sandstone); body.position.y = H/2; g.add(body);
  const cap  = box(W+0.06, 0.05, D+0.06, FIT.granite); cap.position.y = H + 0.025; g.add(cap);
  const t = engrave(line, 0.082, 0.13, 0xdccba0, 0.9);
  if (t){ t.position.set(0, H*0.60, D/2 + 0.012); g.add(t); }
  const s = engrave(sub, 0.045, 0.14, 0xbda87c, 0.7);
  if (s){ s.position.set(0, H*0.28, D/2 + 0.012); g.add(s); }
  return { group:g, w:W/2 + 0.06, l:D/2 + 0.06, h:H };
}

/* ── 10 / 12 / 13 · decorative furniture, merged per zone ────────────── */

/* Footprint of each kind, in metres: half-width across the tunnel (X) and
   half-length along it (Z). Anything long sits parallel to the wall. */
const DECOR_FOOTPRINT = {
  bench:   { w:0.34, l:0.86 },
  trunk:   { w:0.26, l:0.40 },
  planter: { w:0.26, l:0.38 },
  crates:  { w:0.24, l:0.28 },
  rail:    { w:0.12, l:1.00 }
};

/* These geometries are baked straight into world space — the placement pass
   merges them and never applies a rotation — so anything long has to be built
   along Z, the axis the tunnel runs on. Building along X put the bench broadside
   across the carriageway. `side` is a wall direction (±X), so offsets that push
   a part towards the wall belong on X, not Z. */
function decorGeoms(kind, x, y, z, side){
  const out = { timber:[], iron:[], stone:[], hedge:[], bronze:[] };
  const T = (geo, dx, dy, dz) => geo.translate(x+dx, y+dy, z+dz);

  if (kind === 'bench'){
    // seat: 0.42 deep across the walkway, 1.55 long down the tunnel
    out.timber.push(T(new THREE.BoxGeometry(0.42,0.075,1.55), 0, 0.46, 0));
    // backrest: a panel in the YZ plane, set against the wall and leaning into it
    out.timber.push(T(new THREE.BoxGeometry(0.06,0.34,1.55).rotateZ(-side*0.22),
                      side*0.17, 0.66, 0));
    for (const sz of [-1,1]){
      out.iron.push(T(new THREE.BoxGeometry(0.36,0.46,0.07), 0, 0.23, sz*0.66));
    }
  } else if (kind === 'planter'){
    out.stone.push(T(new THREE.BoxGeometry(0.40,0.42,0.62), 0, 0.21, 0));
    out.stone.push(T(new THREE.BoxGeometry(0.46,0.06,0.70), 0, 0.45, 0));
    out.hedge.push(T(new THREE.SphereGeometry(0.21,10,8).scale(1,1,1.3), 0, 0.58, 0));
  } else if (kind === 'rail'){
    out.iron.push(T(new THREE.BoxGeometry(0.05,0.86,0.05), 0, 0.43, -0.9));
    out.iron.push(T(new THREE.BoxGeometry(0.05,0.86,0.05), 0, 0.43,  0.9));
    out.iron.push(T(new THREE.BoxGeometry(0.035,0.035,1.85), 0, 0.80, 0));
    out.iron.push(T(new THREE.BoxGeometry(0.03,0.03,1.85), 0, 0.50, 0));
    for (let i=-3;i<=3;i++) out.iron.push(T(new THREE.BoxGeometry(0.022,0.34,0.022), 0, 0.64, i*0.26));
    for (const sz of [-1,1]) out.bronze.push(T(new THREE.SphereGeometry(0.04,8,6), 0, 0.88, sz*0.9));
  } else if (kind === 'crates'){
    out.timber.push(T(new THREE.BoxGeometry(0.34,0.36,0.44).rotateY(0.18), 0, 0.18, 0));
    out.timber.push(T(new THREE.BoxGeometry(0.26,0.26,0.32).rotateY(-0.3), 0.01, 0.49, 0.06));
    out.iron.push(T(new THREE.BoxGeometry(0.02,0.02,0.44), 0.14, 0.30, 0));
  } else if (kind === 'trunk'){
    out.timber.push(T(new THREE.BoxGeometry(0.38,0.30,0.62), 0, 0.15, 0));
    out.iron.push(T(new THREE.BoxGeometry(0.40,0.035,0.64), 0, 0.31, 0));
    for (const sz of [-1,1]) out.iron.push(T(new THREE.BoxGeometry(0.42,0.30,0.03), 0, 0.15, sz*0.24));
  }
  return out;
}

/* ── 7 · road medallions ─────────────────────────────────────────────── */

function medallionTexture(year){
  return canvasTexture(384, 384, (x,w,h)=>{
    x.clearRect(0,0,w,h);
    const cx=w/2, cy=h/2;
    x.strokeStyle='rgba(226,200,140,.92)'; x.lineWidth=7;
    x.beginPath(); x.arc(cx,cy,w*0.44,0,Math.PI*2); x.stroke();
    x.lineWidth=2.5;
    x.beginPath(); x.arc(cx,cy,w*0.38,0,Math.PI*2); x.stroke();
    for (let i=0;i<24;i++){
      const a=i/24*Math.PI*2;
      x.beginPath();
      x.moveTo(cx+Math.cos(a)*w*0.40, cy+Math.sin(a)*w*0.40);
      x.lineTo(cx+Math.cos(a)*w*0.425, cy+Math.sin(a)*w*0.425);
      x.stroke();
    }
    x.textAlign='center'; x.fillStyle='rgba(232,208,150,.95)';
    drawFitted(x, year, cx, cy+22, w*0.56, 78, 5, '600', 'Cinzel, Georgia, serif');
    // small stars above and below
    x.fillStyle='rgba(226,200,140,.85)';
    for (const sy of [-1,1]){
      x.beginPath();
      for (let k=0;k<10;k++){
        const r = k%2 ? w*0.022 : w*0.048, a = -Math.PI/2 + k*Math.PI/5;
        const px = cx + Math.cos(a)*r, py = cy + sy*w*0.255 + Math.sin(a)*r;
        k ? x.lineTo(px,py) : x.moveTo(px,py);
      }
      x.closePath(); x.fill();
    }
    x.globalCompositeOperation='destination-out';
    for (let i=0;i<90;i++){
      x.fillStyle=`rgba(0,0,0,${0.1+Math.random()*0.35})`;
      x.fillRect(Math.random()*w, Math.random()*h, 2+Math.random()*12, 2+Math.random()*7);
    }
    x.globalCompositeOperation='source-over';
  }, { aniso:16 });
}

/* ── 4 · era archway ─────────────────────────────────────────────────── */

function buildArchway(zone){
  const d = zone.startD - 1.2;
  const { ht } = profileAt(d);
  const WX = wallXAt(d), SPR = springingAt(ht);
  const g = new THREE.Group();
  const pts = sectionPoints(d);
  const ring = [];
  for (let i=0;i<pts.length-1;i++){
    if (pts[i].band !== BAND.ARCH && pts[i].band !== BAND.WALL) continue;
    const a = pts[i], b = pts[i+1];
    const len = Math.hypot(b.x-a.x, b.y-a.y);
    const ang = Math.atan2(b.y-a.y, b.x-a.x);
    const nx = -Math.sin(ang)*0.13, ny = Math.cos(ang)*0.13;
    ring.push(new THREE.BoxGeometry(len*1.08, 0.26, 0.44)
      .rotateZ(ang).translate((a.x+b.x)/2 + nx, (a.y+b.y)/2 + ny, zOf(d)));
  }
  mergeInto(g, ring, FIT.sandstone);

  // bronze keystone with the era engraved on it
  const key = box(1.05, 0.5, 0.5, FIT.bronzeWorn);
  key.position.set(0, ht - 0.34, zOf(d)); g.add(key);
  for (const face of [1,-1]){
    const t = engrave(zone.name.replace(/ /g,'\n'), 0.16, 0.14, 0xe8d19a, 0.95);
    if (t){
      t.position.set(0, SPR + (ht-SPR)*0.42, zOf(d) + face*0.30);
      if (face < 0) t.rotation.y = Math.PI;
      g.add(t);
    }
    if (zone.years){
      const y2 = engrave(zone.years, 0.10, 0.16, 0xcbb47e, 0.8);
      if (y2){
        y2.position.set(0, SPR + (ht-SPR)*0.42 - 0.32, zOf(d) + face*0.30);
        if (face < 0) y2.rotation.y = Math.PI;
        g.add(y2);
      }
    }
  }
  // gold impost blocks where the arch springs
  for (const sx of [-1,1]){
    const imp = box(0.34, 0.22, 0.52, FIT.bronze);
    imp.position.set(sx*(WX - 0.1), SPR, zOf(d)); g.add(imp);
  }
  lampFixtures.push({ pos:new THREE.Vector3(0, SPR + 0.5, zOf(d) + 1.1),
                      colour:new THREE.Color(0xffd9a0), power:16, d });
  zoneGroups[zone.key].add(g);
  for (const side of [-1,1]) claimWall(side, d, 0.5, 0.3, ht, 'archway');
}

/* ── catalogues ──────────────────────────────────────────────────────── */

/* Real classes of document, each tied to a source already cited elsewhere in
   this exhibition. The cases hold reconstructions, and say so. */
const ARTEFACTS = [
  { id:'af-bandi',     name:'BANDI JIVAN',              year:'BENGALI, 1922', kind:'book', tint:0x6b3a26, zone:'network',
    note:'Sanyal&rsquo;s memoir of the underground and of the Andamans.', source:SRC.bandi },
  { id:'af-manifesto', name:'THE REVOLUTIONARY',        year:'1 JANUARY 1925', kind:'paper', zone:'network',
    note:'The four-page HRA manifesto, circulated across northern India.', source:SRC.maclean },
  { id:'af-younginda', name:'YOUNG INDIA',              year:'FEBRUARY 1925', kind:'paper', zone:'network',
    note:'The exchange between Sanyal and Gandhi, printed together.', source:SRC.cwmg },
  { id:'af-judgment',  name:'KAKORI CASE PAPERS',       year:'6 APRIL 1927', kind:'paper', zone:'kakori',
    note:'Judgment of the Special Sessions Court at Lucknow.', source:SRC.kakori },
  { id:'af-sedition',  name:'SEDITION COMMITTEE REPORT',year:'CALCUTTA, 1918', kind:'book', tint:0x3f4a55, zone:'revolution',
    note:'The official account of the conspiracies of 1912 to 1915.', source:SRC.sedition },
  { id:'af-jail',      name:'CELLULAR JAIL RECORDS',    year:'1916 &mdash; 1938', kind:'paper', zone:'prison',
    note:'Convict registers, petitions and medical remarks from Port Blair.', source:SRC.andaman },
  { id:'af-map',       name:'NORTHERN INDIA',           year:'THE RAILWAY GEOGRAPHY', kind:'map', zone:'early',
    note:'The line along which the whole network was organised.', source:SRC.sarkar },
  { id:'af-dictionary',name:'DICTIONARY OF MARTYRS',    year:'ICHR', kind:'book', tint:0x5b4a2c, zone:'legacy',
    note:'The register in which these lives are formally recorded.', source:SRC.ichr }
];

/** Busts: NETWORK ids only, so every name carries its own sourced context. */
const BUSTS = ['sns', 'rbb', 'bismil', 'ashfaq', 'azad'];

/* Engraved stones carry documented titles and facts drawn from the data above.
   This exhibition does not invent quotations and does not attribute them. */
const STONES = [
  ['A FEDERAL REPUBLIC OF THE\nUNITED STATES OF INDIA', 'OBJECT OF THE HRA · THE REVOLUTIONARY · 1925', 'network'],
  ['BANDI JIVAN', 'A LIFE OF CAPTIVITY · 1922', 'writings'],
  ['SEVEN WINGS · 693 CELLS\nNO CELL FACED ANOTHER', 'CELLULAR JAIL, PORT BLAIR · COMPLETED 1906', 'prison'],
  ['TRANSPORTED FOR LIFE\nTWICE', 'BENARES 1916 · AND AGAIN FROM 1925', 'kakori'],
  ['1893 — 1942', 'DIED OF TUBERCULOSIS CONTRACTED IN PRISON', 'legacy']
];

const SIGNPOSTS = [
  ['BENGAL', 'BANARAS', 'PATNA'],
  ['LAHORE', 'DELHI', 'KANPUR'],
  ['SHAHJAHANPUR', 'LUCKNOW', 'KAKORI'],
  ['PORT BLAIR', 'GORAKHPUR', 'CALCUTTA']
];


/* ── period-specific exhibits ─────────────────────────────────────────
   Each period gets objects that belong to it, so the verge tells the story
   rather than decorating it. Every builder returns the same shape:
   { group, w, l, h, statics } — statics are merged per period, so a dozen
   exhibits cost a handful of draw calls.                                  */

function labelPlate(title, sub, w = 512, h = 190){
  return canvasTexture(w, h, (x,cw,ch)=>{
    x.fillStyle='#ded3b6'; x.fillRect(0,0,cw,ch);
    blotches(x,cw,ch,40,['198,186,158','216,208,186'],18,90,0.4);
    x.strokeStyle='rgba(70,56,36,.5)'; x.lineWidth=2; x.strokeRect(10,10,cw-20,ch-20);
    x.textAlign='center'; x.fillStyle='#2b2318';
    drawFitted(x, title, cw/2, 68, cw*0.86, 30, 3, '600', 'Cinzel, Georgia, serif');
    x.fillStyle='rgba(43,35,24,.72)'; x.font='19px "Cormorant Garamond", Georgia, serif';
    for (const [i,ln] of wrapLines(x, sub, cw-52).slice(0,3).entries()) x.fillText(ln, cw/2, 104 + i*24);
  }, { aniso:16 });
}

function faceAndHalo(g, tex, pw, ph, px, py, pz, rx, hw, hh){
  const label = new THREE.Mesh(new THREE.PlaneGeometry(pw, ph),
    mat({ map:tex, roughness:0.85 }));
  label.position.set(px, py, pz);
  if (rx) label.rotation.x = rx;
  g.add(label);
  const halo = new THREE.Mesh(new THREE.PlaneGeometry(hw, hh), haloMat.clone());
  halo.position.set(0, py + 0.2, pz + 0.02);
  g.add(halo);
  g.userData.face = label;
  g.userData.halo = halo;
}

/** Glass-topped map table — Early Life, Swadeshi, Kakori. */
function buildMapTable(title, sub){
  const g = new THREE.Group(), st = { iron:[], timber:[], bronze:[] };
  const H = 0.82, W = 1.05, D = 0.68;
  for (const sx of [-1,1]) for (const sz of [-1,1])
    st.iron.push(new THREE.BoxGeometry(0.055,H,0.055).translate(sx*(W/2-0.06), H/2, sz*(D/2-0.06)));
  st.timber.push(new THREE.BoxGeometry(W,0.06,D).translate(0,H,0));
  st.bronze.push(new THREE.BoxGeometry(W+0.05,0.03,D+0.05).translate(0,H+0.045,0));
  const map = new THREE.Mesh(new THREE.PlaneGeometry(W-0.14, D-0.14),
    mat({ map:canvasTexture(640,420,mapPlate,{aniso:8}), roughness:0.9 }));
  map.rotation.x = -Math.PI/2; map.position.y = H + 0.065; g.add(map);
  const hood = new THREE.Mesh(new THREE.BoxGeometry(W-0.04,0.14,D-0.04), FIT.glass);
  hood.position.y = H + 0.13; g.add(hood);
  faceAndHalo(g, labelPlate(title, sub), 0.44, 0.16, 0, H+0.30, D/2-0.06, -1.0, W+0.3, 0.8);
  return { group:g, w:W/2+0.08, l:D/2+0.08, h:H+0.35, statics:st };
}

/** Framed newspaper on a cast-iron easel — Swadeshi, Revolution, Kakori. */
function buildNewsStand(headline, sub, kicker){
  const g = new THREE.Group(), st = { iron:[], bronze:[] };
  const H = 1.30;
  st.iron.push(new THREE.CylinderGeometry(0.035,0.05,H,10).translate(0,H/2,0));
  st.iron.push(new THREE.CylinderGeometry(0.16,0.19,0.06,12).translate(0,0.03,0));
  st.iron.push(new THREE.BoxGeometry(0.70,0.05,0.05).translate(0,H-0.06,0));
  for (const [bw,bh,bx,by] of [[0.78,0.05,0,H+0.52],[0.78,0.05,0,H-0.02],
                               [0.05,0.58,-0.365,H+0.25],[0.05,0.58,0.365,H+0.25]])
    st.bronze.push(new THREE.BoxGeometry(bw,bh,0.04).translate(bx,by,0));
  const sheet = new THREE.Mesh(new THREE.PlaneGeometry(0.68, 0.50),
    mat({ map:canvasTexture(560,412,(x,w,h)=>newsPlate(x,w,h,headline,sub,kicker),{aniso:16}),
          roughness:0.82 }));
  sheet.position.set(0, H+0.25, 0.024); g.add(sheet);
  faceAndHalo(g, labelPlate(kicker, sub), 0.42, 0.15, 0, H-0.16, 0.06, -0.5, 0.95, 1.1);
  g.userData.face = sheet;
  return { group:g, w:0.44, l:0.16, h:H+0.6, statics:st };
}

/** A barred cell door set in a stone jamb — Imprisonment only. */
function buildCellDoor(){
  const g = new THREE.Group(), st = { granite:[], iron:[] };
  const H = 1.95, W = 0.92;
  st.granite.push(new THREE.BoxGeometry(W+0.34,0.16,0.34).translate(0,0.08,0));
  for (const sx of [-1,1])
    st.granite.push(new THREE.BoxGeometry(0.17,H,0.30).translate(sx*(W/2+0.085), H/2, 0));
  st.granite.push(new THREE.BoxGeometry(W+0.34,0.18,0.30).translate(0,H-0.09,0));
  for (let i=0;i<7;i++)
    st.iron.push(new THREE.CylinderGeometry(0.022,0.022,H-0.34,8)
      .translate(-W/2+0.09+i*((W-0.18)/6), (H-0.18)/2, 0));
  for (const y of [0.42, H-0.46])
    st.iron.push(new THREE.BoxGeometry(W-0.10,0.05,0.05).translate(0,y,0));
  st.iron.push(new THREE.BoxGeometry(0.13,0.19,0.07).translate(W/2-0.19,0.95,0.05));
  faceAndHalo(g, labelPlate('CELLULAR JAIL', 'Seven wings, 693 single cells. No cell faced another.'),
              0.46, 0.17, 0, 0.66, 0.20, -0.35, 1.2, 1.9);
  return { group:g, w:(W+0.34)/2, l:0.22, h:H, statics:st };
}

/** Writing desk with a manuscript — Writings, and the prison cell. */
function buildWritingDesk(){
  const g = new THREE.Group(), st = { timber:[], iron:[], bronze:[] };
  const H = 0.76, W = 1.10, D = 0.62;
  st.timber.push(new THREE.BoxGeometry(W,0.06,D).translate(0,H,0));
  st.timber.push(new THREE.BoxGeometry(W-0.16,0.14,D-0.14).translate(0,H-0.10,0));
  for (const sx of [-1,1]) for (const sz of [-1,1])
    st.timber.push(new THREE.BoxGeometry(0.07,H,0.07).translate(sx*(W/2-0.09), H/2, sz*(D/2-0.09)));
  st.bronze.push(new THREE.CylinderGeometry(0.035,0.045,0.06,10).translate(-0.34,H+0.06,-0.08));
  st.iron.push(new THREE.CylinderGeometry(0.006,0.006,0.17,6).rotateZ(0.5).translate(-0.28,H+0.10,0.02));
  for (let i=0;i<4;i++){
    const sh = new THREE.Mesh(new THREE.PlaneGeometry(0.30,0.40),
      mat({ color:0xd8ceb2, roughness:0.94 }));
    sh.rotation.x = -Math.PI/2; sh.rotation.z = (Math.random()-0.5)*0.3;
    sh.position.set(0.06 + (Math.random()-0.5)*0.05, H+0.035+i*0.004, (Math.random()-0.5)*0.06);
    g.add(sh);
  }
  faceAndHalo(g, labelPlate('THE WRITING DESK', 'Bandi Jivan was written after release, not smuggled from a cell.'),
              0.42, 0.15, 0, H+0.14, D/2-0.04, -1.1, 1.1, 0.7);
  return { group:g, w:W/2+0.06, l:D/2+0.06, h:H+0.2, statics:st };
}

/** Railway signal lamp on a post — Kakori. */
function buildRailLamp(){
  const g = new THREE.Group(), st = { iron:[], bronze:[] };
  const H = 1.72;
  st.iron.push(new THREE.CylinderGeometry(0.04,0.055,H,10).translate(0,H/2,0));
  st.iron.push(new THREE.CylinderGeometry(0.15,0.18,0.07,12).translate(0,0.035,0));
  st.iron.push(new THREE.BoxGeometry(0.26,0.34,0.26).translate(0,H+0.12,0));
  st.bronze.push(new THREE.ConeGeometry(0.19,0.13,4).rotateY(Math.PI/4).translate(0,H+0.34,0));
  const lens = new THREE.Mesh(new THREE.CircleGeometry(0.085,14),
    new THREE.MeshBasicMaterial({ color:0xffc06a, toneMapped:false }));
  lens.position.set(0, H+0.12, 0.132); g.add(lens);
  faceAndHalo(g, labelPlate('THE 8 DOWN', '9 August 1925, between Shahjahanpur and Lucknow.'),
              0.42, 0.15, 0, H-0.42, 0.05, -0.4, 0.9, 1.2);
  return { group:g, w:0.2, l:0.2, h:H+0.4, statics:st, glow:0xffc06a };
}

/** Low bronze plaque on a stone base — used for the smaller entries. */
function buildPlaque(ev){
  const g = new THREE.Group(), st = { granite:[], bronze:[] };
  const H = 0.74, W = 0.86;
  st.granite.push(new THREE.BoxGeometry(W+0.12,0.12,0.42).translate(0,0.06,0));
  st.granite.push(new THREE.BoxGeometry(W,H-0.12,0.30).translate(0,(H-0.12)/2+0.06,0));
  st.bronze.push(new THREE.BoxGeometry(W-0.10,0.44,0.035).rotateX(-0.42).translate(0,H-0.14,0.15));
  const tex = labelPlate(ev.year, stripTags(ev.title), 512, 240);
  const face = new THREE.Mesh(new THREE.PlaneGeometry(W-0.14, 0.40),
    mat({ map:tex, roughness:0.44, metalness:0.68 }));
  face.rotation.x = -0.42;
  face.position.set(0, H-0.135, 0.168);
  g.add(face);
  const halo = new THREE.Mesh(new THREE.PlaneGeometry(W+0.4, 0.9), haloMat.clone());
  halo.position.set(0, H-0.1, 0.2); g.add(halo);
  g.userData.face = face; g.userData.halo = halo;
  return { group:g, w:W/2+0.08, l:0.26, h:H, statics:st };
}

/* ── the placement pass ──────────────────────────────────────────────────
   Curated, not scattered. Priority runs:
       interactive board  →  the visitor's clearance  →  exhibit  →  decoration
   A board never yields: its approach box is reserved before anything else is
   placed, and every exhibit is seated on the OPPOSITE verge so it can never
   stand between the visitor and a poster. Exhibits are drawn from a per-period
   catalogue with a no-repeat rule, so the same object never recurs nearby. */

/** What belongs to each period. Order is the order they are offered. */
const EXHIBIT_KIT = {
  early:      ['maptable', 'case', 'pillar', 'bust'],
  revolution: ['newsstand', 'case', 'pillar', 'bust', 'maptable'],
  network:    ['case', 'pillar', 'bust', 'newsstand'],
  kakori:     ['raillamp', 'newsstand', 'case', 'pillar', 'maptable'],
  prison:     ['celldoor', 'desk', 'case', 'pillar'],
  writings:   ['desk', 'case', 'pillar', 'bust'],
  legacy:     ['pillar', 'case', 'bust']
};

const NEWS_FOR = {
  revolution: ['THE FEBRUARY PLAN SUPPRESSED', 'Arrests across the Punjab and the United Provinces.', 'FEBRUARY 1915'],
  network:    ['A MANIFESTO IN CIRCULATION', 'Four pages, dated 1 January 1925, distributed in several cities.', '1 JANUARY 1925'],
  kakori:     ['TRAIN STOPPED NEAR KAKORI', 'Government treasury cash removed from the 8 Down.', '9 AUGUST 1925'],
  early:      ['BENGAL PARTITIONED', 'Boycott and Swadeshi campaigns follow across the province.', '16 OCTOBER 1905']
};

function createMuseumFittings(){
  fittingPalette();

  const decor = {}, medallionSeen = {};
  const MATKEY = { granite:'granite', sandstone:'sandstone', bronze:'bronze', bronzeWorn:'bronzeWorn',
                   iron:'iron', timber:'timber', hedge:'hedge', stone:'sandstone' };
  for (const z of ZONES){
    decor[z.key] = { granite:[], sandstone:[], bronze:[], bronzeWorn:[], iron:[], timber:[], hedge:[] };
  }

  const zoneOf = d => zoneAtD(clamp(d, 0, CORRIDOR_LEN - 1));
  const limits = d => { const z = zoneOf(d); return [z.startD + 3, z.endD - 3]; };
  const M4 = new THREE.Matrix4();

  /** Bake a fitting's structural geometry into its period's merge batch. */
  const bakeStatics = (zoneKey, st, x, y, z, rotY) => {
    if (!st) return;
    M4.makeRotationY(rotY); M4.setPosition(x, y, z);
    for (const k in st){
      const target = decor[zoneKey][MATKEY[k] || 'granite'];
      for (const geo of st[k]) target.push(geo.applyMatrix4(M4));
    }
  };

  /** Seat a fitting in the nearest clear bay. Returns the bay, or null. */
  const seat = (d, side, built, payload, line, opts = {}) => {
    line = line || vergeX;
    const [lo, hi] = limits(d);
    const bay = findBay(d, side, built.w, built.l, built.h, line, lo, hi, opts.reach || 11);
    if (!bay) return null;                       // better an empty verge than a bad placement
    const zk = zoneOf(bay.d).key;
    const y = surfaceYAt(bay.x, bay.d);
    const rotY = side < 0 ? Math.PI/2 : -Math.PI/2;

    bakeStatics(zk, built.statics, bay.x, y, bay.z, rotY);
    built.group.position.set(bay.x, y, bay.z);
    built.group.rotation.y = rotY;
    zoneGroups[zk].add(built.group);

    claimBay(bay.x, bay.z, built.w, built.l);
    addCollider(bay.x, y + built.h/2, bay.z, built.w*2, built.h, built.l*2);
    contactShadow(built.w*3, built.l*4, bay.x, y, bay.z, zoneGroups[zk]);
    lampFixtures.push({ pos:new THREE.Vector3(bay.x, y + built.h + 0.45, bay.z),
                        colour:new THREE.Color(built.glow || 0xffd9a0),
                        power: opts.power || 6, d: bay.d });
    if (payload){
      built.group.userData.stand = new THREE.Vector3(
        side * Math.max(Math.abs(bay.x) - 2.3, 0.8), CFG.eyeHeight, bay.z);
      built.group.userData.lookAt = new THREE.Vector3(bay.x, y + built.h*0.62, bay.z);
      registerInteractive(built.group, payload);
    }
    return bay;
  };

  /* ── exhibits, one per event, drawn from the period's own kit ───────── */

  const lastAt = {};                                  // kind → distance last used
  const MIN_REPEAT = 48;                              // metres before a kind may recur

  const makeExhibit = (kind, ev, zoneKey) => {
    const news = NEWS_FOR[zoneKey] || NEWS_FOR.revolution;
    switch (kind){
      case 'pillar':    return [buildPillar(ev), { kind:'event', event:ev }];
      case 'plaque':    return [buildPlaque(ev), { kind:'event', event:ev }];
      case 'maptable':  return [buildMapTable('THE NETWORK BY RAIL', 'Lahore · Delhi · Kanpur · Lucknow · Banaras · Patna · Calcutta'),
                                { kind:'record', record:{ kicker:'MAP TABLE', tag:'context', zone:zoneKey,
                                  title:'Northern India by Rail', date:'1912 — 1927', place:'—',
                                  what:'Every organisational act in this exhibition happened along the main line of northern India.',
                                  why:'The railway is what made a network across four provinces possible for people with no money and no legal standing — and equally what let the police follow them.',
                                  sources:[SRC.sarkar, SRC.maclean], audioUrl:'' } }];
      case 'newsstand': return [buildNewsStand(news[0], news[1], news[2]),
                                { kind:'record', record:{ kicker:'ARCHIVE PLATE', tag:'broader', zone:zoneKey,
                                  title:news[0], date:news[2], place:'—', what:news[1],
                                  why:'Public knowledge of these events was formed by press coverage. The plate is a representation prepared for this exhibition; no wording has been invented and no original newspaper reproduced.',
                                  sources:[SRC.maclean, SRC.nai], audioUrl:'' } }];
      case 'celldoor':  return [buildCellDoor(),
                                { kind:'record', record:{ kicker:'THE ANDAMANS', tag:'context', zone:'prison',
                                  title:'A Cell in the Cellular Jail', date:'completed 1906', place:'Port Blair',
                                  what:'Seven wings radiating from a central tower, 693 single cells, angled so that no cell faced another.',
                                  why:'The building was designed to make organisation impossible. Solitude was the punishment.',
                                  sources:[SRC.andaman], audioUrl:'' } }];
      case 'desk':      return [buildWritingDesk(),
                                { kind:'record', record:{ kicker:'THE DESK', tag:'direct', zone:'writings',
                                  title:'Where Bandi Jivan Was Written', date:'1920 — 1922', place:'The mainland, after the amnesty',
                                  what:'Bandi Jivan was written after release, not smuggled out of a cell — and written knowing the censor would read it.',
                                  why:'That shapes what the memoir does and does not say, and it is why the book reads as argument as much as recollection.',
                                  sources:[SRC.bandi], audioUrl:'' } }];
      case 'raillamp':  return [buildRailLamp(),
                                { kind:'record', record:{ kicker:'THE ACTION', tag:'broader', zone:'kakori',
                                  title:'The 8 Down', date:'9 August 1925', place:'Near Kakori',
                                  what:'A party of HRA members stopped the 8 Down train between Shahjahanpur and Lucknow and took the government treasury cash it carried.',
                                  why:'It funded almost nothing and cost the association everything: the arrests that followed broke it within two years.',
                                  note:'Sanyal had been arrested earlier in 1925 and took no part in it.',
                                  sources:[SRC.kakori, SRC.maclean], audioUrl:'' } }];
      case 'bust': {
        const id = BUSTS[(bustIdx++) % BUSTS.length];
        const n = NETWORK.nodes.find(q => q.id === id);
        return n ? [buildBust(n), { kind:'node', node:n }] : null;
      }
      case 'case': {
        const af = ARTEFACTS[(afIdx++) % ARTEFACTS.length];
        return [buildCase(af), { kind:'record', record:{
          kicker:'FROM THE ARCHIVE', tag:'context', title:af.name, date:af.year, zone:af.zone,
          place:'—', what:af.note,
          why:'The cases hold reconstructions built for this exhibition, not originals. They mark what kind of document the record actually rests on — a memoir, a manifesto, a court file, a jail register.',
          note:'No original artefact is reproduced here. Consult the cited edition or archive.',
          sources:[af.source], audioUrl:'' } }];
      }
    }
    return null;
  };

  let bustIdx = 0, afIdx = 0;

  TIMELINE.forEach((ev, i) => {
    const zoneKey = zoneOf(ev.absD).key;
    const kit = EXHIBIT_KIT[zoneKey] || EXHIBIT_KIT.revolution;
    const major = ev.involvement === 'direct' || !!EXTRA[ev.id];

    // pick the first kit entry that has not been used nearby
    let chosen = null;
    for (let k = 0; k < kit.length && !chosen; k++){
      const kind = kit[(i + k) % kit.length];
      if (lastAt[kind] !== undefined && Math.abs(ev.absD - lastAt[kind]) < MIN_REPEAT) continue;
      chosen = kind;
    }
    if (!chosen) chosen = 'plaque';                 // everything nearbyhas been used
    if (!major) chosen = 'plaque';                  // minor entries get the small marker

    const made = makeExhibit(chosen, ev, zoneKey);
    if (!made) return;
    // always on the far verge from the board, so it can never block the approach
    const side = ev.side === 'left' ? 1 : -1;
    const bay = seat(ev.absD, side, made[0], made[1]);
    if (bay) lastAt[chosen] = bay.d;
  });

  /* ── era archways ──────────────────────────────────────────────────── */
  for (const z of ZONES) if (z.key !== 'entrance') buildArchway(z);

  /* ── engraved stones and fingerposts, spaced between the exhibits ──── */
  for (const [line, sub, zk] of STONES){
    const z = ZONES.find(q => q.key === zk);
    if (!z) continue;
    const built = buildStone(line, sub);
    const bay = findBay(z.startD + z.length*0.62, 1, built.w, built.l, built.h,
                        shoulderX, z.startD + 6, z.endD - 6, 14);
    if (!bay) continue;
    bakeStatics(z.key, built.statics, bay.x, surfaceYAt(bay.x,bay.d), bay.z, -Math.PI/2);
    built.group.position.set(bay.x, surfaceYAt(bay.x, bay.d), bay.z);
    built.group.rotation.y = -Math.PI/2;
    zoneGroups[z.key].add(built.group);
    claimBay(bay.x, bay.z, built.w, built.l);
    addCollider(bay.x, surfaceYAt(bay.x,bay.d) + built.h/2, bay.z, built.w*2, built.h, built.l*2);
  }

  SIGNPOSTS.forEach((places, i) => {
    const d = 34 + i * (CORRIDOR_LEN - 80) / SIGNPOSTS.length;
    const side = i % 2 ? -1 : 1;
    const built = buildFingerpost(places);
    const [lo, hi] = limits(d);
    const bay = findBay(d, side, built.w, built.l, built.h, vergeX, lo, hi, 14);
    if (!bay) return;
    built.group.position.set(bay.x, surfaceYAt(bay.x, bay.d), bay.z);
    built.group.rotation.y = side < 0 ? Math.PI/2 : -Math.PI/2;
    zoneGroups[zoneOf(bay.d).key].add(built.group);
    claimBay(bay.x, bay.z, 0.2, built.l);
  });

  /* ── quiet decoration, only where the walk would otherwise be blank ── */
  const interest = [];
  for (const b of walkColliders) interest.push(dOf((b.z0 + b.z1)/2));
  for (const ev of TIMELINE) interest.push(ev.absD);
  const nearestInterest = d => {
    let best = Infinity;
    for (const t of interest) best = Math.min(best, Math.abs(t - d));
    return best;
  };

  const kinds = ['bench','planter','rail','crates','trunk'];
  let prev = null, k = 0;

  for (let d = 14; d < CORRIDOR_LEN - 10; d += 5){
    const zone = zoneOf(d);
    if (zone.key === 'entrance') continue;
    const gap = nearestInterest(d);

    if (gap > 6){
      for (const side of [-1, 1]){
        let kind = kinds[(k++) % kinds.length];
        if (kind === prev) kind = kinds[(k++) % kinds.length];   // never twice running
        prev = kind;
        const fp = DECOR_FOOTPRINT[kind] || { w:0.42, l:0.34 };
        const halfW = fp.w, halfL = fp.l;
        const bay = findBay(d + (side < 0 ? 0 : 2.5), side, halfW, halfL, 0.9,
                            vergeX, zone.startD + 2, zone.endD - 2, 4);
        if (!bay) continue;
        const geoms = decorGeoms(kind, bay.x, surfaceYAt(bay.x, bay.d), bay.z, side);
        for (const m in geoms) decor[zone.key][MATKEY[m] || 'granite'].push(...geoms[m]);
        claimBay(bay.x, bay.z, halfW, halfL);
        if (kind !== 'rail') addCollider(bay.x, surfaceYAt(bay.x,bay.d)+0.3, bay.z, halfW*2, 0.7, halfL*2);
      }
    }

    if (gap > 8){                        // a bronze year medallion on the road
      const t = clamp((d - zone.startD) / zone.length, 0, 1);
      const yr = String(Math.round(lerp(zone.yearFrom, zone.yearTo, t)));
      if (!medallionSeen[yr]){
        medallionSeen[yr] = true;
        const geo = new THREE.PlaneGeometry(1.15, 1.15).rotateX(-Math.PI/2)
          .translate(0, surfaceYAt(0, d) + 0.008, zOf(d));
        zoneGroups[zone.key].add(new THREE.Mesh(geo, mat({
          map: medallionTexture(yr), transparent:true, color:0xd8bd82,
          roughness:0.34, metalness:0.9, emissive:0x2e2308, emissiveIntensity:0.22,
          depthWrite:false, polygonOffset:true, polygonOffsetFactor:-5, polygonOffsetUnits:-5 })));
      }
    }
  }

  // bake every period's structural geometry down to one call per material
  for (const z of ZONES){
    const D = decor[z.key];
    mergeInto(zoneGroups[z.key], D.granite,    FIT.granite);
    mergeInto(zoneGroups[z.key], D.sandstone,  FIT.sandstone);
    mergeInto(zoneGroups[z.key], D.bronze,     FIT.bronze);
    mergeInto(zoneGroups[z.key], D.bronzeWorn, FIT.bronzeWorn);
    mergeInto(zoneGroups[z.key], D.iron,       FIT.iron);
    mergeInto(zoneGroups[z.key], D.timber,     FIT.timber);
    mergeInto(zoneGroups[z.key], D.hedge,      FIT.hedge);
  }
}

/* ═══════════════════════ controls ═══════════════════════ */

/* Touch input. Left half of the screen is a movement stick, right half is the
   look area; a pointer keeps whichever role it started with for its whole life,
   so dragging the stick can never rotate the camera. */
const touch = { moveX:0, moveY:0, stick:null, look:null, isTouch:false };
const STICK_R = 62;

function setupTouch(canvas){
  const setStick = (t) => {
    const dx = clamp((t.x - t.ox)/STICK_R, -1, 1);
    const dy = clamp((t.y - t.oy)/STICK_R, -1, 1);
    touch.moveX = dx; touch.moveY = -dy;
    const knob = $('stickKnob');
    knob.style.transform = `translate(${dx*STICK_R}px, ${dy*STICK_R}px)`;
  };

  canvas.addEventListener('pointerdown', e => {
    musicOnFirstGesture();
    if (e.pointerType !== 'touch' || !state.started || state.mode === 'reading') return;
    touch.isTouch = true;
    document.body.classList.add('touch');
    if (e.clientX < window.innerWidth*0.42 && !touch.stick){
      touch.stick = { id:e.pointerId, ox:e.clientX, oy:e.clientY, x:e.clientX, y:e.clientY };
      const s = $('stick');
      s.style.left = e.clientX+'px'; s.style.top = e.clientY+'px';
      s.classList.remove('hidden');
      setStick(touch.stick);
    } else if (!touch.look){
      touch.look = { id:e.pointerId, x:e.clientX, y:e.clientY, moved:0 };
    }
    canvas.setPointerCapture(e.pointerId);
  });

  canvas.addEventListener('pointermove', e => {
    if (touch.stick && e.pointerId === touch.stick.id){
      touch.stick.x = e.clientX; touch.stick.y = e.clientY;
      setStick(touch.stick);
    } else if (touch.look && e.pointerId === touch.look.id && state.mode === 'walk'){
      const dx = e.clientX - touch.look.x, dy = e.clientY - touch.look.y;
      touch.look.x = e.clientX; touch.look.y = e.clientY;
      touch.look.moved += Math.abs(dx) + Math.abs(dy);
      player.targetYaw   -= dx * CFG.lookSens * 1.6;   // same target→damped path as the mouse
      player.targetPitch -= dy * CFG.lookSens * 1.6;
      player.targetPitch  = clamp(player.targetPitch, -CFG.pitchLimit, CFG.pitchLimit);
    }
  });

  const end = e => {
    if (touch.stick && e.pointerId === touch.stick.id){
      touch.stick = null; touch.moveX = touch.moveY = 0;
      $('stick').classList.add('hidden');
      $('stickKnob').style.transform = 'translate(0,0)';
    } else if (touch.look && e.pointerId === touch.look.id){
      if (touch.look.moved < 12 && state.mode === 'walk' && state.hovered) openFocus(state.hovered);
      touch.look = null;
    }
  };
  canvas.addEventListener('pointerup', end);
  canvas.addEventListener('pointercancel', end);
}

function setupControls(){
  const canvas = $('scene');
  setupTouch(canvas);

  canvas.addEventListener('click', () => {
    if (!state.started || touch.isTouch) return;
    if (state.mode === 'reading') return;
    if ($('timelineOverlay').classList.contains('hidden')) requestLock();
  });
  $('resume').addEventListener('click', requestLock);
  $('musicBtn').addEventListener('click', e => { e.stopPropagation(); toggleMute(); });
  $('prompt').addEventListener('click', () => {
    if (state.mode === 'walk' && state.hovered) openFocus(state.hovered);
  });

  document.addEventListener('pointerlockchange', () => {
    state.locked = document.pointerLockElement === canvas;
    document.body.classList.toggle('locked', state.locked);
    if (state.locked){
      $('resume').classList.add('hidden');
    } else if (state.started){
      if (state.mode === 'reading' || state.mode === 'focusing'){
        closeEventPanel();
      }
      if (!touch.isTouch && $('timelineOverlay').classList.contains('hidden')){
        $('resume').classList.remove('hidden');
      }
    }
  });

  document.addEventListener('mousemove', e => {
    if (!state.locked || state.mode !== 'walk') return;
    player.targetYaw   -= e.movementX * CFG.lookSens;
    player.targetPitch -= e.movementY * CFG.lookSens;
    player.targetPitch  = clamp(player.targetPitch, -CFG.pitchLimit, CFG.pitchLimit);
  });

  window.addEventListener('keydown', e => {
    keys[e.code] = true;
    musicOnFirstGesture();
    if (state.mode === 'guided' &&
        ['KeyW','KeyA','KeyS','KeyD','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.code)){
      endGuided();
    }
  });
  window.addEventListener('keyup', e => { keys[e.code] = false; });
  window.addEventListener('blur', () => { for (const k in keys) keys[k] = false; });
}

function requestLock(){
  if (!state.started || touch.isTouch) return;   // touch devices never lock the pointer
  const canvas = $('scene');
  try {
    const r = canvas.requestPointerLock();
    if (r && typeof r.catch === 'function') r.catch(()=>{});
  } catch (_){ /* browser refused; the resume overlay stays up */ }
}

/* ═══════════════════════ collision ═══════════════════════ */

const _box = new THREE.Box3();
const PLAYER_R = 0.36;

function setupCollision(){
  // corridor and rotunda bounds are analytic; furniture boxes were collected
  // while building the exhibits. Pad them by the player's radius once, here.
  for (const b of colliders) b.expandByScalar(PLAYER_R);
}

function insideCorridor(x, z){
  if (z > BACK_WALL_Z - 0.4 || z < zOf(CORRIDOR_LEN)) return false;
  return Math.abs(x) < wallXAt(dOf(z)) - CFG.wallMargin;
}
function insideRotunda(x, z){
  const dx = x, dz = z - ROT_CENTER_Z;
  return Math.hypot(dx, dz) < ROT_RADIUS - CFG.wallMargin;
}

function resolveCollision(pos, prev){
  // 1. shell — the corridor and the rotunda form a union
  if (!insideCorridor(pos.x, pos.z) && !insideRotunda(pos.x, pos.z)){
    // try each axis separately so sliding along a wall still works
    if (insideCorridor(prev.x, pos.z) || insideRotunda(prev.x, pos.z)){
      pos.x = prev.x; player.vel.x = 0;
    } else if (insideCorridor(pos.x, prev.z) || insideRotunda(pos.x, prev.z)){
      pos.z = prev.z; player.vel.z = 0;
    } else {
      pos.x = prev.x; pos.z = prev.z; player.vel.set(0,0,0);
    }
  }

  // 2. furniture — push out along the shallower axis
  for (const b of colliders){
    if (pos.x < b.min.x || pos.x > b.max.x || pos.z < b.min.z || pos.z > b.max.z) continue;
    const dxMin = pos.x - b.min.x, dxMax = b.max.x - pos.x;
    const dzMin = pos.z - b.min.z, dzMax = b.max.z - pos.z;
    const m = Math.min(dxMin, dxMax, dzMin, dzMax);
    if (m === dxMin){ pos.x = b.min.x; player.vel.x = Math.min(player.vel.x, 0); }
    else if (m === dxMax){ pos.x = b.max.x; player.vel.x = Math.max(player.vel.x, 0); }
    else if (m === dzMin){ pos.z = b.min.z; player.vel.z = Math.min(player.vel.z, 0); }
    else { pos.z = b.max.z; player.vel.z = Math.max(player.vel.z, 0); }
  }
}

/* ═══════════════════════ interaction ═══════════════════════ */

const raycaster = new THREE.Raycaster();
raycaster.far = CFG.interactRange;
const screenCentre = new THREE.Vector2(0,0);

function setupInteraction(){
  window.addEventListener('keydown', e => {
    if (!state.started) return;

    if (e.code === 'KeyE'){
      if (state.mode === 'walk' && state.hovered){ e.preventDefault(); openFocus(state.hovered); }
      return;
    }
    if (e.code === 'Escape'){
      if (!$('timelineOverlay').classList.contains('hidden')){ toggleTimelineOverlay(false); return; }
      if (state.mode === 'reading' || state.mode === 'focusing'){ closeEventPanel(); return; }
      return;
    }
    // arrow keys page through the exhibition while a panel or plate is open
    if (e.code === 'ArrowLeft' || e.code === 'ArrowRight'){
      if (state.mode === 'reading'){
        e.preventDefault(); stepEntry(e.code === 'ArrowRight' ? 1 : -1); return;
      }
    }
    if (e.code === 'KeyT'){
      if (state.mode === 'reading' || state.mode === 'focusing') closeEventPanel();
      toggleTimelineOverlay($('timelineOverlay').classList.contains('hidden'));
      return;
    }
    if (e.code === 'KeyM'){
      const el = document.activeElement;
      if (el && /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName) || (el && el.isContentEditable)) return;
      toggleMute();
    }
  });

  $('pClose').addEventListener('click', closeEventPanel);
  $('pPrev').addEventListener('click', () => stepEntry(-1));
  $('pNext').addEventListener('click', () => stepEntry(1));
  $('toClose').addEventListener('click', () => toggleTimelineOverlay(false));
  $('guideCancel').addEventListener('click', endGuided);
  $('pNarrate').addEventListener('click', () => playNarration(state.activeItem));
}

function updateHover(){
  if (state.mode !== 'walk'){ setHover(null); return; }
  raycaster.setFromCamera(screenCentre, camera);
  const hits = raycaster.intersectObjects(interactables, false);
  setHover(hits.length ? hits[0].object : null);
  // the prompt gathers strength as the visitor closes on the exhibit
  if (hits.length){
    const t = clamp(1 - (hits[0].distance - 1.6) / (CFG.interactRange - 1.6), 0.35, 1);
    $('prompt').style.setProperty('--near', t.toFixed(3));
  }
}

function setHover(face){
  if (state.hovered === face) return;
  if (state.hovered) fadeHalo(state.hovered, 0);
  state.hovered = face;
  const prompt = $('prompt'), ret = $('reticle');
  if (face){
    fadeHalo(face, 0.28);
    const k = face.userData.payload.kind;
    $('promptText').textContent =
      k === 'book' ? 'OPEN THIS WORK' :
      k === 'node' ? 'EXAMINE CONNECTION' : 'EXPLORE EVENT';
    prompt.classList.remove('hidden');
    // restart the entrance each time a new exhibit is picked up
    prompt.classList.remove('show');
    void prompt.offsetWidth;
    prompt.classList.add('show');
    ret.classList.add('active');
  } else {
    prompt.classList.remove('show');          // fades out, then hides itself
    clearTimeout(setHover._t);
    setHover._t = setTimeout(() => {
      if (!state.hovered) prompt.classList.add('hidden');
    }, 260);
    ret.classList.remove('active');
  }
}

const haloTweens = new Map();
function fadeHalo(face, to){
  const owner = face.userData.owner;
  const halo = owner && owner.userData.halo;
  if (!halo) return;
  haloTweens.set(halo, to);
}
function updateHalos(dt){
  for (const [halo, to] of haloTweens){
    const m = halo.material;
    m.opacity += (to - m.opacity) * Math.min(1, dt*7);
    if (Math.abs(m.opacity - to) < 0.003){ m.opacity = to; if (to === 0) haloTweens.delete(halo); }
  }
}

/* ── focus camera move ── */

function openFocus(face){
  const owner = face.userData.owner;
  const payload = face.userData.payload;
  state.activeItem = payload;

  focusCam.from.copy(camera.position);
  focusCam.fromQ.copy(camera.quaternion);
  focusCam.fromYaw = player.yaw;
  focusCam.fromPitch = player.pitch;

  const stand = owner.userData.stand
    ? owner.userData.stand.clone()
    : camera.position.clone();
  focusCam.to.copy(stand);

  const look = owner.userData.lookAt || new THREE.Vector3();
  const tmp = new THREE.Object3D();
  tmp.position.copy(stand);
  tmp.up.set(0,1,0);
  tmp.lookAt(look);
  focusCam.toQ.copy(tmp.quaternion);

  focusCam.t = 0;
  focusCam.dur = Math.max(0.75, Math.min(1.5, stand.distanceTo(camera.position) * 0.28));
  state.mode = 'focusing';
  player.vel.set(0,0,0);
  setHover(null);
  fadeHalo(face, 0.5);
  sfxChime();
}

function updateFocus(dt){
  if (state.mode !== 'focusing' && state.mode !== 'returning') return;
  focusCam.t += dt / focusCam.dur;
  const t = smoothstep(clamp(focusCam.t, 0, 1));

  if (state.mode === 'focusing'){
    camera.position.lerpVectors(focusCam.from, focusCam.to, t);
    camera.quaternion.slerpQuaternions(focusCam.fromQ, focusCam.toQ, t);
    if (focusCam.t >= 1){ state.mode = 'reading'; player.speedCap = CFG.walkSpeed; showEventPanel(state.activeItem); }
  } else {
    camera.position.lerpVectors(focusCam.to, focusCam.from, t);
    camera.quaternion.slerpQuaternions(focusCam.toQ, focusCam.fromQ, t);
    if (focusCam.t >= 1){
      state.mode = 'walk';
      player.pos.copy(focusCam.from);
      camRig.copy(focusCam.from);                 // no catch-up lerp across the room
      player.yaw = player.targetYaw = focusCam.fromYaw;
      player.pitch = player.targetPitch = focusCam.fromPitch;
    }
  }
}

/* ═══════════════════════ panels ═══════════════════════ */

/* ═══════════════════ panel hero plates ═══════════════════
   Each record gets an engraved header drawn for it. These are deliberately
   abstract line motifs, not depictions of real people or places — the
   exhibition never puts an unverified image beside verified text.          */

const MOTIF = {
  early(x,w,h,B){                                  // ghats and river at Varanasi
    x.strokeStyle=B; x.lineWidth=1.6;
    const base=h*0.72;
    for (let i=0;i<7;i++){
      const bx=w*0.08+i*w*0.12, bw=w*0.075, bh=h*(0.16+((i*37)%5)*0.055);
      x.strokeRect(bx, base-bh, bw, bh);
      x.beginPath(); x.moveTo(bx-4, base-bh); x.lineTo(bx+bw/2, base-bh-h*0.09);
      x.lineTo(bx+bw+4, base-bh); x.stroke();      // shikhara
      for (let s=1;s<4;s++){                        // steps down to the water
        x.beginPath(); x.moveTo(bx-6, base+s*h*0.045); x.lineTo(bx+bw+6, base+s*h*0.045); x.stroke();
      }
    }
    x.globalAlpha=0.5;
    for (let i=0;i<5;i++){
      x.beginPath(); x.moveTo(0, base+h*0.20+i*h*0.045);
      x.bezierCurveTo(w*0.3, base+h*0.17+i*h*0.045, w*0.7, base+h*0.23+i*h*0.045, w, base+h*0.19+i*h*0.045);
      x.stroke();
    }
    x.globalAlpha=1;
  },
  revolution(x,w,h,B){                             // the railway that held the network together
    x.strokeStyle=B; x.lineWidth=1.6;
    const vx=w*0.62, vy=h*0.44;
    for (const o of [-1,1]){
      x.beginPath(); x.moveTo(vx+o*w*0.42, h); x.lineTo(vx+o*w*0.02, vy); x.stroke();
    }
    for (let i=0;i<13;i++){                        // sleepers, foreshortened
      const t=i/13, yy=vy+(h-vy)*Math.pow(t,1.7), sp=w*0.02+(w*0.40)*Math.pow(t,1.7);
      x.globalAlpha=0.35+t*0.5;
      x.beginPath(); x.moveTo(vx-sp, yy); x.lineTo(vx+sp, yy); x.stroke();
    }
    x.globalAlpha=1;
    for (let i=0;i<4;i++){                         // telegraph poles
      const px=w*0.10+i*w*0.13, ph=h*(0.5-i*0.07);
      x.beginPath(); x.moveTo(px, h*0.78); x.lineTo(px, h*0.78-ph); x.stroke();
      x.beginPath(); x.moveTo(px-w*0.022, h*0.78-ph+6); x.lineTo(px+w*0.022, h*0.78-ph+6); x.stroke();
    }
  },
  network(x,w,h,B){                                // a constellation of associations
    const n=[[.18,.30],[.34,.62],[.50,.26],[.50,.72],[.66,.46],[.80,.24],[.86,.68],[.26,.84],[.68,.84]];
    x.strokeStyle=B; x.lineWidth=1.1; x.globalAlpha=0.5;
    for (const [a,b] of [[0,1],[0,2],[1,3],[2,4],[3,4],[4,5],[4,6],[1,7],[6,8],[3,8]]){
      x.beginPath(); x.moveTo(n[a][0]*w, n[a][1]*h); x.lineTo(n[b][0]*w, n[b][1]*h); x.stroke();
    }
    x.globalAlpha=1; x.fillStyle=B;
    n.forEach(([px,py],i)=>{
      x.beginPath(); x.arc(px*w, py*h, i===4?6.5:4, 0, Math.PI*2); x.fill();
      x.beginPath(); x.arc(px*w, py*h, i===4?13:9, 0, Math.PI*2); x.stroke();
    });
  },
  kakori(x,w,h,B){                                 // newsprint columns
    x.strokeStyle=B; x.lineWidth=1.4;
    x.strokeRect(w*0.06, h*0.12, w*0.88, h*0.76);
    x.beginPath(); x.moveTo(w*0.10, h*0.30); x.lineTo(w*0.90, h*0.30); x.stroke();
    x.fillStyle=B;
    for (let c=0;c<4;c++){
      const cx0=w*0.10+c*w*0.205;
      for (let yy=h*0.38; yy<h*0.83; yy+=h*0.055){
        x.globalAlpha=0.16+Math.random()*0.20;
        x.fillRect(cx0, yy, w*0.175*(0.65+Math.random()*0.35), 2.4);
      }
      if (c<3){ x.globalAlpha=0.3;
        x.beginPath(); x.moveTo(cx0+w*0.19, h*0.36); x.lineTo(cx0+w*0.19, h*0.84); x.stroke(); }
    }
    x.globalAlpha=1;
  },
  prison(x,w,h,B){                                 // cell bars and a high window
    x.strokeStyle=B; x.lineWidth=2.2;
    for (let i=0;i<11;i++){
      const px=w*0.08+i*w*0.084;
      x.beginPath(); x.moveTo(px, h*0.10); x.lineTo(px, h*0.92); x.stroke();
    }
    x.lineWidth=1.6;
    for (const yy of [h*0.24, h*0.76]){ x.beginPath(); x.moveTo(w*0.05,yy); x.lineTo(w*0.95,yy); x.stroke(); }
    const g=x.createRadialGradient(w*0.5,h*0.12,4,w*0.5,h*0.12,h*0.6);
    g.addColorStop(0,'rgba(190,208,224,.34)'); g.addColorStop(1,'rgba(190,208,224,0)');
    x.fillStyle=g; x.fillRect(0,0,w,h);
  },
  writings(x,w,h,B){                               // an open book
    x.strokeStyle=B; x.lineWidth=1.8;
    x.beginPath();
    x.moveTo(w*0.5, h*0.30); x.bezierCurveTo(w*0.34,h*0.20, w*0.18,h*0.22, w*0.09,h*0.28);
    x.lineTo(w*0.09,h*0.80); x.bezierCurveTo(w*0.18,h*0.74, w*0.34,h*0.72, w*0.5,h*0.82);
    x.bezierCurveTo(w*0.66,h*0.72, w*0.82,h*0.74, w*0.91,h*0.80);
    x.lineTo(w*0.91,h*0.28); x.bezierCurveTo(w*0.82,h*0.22, w*0.66,h*0.20, w*0.5,h*0.30);
    x.closePath(); x.stroke();
    x.beginPath(); x.moveTo(w*0.5,h*0.30); x.lineTo(w*0.5,h*0.82); x.stroke();
    x.fillStyle=B; x.globalAlpha=0.28;
    for (const s of [-1,1]) for (let i=0;i<8;i++){
      const yy=h*0.38+i*h*0.052, ww=w*0.30*(0.6+Math.random()*0.4);
      x.fillRect(s<0 ? w*0.15 : w*0.55, yy, ww, 2.2);
    }
    x.globalAlpha=1;
  },
  legacy(x,w,h,B){                                 // memorial arch and rays
    x.strokeStyle=B; x.lineWidth=1.8;
    x.beginPath();
    x.moveTo(w*0.30,h*0.92); x.lineTo(w*0.30,h*0.46);
    x.arc(w*0.5,h*0.46,w*0.20,Math.PI,0); x.lineTo(w*0.70,h*0.92);
    x.stroke();
    x.beginPath(); x.moveTo(w*0.24,h*0.92); x.lineTo(w*0.76,h*0.92); x.stroke();
    x.globalAlpha=0.4;
    for (let i=0;i<9;i++){
      const a=-Math.PI*0.5 + (i-4)*0.19;
      x.beginPath(); x.moveTo(w*0.5,h*0.46);
      x.lineTo(w*0.5+Math.cos(a)*w*0.5, h*0.46+Math.sin(a)*h*0.9); x.stroke();
    }
    x.globalAlpha=1;
  }
};
MOTIF.entrance = MOTIF.early;

function heroDataURL(zoneKey, r){
  return canvasOf(760, 300, (x,W,H) => heroPlate(x, W, H, zoneKey, r)).toDataURL('image/jpeg', 0.86);
}

/* ═══════════════════ supplementary panel material ═══════════════════
   Kept in a side table so TIMELINE itself is untouched. `people` are ids from
   NETWORK, so nothing is duplicated and nothing is invented: every card is a
   node that already carries its own sourced context.                       */

const EXTRA = {
  birth: {
    people:['sns','anu'],
    facts:[
      'Varanasi was in the North-Western Provinces in 1893; the province was renamed the United Provinces of Agra and Oudh in 1902.',
      'The family belonged to the city\'s long-settled Bengali community, concentrated in the Bengali Tola quarter.',
      'He was 48 when he died — his adult life falls almost entirely between the two world wars.'
    ],
    impact:'Being Bengali by community and North Indian by geography is the single structural fact of his career. It is why the Anushilan Samiti\'s methods reached Patna and the United Provinces at all, and why he, rather than a Calcutta organiser, became the link between Bengal and the Punjab.'
  },
  swadeshi: {
    people:['anu','ghadar'],
    facts:[
      'The partition of Bengal took effect on 16 October 1905 and was annulled in 1911.',
      'The Swadeshi campaign combined boycott, national education and indigenous manufacture — the secret societies were a minority current within it.',
      'The Anushilan Samiti had been founded at Calcutta in 1902, three years before the partition.'
    ],
    impact:'This is the political weather Sanyal grew up in rather than an episode in his life. The cellular organisation, the oath, the physical training and the printed manifesto all date from here.'
  },
  'anushilan-patna': {
    people:['anu','rbb'],
    facts:[
      'The Anushilan Samiti began as a physical-culture society; only some branches became underground political bodies.',
      'Extending it to Patna put a Bengal organisation into Bihar for the first time.'
    ],
    impact:'Created the geography that made a coordinated northern rising conceivable two years later.'
  },
  feb1915: {
    people:['rbb','ghadar','anu'],
    facts:[
      'The rising was brought forward to 19 February 1915 after the plan was betrayed from inside.',
      'The Defence of India Act, 1915 was passed in March 1915 to try the accused by special tribunal without appeal.',
      'The same plan is called the Ghadar Conspiracy, the Hindu–German Conspiracy and the February Plan in different sources.'
    ],
    impact:'The largest attempt at an armed pan-Indian rising between 1857 and 1942. Its failure removed a generation of organisers from circulation and set the terms for everything the movement did afterwards.'
  },
  'benares-case': {
    people:['rbb','cell'],
    facts:[
      'Transportation for life was the heaviest sentence short of hanging.',
      'The Government also confiscated the family property at Varanasi — a household that had committed no offence.'
    ],
    impact:'Removed him from political life for four years and destroyed the family\'s means at the same time.'
  },
  'cellular-1': {
    people:['cell'],
    facts:[
      'The Cellular Jail was completed in 1906: seven wings radiating from a central tower, 693 single cells.',
      'The wings were angled so that no cell faced another — solitude was the design.',
      'Three of the seven wings survive; the site was declared a National Memorial in 1979.'
    ],
    impact:'The building was built to make organisation impossible. That a body of political writing came out of the Andamans at all is a fact about its prisoners, not the institution.'
  },
  'amnesty-1920': {
    people:['gandhi'],
    facts:[
      'The Royal Proclamation of 23 December 1919 followed the Government of India Act 1919.',
      'He returned to an India changed by the Rowlatt Satyagraha, the Jallianwala Bagh massacre of 13 April 1919 and the start of Non-Cooperation.'
    ],
    impact:'He walked out of an eighteenth-century punishment into a twentieth-century mass movement. Everything afterwards is an attempt to work out what armed revolutionaries were now for.'
  },
  'bandi-jivan': {
    people:['bandi','bhagat','cell'],
    facts:[
      'Published in Bengali in 1922 and translated into Hindi and other Indian languages.',
      'Written after release, on the mainland — not smuggled out of a cell.',
      'Written knowing the censor would read it, which shapes what it does and does not say.'
    ],
    impact:'It made the revolutionary underground legible to a mass readership in its own words, and carried the pre-1915 movement to a generation that had never met it.'
  },
  'hra-founded': {
    people:['hra','bismil','jcc','pg'],
    facts:[
      'Object: a federal republic of the United States of India, by organised armed revolution.',
      'Some accounts date the beginnings to 1923; the October 1924 Kanpur meeting is what the sources agree on.',
      'The association was broken by the Kakori arrests within three years of its founding.'
    ],
    impact:'The organisational parent of almost everything that follows in north Indian revolutionary history, including the HSRA of 1928.'
  },
  manifesto: {
    people:['hra'],
    facts:[
      'Four pages, dated 1 January 1925, signed with a pseudonym.',
      'Distributed in several north Indian cities at once.',
      'It was central to the case later made against Sanyal.'
    ],
    impact:'The clearest surviving statement of HRA aims — and the moment a secret society chose to argue its case in public print.'
  },
  'gandhi-exchange': {
    people:['gandhi'],
    facts:[
      'Gandhi printed Sanyal\'s letter and his own reply together in Young India.',
      'Both texts are reproduced in the Collected Works of Mahatma Gandhi.',
      'Neither man softened his position for the other.'
    ],
    impact:'A rare dated, documented argument between the two wings of the freedom struggle, conducted in a paper anyone could buy.'
  },
  kakori: {
    people:['bismil','ashfaq','lahiri','azad','bakshi','mng','hra'],
    facts:[
      'The 8 Down train was stopped near Kakori, between Shahjahanpur and Lucknow.',
      'A passenger was killed by a shot fired during the action; the accused maintained the death was not intended.',
      'The money taken funded almost nothing — the arrests that followed broke the organisation.'
    ],
    impact:'Made the HRA nationally famous and destroyed it in the same stroke. Its name survived into the HSRA largely because of the publicity the trial gave it.'
  },
  'kakori-trial': {
    people:['bismil','ashfaq','lahiri','roshan','jcc','bakshi'],
    facts:[
      'Judgment was delivered at Lucknow on 6 April 1927.',
      'Four death sentences; others transported for life or given long terms.',
      'The prosecution had to describe the HRA in order to convict it, which is why the papers are so detailed.'
    ],
    impact:'Much of what can be dated about the association is dateable only because a court had to prove it.'
  },
  executions: {
    people:['bismil','ashfaq','lahiri','roshan'],
    facts:[
      'Rajendra Lahiri was hanged at Gonda on 17 December 1927.',
      'Bismil at Gorakhpur, Ashfaqullah Khan at Faizabad and Roshan Singh at Naini, all on 19 December 1927.',
      'Appeals and mercy petitions had been refused.'
    ],
    impact:'Ended the first HRA and turned its members into a public memory the reorganised HSRA drew on directly.'
  },
  'hsra-1928': {
    people:['hsra','azad','bhagat','hra'],
    facts:[
      'Met at the ruins of Feroz Shah Kotla, Delhi, in September 1928.',
      'The object gained an explicitly socialist character it had not had in 1924.',
      'Sanyal was imprisoned in the Andamans and had no part in it.'
    ],
    impact:'The organisation he founded outlived his liberty and changed its politics without him.'
  },
  'cellular-2': {
    people:['cell'],
    facts:[
      'He is commonly described as the only Indian revolutionary transported to the Andamans twice.',
      'The second term is the least visible part of his life, because the surviving record was written by the institution holding him.'
    ],
    impact:'What survives is largely official: jail files, petitions and medical remarks.'
  },
  'hunger-1933': {
    people:['cell'],
    facts:[
      'Prisoners demanded recognition as political prisoners and an end to forced labour.',
      'Three prisoners died during the 1933 strike, among them Mahavir Singh in May 1933.',
      'Reporting of the deaths on the mainland produced sustained public pressure.'
    ],
    impact:'These strikes are why the Andamans ceased to be used as a political penal settlement.'
  },
  death: {
    people:['sns','bandi','cell'],
    facts:[
      'He died on 7 February 1942, aged 48, of tuberculosis contracted in the Cellular Jail.',
      'Six months before the Quit India resolution of August 1942; five years before independence.',
      'The federal republic named in his 1925 manifesto was constituted in 1950.'
    ],
    impact:'The end of a specific revolutionary tradition — pre-Gandhian in origin, organisational in method, and by 1942 largely superseded.'
  }
};

/** Where this record sits in the 1893–1942 span, for the panel's mini ribbon. */
function recordSpan(r){
  const m = String(r.date || '').match(/1[89]\d\d/g);
  if (!m) return null;
  const a = +m[0], b = m.length > 1 ? +m[m.length-1] : a;
  const f = y => clamp((y - 1893) / (1942 - 1893), 0, 1) * 100;
  return { from:f(a), to:Math.max(f(b), f(a) + 1.2), a, b };
}

/* ═══════════════════ archive plates ═══════════════════
   The exhibition holds no photographs. Rather than put an unverified image
   beside sourced text, each record gets plates drawn for it from the same
   generators the walls use — a map, a document, a newsprint layout, an
   engraved motif — every one captioned as a reconstruction.

   To show real archival scans instead, add
       images: [{ src:'./assets/xyz.jpg', caption:'…', credit:'…' }]
   to a TIMELINE entry; anything listed there is shown first, unaltered.   */


/* ═══════════════════ archive plates ═══════════════════
   Plates are chosen per EVENT, never per zone. Earlier this function added the
   engraved motif and the northern-India map to everything, so every panel in a
   period opened with the same two pictures; the map in particular was a global
   default. `PLATE_SPEC` now names what each entry actually shows, and an event
   with nothing named is reported by `validateEventContent()` rather than being
   quietly filled with the house set.

   None of these are photographs. They are drawn for this exhibition from the
   cited sources and are labelled as reconstructions.                        */

/* ── additional generators, so events can genuinely differ ── */

function bengalPlate(x, w, h){
  x.fillStyle='#ded1b1'; x.fillRect(0,0,w,h);
  blotches(x,w,h,70,['198,182,148','214,202,174'],28,160,0.35);
  x.strokeStyle='rgba(70,56,36,.5)'; x.lineWidth=2; x.strokeRect(18,18,w-36,h-36);
  // coastline / delta, indicative
  x.strokeStyle='rgba(70,90,110,.5)'; x.lineWidth=2.5;
  x.beginPath(); x.moveTo(w*0.18,h*0.20);
  x.bezierCurveTo(w*0.30,h*0.42, w*0.36,h*0.62, w*0.30,h*0.86); x.stroke();
  x.beginPath(); x.moveTo(w*0.62,h*0.16);
  x.bezierCurveTo(w*0.66,h*0.44, w*0.72,h*0.64, w*0.64,h*0.88); x.stroke();
  // the 1905 partition line
  x.strokeStyle='rgba(140,50,34,.85)'; x.lineWidth=3.4; x.setLineDash([12,7]);
  x.beginPath(); x.moveTo(w*0.46,h*0.12); x.lineTo(w*0.44,h*0.92); x.stroke();
  x.setLineDash([]);
  x.fillStyle='#8a2b1c'; x.font='600 17px Georgia, serif'; x.textAlign='center';
  x.fillText('PARTITION LINE, 1905', w*0.44, h*0.08);
  const mark = (nm, px, py, key) => {
    x.fillStyle = key ? '#8a2b1c' : '#2b2318';
    x.beginPath(); x.arc(px*w, py*h, key?6:4, 0, Math.PI*2); x.fill();
    x.font = key ? '600 18px Georgia, serif' : '15px Georgia, serif';
    x.textAlign='left'; x.fillText(nm, px*w+11, py*h+5);
  };
  mark('DACCA', 0.60, 0.36, true);
  mark('CALCUTTA', 0.30, 0.70, true);
  mark('CHITTAGONG', 0.70, 0.62);
  mark('RAJSHAHI', 0.55, 0.22);
  x.textAlign='left'; x.fillStyle='#2b2318'; x.font='600 22px Cinzel, Georgia, serif';
  drawSpaced(x,'THE PARTITION OF BENGAL', 40, 52, 3);
  x.fillStyle='rgba(43,35,24,.6)'; x.font='15px "Cormorant Garamond", Georgia, serif';
  x.fillText('Announced 1905, annulled 1911. Indicative schematic.', 40, 76);
}

function andamanPlate(x, w, h){
  x.fillStyle='#d9cdae'; x.fillRect(0,0,w,h);
  blotches(x,w,h,60,['196,182,150','212,202,176'],26,150,0.35);
  x.fillStyle='rgba(96,124,140,.22)'; x.fillRect(18,18,w-36,h-36);
  x.strokeStyle='rgba(70,56,36,.5)'; x.lineWidth=2; x.strokeRect(18,18,w-36,h-36);
  // island chain
  x.fillStyle='rgba(96,110,80,.8)';
  const isles = [[0.50,0.20,26,60],[0.53,0.38,22,46],[0.50,0.54,18,38],[0.54,0.70,24,30]];
  for (const [ix,iy,rw,rh] of isles){
    x.beginPath(); x.ellipse(ix*w, iy*h, rw, rh, 0.2, 0, Math.PI*2); x.fill();
  }
  x.fillStyle='#8a2b1c';
  x.beginPath(); x.arc(w*0.53, h*0.54, 7, 0, Math.PI*2); x.fill();
  x.strokeStyle='rgba(138,43,28,.6)'; x.lineWidth=1.6;
  x.beginPath(); x.arc(w*0.53, h*0.54, 16, 0, Math.PI*2); x.stroke();
  x.fillStyle='#8a2b1c'; x.font='600 18px Georgia, serif'; x.textAlign='left';
  x.fillText('PORT BLAIR', w*0.53+24, h*0.54+6);
  x.fillStyle='rgba(43,35,24,.7)'; x.font='15px Georgia, serif';
  x.fillText('BAY OF BENGAL', w*0.14, h*0.30);
  x.fillText('≈ 1,250 km from Calcutta', w*0.10, h*0.86);
  x.fillStyle='#2b2318'; x.font='600 22px Cinzel, Georgia, serif';
  drawSpaced(x,'THE ANDAMAN ISLANDS', 40, 52, 3);
}

function railPlate(x, w, h){
  x.fillStyle='#ddd2b6'; x.fillRect(0,0,w,h);
  blotches(x,w,h,50,['198,186,156','216,206,182'],24,140,0.35);
  x.strokeStyle='rgba(70,56,36,.5)'; x.lineWidth=2; x.strokeRect(18,18,w-36,h-36);
  const y = h*0.56;
  x.strokeStyle='rgba(48,40,28,.8)'; x.lineWidth=3;
  x.beginPath(); x.moveTo(w*0.10,y); x.lineTo(w*0.90,y); x.stroke();
  x.lineWidth=1.4;
  for (let i=0;i<34;i++){
    const px = w*0.10 + i*(w*0.80/33);
    x.beginPath(); x.moveTo(px, y-9); x.lineTo(px, y+9); x.stroke();
  }
  const stop = (nm, t, key) => {
    const px = w*0.10 + t*w*0.80;
    x.fillStyle = key ? '#8a2b1c' : '#2b2318';
    x.beginPath(); x.arc(px, y, key?9:6, 0, Math.PI*2); x.fill();
    x.save(); x.translate(px, y - 26); x.rotate(-0.5);
    x.textAlign='left'; x.font = key ? '600 17px Georgia, serif' : '15px Georgia, serif';
    x.fillText(nm, 0, 0); x.restore();
  };
  stop('SHAHJAHANPUR', 0.02, false);
  stop('KAKORI', 0.62, true);
  stop('LUCKNOW', 0.94, false);
  x.fillStyle='#8a2b1c'; x.font='600 16px Georgia, serif'; x.textAlign='center';
  x.fillText('8 DOWN · 9 AUGUST 1925', w*0.60, y + 44);
  x.textAlign='left'; x.fillStyle='#2b2318'; x.font='600 22px Cinzel, Georgia, serif';
  drawSpaced(x,'THE LINE TO LUCKNOW', 40, 52, 3);
  x.fillStyle='rgba(43,35,24,.6)'; x.font='15px "Cormorant Garamond", Georgia, serif';
  x.fillText('Schematic. Distances not to scale.', 40, 76);
}

/** A typed official document: header, ruled body, stamp. */
function docPlate(x, w, h, title, lines, stamp){
  x.fillStyle='#e3dbc4'; x.fillRect(0,0,w,h);
  blotches(x,w,h,60,['206,196,168','226,220,200'],24,130,0.4);
  x.strokeStyle='rgba(70,56,36,.42)'; x.lineWidth=1.6; x.strokeRect(26,26,w-52,h-52);
  x.textAlign='center'; x.fillStyle='#2b2318';
  x.font='600 20px Cinzel, Georgia, serif';
  drawSpaced(x, title, w/2, 82, 3.2, 'center');
  x.strokeStyle='rgba(70,56,36,.4)'; x.lineWidth=1;
  x.beginPath(); x.moveTo(60,102); x.lineTo(w-60,102); x.stroke();
  x.textAlign='left'; x.font='18px "Cormorant Garamond", Georgia, serif';
  x.fillStyle='rgba(43,35,24,.86)';
  let y = 140;
  for (const ln of lines){
    for (const wrapped of wrapLines(x, ln, w-120)){ x.fillText(wrapped, 60, y); y += 26; }
    y += 8;
  }
  // ruled remainder
  x.strokeStyle='rgba(70,56,36,.16)';
  while (y < h - 96){ x.beginPath(); x.moveTo(60,y); x.lineTo(w-60,y); x.stroke(); y += 26; }
  if (stamp){
    x.save(); x.translate(w-140, h-120); x.rotate(-0.28);
    x.strokeStyle='rgba(138,43,28,.55)'; x.lineWidth=3;
    x.strokeRect(-70,-26,140,52);
    x.fillStyle='rgba(138,43,28,.62)'; x.textAlign='center';
    x.font='600 15px Helvetica, Arial, sans-serif';
    drawSpaced(x, stamp, 0, 6, 2.4, 'center');
    x.restore();
  }
}

/** A title page. */
function bookPlate(x, w, h, title, sub, imprint){
  x.fillStyle='#dfd4b6'; x.fillRect(0,0,w,h);
  blotches(x,w,h,70,['198,186,156','218,208,184','172,158,124'],26,150,0.4);
  x.strokeStyle='rgba(70,56,36,.5)'; x.lineWidth=2.4; x.strokeRect(30,30,w-60,h-60);
  x.strokeStyle='rgba(70,56,36,.25)'; x.lineWidth=1; x.strokeRect(40,40,w-80,h-80);
  x.textAlign='center'; x.fillStyle='#2b2318';
  drawFitted(x, title, w/2, h*0.34, w*0.74, 40, 5, '600', 'Cinzel, Georgia, serif');
  x.strokeStyle='rgba(70,56,36,.45)'; x.lineWidth=1.4;
  x.beginPath(); x.moveTo(w*0.28,h*0.40); x.lineTo(w*0.72,h*0.40); x.stroke();
  x.fillStyle='rgba(43,35,24,.78)'; x.font='italic 21px "Cormorant Garamond", Georgia, serif';
  for (const [i,ln] of wrapLines(x, sub, w-140).slice(0,3).entries())
    x.fillText(ln, w/2, h*0.48 + i*27);
  x.fillStyle='rgba(43,35,24,.6)'; x.font='16px "Cormorant Garamond", Georgia, serif';
  x.fillText(imprint, w/2, h*0.80);
}

/** A court record sheet. */
function courtPlate(x, w, h, caption, rows){
  x.fillStyle='#e0d8c0'; x.fillRect(0,0,w,h);
  blotches(x,w,h,50,['204,194,166','224,218,198'],22,120,0.4);
  x.strokeStyle='rgba(70,56,36,.45)'; x.lineWidth=1.8; x.strokeRect(24,24,w-48,h-48);
  x.textAlign='center'; x.fillStyle='#2b2318'; x.font='600 17px Cinzel, Georgia, serif';
  drawSpaced(x,'IN THE SPECIAL SESSIONS COURT', w/2, 74, 2.6, 'center');
  x.font='600 21px Cinzel, Georgia, serif';
  drawFitted(x, caption, w/2, 112, w*0.8, 21, 2.4, '600', 'Cinzel, Georgia, serif');
  x.strokeStyle='rgba(70,56,36,.4)'; x.lineWidth=1;
  x.beginPath(); x.moveTo(60,132); x.lineTo(w-60,132); x.stroke();
  x.textAlign='left'; x.font='18px "Cormorant Garamond", Georgia, serif';
  let y = 172;
  for (const [a,b] of rows){
    x.fillStyle='rgba(43,35,24,.9)'; x.fillText(a, 62, y);
    x.textAlign='right'; x.fillStyle='rgba(43,35,24,.7)'; x.fillText(b, w-62, y);
    x.textAlign='left';
    x.strokeStyle='rgba(70,56,36,.18)';
    x.beginPath(); x.moveTo(62,y+9); x.lineTo(w-62,y+9); x.stroke();
    y += 34;
  }
}

/* ── the generator table ── */

const PLATE_KIND = {
  // every generator takes (args, record) — motif is the only one that needs the record
  motif:  (a, r) => [canvasOf(760,300,(x,w,h)=>heroPlate(x,w,h,(r&&r.zone)||'early',r||{})), 'ENGRAVED PLATE',
                   'Period motif — ' + ((r&&r.date)||''), 'Drawn for this exhibition'],
  netmap: ()   => [canvasOf(1024,640,mapPlate), 'ARCHIVAL MAP',
                   'Northern India: the railway geography of the network', 'Indicative schematic'],
  bengal: ()   => [canvasOf(900,600,bengalPlate), 'ARCHIVAL MAP',
                   'The Partition of Bengal, 1905', 'Indicative schematic, not a survey document'],
  andaman:()   => [canvasOf(760,560,andamanPlate), 'ARCHIVAL MAP',
                   'The Andaman Islands and Port Blair', 'Indicative schematic'],
  rail:   ()   => [canvasOf(940,520,railPlate), 'ROUTE DIAGRAM',
                   'Shahjahanpur — Kakori — Lucknow', 'Schematic, not to scale'],
  jail:   ()   => [canvasOf(560,700,cellPlate), 'BUILDING PLAN',
                   'Cellular Jail, Port Blair — the seven radiating wings', 'After published plans of the 1906 building'],
  lineage:()   => [canvasOf(700,480,lineagePlate), 'ORGANISATIONAL CHART',
                   'HRA → Kakori → HSRA, 1924–1928', 'Drawn from the cited scholarship'],
  news:   (a)  => [canvasOf(700,900,(x,w,h)=>newsPlate(x,w,h,a[0],a[1],a[2])), 'NEWSPAPER PLATE',
                   a[0], 'Representation — not a facsimile of any newspaper'],
  doc:    (a)  => [canvasOf(760,900,(x,w,h)=>docPlate(x,w,h,a[0],a[1],a[2])), 'HISTORICAL DOCUMENT',
                   a[0], 'Reconstruction of a document class, not a facsimile'],
  book:   (a)  => [canvasOf(680,900,(x,w,h)=>bookPlate(x,w,h,a[0],a[1],a[2])), 'TITLE PAGE',
                   a[0], 'Reconstruction — consult a published edition'],
  court:  (a)  => [canvasOf(820,760,(x,w,h)=>courtPlate(x,w,h,a[0],a[1])), 'COURT RECORD',
                   a[0], 'Reconstruction of the record class, not a facsimile']
};

/* ── what each event actually shows ── */

const PLATE_SPEC = {
  birth:              [['motif'], ['doc',['MUNICIPAL RECORD OF BIRTH',['Varanasi, North-Western Provinces.','Sachindranath Sanyal, born 3 April 1893.','Bengali family long settled in the Bengali Tola quarter.'],'RECORD']]],
  swadeshi:           [['bengal'], ['news',['BENGAL PARTITIONED','Boycott and Swadeshi campaigns follow across the province.','16 OCTOBER 1905']]],
  'benares-node':     [['doc',['NOTE ON THE BENARES CIRCLE',['Recruitment, shelter, and the movement of people and money','between provinces — the connective work on which everything else rested.','Memoir literature gives few firm dates for these years.'],'INTELLIGENCE']], ['motif']],
  'anushilan-patna':  [['doc',['ANUSHILAN SAMITI — BRANCH RETURN',['Calcutta, founded 1902. Physical culture and self-discipline.','Branches extended into Bihar and the United Provinces.','Patna branch attributed to S. N. Sanyal, c. 1913.'],'INTELLIGENCE']], ['netmap']],
  'delhi-1912':       [['news',['BOMB THROWN AT THE VICEROY','Lord Hardinge wounded entering Delhi in state procession.','23 DECEMBER 1912']], ['doc',['DELHI CONSPIRACY CASE — SUMMARY',['Rash Behari Bose named a principal organiser.','Sanyal was not among those charged for the act.'],'CASE FILE']]],
  rashbehari:         [['netmap'], ['doc',['WATCH REPORT — UNITED PROVINCES',['Association of S. N. Sanyal with Rash Behari Bose.','Varanasi named among the safe centres of the north.','Groups linked across Bengal, Bihar, the U.P. and the Punjab.'],'WATCH REPORT']]],
  feb1915:            [['doc',['THE FEBRUARY PLAN',['Coordinated rising in the Indian Army, timed for February 1915.','Date advanced to 19 February after betrayal by an informer.','Suppressed before it could begin; mass arrests followed.'],'SEDITION CTTE']], ['news',['THE FEBRUARY PLAN SUPPRESSED','Arrests across the Punjab and the United Provinces.','FEBRUARY 1915']]],
  'rbb-escape':       [['doc',['PASSENGER MANIFEST — SANUKI MARU',['Sailed Calcutta, 12 May 1915.','Rash Behari Bose travelling under an assumed name.','Reached Japan; remained there for life.'],'PORT RECORD']]],
  'benares-case':     [['court',['THE BENARES CONSPIRACY CASE, 1916',[['Charge','Conspiracy to wage war'],['Sentence','Transportation for life'],['Property','Confiscated at Varanasi'],['Destination','Cellular Jail, Port Blair']]]], ['andaman']],
  'cellular-1':       [['jail'], ['andaman']],
  'amnesty-1920':     [['doc',['ROYAL PROCLAMATION, 23 DECEMBER 1919',['Following the Government of India Act 1919.','General amnesty for political prisoners.','Sanyal returned to the mainland in 1920.'],'GAZETTE']]],
  'bandi-jivan':      [['book',['BANDI JIVAN','A Life of Captivity — an account of the revolutionary underground and of the Andamans','Bengali, 1922']], ['jail']],
  'hra-founded':      [['lineage'], ['doc',['HINDUSTAN REPUBLICAN ASSOCIATION',['Founded at Kanpur, October 1924.','Object: a federal republic of the United States of India,','to be brought about by organised armed revolution.'],'CONSTITUTION']]],
  manifesto:          [['book',['THE REVOLUTIONARY','The manifesto of the Hindustan Republican Association, signed pseudonymously','Dated 1 January 1925']], ['lineage']],
  'gandhi-exchange':  [['news',['A LETTER AND A REPLY','Young India prints the revolutionary case and Gandhi answers it.','FEBRUARY 1925']], ['book',['YOUNG INDIA','The exchange between Sachindra Nath Sanyal and M. K. Gandhi, printed together','Ahmedabad, February 1925']]],
  'sanyal-1925-arrest':[['court',['KING-EMPEROR v. SACHINDRA NATH SANYAL',[['Year','1925'],['In connection with','The Revolutionary, and the HRA'],['Sentence','Transportation for life'],['Note','A second term in the Andamans']]]], ['andaman']],
  kakori:             [['rail'], ['news',['TRAIN STOPPED NEAR KAKORI','Government treasury cash removed from the 8 Down.','9 AUGUST 1925']]],
  'kakori-trial':     [['court',['KING-EMPEROR v. RAM PRASAD AND OTHERS',[['Court','Special Sessions, Lucknow'],['Judgment','6 April 1927'],['Death sentences','Bismil · Ashfaqullah Khan · Lahiri · Roshan Singh'],['Others','Transportation for life, or long terms']]]], ['lineage']],
  executions:         [['news',['FOUR EXECUTIONS CARRIED OUT','Lahiri at Gonda; Bismil at Gorakhpur, Ashfaqullah Khan at Faizabad, Roshan Singh at Naini.','17 & 19 DECEMBER 1927']], ['doc',['RETURN OF SENTENCES EXECUTED',['Rajendra Lahiri — Gonda, 17 December 1927.','Ram Prasad Bismil — Gorakhpur, 19 December 1927.','Ashfaqullah Khan — Faizabad, 19 December 1927.','Roshan Singh — Naini, Allahabad, 19 December 1927.'],'JAIL RETURN']]],
  attribution:        [['lineage'], ['doc',['A NOTE ON ATTRIBUTION',['Sachindra Nath BAKSHI took part in the Kakori action.','Sachindra Nath SANYAL did not, and was already in custody.','The two men are regularly and wrongly conflated.'],'EDITORIAL']]],
  'cellular-2':       [['jail'], ['doc',['CONVICT REGISTER — PORT BLAIR',['Second term of transportation for life.','Solitary confinement; labour at the oil mill.','Correspondence censored and rationed.'],'JAIL FILE']]],
  'hunger-1933':      [['doc',['PETITION OF POLITICAL PRISONERS',['Demanding recognition as political prisoners','and an end to forced labour.','Three prisoners died during the strike of 1933.'],'PETITION']], ['jail']],
  'hsra-1928':        [['lineage'], ['doc',['REORGANISATION AT FEROZ SHAH KOTLA',['Delhi, September 1928.','The association takes an explicitly socialist object.','Sanyal was imprisoned in the Andamans and had no part in it.'],'MINUTE']]],
  repatriation:       [['andaman'], ['doc',['REPATRIATION OF POLITICAL PRISONERS',['Andamans to mainland jails, 1937–38.','Following hunger strikes and sustained public campaign.','Effectively ends the settlement as a political penal colony.'],'ORDER']]],
  illness:            [['doc',['MEDICAL REMARK',['Tuberculosis contracted during imprisonment.','Untreatable by any reliable means at the time.','Widespread in Indian jails: crowding, diet, ventilation.'],'MEDICAL']], ['jail']],
  'writing-room':     [['book',['BANDI JIVAN','Written after release, on the mainland — and written knowing the censor would read it','Bengali, 1922']], ['book',['THE REVOLUTIONARY','Four pages. A secret society arguing its case in public print','1 January 1925']]],
  'reading-note':     [['book',['ON READING THESE WORKS','Memoir, manifesto and prosecution file are each partisan, and each indispensable','A note on method']], ['court',['THE RECORD AS EVIDENCE',[['Memoir','Testimony, written for publication'],['Manifesto','A statement of intent'],['Court papers','What was alleged and found'],['Method','Read them against one another']]]]],
  death:              [['doc',['RETURN OF A DEATH IN CUSTODY',['Sachindranath Sanyal, aged 48.','Gorakhpur, 7 February 1942.','Cause: tuberculosis contracted in the Cellular Jail.'],'JAIL RETURN']], ['motif']]
};

/* Non-event records get plates matched to what they are — a person, a book, an
   artefact — rather than the house set. Still intentional, still per-record. */
function fallbackSpec(r){
  if (r.kicker === 'NETWORK NODE')      return [['lineage'], ['netmap']];
  if (r.kicker === 'FROM THE WRITINGS') return [['book',[stripTags(r.title), stripTags(r.what).slice(0,110), r.date || '']]];
  if (r.kicker === 'FROM THE ARCHIVE')  return [['doc',[stripTags(r.title), [stripTags(r.what)], 'ARCHIVE']]];
  if (r.kicker === 'MAP TABLE')         return [['netmap'], ['bengal']];
  return [['motif']];
}

const plateCache = new Map();

function platesFor(r, id){
  if (plateCache.has(id)) return plateCache.get(id);
  const out = [];

  // real, licensed scans supplied with the project always take precedence
  for (const im of (r.images || [])){
    out.push({ src:im.src, label:im.label || 'PHOTOGRAPH', caption:im.caption || '',
               credit:im.credit || '', real:true });
  }

  const spec = PLATE_SPEC[r.id] || fallbackSpec(r);
  for (const [kind, args] of spec){
    const make = PLATE_KIND[kind];
    if (!make) continue;
    const [canvas, label, caption, credit] = make(args, r);
    out.push({ src: canvas.toDataURL('image/jpeg', 0.86), label, caption, credit });
  }

  plateCache.set(id, out);
  return out;
}

/* ── development-time content check ──────────────────────────────────── */
function validateEventContent(){
  const missing = [], dupes = {};
  for (const ev of TIMELINE){
    const spec = PLATE_SPEC[ev.id];
    if (!spec || !spec.length){ missing.push(ev.id); continue; }
    const key = spec.map(s => s[0] + JSON.stringify(s[1] || '')).sort().join('|');
    (dupes[key] = dupes[key] || []).push(ev.id);
    if (!ev.title || !ev.date || !ev.what || !ev.sources || !ev.sources.length) missing.push(ev.id + ' (text)');
  }
  for (const id of missing) console.warn(`[timeline] event "${id}" has no dedicated plates`);
  for (const k in dupes){
    if (dupes[k].length > 1) console.warn(`[timeline] identical plate set shared by: ${dupes[k].join(', ')}`);
  }
  return { events: TIMELINE.length, missing: missing.length,
           shared: Object.values(dupes).filter(a => a.length > 1).length };
}

/* the header motif, factored out so the gallery and the hero share one drawing */
function heroPlate(x, W, H, zoneKey, r){
  const dark = zoneKey === 'prison' || zoneKey === 'network';
  x.fillStyle = dark ? '#161a1f' : '#1c1710';
  x.fillRect(0,0,W,H);
  blotches(x, W, H, 70, dark ? ['38,44,52','12,14,17'] : ['52,42,30','16,13,9'], 40, 210, 0.55);
  const B = dark ? 'rgba(168,190,208,.72)' : 'rgba(198,166,102,.78)';
  x.save(); x.translate(W*0.30, 0); x.scale(0.72, 1);
  (MOTIF[zoneKey] || MOTIF.early)(x, W, H, B);
  x.restore();
  const vg = x.createLinearGradient(0,0,W*0.62,0);
  vg.addColorStop(0, dark ? 'rgba(22,26,31,.97)' : 'rgba(28,23,16,.97)');
  vg.addColorStop(1, 'rgba(0,0,0,0)');
  x.fillStyle = vg; x.fillRect(0,0,W*0.62,H);
  x.textAlign = 'left';
  x.fillStyle = dark ? '#a8c0d4' : '#d9b75a';
  x.font = '600 15px Helvetica, Arial, sans-serif';
  drawSpaced(x, (r.kicker || 'RECORD'), 42, 74, 4.6);
  x.fillStyle = '#f2e7cc';
  drawFitted(x, (r.date || '—'), 42 + 250, 168, 470, 62, 5, '400', 'Cinzel, Georgia, serif');
  x.strokeStyle = dark ? 'rgba(168,190,208,.5)' : 'rgba(198,166,102,.55)';
  x.lineWidth = 1.4;
  x.beginPath(); x.moveTo(42, 200); x.lineTo(300, 200); x.stroke();
  x.fillStyle = dark ? 'rgba(168,190,208,.62)' : 'rgba(198,166,102,.7)';
  x.font = '600 12px Helvetica, Arial, sans-serif';
  drawSpaced(x, 'ENGRAVED PLATE — STYLISED, NOT A DEPICTION', 42, 236, 2.4);
  noiseOverlay(x, W, H, 16);
}

/** Plan of the Cellular Jail: seven wings from a central tower. */
function cellPlate(x, W, H){
  x.fillStyle = '#e0d7bd'; x.fillRect(0,0,W,H);
  blotches(x,W,H,60,['198,186,158','214,206,184'],26,140,0.4);
  const cx = W/2, cy = H*0.46, R = Math.min(W,H)*0.36;
  x.strokeStyle = 'rgba(48,40,28,.8)'; x.lineWidth = 2;
  x.beginPath(); x.arc(cx, cy, R*0.17, 0, Math.PI*2); x.stroke();
  for (let i=0;i<7;i++){
    const a = -Math.PI/2 + (i/7)*Math.PI*2;
    const ex = cx + Math.cos(a)*R, ey = cy + Math.sin(a)*R;
    const nx = -Math.sin(a)*R*0.075, ny = Math.cos(a)*R*0.075;
    x.beginPath();
    x.moveTo(cx + Math.cos(a)*R*0.17 + nx, cy + Math.sin(a)*R*0.17 + ny);
    x.lineTo(ex + nx, ey + ny); x.lineTo(ex - nx, ey - ny);
    x.lineTo(cx + Math.cos(a)*R*0.17 - nx, cy + Math.sin(a)*R*0.17 - ny);
    x.closePath(); x.stroke();
    x.lineWidth = 1;                                  // cell divisions
    for (let k=1;k<11;k++){
      const t = 0.17 + (k/11)*0.83;
      x.beginPath();
      x.moveTo(cx + Math.cos(a)*R*t + nx, cy + Math.sin(a)*R*t + ny);
      x.lineTo(cx + Math.cos(a)*R*t - nx, cy + Math.sin(a)*R*t - ny);
      x.stroke();
    }
    x.lineWidth = 2;
  }
  x.textAlign='center'; x.fillStyle='#2b2318';
  x.font='600 22px Cinzel, Georgia, serif';
  drawSpaced(x,'CELLULAR JAIL, PORT BLAIR', W/2, 52, 3.4, 'center');
  x.font='16px "Cormorant Garamond", Georgia, serif';
  x.fillStyle='rgba(43,35,24,.72)';
  x.fillText('Completed 1906 · seven wings · 693 single cells', W/2, 78);
  x.fillText('No cell faced another. Three wings survive.', W/2, H-52);
  x.strokeStyle='rgba(70,56,36,.5)'; x.lineWidth=2; x.strokeRect(16,16,W-32,H-32);
}

/** HRA → Kakori → HSRA, as a plain organisational line. */
function lineagePlate(x, W, H){
  x.fillStyle = '#ded4b8'; x.fillRect(0,0,W,H);
  blotches(x,W,H,50,['196,184,154','216,208,186'],26,140,0.4);
  x.strokeStyle='rgba(70,56,36,.5)'; x.lineWidth=2; x.strokeRect(16,16,W-32,H-32);
  x.textAlign='center'; x.fillStyle='#2b2318';
  x.font='600 21px Cinzel, Georgia, serif';
  drawSpaced(x,'THE ORGANISATIONAL LINE', W/2, 56, 3.4, 'center');
  const boxes = [
    ['HINDUSTAN REPUBLICAN','ASSOCIATION','Kanpur, October 1924'],
    ['THE KAKORI CASE','1925 — 1927','four executions, Dec 1927'],
    ['HINDUSTAN SOCIALIST','REPUBLICAN ASSOCIATION','Delhi, September 1928']
  ];
  const bw = (W - 120)/3, by = 120, bh = H - 220;
  boxes.forEach((b, i) => {
    const bx = 40 + i*(bw + 20);
    x.strokeStyle='rgba(48,40,28,.72)'; x.lineWidth=1.6;
    x.strokeRect(bx, by, bw, bh);
    x.fillStyle='#2b2318'; x.font='600 15px Cinzel, Georgia, serif';
    drawSpaced(x, b[0], bx + bw/2, by + 46, 1.4, 'center');
    drawSpaced(x, b[1], bx + bw/2, by + 70, 1.4, 'center');
    x.fillStyle='rgba(43,35,24,.7)'; x.font='italic 16px "Cormorant Garamond", Georgia, serif';
    x.fillText(b[2], bx + bw/2, by + 104);
    if (i < 2){
      x.strokeStyle='rgba(48,40,28,.6)';
      x.beginPath(); x.moveTo(bx+bw+3, by+bh/2); x.lineTo(bx+bw+17, by+bh/2); x.stroke();
      x.beginPath(); x.moveTo(bx+bw+12, by+bh/2-5); x.lineTo(bx+bw+17, by+bh/2); x.lineTo(bx+bw+12, by+bh/2+5); x.stroke();
    }
  });
  x.fillStyle='rgba(43,35,24,.7)'; x.font='16px "Cormorant Garamond", Georgia, serif';
  x.fillText('Sanyal founded the first and was imprisoned in the Andamans during the third.', W/2, H-46);
}

function toRecord(payload){
  if (!payload) return null;
  if (payload.kind === 'event'){
    const e = payload.event;
    return { kicker:'EVENT', id:e.id, images:e.images, tag:e.involvement, title:e.title, date:e.date || e.year, zone:e.zone,
             place:e.place, what:e.what, why:e.why, note:e.note, sources:e.sources, audioUrl:e.audioUrl };
  }
  if (payload.kind === 'node'){
    const n = payload.node;
    return { kicker:'NETWORK NODE', id:'node-'+n.id, tag:'context', title:n.label, date:'—', zone:'network',
             place:n.role, what:n.context,
             why:'This node appears on the wall because its association with Sanyal is documented. The exhibition draws no relationship that a source does not support.',
             sources:[n.source], audioUrl:'' };
  }
  if (payload.kind === 'book'){
    const b = payload.book;
    return { kicker:'FROM THE WRITINGS', id:'book-'+b.id, tag:'direct', title:b.title, date:b.period, zone:'writings',
             place:'—', what:b.description, why:b.importance,
             note:'This exhibition summarises rather than reproduces. Consult a published edition for the text itself.',
             sources:[b.source], audioUrl:'' };
  }
  const r = payload.record;
  if (!r) return null;
  return { kicker:r.kicker || 'RECORD', id:r.id || ('rec-'+stripTags(r.title).slice(0,24)), images:r.images,
           tag:r.tag || r.involvement || 'context', zone:r.zone || state.zoneKey,
           title:r.title, date:r.date || r.year, place:r.place, what:r.what, why:r.why,
           note:r.note, sources:r.sources, audioUrl:r.audioUrl };
}

function showEventPanel(payload){
  const r = toRecord(payload);
  if (!r) return;
  music.pausedForInfo = true;      // set before the fade so a rapid E/ESC cannot race it
  musicSuspend(900);
  const p = $('panel');
  p.classList.remove('hidden','closing');
  p.scrollTop = 0;
  const scroll = p.querySelector('.panel-scroll');
  if (scroll) scroll.scrollTop = 0;

  // where this sits in the 1893–1942 span
  const span = recordSpan(r);
  const ribbon = $('pRibbon');
  if (span){
    ribbon.classList.remove('hidden');
    $('pRibbonFill').style.left  = span.from + '%';
    $('pRibbonFill').style.width = (span.to - span.from) + '%';
    $('pRibbonLabel').textContent = span.a === span.b ? String(span.a) : `${span.a} — ${span.b}`;
  } else ribbon.classList.add('hidden');

  $('pKicker').textContent = r.kicker;
  const tag = $('pTag');
  tag.textContent = TAG_TEXT[r.tag] || 'HISTORICAL CONTEXT';
  tag.className = 'tag ' + (r.tag || 'context');
  $('pTitle').innerHTML = r.title;
  $('pDate').textContent  = r.date || '—';
  $('pPlace').innerHTML   = r.place || '—';
  $('pWhat').innerHTML    = r.what || '—';
  $('pWhy').innerHTML     = r.why  || '—';

  const nw = $('pNoteWrap');
  if (r.note){ nw.classList.remove('hidden'); $('pNote').innerHTML = r.note; }
  else nw.classList.add('hidden');

  const ul = $('pSources');
  ul.innerHTML = '';
  for (const s of (r.sources || [])){
    const li = document.createElement('li');
    li.innerHTML = s;
    ul.appendChild(li);
  }

  // ── subtitle: the involvement, spelled out ──
  $('pSubtitle').textContent =
    r.tag === 'direct'  ? 'A documented act or circumstance of Sanyal\'s own life.'
  : r.tag === 'broader' ? 'An event of the movement that was not Sanyal\'s act.'
  :                       'Surrounding historical and institutional context.';

  // ── supplementary material ──
  const extra = EXTRA[r.id] || {};
  fillList($('pFacts'), extra.facts, $('pFactsWrap'));
  $('pImpactWrap').classList.toggle('hidden', !extra.impact);
  if (extra.impact) $('pImpact').innerHTML = extra.impact;
  fillPeople(extra.people);
  fillNearby(r.id);

  // ── prev / next within the timeline ──
  const i = TIMELINE.findIndex(e => e.id === r.id);
  $('pPrev').classList.toggle('hidden', i < 1);
  $('pNext').classList.toggle('hidden', i < 0 || i >= TIMELINE.length - 1);

  $('pNarrate').classList.toggle('hidden', !r.audioUrl);
  $('prompt').classList.add('hidden');
  $('reticle').classList.add('hidden');

  // restart the staggered reveal on every open
  const reveal = p.querySelectorAll('[data-reveal]');
  reveal.forEach((el, i) => {
    el.style.animation = 'none';
    void el.offsetWidth;
    el.style.animation = `revealUp .62s cubic-bezier(.22,.61,.36,1) ${0.06 + i*0.055}s both`;
  });
}

function fillList(ul, items, wrap){
  wrap.classList.toggle('hidden', !items || !items.length);
  ul.innerHTML = '';
  for (const it of (items || [])){
    const li = document.createElement('li');
    li.innerHTML = it;
    ul.appendChild(li);
  }
}

/** Cards for the NETWORK nodes this record is documented as touching. */
function fillPeople(ids){
  const host = $('pPeople');
  host.innerHTML = '';
  const nodes = (ids || []).map(id => NETWORK.nodes.find(n => n.id === id)).filter(Boolean);
  $('pPeopleWrap').classList.toggle('hidden', !nodes.length);
  for (const n of nodes){
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'card';
    b.innerHTML =
      `<span class="mono">${n.label.split(/[\s(]+/).slice(0,2).map(w=>w[0]).join('')}</span>` +
      `<b>${n.label}</b><span>${n.role}</span>`;
    b.addEventListener('click', () => showEventPanel({ kind:'node', node:n }));
    host.appendChild(b);
  }
}

/** Other dated entries standing in the same period of the exhibition. */
function fillNearby(id){
  const host = $('pNearby');
  host.innerHTML = '';
  const self = TIMELINE.find(e => e.id === id);
  const near = self ? TIMELINE.filter(e => e.zone === self.zone && e.id !== id).slice(0, 5) : [];
  $('pNearbyWrap').classList.toggle('hidden', !near.length);
  for (const e of near){
    const b = document.createElement('button');
    b.type = 'button';
    b.innerHTML = `<span class="ny">${e.year}</span><span class="nt">${stripTags(e.title)}</span>`;
    b.addEventListener('click', () => showEventPanel({ kind:'event', event:e }));
    host.appendChild(b);
  }
}


/** Step to the neighbouring timeline entry while the panel is open. */
function stepEntry(delta){
  const id = state.activeItem && toRecord(state.activeItem) && toRecord(state.activeItem).id;
  let i = TIMELINE.findIndex(e => e.id === id);
  if (i < 0) i = 0;
  const next = TIMELINE[clamp(i + delta, 0, TIMELINE.length - 1)];
  if (!next) return;
  state.activeItem = { kind:'event', event:next };
  showEventPanel(state.activeItem);
}

function closeEventPanel(){
  music.pausedForInfo = false;
  musicResume(1000);              // no-ops while music.enabled is false
  const p = $('panel');
  if (!p.classList.contains('hidden')){
    p.classList.add('closing');
    setTimeout(() => { p.classList.add('hidden'); p.classList.remove('closing'); }, 420);
  }
  stopNarration();
  $('reticle').classList.remove('hidden');
  if (state.mode === 'reading' || state.mode === 'focusing'){
    // return from wherever the camera actually is, so an interrupted move never pops
    focusCam.to.copy(camera.position);
    focusCam.toQ.copy(camera.quaternion);
    focusCam.t = 0;
    focusCam.dur = 0.85;
    state.mode = 'returning';
  }
  if (state.activeItem){
    const owner = state.activeItem;
    for (const face of interactables) if (face.userData.payload === owner) fadeHalo(face, 0);
  }
  state.activeItem = null;
}

/* ═══════════════════════ full timeline overlay ═══════════════════════ */

let overlayBuilt = false;

function buildTimelineOverlay(){
  if (overlayBuilt) return;
  overlayBuilt = true;
  const tree = $('toTree');
  const frag = document.createDocumentFragment();

  const anchorTop = document.createElement('div');
  anchorTop.className = 'to-anchor';
  anchorTop.textContent = '1893';
  frag.appendChild(anchorTop);

  TIMELINE.forEach((ev, i) => {
    const stem = document.createElement('div');
    stem.className = 'to-stem'; stem.textContent = '│';
    frag.appendChild(stem);

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'to-item';
    btn.dataset.id = ev.id;
    const last = i === TIMELINE.length - 1;
    btn.innerHTML =
      `<span class="br">${last ? '└──' : '├──'}</span>` +
      `<span class="sw ${ev.involvement}"></span>` +
      `<span class="yr">${ev.year}</span>` +
      `<span class="tx">${stripTags(ev.title)}</span>`;
    btn.addEventListener('click', () => selectTimelineItem(ev.id));
    frag.appendChild(btn);
  });

  const stem2 = document.createElement('div');
  stem2.className = 'to-stem'; stem2.textContent = '│';
  frag.appendChild(stem2);
  const anchorEnd = document.createElement('div');
  anchorEnd.className = 'to-anchor';
  anchorEnd.textContent = '1942';
  frag.appendChild(anchorEnd);

  tree.appendChild(frag);
}

function selectTimelineItem(id){
  const ev = TIMELINE.find(e => e.id === id);
  if (!ev) return;
  for (const b of document.querySelectorAll('.to-item')) b.classList.toggle('sel', b.dataset.id === id);

  const d = $('toDetail');
  d.innerHTML = `
    <h3>${ev.title}</h3>
    <p class="dmeta">${(ev.date || ev.year)} &nbsp;·&nbsp; ${TAG_TEXT[ev.involvement]}${ev.place && ev.place !== '—' ? ' &nbsp;·&nbsp; ' + ev.place : ''}</p>
    <h4>WHAT HAPPENED</h4><p>${ev.what}</p>
    <h4>WHY IT MATTERS</h4><p>${ev.why}</p>
    ${ev.note ? `<div class="note-box"><h4>NOTE ON THE RECORD</h4><p>${ev.note}</p></div>` : ''}
    <h4>SOURCES</h4><ul>${ev.sources.map(s=>`<li>${s}</li>`).join('')}</ul>
    <div class="panel-actions"><button type="button" class="ghost" id="locateBtn">LOCATE IN EXHIBITION</button></div>
  `;
  $('locateBtn').addEventListener('click', () => {
    toggleTimelineOverlay(false);
    beginGuided(ev);
  });
}

function toggleTimelineOverlay(open){
  const o = $('timelineOverlay');
  if (open){
    buildTimelineOverlay();
    if (!document.querySelector('.to-item.sel')) selectTimelineItem(nearestEvent().id);
    o.classList.remove('hidden');
    if (document.pointerLockElement) document.exitPointerLock();
    $('resume').classList.add('hidden');
    $('prompt').classList.add('hidden');
  } else {
    o.classList.add('hidden');
    if (state.started && state.mode !== 'reading' && !touch.isTouch) $('resume').classList.remove('hidden');
  }
}

function nearestEvent(){
  const d = dOf(camera.position.z);
  let best = TIMELINE[0], bd = Infinity;
  for (const e of TIMELINE){
    const q = Math.abs(e.absD - d);
    if (q < bd){ bd = q; best = e; }
  }
  return best;
}

/* ── guided walk to an exhibit ── */

function beginGuided(ev){
  state.guideTargetD = ev.absD;
  state.guideEvent = ev;
  state.mode = 'guided';
  player.vel.set(0,0,0);
  $('guideText').textContent = `WALKING TO  ${ev.year}  ·  ${stripTags(ev.title).toUpperCase()}`;
  $('guide').classList.remove('hidden');
  requestLock();
}

function endGuided(){
  state.guideTargetD = null;
  state.guideEvent = null;
  if (state.mode === 'guided') state.mode = 'walk';
  $('guide').classList.add('hidden');
}

function updateGuided(dt){
  if (state.mode !== 'guided' || state.guideTargetD === null) return;
  const targetZ = zOf(state.guideTargetD);
  const dz = targetZ - camera.position.z;
  const dist = Math.abs(dz);

  if (dist < 0.35){
    player.pos.copy(camera.position);
    player.pos.z = targetZ;
    if (state.guideEvent && state.guideEvent.side){          // turn to face the exhibit
      player.targetYaw = state.guideEvent.side === 'left' ? Math.PI/2 : -Math.PI/2;
    } else {
      player.targetYaw = 0;                                   // the opening walk-in: face forward
    }
    player.targetPitch = 0;
    endGuided();
    return;
  }

  const speed = CFG.walkSpeed * 1.9 * clamp(dist/4, 0.28, 1);
  player.pos.z += Math.sign(dz) * speed * dt;
  player.pos.x += (0 - player.pos.x) * Math.min(1, dt*1.4);
  player.pos.y = CFG.eyeHeight;

  const facing = dz < 0 ? 0 : Math.PI;                        // walk facing the direction of travel
  let diff = facing - player.targetYaw;
  while (diff >  Math.PI) diff -= Math.PI*2;
  while (diff < -Math.PI) diff += Math.PI*2;
  player.targetYaw += diff * Math.min(1, dt*2.2);
  player.targetPitch += (0 - player.targetPitch) * Math.min(1, dt*2.2);

  camera.position.copy(player.pos);
}

/* ═══════════════════════ HUD / period transitions ═══════════════════════ */

const fogCol = new THREE.Color(), ambCol = new THREE.Color();
let lastZoneKey = '', hudPct = 0;

function updateTimeline(){
  const d = clamp(dOf(camera.position.z), 0, CORRIDOR_LEN + 26);
  const zone = zoneAtD(Math.min(d, CORRIDOR_LEN - 0.01));

  // dot + year + period — the marker eases onto its target rather than stepping
  const pct = clamp(d / (CORRIDOR_LEN + 20), 0, 1) * 100;
  hudPct += (pct - hudPct) * 0.12;
  $('tlDot').style.left = hudPct.toFixed(2) + '%';
  $('tlTrail').style.width = hudPct.toFixed(2) + '%';

  const t = clamp((d - zone.startD) / zone.length, 0, 1);
  const year = Math.round(lerp(zone.yearFrom, zone.yearTo, t));
  $('tlYear').textContent = zone.key === 'entrance' ? '—' : String(year);
  $('tlPeriod').textContent = zone.name;

  // ── the cinematic part: lighting and air change with the period ──
  const nextIdx = Math.min(ZONES.indexOf(zone) + 1, ZONES.length - 1);
  const next = ZONES[nextIdx];
  const blend = smoothstep((d - (zone.endD - 14)) / 14);       // ease into the next period

  fogCol.set(zone.fog).lerp(new THREE.Color(next.fog), blend);
  scene.fog.color.copy(fogCol);
  scene.background.copy(fogCol);
  scene.fog.density = lerp(CFG.fogDensity, 0.006, clamp((d - FLARE_START + 30)/60, 0, 1));

  ambCol.set(zone.ambient).lerp(new THREE.Color(next.ambient), blend);
  ambient.color.copy(ambCol);
  ambient.intensity = lerp(zone.ambientI, next.ambientI, blend);
  hemi.color.copy(ambCol);
  hemi.groundColor.copy(ambCol).multiplyScalar(0.62);
  hemi.intensity = 0.34;

  if (zone.key !== lastZoneKey){
    lastZoneKey = zone.key;
    state.zoneKey = zone.key;
    if (zone.key !== 'entrance') announceZone(zone);
    setAmbienceForZone(zone);
  }
}

function announceZone(zone){
  const card = $('zoneCard');
  $('zcYears').textContent = zone.years || '';
  $('zcName').textContent  = zone.name;
  card.classList.add('hidden');
  void card.offsetWidth;                      // restart the animation
  card.classList.remove('hidden');
  clearTimeout(announceZone._t);
  announceZone._t = setTimeout(() => card.classList.add('hidden'), 5200);
}

function buildTimelineTicks(){
  const host = $('tlZones');
  for (const z of ZONES){
    if (z.key === 'entrance') continue;
    const i = document.createElement('i');
    i.style.left = (z.startD / (CORRIDOR_LEN + 20) * 100).toFixed(2) + '%';
    i.title = z.name;
    host.appendChild(i);
  }
}

/* ═══════════════════════ audio ═══════════════════════ */

const audio = { ctx:null, master:null, drone:[], noiseGain:null, filter:null, stepT:0, el:null };

function initAudio(){
  if (audio.ctx) return;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  try {
    audio.ctx = new AC();
    audio.master = audio.ctx.createGain();
    audio.master.gain.value = 0.55;
    audio.master.connect(audio.ctx.destination);

    // low room drone
    for (const [f, g] of [[54, 0.05],[81.5, 0.028],[108, 0.014]]){
      const o = audio.ctx.createOscillator(), gn = audio.ctx.createGain();
      o.type = 'sine'; o.frequency.value = f;
      gn.gain.value = g;
      o.connect(gn).connect(audio.master);
      o.start();
      audio.drone.push({ o, gn, base:f });
    }

    // filtered noise bed — the "air" of the room
    const len = audio.ctx.sampleRate * 3;
    const buf = audio.ctx.createBuffer(1, len, audio.ctx.sampleRate);
    const dat = buf.getChannelData(0);
    let last = 0;
    for (let i=0;i<len;i++){ last = (last + (Math.random()*2-1)*0.03) * 0.997; dat[i] = last; }
    const src = audio.ctx.createBufferSource();
    src.buffer = buf; src.loop = true;
    audio.filter = audio.ctx.createBiquadFilter();
    audio.filter.type = 'bandpass';
    audio.filter.frequency.value = 420;
    audio.filter.Q.value = 0.6;
    audio.noiseGain = audio.ctx.createGain();
    audio.noiseGain.gain.value = 0.5;
    src.connect(audio.filter).connect(audio.noiseGain).connect(audio.master);
    src.start();
  } catch (_){ audio.ctx = null; }
}

function setAmbienceForZone(zone){
  if (!audio.ctx) return;
  const map = { entrance:[54,380,0.4], early:[58,520,0.45], revolution:[52,430,0.5],
                network:[62,600,0.4], kakori:[49,360,0.55], prison:[44,240,0.62],
                writings:[65,700,0.34], legacy:[73,860,0.3] };
  const [f, cut, ng] = map[zone.key] || map.entrance;
  const now = audio.ctx.currentTime;
  audio.drone.forEach((d,i) => d.o.frequency.linearRampToValueAtTime(f * (i===0?1:(i===1?1.5:2)), now + 4));
  audio.filter.frequency.linearRampToValueAtTime(cut, now + 4);
  audio.noiseGain.gain.linearRampToValueAtTime(ng, now + 4);
}

function sfxFootstep(gain = 0.16){
  if (!audio.ctx || state.muted) return;
  const t = audio.ctx.currentTime;
  const len = (audio.ctx.sampleRate * 0.12)|0;
  const buf = audio.ctx.createBuffer(1, len, audio.ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i=0;i<len;i++) d[i] = (Math.random()*2-1) * Math.pow(1 - i/len, 5);
  const src = audio.ctx.createBufferSource(); src.buffer = buf;
  const f = audio.ctx.createBiquadFilter();
  f.type = 'lowpass'; f.frequency.value = 300 + Math.random()*220;
  const g = audio.ctx.createGain(); g.gain.value = gain;
  src.connect(f).connect(g).connect(audio.master);
  src.start(t);
}

function sfxChime(){
  if (!audio.ctx || state.muted) return;
  const t = audio.ctx.currentTime;
  for (const [f, dl] of [[523.25, 0],[659.25, 0.06]]){
    const o = audio.ctx.createOscillator(), g = audio.ctx.createGain();
    o.type = 'sine'; o.frequency.value = f;
    g.gain.setValueAtTime(0, t + dl);
    g.gain.linearRampToValueAtTime(0.06, t + dl + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dl + 1.4);
    o.connect(g).connect(audio.master);
    o.start(t + dl); o.stop(t + dl + 1.5);
  }
}

/* ═══════════════════════ background music ═══════════════════════
   One persistent <audio> element for the whole session — never re-created on
   E, ESC, M, a new poster or a change of period. It sits underneath the
   WebAudio ambience and steps out of the way entirely while a record is open,
   so narration and reading are never competing with a score.

   Two independent reasons the music can be silent, deliberately kept apart:
     enabled === false      the visitor pressed M. Sticky; only M undoes it.
     pausedForInfo === true a panel is open. Clears when the panel closes.
   Resuming only ever happens when `enabled` is true, so an info-pause can
   never override a manual mute.                                            */

const MUSIC_SRC = './assets/audio/background.mp3';

const music = {
  el: null,
  enabled: true,        // the visitor's own choice (M)
  pausedForInfo: false, // a record panel is open
  started: false,       // playback has been permitted at least once
  failed: false,
  volume: 0.32,         // sits under narration, footsteps and the ambience
  fade: null            // handle of the running fade, so only one ever runs
};

function initMusic(){
  if (music.el || music.failed) return;
  const el = new Audio();
  el.src = MUSIC_SRC;
  el.loop = true;                    // seamless, no end-of-track handling needed
  el.preload = 'auto';
  el.volume = 0;                     // every start fades up from silence
  el.addEventListener('error', () => {
    music.failed = true;
    console.warn(`[music] could not load ${MUSIC_SRC} — the exhibition runs without it.`);
  });
  music.el = el;
}

/* Interpolated from elapsed time, so it is frame-rate independent, and driven
   by a timer rather than rAF: requestAnimationFrame stops being serviced in a
   background or non-compositing tab, which would strand a fade half-finished
   and leave the track audible-but-silent. Starting a fade cancels the one in
   flight, so hammering E/ESC/M can never stack two loops. */
function fadeMusic(target, ms, done){
  const el = music.el;
  if (!el) return;
  if (music.fade){ clearInterval(music.fade); music.fade = null; }
  const from = el.volume, delta = clamp(target, 0, 1) - from, t0 = performance.now();
  if (Math.abs(delta) < 0.001 || ms <= 0){
    el.volume = clamp(target, 0, 1); done && done(); return;
  }
  music.fade = setInterval(() => {
    const k = clamp((performance.now() - t0) / ms, 0, 1);
    el.volume = clamp(from + delta * (k * k * (3 - 2 * k)), 0, 1);   // smoothstep
    if (k >= 1){
      clearInterval(music.fade); music.fade = null;
      done && done();
    }
  }, 25);
}

/** Play if the visitor wants it and nothing is claiming the foreground. */
function musicResume(ms = 900){
  initMusic();
  if (!music.el || music.failed) return;
  if (!music.enabled || music.pausedForInfo) return;
  // resumes from wherever it left off — currentTime is never reset
  const p = music.el.play();
  if (p && p.catch) p.catch(() => {
    // autoplay still blocked; the next real gesture will call this again
    music.started = false;
  });
  music.started = true;
  fadeMusic(music.volume, ms);
}

function musicSuspend(ms = 900){
  if (!music.el || music.failed) return;
  fadeMusic(0, ms, () => { if (music.el) music.el.pause(); });
}

/** The first genuine gesture of any kind is what unblocks playback. */
function musicOnFirstGesture(){
  if (music.started || music.failed) return;
  musicResume(1400);
}

function toggleMusic(){
  initMusic();
  music.enabled = !music.enabled;
  if (music.enabled) musicResume(900);
  else               musicSuspend(700);
  musicToast();
}

/** Small, brief, and gone again — no permanent HUD furniture. */
function musicToast(){
  const ind = $('musicState');
  if (ind) ind.textContent = music.enabled ? '♫ MUSIC: ON' : '♫ MUSIC: OFF';
  const t = $('musicToast');
  if (!t) return;
  t.textContent = music.enabled ? '♫  MUSIC ON' : '♫  MUSIC OFF';
  t.classList.remove('hidden', 'show');
  void t.offsetWidth;
  t.classList.add('show');
  clearTimeout(musicToast._t);
  musicToast._t = setTimeout(() => {
    t.classList.remove('show');
    setTimeout(() => t.classList.add('hidden'), 400);
  }, 1500);
}

/* M is this exhibition's single audio key: it already muted the ambience and
   footsteps, and now carries the music with it, so one press means silence. */
function toggleMute(){
  state.muted = !state.muted;
  if (audio.master) audio.master.gain.value = state.muted ? 0 : 0.55;
  if (audio.el) audio.el.muted = state.muted;
  toggleMusic();
}

/* Returning to the tab must not spawn a second playback or rewind the track. */
document.addEventListener('visibilitychange', () => {
  if (!music.el || music.failed) return;
  if (document.hidden){
    // silence immediately rather than relying on a fade a hidden tab may throttle
    if (music.fade){ clearInterval(music.fade); music.fade = null; }
    music.el.volume = 0;
    music.el.pause();
  } else if (music.started){
    musicResume(700);
  }
});

/* Narration hook — set `audioUrl` on any event/record and the panel offers it.
   e.g. an ElevenLabs render written to ./assets/audio/1893-birth.mp3            */
function playNarration(payload){
  const r = toRecord(payload);
  if (!r || !r.audioUrl) return;
  stopNarration();
  audio.el = new Audio(r.audioUrl);
  audio.el.volume = 0.9;
  audio.el.muted = state.muted;
  audio.el.play().catch(()=>{});
  $('pNarrate').textContent = '■ STOP NARRATION';
}
function stopNarration(){
  if (audio.el){ audio.el.pause(); audio.el = null; }
  $('pNarrate').textContent = '▶ PLAY NARRATION';
}

/* ═══════════════════════ movement + loop ═══════════════════════ */

const fwd = new THREE.Vector3(), rgt = new THREE.Vector3(), wish = new THREE.Vector3(), prevPos = new THREE.Vector3();
const camRig = new THREE.Vector3();
const damp = THREE.MathUtils.damp;          // lerp(x,y,1-exp(-lambda*dt)) — FPS independent

/** The camera may never enter the masonry: walls, vault, road or rotunda shell. */
function clampInsideBore(p){
  if (p.z <= zOf(CORRIDOR_LEN)){
    const dx = p.x, dz = p.z - ROT_CENTER_Z, r = Math.hypot(dx, dz), lim = ROT_RADIUS - 0.55;
    if (r > lim){ p.x = dx/r*lim; p.z = ROT_CENTER_Z + dz/r*lim; }
    p.y = clamp(p.y, 0.3, ROT_HEIGHT - 0.5);
    return p;
  }
  const d = clamp(dOf(p.z), 0, CORRIDOR_LEN);
  const { ht } = profileAt(d);
  const WX = wallXAt(d), SPR = springingAt(ht);
  p.x = clamp(p.x, -(WX - 0.5), WX - 0.5);
  // headroom follows the arch, so looking up near a wall never clips the vault
  const k = clamp(Math.abs(p.x)/WX, 0, 1);
  p.y = clamp(p.y, 0.25, SPR + (ht - SPR)*Math.sqrt(Math.max(0, 1 - k*k)) - 0.35);
  return p;
}

function updateMovement(dt){
  // damped look — raw mouse deltas feed the target, the camera eases onto it
  player.yaw   = damp(player.yaw,   player.targetYaw,   1/CFG.lookSmooth, dt);
  player.pitch = damp(player.pitch, player.targetPitch, 1/CFG.lookSmooth, dt);

  // Field of view eases back in every mode, so opening a panel mid-sprint
  // settles the lens instead of freezing it wide.
  if (state.mode !== 'walk') player.speedCap = damp(player.speedCap, CFG.walkSpeed, 4.2, dt);
  const fovTarget = CFG.fov + CFG.runFov *
    clamp((player.speedCap - CFG.walkSpeed) / (CFG.runSpeed - CFG.walkSpeed), 0, 1);
  if (Math.abs(camera.fov - fovTarget) > 0.01){
    camera.fov = damp(camera.fov, fovTarget, 4.5, dt);
    camera.updateProjectionMatrix();
  }

  if (state.mode !== 'walk'){
    if (state.mode === 'guided'){
      camera.rotation.set(player.pitch, player.yaw, 0, 'YXZ');
      camRig.copy(camera.position);
    }
    return;
  }

  camera.rotation.set(player.pitch, player.yaw, 0, 'YXZ');

  const f = (keys.KeyW || keys.ArrowUp   ? 1 : 0) - (keys.KeyS || keys.ArrowDown  ? 1 : 0)
          + touch.moveY;
  const s = (keys.KeyD || keys.ArrowRight? 1 : 0) - (keys.KeyA || keys.ArrowLeft  ? 1 : 0)
          + touch.moveX;

  fwd.set(-Math.sin(player.yaw), 0, -Math.cos(player.yaw));
  rgt.set( Math.cos(player.yaw), 0, -Math.sin(player.yaw));
  wish.set(0,0,0).addScaledVector(fwd, clamp(f,-1,1)).addScaledVector(rgt, clamp(s,-1,1));
  if (wish.lengthSq() > 1) wish.normalize();

  /* Sprint. The cap itself is interpolated rather than switched, so the change
     is felt as the visitor gathering pace and easing off, never as a step. It
     is keyed off Shift being held at this instant, so the order Shift and W are
     pressed or released in makes no difference. `mode` is already 'walk' here,
     which is what keeps sprint off while a panel is open. */
  const wantsRun = (keys.ShiftLeft || keys.ShiftRight) && wish.lengthSq() > 0.001;
  player.speedCap = damp(player.speedCap,
                         wantsRun ? CFG.runSpeed : CFG.walkSpeed,
                         wantsRun ? 2.6 : 4.2, dt);        // eases in, settles quicker
  const runT = clamp((player.speedCap - CFG.walkSpeed) / (CFG.runSpeed - CFG.walkSpeed), 0, 1);

  // Drag settles the speed at accel/damping, so acceleration has to scale with
  // the cap for a sprint actually to reach twice walking pace.
  const push = CFG.accel * (player.speedCap / CFG.walkSpeed);
  player.vel.x += wish.x * push * dt;
  player.vel.z += wish.z * push * dt;
  const drag = Math.exp(-CFG.damping * dt);
  player.vel.x *= drag; player.vel.z *= drag;

  const sp = Math.hypot(player.vel.x, player.vel.z);
  if (sp > player.speedCap){ player.vel.x *= player.speedCap/sp; player.vel.z *= player.speedCap/sp; }

  prevPos.copy(player.pos);
  player.pos.x += player.vel.x * dt;
  player.pos.z += player.vel.z * dt;
  resolveCollision(player.pos, prevPos);

  // a small, slow gait — museum walking. Running lengthens the stride and
  // deepens the bob a little, but never enough to read as a shooter.
  audio.stepT += sp * dt;
  if (audio.stepT > lerp(1.55, 1.15, runT)){ audio.stepT = 0; sfxFootstep(0.16 + runT*0.13); }
  const bob = Math.sin(audio.stepT * 4.05) * (0.012 + runT*0.017) * clamp(sp/CFG.walkSpeed, 0, 1);

  // stand on the actual road surface: camber, gutter dip and the kerb step up
  const ground = player.pos.z > zOf(CORRIDOR_LEN) ? surfaceYAt(player.pos.x, dOf(player.pos.z)) : 0;
  player.ground = damp(player.ground, ground, 7, dt);
  player.pos.y = player.ground + CFG.eyeHeight + bob;

  // Damped follow. Fast enough to feel responsive, slow enough that starting
  // and stopping settle rather than snap. Vertical is softer so the kerb step
  // and the road camber read as a rise, not a jolt.
  camRig.x = damp(camRig.x, player.pos.x, 20, dt);
  camRig.z = damp(camRig.z, player.pos.z, 20, dt);
  camRig.y = damp(camRig.y, player.pos.y, 11, dt);
  camera.position.copy(clampInsideBore(camRig));
}

function animate(){
  state.raf = requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.05);

  updateMovement(dt);
  updateGuided(dt);
  updateFocus(dt);
  updateLampPool();
  updateDust(clock.elapsedTime);
  updateHover();
  updateHalos(dt);
  updateTimeline();

  renderer.render(scene, camera);
}

/* ═══════════════════════ boot ═══════════════════════ */

function fatal(msg){
  $('loading').classList.add('hidden');
  $('start').classList.add('hidden');
  $('fatalMsg').textContent = msg;
  $('fatal').classList.remove('hidden');
}

function beginJourney(){
  if (state.started) return;
  state.started = true;

  initAudio();
  setAmbienceForZone(ZONES[0]);
  musicOnFirstGesture();

  const s = $('start');
  s.classList.add('fading');
  setTimeout(() => s.classList.add('hidden'), 1200);
  $('hud').classList.remove('hidden');

  // the camera walks itself in, once, then hands over
  const introFrom = new THREE.Vector3(0, CFG.eyeHeight, BACK_WALL_Z - 1.2);
  const introTo   = new THREE.Vector3(0, CFG.eyeHeight, -4.5);
  camera.position.copy(introFrom);
  player.pos.copy(introFrom);
  camRig.copy(introFrom);
  state.mode = 'guided';
  state.guideTargetD = dOf(introTo.z);
  state.guideEvent = null;                      // no exhibit to turn towards — just walk in
  $('guide').classList.add('hidden');
  setTimeout(() => {                            // safety net if the walk-in is interrupted
    if (state.mode === 'guided' && !state.guideEvent) endGuided();
  }, 5000);

  requestLock();
}

async function boot(){
  try {
    // the glyph atlas is rasterised from the webfont, so wait for it — but never
    // block the exhibition on a CDN: after a short grace period we fall back to
    // the local serif and carry on.
    try {
      await Promise.race([
        Promise.all([
          document.fonts.load('400 340px Cinzel'),
          document.fonts.load('400 20px "Cormorant Garamond"')
        ]).then(() => document.fonts.ready),
        new Promise(r => setTimeout(r, 3500))
      ]);
    } catch (_){ /* fall back to the local serif stack */ }

    buildTextures();
    initScene();
    buildGlyphAtlas();

    /* Order matters for wall occupancy: the exhibits are anchored to dated
       milestones, so they claim their wall space first. The bore's ribs and
       the lanterns then place themselves around what is already taken. */
    createExhibits();
    createTunnel();
    createTimeline();
    validateRoadTextOrientation();   // every label faces the direction of travel
    createLighting();
    createMuseumFittings();
    createDust();
    setupCollision();
    setupControls();
    setupInteraction();
    buildTimelineTicks();

    camera.position.copy(player.pos);
    camera.rotation.set(0, player.yaw, 0, 'YXZ');
    renderer.compile(scene, camera);

    $('loading').classList.add('fading');
    setTimeout(() => $('loading').classList.add('hidden'), 900);
    $('start').classList.remove('hidden');
    $('beginBtn').addEventListener('click', beginJourney);

    window.__EXHIBITION_BOOTED = true;   // read by the deployment self-check
    animate();
  } catch (err){
    console.error(err);
    fatal(String(err && err.message ? err.message : err));
  }
}

window.addEventListener('error', e => {
  if (!state.started && !renderer) fatal(e.message || 'Unknown error while starting WebGL.');
});

boot();


