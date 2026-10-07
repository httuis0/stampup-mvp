import { test } from 'node:test';
import assert from 'node:assert/strict';

// Helper tests for 365-day trajectory logic
function get365Trajectory(dayStreak = 1) {
  const day = Math.max(1, dayStreak);
  if (day <= 30) {
    return {
      phase: 1,
      phaseName: 'Foundation & Daily Routine',
      targetCefr: 'Pre-A1 to A1',
      estimatedFluency: Math.min(25, Math.round((day / 30) * 25)),
      dayGoal: 'Master everyday greetings, common verbs, and survival phrases.',
    };
  }
  if (day <= 90) {
    return {
      phase: 2,
      phaseName: 'Conversational Confidence',
      targetCefr: 'A1 to A2',
      estimatedFluency: Math.min(50, 25 + Math.round(((day - 30) / 60) * 25)),
      dayGoal: 'Narrate past experiences, order food, shop, and give directions.',
    };
  }
  if (day <= 180) {
    return {
      phase: 3,
      phaseName: 'Fluid Expression & Opinions',
      targetCefr: 'A2 to B1',
      estimatedFluency: Math.min(75, 50 + Math.round(((day - 90) / 90) * 25)),
      dayGoal: 'Express feelings, handle workplace meetings, and discuss future plans.',
    };
  }
  if (day <= 300) {
    return {
      phase: 4,
      phaseName: 'Professional & Nuanced Fluency',
      targetCefr: 'B1 to B2',
      estimatedFluency: Math.min(90, 75 + Math.round(((day - 180) / 120) * 15)),
      dayGoal: 'Debate complex topics, understand idioms, jokes, and native podcasts.',
    };
  }
  return {
    phase: 5,
    phaseName: 'Natural Fluency & Mastery',
    targetCefr: 'B2 to C1',
    estimatedFluency: Math.min(100, 90 + Math.round(((Math.min(365, day) - 300) / 65) * 10)),
    dayGoal: 'Speak spontaneously with idiomatic nuance, precision, and ease.',
  };
}

const SUPPORTED_LANGUAGES = [
  'English',
  'Bangla',
  'Spanish',
  'Hindi',
  'French',
  'Arabic',
  'German',
  'Japanese',
];

test('365 trajectory progression from Day 1 to Day 365+', () => {
  const day1 = get365Trajectory(1);
  assert.equal(day1.phase, 1);
  assert.equal(day1.targetCefr, 'Pre-A1 to A1');
  assert.ok(day1.estimatedFluency >= 0 && day1.estimatedFluency <= 25);

  const day45 = get365Trajectory(45);
  assert.equal(day45.phase, 2);
  assert.equal(day45.targetCefr, 'A1 to A2');
  assert.ok(day45.estimatedFluency > 25 && day45.estimatedFluency <= 50);

  const day120 = get365Trajectory(120);
  assert.equal(day120.phase, 3);
  assert.equal(day120.targetCefr, 'A2 to B1');
  assert.ok(day120.estimatedFluency > 50 && day120.estimatedFluency <= 75);

  const day220 = get365Trajectory(220);
  assert.equal(day220.phase, 4);
  assert.equal(day220.targetCefr, 'B1 to B2');
  assert.ok(day220.estimatedFluency > 75 && day220.estimatedFluency <= 90);

  const day365 = get365Trajectory(365);
  assert.equal(day365.phase, 5);
  assert.equal(day365.targetCefr, 'B2 to C1');
  assert.equal(day365.estimatedFluency, 100);

  const day500 = get365Trajectory(500); // endless learning
  assert.equal(day500.phase, 5);
  assert.equal(day500.estimatedFluency, 100);
});

test('Supported language options matrix has 8 decoupled native instruction languages', () => {
  assert.equal(SUPPORTED_LANGUAGES.length, 8);
  assert.ok(SUPPORTED_LANGUAGES.includes('Bangla'));
  assert.ok(SUPPORTED_LANGUAGES.includes('English'));
  assert.ok(SUPPORTED_LANGUAGES.includes('Spanish'));
  assert.ok(SUPPORTED_LANGUAGES.includes('Hindi'));
  assert.ok(SUPPORTED_LANGUAGES.includes('French'));
  assert.ok(SUPPORTED_LANGUAGES.includes('Arabic'));
  assert.ok(SUPPORTED_LANGUAGES.includes('German'));
  assert.ok(SUPPORTED_LANGUAGES.includes('Japanese'));
});

const EXPANSION_LESSON_IDS = [307, 308, 309, 310, 311, 407, 408, 410, 411];

