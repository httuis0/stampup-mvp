import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { withSupabase } from "jsr:@supabase/server@^1";

type Scenario = {
  id?: string;
  level?: string;
  category?: string;
  title?: string;
  goal?: string;
  minimumTurns?: number;
  requiredSteps?: string[];
  teacherPrompts?: string[];
  acceptedResponses?: string[];
  vocabulary?: string[];
  branches?: Array<{
    learnerIntent?: string;
    teacherResponse?: string;
  }>;
  commonMistakes?: Array<{
    example?: string;
    correction?: string;
    pattern?: string;
  }>;
  completionChecks?: Array<{
    id?: string;
    description?: string;
    signals?: string[];
  }>;
};

type Lesson = {
  id?: number;
  title?: string;
  subtitle?: string;
  skills?: string[];
  grammarPoints?: string[];
};

const categories = new Set([
  "none",
  "grammar",
  "tense",
  "word_order",
  "word_choice",
  "article",
  "preposition",
  "agreement",
  "fluency",
  "other",
]);

const teacherResponseSchema = {
  name: "teacher_turn",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      reply: { type: "string" },
      correction: { type: "string" },
      correctionReason: { type: "string" },
      patternKey: { type: "string" },
      patternLabel: { type: "string" },
      patternCategory: {
        type: "string",
        enum: [
          "none", "grammar", "tense", "word_order", "word_choice",
          "article", "preposition", "agreement", "fluency", "other",
        ],
      },
      lessonId: { type: "number" },
      lessonTitle: { type: "string" },
      lessonReason: { type: "string" },
      lessonSkill: { type: "string" },
      mode: { type: "string", enum: ["roleplay", "teacher"] },
      finished: { type: "boolean" },
    },
    required: [
      "reply", "correction", "correctionReason", "patternKey",
      "patternLabel", "patternCategory", "lessonId", "lessonTitle",
      "lessonReason", "lessonSkill", "mode", "finished",
    ],
  },
};

function str(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function parseTeacherPayload(
  value: unknown,
  depth = 0
): Record<string, unknown> | null {
  if (depth > 5 || value == null) {
    return null;
  }

  if (typeof value === "object" && !Array.isArray(value)) {
    const record = value as Record<string, unknown>;

    if (typeof record.reply === "string") {
      return record;
    }

    const nestedCandidates = [
      record.arguments,
      record.content,
      record.failed_generation,
      record.output,
      (record.function as Record<string, unknown> | undefined)
        ?.arguments,
    ];

    for (const candidate of nestedCandidates) {
      const parsed = parseTeacherPayload(candidate, depth + 1);

      if (parsed) return parsed;
    }

    return null;
  }

  if (Array.isArray(value)) {
    for (const candidate of value) {
      const parsed = parseTeacherPayload(candidate, depth + 1);

      if (parsed) return parsed;
    }

    return null;
  }

  if (typeof value !== "string") {
    return null;
  }

  const cleaned = value
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "");

  const candidates = [cleaned];
  const firstBrace = cleaned.indexOf("{");
  const lastBrace = cleaned.lastIndexOf("}");

  if (firstBrace >= 0 && lastBrace > firstBrace) {
    candidates.push(cleaned.slice(firstBrace, lastBrace + 1));
  }

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate);
      const teacher = parseTeacherPayload(parsed, depth + 1);

      if (teacher) return teacher;
    } catch {
      // Try the next possible JSON section.
    }
  }

  return null;
}

function num(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : 0;
}

