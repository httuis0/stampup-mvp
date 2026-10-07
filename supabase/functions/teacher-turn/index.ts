const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type',
};

type TeacherRequest = {
  learnerMessage: string;
  learnerName: string;
  nativeLanguage: string;
  targetLanguage: string;
  cefrLevel: string;
  teacherName?: string;
  scenario: { id: string; title: string; goal: string };
  history: { role: 'teacher' | 'learner'; text: string }[];
  interests?: string[];
  learningGoal?: string;
  speakingBarrier?: string;
  targetAccent?: string;
};

const responseSchema = {
  name: 'teacher_turn',
  strict: true,
  schema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      teacherReply: { type: 'string' },
      correction: { type: ['string', 'null'] },
      explanation: { type: ['string', 'null'] },
      tip: { type: ['string', 'null'] },
      suggestedWords: {
        type: 'array', maxItems: 2,
        items: { type: 'object', additionalProperties: false, properties: { word: { type: 'string' }, meaning: { type: 'string' }, example: { type: 'string' } }, required: ['word', 'meaning', 'example'] },
      },
      mistakes: {
        type: 'array', maxItems: 2,
        items: { type: 'object', additionalProperties: false, properties: { type: { type: 'string', enum: ['word', 'grammar', 'sentence'] }, content: { type: 'string' }, correctAnswer: { type: 'string' }, explanation: { type: 'string' } }, required: ['type', 'content', 'correctAnswer', 'explanation'] },
      },
    },
    required: ['teacherReply', 'correction', 'explanation', 'tip', 'suggestedWords', 'mistakes'],
  },
};

function json(body: unknown, status = 200) { return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }); }

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const authorization = request.headers.get('Authorization');
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const supabaseKey = Deno.env.get('SUPABASE_ANON_KEY');
  if (!authorization || !supabaseUrl || !supabaseKey) return json({ error: 'Unauthorized' }, 401);

  const userResponse = await fetch(`${supabaseUrl}/auth/v1/user`, { headers: { Authorization: authorization, apikey: supabaseKey } });
  if (!userResponse.ok) return json({ error: 'Unauthorized' }, 401);

  const body = await request.json() as TeacherRequest;
  if (!body.learnerMessage?.trim() || !body.targetLanguage || !body.scenario?.title) return json({ error: 'Missing teacher session details.' }, 400);

  const apiKey = Deno.env.get('GROQ_API_KEY');
  if (!apiKey) return json({ error: 'Teacher Luma is not configured.' }, 503);
  const model = Deno.env.get('GROQ_TEACHER_MODEL') || 'openai/gpt-oss-20b';
  const instructions = `You are Teacher ${body.teacherName || 'Luma'}, a world-class, Cambridge CELTA/TESOL certified Master English Teacher. Your mission is to guide ${body.learnerName} to natural spoken fluency.

LEARNER PROFILE:
- Target language: ${body.targetLanguage} (Preferred accent: ${body.targetAccent || 'Natural standard'})
- Mother tongue: ${body.nativeLanguage}
- CEFR level: ${body.cefrLevel}
- Core life goal: ${body.learningGoal || 'General and professional conversation'}
- Personal passions: ${(body.interests || ['Daily life', 'Technology']).join(', ')}
- Speaking barrier: ${body.speakingBarrier || 'Mental freeze / overthinking'}

SCENARIO CONTEXT:
- Scenario: ${body.scenario.title}
- Goal: ${body.scenario.goal}

MASTER TEACHER PEDAGOGY (CELTA/DELTA):
1. 80/20 TALKING RULE: Keep teacherReply concise (under 35 words). React naturally to what they said, then ask ONE engaging, open-ended question. Never monologue.
2. IMPLICIT RECASTING: Subtly weave the correct phrasing into your response so the learner hears authentic English naturally (e.g. if student says "I go to market", reply "Oh, you went to the market! What did you pick up there?").
3. TARGETED ERROR CORRECTION: Separate from conversation, provide a correction only when an error impedes clarity or sounds unnatural. Keep explanations clear.
4. NATIVE CODE-SWITCHING: Explain corrections in ${body.nativeLanguage} so linguistic concepts click immediately, but keep teacherReply in natural ${body.targetLanguage}.
5. INTERACTIONAL WARMTH: Weave their interests (${(body.interests || []).join(', ')}) into questions and examples. Be encouraging, warm, and celebrate good vocabulary.`;
  const history = (body.history || []).slice(-8).map((message) => ({ role: message.role === 'teacher' ? 'assistant' : 'user', content: message.text }));

  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, temperature: .4, max_tokens: 450, response_format: { type: 'json_schema', json_schema: responseSchema }, messages: [{ role: 'system', content: instructions }, ...history, { role: 'user', content: body.learnerMessage.trim() }] }),
  });
  if (!response.ok) return json({ error: 'Teacher Luma could not reply right now.' }, 502);
  const completion = await response.json();
  try { return json(JSON.parse(completion.choices?.[0]?.message?.content || '{}')); }
  catch { return json({ error: 'Teacher Luma returned an invalid reply.' }, 502); }
});