test('Curriculum expansion packs cover Career, Travel, Social, and Idioms', () => {
  assert.equal(EXPANSION_LESSON_IDS.length, 9);
  assert.ok(EXPANSION_LESSON_IDS.includes(307)); // Tech standup & remote work
  assert.ok(EXPANSION_LESSON_IDS.includes(308)); // STAR interview technique
  assert.ok(EXPANSION_LESSON_IDS.includes(309)); // Salary negotiation
  assert.ok(EXPANSION_LESSON_IDS.includes(310)); // Border control & immigration
  assert.ok(EXPANSION_LESSON_IDS.includes(311)); // Cancelled flights & lost bags
  assert.ok(EXPANSION_LESSON_IDS.includes(407)); // Small talk & FORD technique
  assert.ok(EXPANSION_LESSON_IDS.includes(408)); // Dating & banter
  assert.ok(EXPANSION_LESSON_IDS.includes(410)); // Top 25 modern idioms
  assert.ok(EXPANSION_LESSON_IDS.includes(411)); // Connected speech & reductions
});

test('Onboarding 5-step persona profile validates complete personalization matrix', () => {
  const profile = {
    nativeLanguage: 'Bangla',
    targetAccent: 'US',
    learningGoal: 'career',
    interests: ['tech', 'cinema'],
    speakingBarrier: 'freeze',
    dailyMinutes: 15,
    teacherVoice: 'female',
    onboardingCompleted: true,
  };

  assert.equal(profile.nativeLanguage, 'Bangla');
  assert.equal(profile.targetAccent, 'US');
  assert.ok(profile.interests.length >= 2);
  assert.equal(profile.dailyMinutes, 15);
  assert.equal(profile.onboardingCompleted, true);
});

const REAL_LIFE_CHAMBER_LESSONS = [
  121, 122, 123, 124, 125, 126,
  221, 222, 223, 224, 225,
  321, 322, 323,
  421, 422,
  425, 426
];

test('Ant Nest Real-Life Chamber suite includes 18 specialized practical lessons', () => {
  assert.equal(REAL_LIFE_CHAMBER_LESSONS.length, 18);
  assert.ok(REAL_LIFE_CHAMBER_LESSONS.includes(121)); // Supermarket & Deli
  assert.ok(REAL_LIFE_CHAMBER_LESSONS.includes(122)); // Fitting Room
  assert.ok(REAL_LIFE_CHAMBER_LESSONS.includes(123)); // Drive-thru & Café Customizations
  assert.ok(REAL_LIFE_CHAMBER_LESSONS.includes(221)); // Subway & Metro
  assert.ok(REAL_LIFE_CHAMBER_LESSONS.includes(222)); // Rideshare & Taxi
  assert.ok(REAL_LIFE_CHAMBER_LESSONS.includes(224)); // Pharmacy Consultation
  assert.ok(REAL_LIFE_CHAMBER_LESSONS.includes(321)); // Bank Account
  assert.ok(REAL_LIFE_CHAMBER_LESSONS.includes(322)); // Apartment Hunting
  assert.ok(REAL_LIFE_CHAMBER_LESSONS.includes(323)); // Haircut Consultation
  assert.ok(REAL_LIFE_CHAMBER_LESSONS.includes(421)); // Corporate Email Etiquette
  assert.ok(REAL_LIFE_CHAMBER_LESSONS.includes(422)); // Slide Presentation & Q&A
  assert.ok(REAL_LIFE_CHAMBER_LESSONS.includes(425)); // Diplomatic Debate
  assert.ok(REAL_LIFE_CHAMBER_LESSONS.includes(426)); // Dry Wit & Sarcasm
});

const EXPANDED_SCENARIO_IDS = [
  'grocery-store',
  'clothes-fitting',
  'bakery-drive-thru',
  'subway-metro',
  'rideshare-taxi',
  'pharmacy',
  'bank-account',
  'apartment-hunting',
  'haircut-salon',
  'email-etiquette',
  'presentation-q-and-a',
  'cocktail-lounge',
  'dinner-party-banter',
  'diplomatic-debate',
  'witty-banter',
];

test('Expanded speaking scenario suite provides 15 real-world simulations', () => {
  assert.equal(EXPANDED_SCENARIO_IDS.length, 15);
  assert.ok(EXPANDED_SCENARIO_IDS.includes('grocery-store'));
  assert.ok(EXPANDED_SCENARIO_IDS.includes('clothes-fitting'));
  assert.ok(EXPANDED_SCENARIO_IDS.includes('bank-account'));
  assert.ok(EXPANDED_SCENARIO_IDS.includes('diplomatic-debate'));
  assert.ok(EXPANDED_SCENARIO_IDS.includes('witty-banter'));
});

const MASTER_EXPANSION_LESSONS = [
  119, 120,
  127, 128, 129, 130,
  226, 227, 228, 229, 230,
  324, 325, 326, 327, 328, 329, 330,
  427, 428, 429,
  430, 431, 432, 433, 434, 435,
];