function normalize(value: string): string {
  return value
    .toLowerCase()
    .replace(/\bokay\b/g, "ok")
    .replace(/[“”"'`]/g, "")
    .replace(/[.!?,:;—–-]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function isConversationManagementPhrase(message: string): boolean {
  const value = normalize(message);

  return [
    /^(hi )?(am i|i am i|im i) coming (through|to) ok$/,
    /^(hi )?can you hear me$/,
    /^is my (mic|microphone|audio) working$/,
    /^(sorry )?come again$/,
    /^(sorry )?(can|could|would) you (please )?repeat that$/,
    /^(sorry )?(can|could|would) you say that again$/,
    /^(sorry )?what did you say$/,
    /^(sorry )?i (didnt|did not) (hear|catch|understand) that$/,
    /^(pardon|pardon me)$/,
  ].some((pattern) => pattern.test(value));
}

function isCosmeticCorrection(
  learnerMessage: string,
  correction: string
): boolean {
  return Boolean(correction) &&
    normalize(learnerMessage) === normalize(correction);
}

function correctionTargetsCurrentMessage(
  learnerMessage: string,
  correction: string
): boolean {
  const learnerWords = normalize(learnerMessage)
    .split(" ")
    .filter(Boolean);
  const correctionWords = normalize(correction)
    .split(" ")
    .filter(Boolean);

  if (!learnerWords.length || !correctionWords.length) {
    return false;
  }

  const learnerSet = new Set(learnerWords);
  const correctionSet = new Set(correctionWords);
  const shared = [...learnerSet]
    .filter((word) => correctionSet.has(word))
    .length;

  if (learnerSet.size === 1) {
    return shared === 1 && correctionSet.size <= 4;
  }

  return shared / learnerSet.size >= 0.35;
}

function isAcceptedScenarioReply(
  message: string,
  scenario: Scenario
): boolean {
  const value = normalize(message);
  const compact = (text: string) => normalize(text)
    .split(" ")
    .filter((word) =>
      !["a", "an", "the", "yes", "yeah", "sure", "please"]
        .includes(word)
    )
    .join(" ");

  const accepted = Array.isArray(scenario.acceptedResponses)
    ? scenario.acceptedResponses.map(str).filter(Boolean)
    : [];

  if (accepted.some((reply) =>
    normalize(reply) === value ||
    (compact(value) && compact(reply) === compact(value))
  )) {
    return true;
  }

  const words = value.split(" ").filter(Boolean);

  if (
    words.length <= 3 &&
    /^(yes|yeah|sure|no|ok)( please)?$/.test(value)
  ) {
    return true;
  }

  if (str(scenario.id) === "shopping" && words.length <= 4) {
    return /\b(small|medium|large|black|white|blue|red|green|yellow|colour|color)\b/
      .test(value);
  }

  return false;
}

function deterministicCommonCorrection(
  learnerMessage: string
): {
  correction: string;
  reason: string;
  pattern: string;
} | null {
  if (/\bexperience on\b/i.test(learnerMessage)) {
    let correction = learnerMessage.replace(
      /\bexperience on\b/i,
      "experience in"
    );

    if (
      /\bi can\b/i.test(correction) &&
      /\band many more\b/i.test(correction)
    ) {
      correction = correction.replace(
        /\band many more\b/i,
        "and do many other things"
      );
    }

    correction = correction.replace(
      /\b(digital marketing)\s+(i can)\b/i,
      (_, subject: string, nextSentence: string) =>
        `${subject}. ${nextSentence[0].toUpperCase()}${nextSentence.slice(1)}`
    );

    return {
      correction,
      reason:
        'Use "experience in" when naming a field or subject.',
      pattern: "prepositions",
    };
  }

  return null;
}

function isMetaConversation(message: string): boolean {
  const value = normalize(message);

  const directTeacherRequest =
    /\b(you|luma|teacher)\b/.test(value) &&
    /\b(ask|answer|correct|explain|repeat|teach|help|respond|reply|practice|lesson|scenario|roleplay|role play)\b/.test(value);

  const behaviorQuestion = [
    /^(dont|do not) (you )?want to ask\b/,
    /\bwhy (didnt|did not|dont|do not|wont|will not|cant|cannot|wouldnt|would not) you\b/,
    /\b(shouldnt|should not|would|will|can|could) you (ask|answer|correct|explain|repeat|help)\b/,
    /\bwhat (should|do|can) i say\b/,
    /\bhow (should|do|can) i say\b/,
    /\bis (this|that|my sentence) (correct|natural)\b/,
  ].some((pattern) => pattern.test(value));

  return directTeacherRequest ||
    behaviorQuestion ||
    isConversationManagementPhrase(message);
}

function scenarioMessageLooksRelevant(
  message: string,
  scenario: Scenario
): boolean {
  const value = message.toLowerCase();
  const scenarioText = `${str(scenario.id)} ${str(scenario.title)}`.toLowerCase();

  let words: string[] = [];

  if (isCafeScenario(scenario)) {
    return cafeMessageLooksRelevant(message);
  } else if (scenarioText.includes("airport")) {
    words = [
      "airport", "passport", "ticket", "flight", "gate", "boarding",
      "luggage", "baggage", "bag", "check in", "check-in", "travelling",
      "traveling", "destination", "seat",
    ];
  } else if (scenarioText.includes("interview")) {
    words = [
      "interview", "job", "work", "experience", "role", "skill",
      "strength", "career", "company", "team", "responsibility",
      "my name", "i am", "i'm",
    ];
  } else if (scenarioText.includes("work")) {
    words = [
      "work", "report", "project", "meeting", "team", "task",
      "deadline", "email", "send", "finish", "working", "manager",
      "client", "colleague",
    ];
  }

  return words.length === 0 || words.some((word) => value.includes(word));
}

function relevantLearnerMessages(
  messages: Array<{ role?: string; content?: string }>,
  learnerMessage: string,
  scenario: Scenario
): string[] {
  return [
    ...messages
      .filter((message) => message.role === "user")
      .map((message) => str(message.content)),
    learnerMessage,
  ].filter(
    (message) =>
      message &&
      !isMetaConversation(message) &&
      scenarioMessageLooksRelevant(message, scenario)
  );
}

function includesQuestion(message: string): boolean {
  const value = message.trim().toLowerCase();

  return message.includes("?") ||
    /^(where|what|when|how|which|who|can|could|may|is|are|do|does|will|would)\b/.test(value);
}

function scenarioGoalComplete(
  scenario: Scenario,
  relevantMessages: string[]
): boolean {
  const scenarioId = str(scenario.id).toLowerCase();
  const combined = relevantMessages.join(" ").toLowerCase();

  if (scenarioId === "restaurant") {
    const orderIndex = relevantMessages.findIndex(
      cafeOrderLooksRelevant
    );

    if (orderIndex < 0) return false;

    const followUpAnswers = relevantMessages
      .slice(orderIndex + 1)
      .filter(
        (message) =>
          !cafeOrderLooksRelevant(message) &&
          cafeFollowUpLooksRelevant(message)
      );

    return followUpAnswers.length >= 2;
  }

  if (scenarioId === "airport") {
    const checkedIn = /(passport|ticket|check in|check-in|luggage|baggage)/.test(combined);
    const askedQuestion = relevantMessages.some(includesQuestion);
    return checkedIn && askedQuestion;
  }

  if (scenarioId === "interview") {
    const hasIntroduction = relevantMessages.some((message) => {
      const value = normalize(message);

      return /\b(my name is|i am called|im called|i am from|im from|i live in|i currently work|i work as)\b/.test(value) ||
        /^i am (?!applying|interested|looking|working|experienced\b)[a-z]+(?: [a-z]+)?(?: |$)/.test(value) ||
        /^im (?!applying|interested|looking|working|experienced\b)[a-z]+(?: [a-z]+)?(?: |$)/.test(value);
    });

    const jobAnswers = relevantMessages.filter((message) =>
      /\b(apply|applying|job|work|worked|experience|experienced|skill|strength|digital|marketing|role|career|company|team|responsibility|responsibilities|project|projects)\b/i
        .test(message)
    );

    return hasIntroduction &&
      relevantMessages.length >= 3 &&
      jobAnswers.length >= 2;
  }

  if (scenarioId === "work") {
    const politeRequest = /\b(could|can|would|please)\b/.test(combined);
    return relevantMessages.length >= 2 && politeRequest;
  }

  const completionChecks = Array.isArray(
    scenario.completionChecks
  )
    ? scenario.completionChecks
    : [];

  if (completionChecks.length) {
    const normalizedConversation = normalize(combined);
    const checksMet = completionChecks.every((check) =>
      Array.isArray(check.signals) &&
      check.signals.some((signal) =>
        normalizedConversation.includes(normalize(str(signal)))
      )
    );

    const minimumTurns = Math.max(
      1,
      num(scenario.minimumTurns) || 3
    );

    return checksMet && relevantMessages.length >= minimumTurns;
  }

  return relevantMessages.length >= 4;
}

function completionReply(scenario: Scenario): string {
  const text = `${str(scenario.id)} ${str(scenario.title)}`.toLowerCase();

  if (isCafeScenario(scenario)) {
    return "Great—your order is complete. Nice work answering the follow-up questions.";
  }

  if (text.includes("airport")) {
    return "You are checked in and found the information you needed. Airport practice complete.";
  }

  if (text.includes("interview")) {
    return "Well done. You introduced yourself and answered the interview questions clearly.";
  }

  if (text.includes("work")) {
    return "Well done. You described your work and made a polite request.";
  }

  if (text.includes("shopping")) {
    return "The item is twenty dollars. You chose an item, size, and colour and asked about the price—shopping practice complete.";
  }

  return "Well done—you completed today’s speaking goal.";
}

function canonicalPattern(key: string): string {
  const value = normalize(key).replace(/\s+/g, "_");

  const aliases: Record<string, string> = {
    past_simple: "past_tense",
    simple_past: "past_tense",
    past: "past_tense",
    past_tense_error: "past_tense",

    present_simple_tense: "present_simple",

    subject_verb: "subject_verb_agreement",
    subject_verb_error: "subject_verb_agreement",

    articles: "article_usage",
    article: "article_usage",

    preposition: "prepositions",

    question_form: "question_structure",
    questions: "question_structure",

    sentence: "sentence_structure",
  };

  return aliases[value] || value;
}

function patternLabel(key: string): string {
  const labels: Record<string, string> = {
    past_tense: "Past tense",
    present_simple: "Present simple",
    subject_verb_agreement: "Subject-verb agreement",
    word_order: "Word order",
    word_choice: "Word choice",
    article_usage: "Articles",
    prepositions: "Prepositions",
    question_structure: "Question structure",
    sentence_structure: "Sentence structure",
    fluency: "Fluency",
  };

  return labels[key] || key
    .replaceAll("_", " ")
    .replace(/^./, (c) => c.toUpperCase());
}

function patternCategory(key: string): string {
  const map: Record<string, string> = {
    past_tense: "tense",
    present_simple: "tense",
    subject_verb_agreement: "agreement",
    word_order: "word_order",
    word_choice: "word_choice",
    article_usage: "article",
    prepositions: "preposition",
    question_structure: "grammar",
    sentence_structure: "grammar",
    fluency: "fluency",
  };

  return map[key] || "other";
}

function localizedCorrectionReason(
  reason: string,
  pattern: string,
  nativeLanguage: string
): string {
  const language = nativeLanguage.toLowerCase();
  const usesBangla = ["bangla", "bengali", "বাংলা"]
    .some((name) => language.includes(name));

  if (
    !reason ||
    !usesBangla ||
    /[\u0980-\u09ff]/.test(reason)
  ) {
    return reason;
  }

  const banglaReasons: Record<string, string> = {
    past_tense:
      "অতীতে সম্পন্ন কাজ বোঝাতে ক্রিয়ার অতীত রূপ ব্যবহার করুন।",
    present_simple:
      "নিয়মিত বা অভ্যাসগত কাজ বোঝাতে present simple ব্যবহার করুন।",
    subject_verb_agreement:
      "কর্তার সঙ্গে মিলিয়ে ক্রিয়ার সঠিক রূপ ব্যবহার করুন।",
    word_order:
      "ইংরেজি বাক্যে শব্দগুলো সঠিক ক্রমে সাজান।",
    word_choice:
      "এই অর্থে আরও উপযুক্ত শব্দটি ব্যবহার করুন।",
    article_usage:
      "বিশেষ্যটির আগে সঠিক article ব্যবহার করুন।",
    prepositions:
      "এই বাক্যে সঠিক preposition ব্যবহার করুন।",
    question_structure:
      "প্রশ্নে auxiliary verb ও subject-এর সঠিক ক্রম ব্যবহার করুন।",
    sentence_structure:
      "বাক্যটি সম্পূর্ণ ও স্বাভাবিক করতে গঠনটি ঠিক করুন।",
    fluency:
      "বাক্যটি আরও স্বাভাবিকভাবে বলতে এই রূপটি ব্যবহার করুন।",
  };

  return banglaReasons[pattern] ||
    "বাক্যটি আরও স্বাভাবিক ও সঠিক করতে উপরের রূপটি ব্যবহার করুন।";
}

function normalizedPatternCounts(
  value: unknown
): Record<string, number> {
  const result: Record<string, number> = {};

  if (!value || typeof value !== "object") {
    return result;
  }

  for (const [rawKey, rawCount] of Object.entries(value)) {
    if (typeof rawCount !== "number") continue;

    const key = canonicalPattern(rawKey);

    if (!key) continue;

    result[key] = (result[key] || 0) + rawCount;
  }

  return result;
}

function isCafeScenario(scenario: Scenario): boolean {
  const text = `${str(scenario.id)} ${str(scenario.title)}`.toLowerCase();

  return (
    text.includes("cafe") ||
    text.includes("café") ||
    text.includes("restaurant") ||
    text.includes("coffee")
  );
}

function cafeMessageLooksRelevant(message: string): boolean {
  return cafeOrderLooksRelevant(message) ||
    cafeFollowUpLooksRelevant(message);
}

function cafeOrderLooksRelevant(message: string): boolean {
  const value = normalize(message);

  const words = [
    "order",
    "menu",
    "coffee",
    "cappuccino",
    "croissant",
    "crescent",
    "tea",
    "water",
    "juice",
    "drink",
    "food",
    "meal",
    "breakfast",
    "lunch",
    "dinner",
    "rice",
    "chicken",
    "beef",
    "fish",
    "soup",
    "sandwich",
    "burger",
    "pizza",
    "pasta",
    "eat",
    "please",
    "i'd like",
    "i would like",
    "can i have",
    "want",
  ];

  return words.some((word) => value.includes(word));
}

function cafeFollowUpLooksRelevant(message: string): boolean {
  const value = normalize(message);

  return [
    "yes",
    "yeah",
    "sure",
    "no",
    "regular",
    "sugar",
    "spoon",
    "milk",
    "cream",
    "small",
    "medium",
    "large",
    "hot",
    "iced",
    "to go",
    "takeaway",
    "thats all",
    "nothing else",
    "thank",
  ].some((word) => value.includes(word));
}

function isAcceptableCafeReply(message: string): boolean {
  const value = normalize(message);

  return [
    /^(yeah|yes)( sure)?( please)? make it regular$/,
    /^(yeah|yes)( sure)?( please)?$/,
    /^(no|no thanks|no thank you)$/,
    /^(one|two|three) spoon(s)? of sugar( please)?$/,
    /^(regular|small|medium|large)( please)?$/,
    /^(thats all|nothing else)( thanks| thank you)?$/,
  ].some((pattern) => pattern.test(value));
}

function fallbackFollowUp(scenario: Scenario): string {
  const text = `${str(scenario.id)} ${str(scenario.title)}`.toLowerCase();

  if (
    text.includes("cafe") ||
    text.includes("café") ||
    text.includes("restaurant") ||
    text.includes("coffee")
  ) {
    return "Let’s return to the restaurant practice. What would you like to order?";
  }

  if (text.includes("work")) {
    return "Let’s continue the work conversation. What do you usually do at work?";
  }

  if (text.includes("interview")) {
    return "Let’s continue the interview. Tell me about your work experience.";
  }

  if (text.includes("airport")) {
    return "Let’s continue the airport practice. Where are you travelling today?";
  }

  return "Let’s continue the conversation. What would you like to say next?";
}

function naturalScenarioFollowUp(
  scenario: Scenario,
  learnerMessage: string
): string {
  const text = `${str(scenario.id)} ${str(scenario.title)}`.toLowerCase();
  const message = learnerMessage.toLowerCase();

  if (isCafeScenario(scenario)) {
    if (/(sugar|spoon|regular)/.test(message)) {
      return "Got it. Would you like anything else with your order?";
    }

    if (/\b(no|nothing else|thats all)\b/.test(normalize(message))) {
      return "Perfect. Your order is ready to go.";
    }

    if (/(coffee|tea|water|juice|drink)/.test(message)) {
      return "Sounds good. Would you like anything to eat with that?";
    }

    if (/(fish|chicken|beef|soup|sandwich|burger|pizza|pasta|rice|food|meal)/.test(message)) {
      return "Certainly. Would you like a drink or anything else with that?";
    }
  }

  if (text.includes("airport")) {
    return "Thank you. Do you have any luggage to check in?";
  }

  if (text.includes("interview")) {
    return "Thanks for sharing that. What is one strength you bring to a team?";
  }

  if (text.includes("work")) {
    return "Thanks for the update. Is there anything you need from the team?";
  }

  return fallbackFollowUp(scenario);
}

function contextualScenarioReply(
  scenario: Scenario,
  learnerMessage: string,
  lastTeacherMessage: string,
  relevantTurnCount: number
): string {
  const scenarioId = str(scenario.id);
  const learner = normalize(learnerMessage);
  const teacher = normalize(lastTeacherMessage);
  const affirmative = /^(yes|yeah|sure|ok)( please)?$/.test(learner);

  if (scenarioId === "shopping") {
    if (
      affirmative &&
      /\b(price|know the price|how much)\b/.test(teacher)
    ) {
      return "It’s twenty dollars. Would you like to buy it?";
    }

    if (
      affirmative &&
      /\b(try it on|fitting room)\b/.test(teacher)
    ) {
      return "The fitting room is over there. Let me know how it fits.";
    }

    if (/\b(small|medium|large)\b/.test(learner)) {
      return "Great. What colour would you like?";
    }

    if (/\b(black|white|blue|red|green|yellow)\b/.test(learner)) {
      return "Good choice. Would you like to try it on?";
    }
  }

  const prompts = Array.isArray(scenario.teacherPrompts)
    ? scenario.teacherPrompts.map(str).filter(Boolean)
    : [];

  if (prompts.length) {
    return prompts[Math.min(relevantTurnCount, prompts.length - 1)];
  }

  return naturalScenarioFollowUp(scenario, learnerMessage);
}

function removeRepeatedCorrection(
  reply: string,
  correction: string,
  scenario: Scenario
): string {
  const cleanReply = reply.trim();
  const cleanCorrection = correction.trim();

  if (!cleanCorrection) return cleanReply;

  if (
    normalize(cleanReply).includes(
      normalize(cleanCorrection)
    )
  ) {
    return fallbackFollowUp(scenario);
  }

  return cleanReply;
}

function lessonSearchText(lesson: Lesson): string {
  return [
    lesson.title || "",
    lesson.subtitle || "",
    ...(Array.isArray(lesson.skills) ? lesson.skills : []),
    ...(Array.isArray(lesson.grammarPoints)
      ? lesson.grammarPoints
      : []),
  ]
    .join(" ")
    .toLowerCase();
}

function lessonKeywords(pattern: string): string[] {
  const map: Record<string, string[]> = {
    past_tense: [
      "past",
      "past tense",
      "past simple",
      "experience",
      "yesterday",
    ],
    present_simple: [
      "present",
      "routine",
      "daily",
      "everyday",
    ],
    subject_verb_agreement: [
      "subject",
      "verb",
      "present",
      "grammar",
    ],
    article_usage: [
      "article",
      "articles",
      "a an the",
      "noun",
    ],
    prepositions: [
      "preposition",
      "place",
      "time",
    ],
    question_structure: [
      "question",
      "questions",
      "asking",
    ],
    sentence_structure: [
      "sentence",
      "grammar",
      "structure",
    ],
    word_order: [
      "word order",
      "sentence",
      "structure",
    ],
    word_choice: [
      "vocabulary",
      "words",
    ],
    fluency: [
      "speaking",
      "conversation",
      "fluency",
    ],
  };

  return map[pattern] || [];
}

function scenarioLessonKeywords(scenario: Scenario): string[] {
  const text = `${str(scenario.id)} ${str(scenario.title)}`.toLowerCase();
  const vocabulary = Array.isArray(scenario.vocabulary)
    ? scenario.vocabulary.map(str).filter(Boolean).slice(0, 8)
    : [];

  if (isCafeScenario(scenario)) {
    return ["food", "order", "restaurant", "menu", "would like", ...vocabulary];
  }

  if (text.includes("interview") || text.includes("work")) {
    return ["work", "professional", "meeting", "request", ...vocabulary];
  }

  if (text.includes("airport")) {
    return ["travel", "airport", "directions", ...vocabulary];
  }

  return vocabulary;
}

function findBestLesson(
  pattern: string,
  lessons: Lesson[],
  scenario: Scenario
): Lesson | null {
  const keywords = lessonKeywords(pattern);
  const scenarioKeywords = scenarioLessonKeywords(scenario);

  if (!keywords.length) return null;

  let bestLesson: Lesson | null = null;
  let bestScore = 0;

  for (const lesson of lessons) {
    const text = lessonSearchText(lesson);

    let score = 0;

    for (const keyword of keywords) {
      if (text.includes(keyword)) {
        score += keyword.includes(" ") ? 6 : 2;
      }
    }

    for (const keyword of scenarioKeywords) {
      if (text.includes(keyword)) {
        score += 2;
      }
    }

    if (score > bestScore) {
      bestScore = score;
      bestLesson = lesson;
    }
  }

  return bestScore > 0 ? bestLesson : null;
}

export default {
  fetch: withSupabase(
    { auth: ["publishable"] },

    async (req) => {
      try {
        const groqKey = Deno.env.get("GROQ_API_KEY");

        if (!groqKey) {
          return Response.json(
            { error: "GROQ_API_KEY is not configured." },
            { status: 500 }
          );
        }

        const body = await req.json();

        const learnerMessage = str(body.learnerMessage);
        const learnerName = str(body.learnerName) || "Learner";
        const nativeLanguage = str(body.nativeLanguage) || "English";
        const targetLanguage = str(body.targetLanguage) || "English";
        const cefrLevel =
          str(body.cefrLevel) ||
          str(body.level) ||
          "A1";
        const teacherName =
          str(body.teacherName) === "Leo"
            ? "Leo"
            : "Maya";

        const scenario: Scenario =
          body.scenario && typeof body.scenario === "object"
            ? body.scenario
            : {
                id: "general",
                title: "English conversation",
                goal: "Practice natural English.",
              };

        const interests = Array.isArray(body.interests)
          ? body.interests.map(str).filter(Boolean)
          : [];
        const learningGoal = str(body.learningGoal) || "General conversation";
        const speakingBarrier =
          str(body.speakingBarrier) || "Hesitation & mental translation";
        const targetAccent = str(body.targetAccent) || "Natural standard";

        if (!learnerMessage) {
          return Response.json(
            { error: "learnerMessage is required." },
            { status: 400 }
          );
        }

        const messages = Array.isArray(body.messages)
          ? body.messages
              .filter(
                (m: any) =>
                  m &&
                  typeof m.content === "string" &&
                  (m.role === "user" || m.role === "assistant")
              )
              .slice(-14)
          : [];

        const existingPatterns =
          normalizedPatternCounts(body.observedPatterns);

        const shownLessonPatterns = new Set(
          Array.isArray(body.shownLessonPatterns)
            ? body.shownLessonPatterns
                .map((value: unknown) => canonicalPattern(str(value)))
                .filter(Boolean)
            : []
        );

        const metaConversation =
          isMetaConversation(learnerMessage);

        const relevantMessages =
          relevantLearnerMessages(
            messages,
            learnerMessage,
            scenario
          );

        const relevantTurnCount =
          relevantMessages.length;

        const lastTeacherMessage = [...messages]
          .reverse()
          .find((message) => message.role === "assistant")
          ?.content || "";

        const lessons: Lesson[] = Array.isArray(body.availableLessons)
          ? body.availableLessons
          : [];

        const patternSummary =
          Object.entries(existingPatterns)
            .map(([key, count]) => `${key}: ${count}`)
            .join(", ") || "None yet.";

        const lessonSummary =
          lessons
            .slice(0, 60)
            .map((lesson) => {
              const skills = Array.isArray(lesson.skills)
                ? lesson.skills.join(", ")
                : "";

              const grammar = Array.isArray(lesson.grammarPoints)
                ? lesson.grammarPoints.join(", ")
                : "";

              return [
                `ID:${lesson.id}`,
                `Title:${lesson.title || ""}`,
                `Description:${lesson.subtitle || ""}`,
                `Skills:${skills}`,
                `Grammar:${grammar}`,
              ].join(" | ");
            })
            .join("\n") || "No lessons supplied.";

        const guideLines = [
          `Level: ${str(scenario.level) || cefrLevel}`,
          `Category: ${str(scenario.category) || "General"}`,
          `Required steps: ${Array.isArray(scenario.requiredSteps)
            ? scenario.requiredSteps.map(str).filter(Boolean).join(" | ")
            : "Follow the stated goal."}`,
          `Useful prompt bank: ${Array.isArray(scenario.teacherPrompts)
            ? scenario.teacherPrompts.map(str).filter(Boolean).join(" | ")
            : "Use natural follow-up questions."}`,
          `Acceptable learner replies: ${Array.isArray(scenario.acceptedResponses)
            ? scenario.acceptedResponses.map(str).filter(Boolean).join(" | ")
            : "Accept natural short replies."}`,
          `Vocabulary: ${Array.isArray(scenario.vocabulary)
            ? scenario.vocabulary.map(str).filter(Boolean).join(", ")
            : ""}`,
          `Conversation branches: ${Array.isArray(scenario.branches)
            ? scenario.branches
                .map((branch) =>
                  `${str(branch.learnerIntent)} => ${str(branch.teacherResponse)}`
                )
                .filter((branch) => branch !== " => ")
                .join(" | ")
            : ""}`,
          `Known mistakes: ${Array.isArray(scenario.commonMistakes)
            ? scenario.commonMistakes
                .map((mistake) =>
                  `${str(mistake.example)} => ${str(mistake.correction)} [${str(mistake.pattern)}]`
                )
                .filter((mistake) => mistake !== " =>  []")
                .join(" | ")
            : ""}`,
          `Completion evidence: ${Array.isArray(scenario.completionChecks)
            ? scenario.completionChecks
                .map((check) => str(check.description))
                .filter(Boolean)
                .join(" | ")
            : "Use the stated goal."}`,
        ].join("\n");

        const systemPrompt = `
You are ${teacherName}, a world-class Cambridge CELTA/TESOL certified Master English Teacher in the Luma learning app. Your mission is to guide ${learnerName} to natural spoken fluency.

LEARNER PROFILE
Name: ${learnerName}
Native language: ${nativeLanguage}
Target language: ${targetLanguage} (Preferred accent: ${targetAccent})
CEFR level: ${cefrLevel}
Primary Goal: ${learningGoal}
Passions & Topics: ${interests.length ? interests.join(", ") : "Daily life, movies, technology"}
Speaking Barrier: ${speakingBarrier}

SCENARIO
Title: ${str(scenario.title)}
Goal: ${str(scenario.goal)}

SCENARIO TEACHING GUIDE
${guideLines}

Use this guide as flexible teaching material, not as a script. Choose the next prompt that fits what the learner actually said. Never ask a question they have already answered.

PREVIOUS PATTERNS
${patternSummary}

SESSION STATE
Current input: ${metaConversation ? "META-CONVERSATION" : "ROLE-PLAY"}
Relevant role-play turns completed: ${relevantTurnCount}

AVAILABLE LESSONS
${lessonSummary}

MASTER TEACHER RULES (CELTA / TESOL CERTIFIED)

1. 80/20 TALKING RULE: The student should talk 80% of the time. Keep your replies under 30 words. React warmly to their meaning, then ask ONE engaging, open-ended question. Never give long lectures.
2. IMPLICIT RECASTING: Subtly weave the correct grammatical phrasing into your natural reply so the student hears authentic native usage (e.g. if student says "I go shopping yesterday", reply: "Oh, you went shopping yesterday! What did you pick up?").
3. WEAVE PERSONAL PASSIONS: Where natural, use topics they love (${interests.length ? interests.join(", ") : "technology, movies, food"}) in follow-up examples and conversational hooks.
4. GENTLE ERROR CORRECTION: Separate from conversation, provide a correction only when a mistake impedes clarity or sounds unnatural. Keep corrections minimal and non-judgmental.
5. NATIVE EXPLANATION: Write "correctionReason" in ${nativeLanguage} so grammar and idiom logic is crystal-clear to the learner, but keep "reply" and "correction" in authentic ${targetLanguage}.
6. CONVERSATIONAL FLOW: Accept short natural answers ("Medium, please", "Just looking", "Sounds good"). Do not force artificial full sentences.
7. SOCRATIC CLARIFICATION: If speech-to-text transcript is ambiguous, ask a quick clarifying question with a smile instead of marking an error.
- Do not invent new facts.
- Keep corrections separate from conversation.
- Keep the selected scenario moving.
- Treat this as an open-ended, real conversation inside the scenario topic. Follow the learner's answers, preferences, questions, and stories instead of running through a fixed script.
- Ask one question at a time.
- Keep replies short and appropriate for ${cefrLevel}.
- Sound warm and human: acknowledge what the learner said, use natural contractions, and vary your wording.
- React to the learner's meaning before asking the next question.
- Use one or two short sentences. Do not lecture during role-play.
- Do not repeat the learner's sentence as your whole reply unless you are asking for clarification.
- Write "reply" and "correction" in ${targetLanguage}.
- Write "correctionReason" in ${nativeLanguage} when a correction needs explanation.
- The learner may be using speech-to-text. Use the previous question to interpret likely transcription errors. If the transcript is ambiguous, ask a short clarification question instead of confidently recording a language mistake.
- For example, after asking how much sugar they want, "once phone" may mean "one spoon"; it must not be changed to "one cappuccino".
- A correction must correct only the learner's newest message. Never repeat or reissue a correction from an earlier turn.
- Accept short answers such as "medium", "black", and "yes, please" when they answer the previous question. Do not expand them into an unrelated full sentence or mark them as mistakes.
- Preserve every part of the newest message. For example, "Yeah, sure, where is the trial room?" may become "Yeah, sure. Where is the fitting room?"; do not discard the acknowledgement.
- Do not repeat a question the learner has already answered. After the core task, broaden naturally within the same subject: ask about preferences, past experiences, plans, comparisons, or a related practical detail.
- Be a real teacher: answer short questions about the target language, explain a word when asked, and then gently offer a useful next turn. Do not claim personal real-world experiences.

META-CONVERSATION

If the learner talks to you about your teaching, your questions, the lesson, or the role-play itself:
- Step out of character temporarily.
- Answer the learner directly as Teacher Luma.
- Preserve exactly who is speaking and what the learner means.
- Do not force the learner back into the scenario in the same reply.
- If their English has a meaningful error, correct it separately without changing the intended speaker.

If the learner checks the audio or asks you to repeat, respond naturally and repeat or clarify the last question. These turns do not count toward the scenario goal. Common spoken phrases such as "Am I coming through okay?" and "Sorry, come again?" are acceptable; do not correct them merely to make them more formal.

Example learner message:
"Don't you want to ask if I need anything else?"

This is a question about your behavior. Answer it directly. Do not rewrite it as "Do you need anything else?" because that changes the speaker and meaning.

IMPORTANT MEANING RULE

Learner:
"I go to work yesterday."

Correct:
"I went to work yesterday."

Do NOT change it to:
"I worked there yesterday."

IMPORTANT SCENARIO RULE

If the learner says something unrelated to the current scenario:
1. Correct useful English if needed.
2. Then guide the learner back to the current scenario.

For a restaurant or café scenario, unrelated grammar examples must NOT start a new conversation about work, friends, travel, or another topic.

CORRECTIONS

Correct useful problems such as:
- tense
- subject-verb agreement
- word order
- sentence structure
- articles
- prepositions
- question structure
- word choice

Ignore harmless punctuation and capitalization.

Do not create a correction, pattern, or lesson recommendation when the only difference is punctuation, capitalization, formatting, or stylistic preference.

"one fish and chips please" is understandable spoken English. Do not correct it only to add capitalization or a comma.

"reply" contains conversation only.

"correction" contains the corrected learner sentence only.

"correctionReason" briefly explains the correction.

Never repeat the correction inside "reply".

Never say in reply:
"You should say..."
"You could say..."
"The correct sentence is..."
"A better way is..."

PATTERNS

Use stable keys where possible:

past_tense
present_simple
subject_verb_agreement
word_order
word_choice
article_usage
prepositions
question_structure
sentence_structure
fluency

For:
"I go yesterday."
"I see him yesterday."
"I eat there yesterday."

always use:
past_tense

Do not use:
past_simple
simple_past
past

If there is no meaningful problem:
patternKey = ""
patternLabel = ""
patternCategory = "none"

LESSONS

You may suggest a lesson, but the server will also check repeated patterns.

Do not invent lesson IDs.

GOAL COMPLETION

- Track the scenario goal across the whole conversation.
- Do not count unrelated examples or meta-conversation as goal progress.
- Completing the stated goal means the learner has made meaningful progress, not that their conversation must stop. Keep the conversation available for as long as the learner wants to practice.
- Never end the learner's practice automatically. The learner controls when the practice finishes in the app.
- Set "finished" to false.
- Short restaurant replies such as "Yeah, sure", "make it regular", "one spoon of sugar", and "that's all" are on-topic answers. Continue from them; never restart the order.

OUTPUT

Return exactly one JSON object:

{
  "reply": "",
  "correction": "",
  "correctionReason": "",
  "patternKey": "",
  "patternLabel": "",
  "patternCategory": "none",
  "lessonId": 0,
  "lessonTitle": "",
  "lessonReason": "",
  "lessonSkill": "",
  "mode": "roleplay",
  "finished": false
}

Return JSON only.
No markdown.
No code fences.
`;

        const groqResponse = await fetch(
          "https://api.groq.com/openai/v1/chat/completions",
          {
            method: "POST",

            headers: {
              Authorization: `Bearer ${groqKey}`,
              "Content-Type": "application/json",
            },

            body: JSON.stringify({
              model:
                Deno.env.get("GROQ_TEACHER_MODEL") ||
                "openai/gpt-oss-120b",

              messages: [
                {
                  role: "system",
                  content: systemPrompt,
                },
                ...messages,
                {
                  role: "user",
                  content: learnerMessage,
                },
              ],

              temperature: 0.2,
              max_completion_tokens: 500,
              reasoning_effort: "low",
              include_reasoning: false,

              response_format: {
                type: "json_schema",
                json_schema: teacherResponseSchema,
              },
            }),
          }
        );

        let groqResult: any;

        try {
          groqResult = await groqResponse.json();
        } catch {
          return Response.json(
            { error: "Groq returned an unreadable response." },
            { status: 502 }
          );
        }

        let teacher: Record<string, any> | null = null;

        if (!groqResponse.ok) {
          teacher = parseTeacherPayload(
            groqResult?.error?.failed_generation
          );

          if (!teacher) {
            console.error("Groq teacher error:", groqResult);
          }
        } else {
          const content =
            groqResult?.choices?.[0]?.message?.content;

          teacher = parseTeacherPayload(content);

          if (!teacher) {
            console.error("Invalid teacher JSON:", content);
          }
        }

        /*
         * Keep the lesson usable during a temporary provider error.
         * A later turn will try the live teacher again automatically.
         */
        if (!teacher) {
          teacher = {
            reply: metaConversation
              ? "I’m still here as your teacher. Please try that question once more."
              : contextualScenarioReply(
                  scenario,
                  learnerMessage,
                  lastTeacherMessage,
                  relevantTurnCount
                ),
            correction: "",
            correctionReason: "",
            patternKey: "",
            finished: false,
          };
        }

        let reply = str(teacher.reply);
        let correction = str(teacher.correction);
        let correctionReason = str(teacher.correctionReason);

        let rawPattern = str(teacher.patternKey);

        if (!correction) {
          const deterministicCorrection =
            deterministicCommonCorrection(learnerMessage);

          if (deterministicCorrection) {
            correction = deterministicCorrection.correction;
            correctionReason = deterministicCorrection.reason;
            rawPattern = deterministicCorrection.pattern;
          }
        }

        let key = rawPattern
          ? canonicalPattern(rawPattern)
          : "";

        if (
          !correction ||
          isCosmeticCorrection(learnerMessage, correction) ||
          !correctionTargetsCurrentMessage(
            learnerMessage,
            correction
          ) ||
          isAcceptedScenarioReply(learnerMessage, scenario) ||
          (isCafeScenario(scenario) &&
            isAcceptableCafeReply(learnerMessage)) ||
          isConversationManagementPhrase(learnerMessage)
        ) {
          correction = "";
          correctionReason = "";
          key = "";
        }

        let label = key
          ? patternLabel(key)
          : "";

        let category = key
          ? patternCategory(key)
          : "none";

        if (!categories.has(category)) {
          category = "other";
        }

        correctionReason = localizedCorrectionReason(
          correctionReason,
          key,
          nativeLanguage
        );

        /*
         * Count the current mistake together
         * with earlier mistakes.
         */
        const previousCount =
          key ? existingPatterns[key] || 0 : 0;

        const totalCount =
          key ? previousCount + 1 : 0;

        /*
         * Keep café/restaurant practice on topic
         * after correcting an unrelated sentence.
         */
        if (
          key &&
          !metaConversation &&
          isCafeScenario(scenario) &&
          !cafeMessageLooksRelevant(learnerMessage)
        ) {
          reply = fallbackFollowUp(scenario);
        }

        reply = removeRepeatedCorrection(
          reply,
          correction,
          scenario
        );

        if (
          !metaConversation &&
          normalize(reply) === normalize(learnerMessage)
        ) {
          reply = naturalScenarioFollowUp(
            scenario,
            learnerMessage
          );
        }

        if (
          !metaConversation &&
          isCafeScenario(scenario) &&
          cafeMessageLooksRelevant(learnerMessage) &&
          /(?:return to|back to).*restaurant|what would you like to order/i
            .test(reply)
        ) {
          reply = naturalScenarioFollowUp(
            scenario,
            learnerMessage
          );
        }

        if (
          !metaConversation &&
          /(?:lets|let us) continue the conversation|what would you like to say next/i
            .test(normalize(reply))
        ) {
          reply = contextualScenarioReply(
            scenario,
            learnerMessage,
            lastTeacherMessage,
            relevantTurnCount
          );
        }

        if (!reply) {
          reply = fallbackFollowUp(scenario);
        }

        /*
         * Deterministic lesson recommendation:
         * after the same pattern appears twice
         * or more, search the real lesson catalog.
         */
        let lessonId = 0;
        let lessonTitle = "";
        let lessonReason = "";
        let lessonSkill = "";

        if (
          key &&
          totalCount >= 2 &&
          !shownLessonPatterns.has(key)
        ) {
          const lesson = findBestLesson(
            key,
            lessons,
            scenario
          );

          if (
            lesson &&
            typeof lesson.id === "number" &&
            str(lesson.title)
          ) {
            lessonId = lesson.id;
            lessonTitle = str(lesson.title);
            lessonSkill = label;

            lessonReason =
              `You have made this ${label.toLowerCase()} mistake more than once. This lesson will help you practise it.`;
          }
        }

        // Learners can stay in any topic for as long as they want. Completion
        // is intentionally controlled by the explicit Finish practice action
        // in the app, rather than a server-side turn or checklist limit.
        const finished = false;

        return Response.json({
          reply,
          correction,
          correctionReason,

          patternKey: key,
          patternLabel: label,
          patternCategory: category,

          lessonId,
          lessonTitle,
          lessonReason,
          lessonSkill,

          mode: metaConversation
            ? "teacher"
            : "roleplay",

          finished,
        });
      } catch (error) {
        console.error("Teacher function error:", error);

        return Response.json(
          {
            error: "Unexpected teacher error.",
            details:
              error instanceof Error
                ? error.message
                : String(error),
          },
          { status: 500 }
        );
      }
    }
  ),
};
