// Vercel Serverless Function — writes survey responses to Notion
// Environment variables needed:
//   NOTION_API_KEY  — Internal integration token from https://www.notion.so/my-integrations
//   NOTION_DB_ID    — The database ID (already set below as default)

const NOTION_API = 'https://api.notion.com/v1/pages';
const NOTION_VERSION = '2022-06-28';

// Map form values to Notion-friendly display names
const CLAUDE_EXP_MAP = {
  never_used: 'Never Used',
  basic_chat: 'Basic Chat',
  projects: 'Projects',
  artifacts: 'Artifacts',
  landing_page: 'Landing Page',
  cowork: 'Cowork',
  claude_code: 'Claude Code',
  mcp_skills: 'MCP/Skills',
  api: 'API',
};

const JOURNEY_MAP = {
  curious_beginner: 'Curious Beginner',
  casual_user: 'Casual User',
  active_builder: 'Active Builder',
  power_user: 'Power User',
};

const BACKGROUND_MAP = {
  leadership: 'Leadership',
  mid_level: 'Mid-Level',
  new_business: 'Early-Stage Business',
  established_founder: 'Established Founder',
  student_learner: 'Student/Career Changer',
  between_roles: 'Between Roles',
};

const GOALS_MAP = {
  build_things: 'Build Things',
  save_time: 'Save Time',
  confidence: 'Confidence',
  launch_faster: 'Launch Faster',
  automate_workflows: 'Automate Workflows',
  generate_revenue: 'Generate Revenue',
};

const CHALLENGES_MAP = {
  inconsistent_outputs: 'Inconsistent Outputs',
  dont_know_whats_possible: 'Dont Know Whats Possible',
  prompting: 'Prompting',
  technical_barrier: 'Technical Barrier',
  no_time: 'No Time',
  business_outcomes: 'Business Outcomes',
  keeping_up: 'Keeping Up',
  trust: 'Trust Issues',
};

export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const NOTION_KEY = process.env.NOTION_API_KEY;
  const DB_ID = process.env.NOTION_DB_ID || '250f7560d8c94bd198fb667be11ee0ea';

  if (!NOTION_KEY) {
    console.error('NOTION_API_KEY not set');
    return res.status(500).json({ error: 'Server configuration error' });
  }

  try {
    const data = req.body;

    const properties = {
      Name: {
        title: [{ text: { content: data.name || 'Anonymous' } }],
      },
      Email: {
        email: data.email || null,
      },
      'Claude Experience': {
        multi_select: (data.claude_experience || [])
          .map((v) => CLAUDE_EXP_MAP[v])
          .filter(Boolean)
          .map((name) => ({ name })),
      },
      'AI Journey': {
        select: JOURNEY_MAP[data.ai_journey]
          ? { name: JOURNEY_MAP[data.ai_journey] }
          : null,
      },
      Background: {
        select: BACKGROUND_MAP[data.background]
          ? { name: BACKGROUND_MAP[data.background] }
          : null,
      },
      'Success Goals': {
        multi_select: (data.success_goals || [])
          .map((v) => GOALS_MAP[v])
          .filter(Boolean)
          .map((name) => ({ name })),
      },
      'Success Definition': {
        rich_text: [{ text: { content: (data.success_text || '').slice(0, 2000) } }],
      },
      Challenges: {
        multi_select: (data.challenges || [])
          .map((v) => CHALLENGES_MAP[v])
          .filter(Boolean)
          .map((name) => ({ name })),
      },
      'Challenges Other': {
        rich_text: [{ text: { content: (data.challenges_other || '').slice(0, 2000) } }],
      },
      'Cohort Intro': {
        rich_text: [{ text: { content: (data.cohort_intro || '').slice(0, 2000) } }],
      },
      'Submitted At': {
        date: { start: data.submitted_at || new Date().toISOString() },
      },
    };

    if (!properties['AI Journey'].select) delete properties['AI Journey'];
    if (!properties['Background'].select) delete properties['Background'];

    const response = await fetch(NOTION_API, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${NOTION_KEY}`,
        'Notion-Version': NOTION_VERSION,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        parent: { database_id: DB_ID },
        properties,
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      console.error('Notion API error:', err);
      return res.status(500).json({ error: 'Failed to save response' });
    }

    return res.status(200).json({ success: true });
  } catch (err) {
    console.error('Handler error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