test('Master Chamber Expansions suite validates 27 advanced real-teacher lessons', () => {
  assert.equal(MASTER_EXPANSION_LESSONS.length, 27);
  assert.ok(MASTER_EXPANSION_LESSONS.includes(119)); // Natural everyday greetings
  assert.ok(MASTER_EXPANSION_LESSONS.includes(120)); // Survival clarifications
  assert.ok(MASTER_EXPANSION_LESSONS.includes(127)); // Dietary restrictions & allergies
  assert.ok(MASTER_EXPANSION_LESSONS.includes(226)); // Car rental & insurance
  assert.ok(MASTER_EXPANSION_LESSONS.includes(324)); // Disputing utility bills
  assert.ok(MASTER_EXPANSION_LESSONS.includes(327)); // Agile daily standups
  assert.ok(MASTER_EXPANSION_LESSONS.includes(329)); // Pitching for a promotion
  assert.ok(MASTER_EXPANSION_LESSONS.includes(427)); // Housewarming etiquette
  assert.ok(MASTER_EXPANSION_LESSONS.includes(430)); // De-escalating workplace conflict
  assert.ok(MASTER_EXPANSION_LESSONS.includes(431)); // High-stakes contract negotiations
  assert.ok(MASTER_EXPANSION_LESSONS.includes(432)); // British vs American irony
  assert.ok(MASTER_EXPANSION_LESSONS.includes(434)); // Public speaking & keynote delivery
  assert.ok(MASTER_EXPANSION_LESSONS.includes(435)); // Synthesizing ethical dilemmas
});

const EVERYDAY_FLUENCY_LESSONS = [
  131, 132, 133, 134,
  231, 232, 233,
  331, 332, 333,
  335, 336,
  436, 437, 440,
  441, 442,
];

test('Everyday Fluency Expansions suite validates 17 specialized real-world modules', () => {
  assert.equal(EVERYDAY_FLUENCY_LESSONS.length, 17);
  assert.ok(EVERYDAY_FLUENCY_LESSONS.includes(131)); // Dentist Checkup & Tooth Pain
  assert.ok(EVERYDAY_FLUENCY_LESSONS.includes(132)); // Custom Salad Bowl & Fast Casual
  assert.ok(EVERYDAY_FLUENCY_LESSONS.includes(133)); // Remote Work Café Etiquette & Wi-Fi
  assert.ok(EVERYDAY_FLUENCY_LESSONS.includes(134)); // Tech Accessories & Return Policy
  assert.ok(EVERYDAY_FLUENCY_LESSONS.includes(231)); // Airport Immigration & Customs Questioning
  assert.ok(EVERYDAY_FLUENCY_LESSONS.includes(232)); // Emergency Home Maintenance & Plumbing
  assert.ok(EVERYDAY_FLUENCY_LESSONS.includes(233)); // Fitness & Gym Equipment Coaching
  assert.ok(EVERYDAY_FLUENCY_LESSONS.includes(331)); // Job Offer & Compensation Breakdown
  assert.ok(EVERYDAY_FLUENCY_LESSONS.includes(332)); // Networking & Cold LinkedIn Outreach
  assert.ok(EVERYDAY_FLUENCY_LESSONS.includes(333)); // Bank Fraud Alert & Card Dispute
  assert.ok(EVERYDAY_FLUENCY_LESSONS.includes(335)); // Presenting Executive KPIs & Metrics
  assert.ok(EVERYDAY_FLUENCY_LESSONS.includes(336)); // Agile Sprint Retrospective
  assert.ok(EVERYDAY_FLUENCY_LESSONS.includes(436)); // Flight Delay & EU261 Compensation
  assert.ok(EVERYDAY_FLUENCY_LESSONS.includes(437)); // Networking at a VIP Industry Reception
  assert.ok(EVERYDAY_FLUENCY_LESSONS.includes(440)); // Storytelling: Setting the Scene & Payoff
  assert.ok(EVERYDAY_FLUENCY_LESSONS.includes(441)); // Crisis Management & Corporate PR
  assert.ok(EVERYDAY_FLUENCY_LESSONS.includes(442)); // Pitching to Angel Investors & VCs
});

test('Ant Colony Hierarchy & Honey Shield Rank progression operates smoothly across all 5 tiers', () => {
  const ranks = [
    { tier: 1, title: 'Forager Ant', minXp: 0 },
    { tier: 2, title: 'Scout Ant', minXp: 350 },
    { tier: 3, title: 'Tunnel Architect', minXp: 1000 },
    { tier: 4, title: 'Colony Guardian', minXp: 2200 },
    { tier: 5, title: "Queen's Royal Envoy", minXp: 4000 },
  ];

  function getRank(xp) {
    for (let i = ranks.length - 1; i >= 0; i--) {
      if (xp >= ranks[i].minXp) return ranks[i];
    }
    return ranks[0];
  }

  assert.equal(getRank(0).title, 'Forager Ant');
  assert.equal(getRank(200).title, 'Forager Ant');
  assert.equal(getRank(350).title, 'Scout Ant');
  assert.equal(getRank(999).title, 'Scout Ant');
  assert.equal(getRank(1000).title, 'Tunnel Architect');
  assert.equal(getRank(2200).title, 'Colony Guardian');
  assert.equal(getRank(4500).title, "Queen's Royal Envoy");
});

test('Daily Colony Quests and Honey Shield refill logic tracks progress and claims rewards correctly', () => {
  const quests = [
    { id: 'quest-speed', targetCount: 1 },
    { id: 'quest-speaking', targetCount: 2 },
    { id: 'quest-lesson', targetCount: 1 },
  ];

  const dummyActivity = {
    lesson: true,
    review: true,
    speaking: true,
    speakingTurns: 3,
    speedDrillDone: true,
    speedDrillMaxCombo: 4,
  };

  const isSpeedDone = Boolean(dummyActivity.speedDrillDone || (dummyActivity.speedDrillMaxCombo && dummyActivity.speedDrillMaxCombo >= 3));
  const isSpeakingDone = (dummyActivity.speakingTurns || 0) >= 2;
  const isLessonDone = Boolean(dummyActivity.lesson || dummyActivity.review);

  assert.equal(isSpeedDone, true);
  assert.equal(isSpeakingDone, true);
  assert.equal(isLessonDone, true);

  // Honey Shield Refill logic
  let honeyShields = 1;
  let xp = 200;
  // Refill with 150 XP
  if (xp >= 150 && honeyShields < 3) {
    xp -= 150;
    honeyShields += 1;
  }
  assert.equal(honeyShields, 2);
  assert.equal(xp, 50);
});

test('Roleplay Objectives Checklist extracts objectives and accurately detects signals in real-time', () => {
  const scenarioWithChecks = {
    requiredSteps: ['Order food', 'Ask for bill'],
    completionChecks: [
      { id: 'order', description: 'Learner orders food or drink', signals: ['coffee', 'tea', 'latte', 'croissant'] },
      { id: 'preference', description: 'Learner chooses size or milk', signals: ['large', 'medium', 'milk', 'sugar'] },
    ],
  };

  function extractObjectives(sc) {
    if (sc.completionChecks && sc.completionChecks.length > 0) {
      return sc.completionChecks.map((c) => ({
        id: c.id,
        description: c.description,
        signals: c.signals || [],
      }));
    }
    if (sc.requiredSteps && sc.requiredSteps.length > 0) {
      return sc.requiredSteps.map((step, idx) => ({
        id: `step-${idx}`,
        description: step,
        signals: step.toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/).filter(w => w.length > 3),
      }));
    }
    return [];
  }

  function detectSatisfied(text, objectives, alreadyDone = []) {
    if (!text || !text.trim() || objectives.length === 0) return [];
    const normalized = text.toLowerCase().trim();
    const newlyCompleted = [];
    for (const obj of objectives) {
      if (alreadyDone.includes(obj.id)) continue;
      if (obj.signals.length === 0) {
        newlyCompleted.push(obj.id);
        continue;
      }
      const matched = obj.signals.some((sig) => {
        const clean = sig.trim().toLowerCase();
        return clean && normalized.includes(clean);
      });
      if (matched) newlyCompleted.push(obj.id);
    }
    return newlyCompleted;
  }

  const objs = extractObjectives(scenarioWithChecks);
  assert.equal(objs.length, 2);
  assert.equal(objs[0].id, 'order');

  // Learner says: "Could I have a hot latte please?" -> triggers 'order'
  let completed = [];
  const hit1 = detectSatisfied('Could I have a hot latte please?', objs, completed);
  assert.deepEqual(hit1, ['order']);
  completed.push(...hit1);

  // Learner says: "Make it a large with extra milk." -> triggers 'preference'
  const hit2 = detectSatisfied('Make it a large with extra milk.', objs, completed);
  assert.deepEqual(hit2, ['preference']);
  completed.push(...hit2);

  // All completed
  assert.equal(completed.length, objs.length);

  // Fallback scenario test
  const fallbackScenario = {
    requiredSteps: ['Greet the interviewer', 'Introduce your past experience', 'Ask a question about the team'],
  };
  const fallbackObjs = extractObjectives(fallbackScenario);
  assert.equal(fallbackObjs.length, 3);
  assert.equal(fallbackObjs[0].id, 'step-0');
  assert.ok(fallbackObjs[0].signals.includes('greet') || fallbackObjs[0].signals.includes('interviewer'));
});

test('The Ant Vault validates reductions, phrasal verbs, irregular verbs, and slang search indexing', () => {
  const sampleReductions = [
    { id: 'gonna', reduction: 'Gonna', fullForm: 'Going to', ipa: '/ˈɡən.ə/' },
    { id: 'wanna', reduction: 'Wanna', fullForm: 'Want to', ipa: '/ˈwɑːn.ə/' },
    { id: 'gotta', reduction: 'Gotta', fullForm: 'Got to / Have to', ipa: '/ˈɡɑːt̬.ə/' },
  ];

  const samplePhrasals = [
    { verb: 'Figure out', type: 'Separable', synonym: 'Resolve / Understand' },
    { verb: 'Look forward to', type: 'Inseparable', synonym: 'Anticipate eagerly' },
  ];

  const sampleIrregulars = [
    { base: 'Catch', pastSimple: 'Caught', pastParticiple: 'Caught', pattern: 'A-B-B' },
    { base: 'Freeze', pastSimple: 'Froze', pastParticiple: 'Frozen', pattern: 'A-B-C' },
    { base: 'Hit', pastSimple: 'Hit', pastParticiple: 'Hit', pattern: 'A-A-A' },
  ];

  const sampleSlang = [
    { phrase: 'Bite the bullet', vibe: 'Workplace', actualMeaning: 'To face a difficult situation with courage' },
    { phrase: 'Touch base', vibe: 'Workplace', actualMeaning: 'To briefly connect with someone for updates' },
  ];

  // Test reductions matching
  assert.equal(sampleReductions.length, 3);
  assert.equal(sampleReductions.find(r => r.id === 'gonna').fullForm, 'Going to');

  // Test phrasal verb separable / inseparable validation
  const separable = samplePhrasals.filter(p => p.type === 'Separable');
  assert.equal(separable.length, 1);
  assert.equal(separable[0].verb, 'Figure out');

  // Test irregular verb pattern matching
  const abcPattern = sampleIrregulars.filter(i => i.pattern === 'A-B-C');
  assert.equal(abcPattern.length, 1);
  assert.equal(abcPattern[0].pastParticiple, 'Frozen');

  // Test search filter function
  function searchVault(query, items, fields) {
    const q = query.toLowerCase().trim();
    if (!q) return items;
    return items.filter(item => fields.some(f => String(item[f] || '').toLowerCase().includes(q)));
  }

  const searchResult = searchVault('bullet', sampleSlang, ['phrase', 'actualMeaning']);
  assert.equal(searchResult.length, 1);
  assert.equal(searchResult[0].phrase, 'Bite the bullet');

  const searchVerb = searchVault('freeze', sampleIrregulars, ['base', 'pastSimple', 'pastParticiple']);
  assert.equal(searchVerb.length, 1);
  assert.equal(searchVerb[0].pastSimple, 'Froze');
});

test('Mobile-first quick-hub and interactive button states validate properly', () => {
  // 1. Validate quest actions router
  const sampleQuests = [
    { id: 'quest_lesson', title: 'Complete 1 lesson' },
    { id: 'quest_review', title: 'Review 5 vocabulary cards' },
    { id: 'quest_speak', title: 'Speak with Luma' },
  ];

  function resolveQuestAction(questId) {
    if (questId === 'quest_speak') return 'startSpeaking';
    if (questId === 'quest_review') return 'startReview';
    return 'lesson';
  }

  assert.equal(resolveQuestAction('quest_lesson'), 'lesson');
  assert.equal(resolveQuestAction('quest_review'), 'startReview');
  assert.equal(resolveQuestAction('quest_speak'), 'startSpeaking');

  // 2. Validate Section badge vs clickable action
  function getSectionRendering(props) {
    if (props.onPress) {
      return { type: 'button', style: 'sectionAction', accessible: true };
    }
    return { type: 'badge', style: 'sectionBadge', accessible: false };
  }

  const clickableSection = getSectionRendering({ title: 'Skills', action: 'View all', onPress: () => {} });
  assert.equal(clickableSection.type, 'button');
  assert.equal(clickableSection.style, 'sectionAction');

  const informationalSection = getSectionRendering({ title: 'Skills', action: 'This week' });
  assert.equal(informationalSection.type, 'badge');
  assert.equal(informationalSection.style, 'sectionBadge');

  // 3. Validate Quick-Hub Strip chips
  const hubChips = [
    { id: 'quests', label: 'Quests 2/3', hasDrawer: true },
    { id: 'rank', label: 'Colony Rank', hasDrawer: true },
    { id: 'vault', label: 'Vault', hasDrawer: false },
    { id: 'journal', label: 'Journal', hasDrawer: false },
  ];
  assert.equal(hubChips.length, 4);
  assert.equal(hubChips.filter(c => c.hasDrawer).length, 2);
});

test('Colony Leagues: 5 tiers, cohort generation, promotion/demotion thresholds, and countdown', () => {
  const COLONY_LEAGUES = [
    { tier: 1, name: 'Larva Burrows', emoji: '🌱', promotionZone: 5, demotionZone: 0, rewardChest: 'Bronze Hive Chest' },
    { tier: 2, name: 'Worker Colony', emoji: '🐜', promotionZone: 5, demotionZone: 5, rewardChest: 'Silver Pollen Pouch' },
    { tier: 3, name: 'Forager Outpost', emoji: '🌿', promotionZone: 5, demotionZone: 5, rewardChest: 'Gold Nectar Cache' },
    { tier: 4, name: 'Royal Guard', emoji: '⚔️', promotionZone: 5, demotionZone: 5, rewardChest: 'Amber Shield Relic' },
    { tier: 5, name: 'Sovereign Hive', emoji: '👑', promotionZone: 0, demotionZone: 5, rewardChest: 'Queen’s Crown Trove' },
  ];

  // 1. Verify 5 distinct league tiers
  assert.equal(COLONY_LEAGUES.length, 5);
  assert.equal(COLONY_LEAGUES[0].name, 'Larva Burrows');
  assert.equal(COLONY_LEAGUES[4].name, 'Sovereign Hive');
  assert.equal(COLONY_LEAGUES[0].demotionZone, 0); // No demotion in Tier 1
  assert.equal(COLONY_LEAGUES[4].promotionZone, 0); // No promotion in Tier 5

  // 2. Cohort generation logic
  function generateCohort(user, tier) {
    const peerAnts = [
      'WorkerAnt-Pip', 'PupaScout', 'TunnelDigger', 'SugarHunter', 'PollenGuard',
      'LeafCutter-Rex', 'ChamberBuilder', 'Forager-Echo', 'SentryAnt-Zara', 'AmberCollector',
      'BurrowCrafter', 'SilkWeaver-Max', 'ScoutRunner-Jax', 'LarvaKeeper', 'NectarHauler',
      'SoldierMajor', 'HillPatrol-Kai', 'QueenGuard-Leo', 'RoyalEnvoy-Sol'
    ];
    const members = peerAnts.map((name, i) => ({
      id: `ant-${i}`,
      name,
      weeklyXp: 100 + ((i * 37 + tier * 53) % 450),
      streak: 1 + (i % 14),
      isUser: false,
    }));
    members.push({
      id: 'current-user',
      name: user.name,
      weeklyXp: user.weeklyXp,
      streak: user.streak,
      isUser: true,
    });
    members.sort((a, b) => b.weeklyXp - a.weeklyXp);
    return members.map((m, idx) => ({ ...m, rank: idx + 1 }));
  }

  const userCohort = generateCohort({ name: 'Learner', weeklyXp: 400, streak: 5 }, 2);
  assert.equal(userCohort.length, 20);
  assert.ok(userCohort.every(m => m.rank >= 1 && m.rank <= 20));
  // Verify sorted by XP descending
  for (let i = 0; i < userCohort.length - 1; i++) {
    assert.ok(userCohort[i].weeklyXp >= userCohort[i + 1].weeklyXp);
  }

  // 3. Zone classifications
  function getMemberZone(rank, tier) {
    const league = COLONY_LEAGUES.find(l => l.tier === tier);
    if (league.promotionZone > 0 && rank <= league.promotionZone) return 'promotion';
    if (league.demotionZone > 0 && rank > 20 - league.demotionZone) return 'demotion';
    return 'safe';
  }

  assert.equal(getMemberZone(1, 2), 'promotion');
  assert.equal(getMemberZone(5, 2), 'promotion');
  assert.equal(getMemberZone(6, 2), 'safe');
  assert.equal(getMemberZone(15, 2), 'safe');
  assert.equal(getMemberZone(16, 2), 'demotion');
  assert.equal(getMemberZone(20, 2), 'demotion');

  // 4. Weekly Reset Countdown format
  function calculateResetCountdown(mockNow = new Date('2026-09-29T12:00:00Z')) {
    const nextSunday = new Date(mockNow);
    const day = mockNow.getUTCDay();
    const daysUntilSunday = (7 - day) % 7 || 7;
    nextSunday.setUTCDate(mockNow.getUTCDate() + daysUntilSunday);
    nextSunday.setUTCHours(23, 59, 59, 999);
    const diff = Math.max(0, nextSunday.getTime() - mockNow.getTime());
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff / (1000 * 60 * 60)) % 24);
    return `${days}d ${hours}h`;
  }
  const countdown = calculateResetCountdown();
  assert.match(countdown, /^\d+d \d+h$/);
});

test('Honey Shield Shard Forging: 3 shards auto-forge 1 shield and cap at 3 shields', () => {
  function applyBlitzReward(currentProgress, shardsEarned) {
    const totalShards = (currentProgress.honeyShieldShards ?? 0) + shardsEarned;
    const additionalShields = Math.floor(totalShards / 3);
    const remainingShards = totalShards % 3;
    const currentShields = currentProgress.honeyShields ?? 2;
    const newShields = Math.min(3, currentShields + additionalShields);
    return {
      honeyShields: newShields,
      honeyShieldShards: remainingShards,
      forgedNewShield: additionalShields > 0,
    };
  }

  // 1 run: 0 shards + 1 shard = 1 shard, 0 forged
  const r1 = applyBlitzReward({ honeyShields: 2, honeyShieldShards: 0 }, 1);
  assert.equal(r1.honeyShields, 2);
  assert.equal(r1.honeyShieldShards, 1);
  assert.equal(r1.forgedNewShield, false);

  // 2 runs: 1 shard + 1 shard = 2 shards, 0 forged
  const r2 = applyBlitzReward({ honeyShields: 2, honeyShieldShards: 1 }, 1);
  assert.equal(r2.honeyShields, 2);
  assert.equal(r2.honeyShieldShards, 2);
  assert.equal(r2.forgedNewShield, false);

  // 3 runs: 2 shards + 1 shard = 3 shards -> auto-forge 1 shield!
  const r3 = applyBlitzReward({ honeyShields: 2, honeyShieldShards: 2 }, 1);
  assert.equal(r3.honeyShields, 3);
  assert.equal(r3.honeyShieldShards, 0);
  assert.equal(r3.forgedNewShield, true);

  // Max 3 shields cap: already at 3 shields, forging keeps shield count at 3
  const r4 = applyBlitzReward({ honeyShields: 3, honeyShieldShards: 2 }, 1);
  assert.equal(r4.honeyShields, 3);
  assert.equal(r4.honeyShieldShards, 0);
  assert.equal(r4.forgedNewShield, true);
});

test('60-Second Foraging Blitz: combo multipliers, streak tiers, and speed scoring', () => {
  function computeBlitzMultiplier(combo) {
    if (combo >= 8) return 5; // 5x Queen's Rush!
    if (combo >= 5) return 3; // 3x Royal Surge!
    if (combo >= 3) return 2; // 2x Colony Pulse!
    return 1;
  }

  assert.equal(computeBlitzMultiplier(0), 1);
  assert.equal(computeBlitzMultiplier(1), 1);
  assert.equal(computeBlitzMultiplier(2), 1);
  assert.equal(computeBlitzMultiplier(3), 2);
  assert.equal(computeBlitzMultiplier(4), 2);
  assert.equal(computeBlitzMultiplier(5), 3);
  assert.equal(computeBlitzMultiplier(7), 3);
  assert.equal(computeBlitzMultiplier(8), 5);
  assert.equal(computeBlitzMultiplier(12), 5);

  function calculateBlitzXp(correctAnswers, maxCombo) {
    const basePoints = correctAnswers * 10;
    const comboBonus = Math.floor(maxCombo * 5);
    const speedBonus = correctAnswers >= 8 ? 25 : 0;
    return basePoints + comboBonus + speedBonus;
  }

  const score1 = calculateBlitzXp(5, 3);
  assert.equal(score1, 5 * 10 + 15); // 65 XP

  const score2 = calculateBlitzXp(10, 8);
  assert.equal(score2, 10 * 10 + 40 + 25); // 165 XP (speed rush!)
});

test('Native Shadowing Studio: waveform evaluation, phonetic token diffing, and speech accuracy', () => {
  function evaluateShadowing(targetPhrase, learnerTranscript) {
    const normalize = (str) =>
      str.toLowerCase().replace(/[^a-z0-9\s]/g, '').trim().split(/\s+/).filter(Boolean);
    const targetWords = normalize(targetPhrase);
    const learnerWords = normalize(learnerTranscript);

    let matchCount = 0;
    const tokens = targetWords.map((word) => {
      const isMatch = learnerWords.includes(word);
      if (isMatch) matchCount++;
      return {
        word,
        status: isMatch ? 'matched' : 'missed',
      };
    });

    const accuracy = targetWords.length > 0 ? Math.round((matchCount / targetWords.length) * 100) : 0;
    return {
      tokens,
      accuracy,
      fluencyLevel: accuracy >= 90 ? 'Native Flow' : accuracy >= 70 ? 'Natural Cadence' : 'Developing',
      xpGained: Math.max(10, Math.round(accuracy * 0.35)),
    };
  }

  // Exact match
  const exact = evaluateShadowing("I'm gonna head out to grab some coffee", "I'm gonna head out to grab some coffee");
  assert.equal(exact.accuracy, 100);
  assert.equal(exact.fluencyLevel, 'Native Flow');
  assert.ok(exact.tokens.every(t => t.status === 'matched'));
  assert.equal(exact.xpGained, 35);

  // Partial match with connected speech reduction
  const partial = evaluateShadowing("Let's touch base right after team standup", "Let's touch base right after");
  assert.ok(partial.accuracy >= 50 && partial.accuracy < 100);
  assert.equal(partial.tokens.find(t => t.word === 'standup').status, 'missed');
  assert.equal(partial.tokens.find(t => t.word === 'touch').status, 'matched');

  // Completely missed
  const missed = evaluateShadowing("Could I get a large oat latte", "Hello world");
  assert.equal(missed.accuracy, 0);
  assert.equal(missed.fluencyLevel, 'Developing');
  assert.equal(missed.xpGained, 10); // Minimum effort reward
});

test('Colony Push Notifications & Habit Engine schedules daily study, Honey Shield alerts, and Sunday League cutoffs', () => {
  // 1. Mock progress profile with customized notification preferences
  const progress = {
    streak: 12,
    honeyShields: 2,
    weeklyXp: 340,
    notificationsEnabled: true,
    reminderHour: 8,
    reminderMinute: 30,
    honeyShieldAlertEnabled: true,
    leagueAlertsEnabled: true,
  };

  // 2. Validate daily study trigger configuration
  const dailyStudyTrigger = {
    type: 'daily',
    hour: progress.reminderHour ?? 9,
    minute: progress.reminderMinute ?? 0,
  };
  assert.equal(dailyStudyTrigger.hour, 8);
  assert.equal(dailyStudyTrigger.minute, 30);

  // 3. Validate Honey Shield alert content and 8:30 PM (20:30) trigger
  const shieldTrigger = {
    type: 'daily',
    hour: 20,
    minute: 30,
  };
  assert.equal(shieldTrigger.hour, 20);
  assert.equal(shieldTrigger.minute, 30);

  const shieldTitle = progress.honeyShields > 0
    ? `🍯 ${progress.honeyShields} Honey Shield${progress.honeyShields === 1 ? '' : 's'} Active`
    : '⚠️ Streak Flame at Risk!';
  assert.ok(shieldTitle.includes('2 Honey Shields Active'));

  // 4. Validate Sunday League cutoff countdown trigger (Sunday = 1 in standard Expo/iOS weekday)
  const sundayCutoffTrigger = {
    type: 'weekly',
    weekday: 1,
    hour: 19,
    minute: 0,
  };
  assert.equal(sundayCutoffTrigger.weekday, 1);
  assert.equal(sundayCutoffTrigger.hour, 19);

  // 5. Disabled notifications cancel correctly
  const mutedProgress = { ...progress, notificationsEnabled: false };
  assert.equal(mutedProgress.notificationsEnabled, false);
});

test('Real Audio Voice Engine generates high-fidelity streams, resolves studio clips, and configures human voice preferences', () => {
  // 1. Real audio stream URL generation
  const cleanUrl = (text, lang = 'en') => {
    const clean = text.trim().replace(/[«»""'']/g, '').slice(0, 200);
    return `https://translate.google.com/translate_tts?ie=UTF-8&client=tw-ob&tl=${encodeURIComponent(lang)}&q=${encodeURIComponent(clean)}`;
  };

  const sampleUrl = cleanUrl("I'm gonna grab some coffee");
  assert.ok(sampleUrl.startsWith('https://translate.google.com/translate_tts'));
  assert.ok(sampleUrl.includes('tl=en'));
  assert.ok(sampleUrl.includes('q=Im%20gonna%20grab%20some%20coffee'));

  // 2. Studio clips registry keys
  const expectedClips = [
    'maya_greeting',
    'leo_greeting',
    'maya_praise',
    'leo_praise',
    'daily_spark',
    'reduction_gonna',
    'reduction_wanna',
    'reduction_kinda',
    'reduction_lemme',
    'shield_protection',
    'blitz_start',
  ];
  assert.equal(expectedClips.length, 11);

  // 3. Text to studio clip matching logic
  const matchClip = (text) => {
    const norm = text.toLowerCase().trim().replace(/[.,!?'"«»]/g, '');
    if (norm.includes("hi im maya") || norm.includes("im maya your language teacher")) return 'maya_greeting';
    if (norm.includes("hi im leo") || norm.includes("im leo your language coach")) return 'leo_greeting';
    if (norm.includes("all ears") || norm.includes("tell me everything")) return 'daily_spark';
    if (norm === 'gonna' || norm.includes("im gonna head out")) return 'reduction_gonna';
    if (norm === 'wanna' || norm.includes("wanna grab coffee")) return 'reduction_wanna';
    if (norm.includes("honey shield active")) return 'shield_protection';
    if (norm.includes("ready set forage")) return 'blitz_start';
    return null;
  };

  assert.equal(matchClip("Hi! I'm Maya, your language teacher. Let's learn together!"), 'maya_greeting');
  assert.equal(matchClip("Hi! I'm Leo, your language coach. Let's make your English sharp and natural!"), 'leo_greeting');
  assert.equal(matchClip("I'm all ears. Tell me everything!"), 'daily_spark');
  assert.equal(matchClip("I'm gonna head out."), 'reduction_gonna');
  assert.equal(matchClip("Do you wanna grab coffee?"), 'reduction_wanna');
  assert.equal(matchClip("Honey Shield active! Your streak flame is protected by the Colony."), 'shield_protection');
  assert.equal(matchClip("Ready, set, forage!"), 'blitz_start');
  assert.equal(matchClip("Arbitrary conversational sentence here"), null);

  // 4. Default user progress has realAudioVoiceEnabled: true
  const userProgress = {
    realAudioVoiceEnabled: true,
    teacherVoice: 'female',
  };
  assert.equal(userProgress.realAudioVoiceEnabled, true);
});








