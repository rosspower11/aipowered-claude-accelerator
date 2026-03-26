// Vercel Serverless Function — writes survey responses to Notion + uploads photo to R2
// Environment variables needed:
//   NOTION_API_KEY       — Internal integration token
//   NOTION_DB_ID         — Database ID (defaults below)
//   R2_ACCESS_KEY_ID     — Cloudflare R2 S3 access key
//   R2_SECRET_ACCESS_KEY — Cloudflare R2 S3 secret key
//   R2_ENDPOINT          — e.g. https://<account>.r2.cloudflarestorage.com
//   R2_BUCKET            — Bucket name
//   R2_PUBLIC_URL        — Public URL for the bucket

import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

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

const INDUSTRY_MAP = {
  technology: 'Technology / Software',
  finance: 'Finance / Banking',
  healthcare: 'Healthcare / Wellness',
  education: 'Education / Training',
  marketing: 'Marketing / Advertising',
  real_estate: 'Real Estate / Property',
  consulting: 'Consulting / Professional Services',
  ecommerce: 'Retail / E-commerce',
  media: 'Media / Entertainment / Creative',
  legal: 'Legal',
  nonprofit: 'Non-profit / Government',
};
// Upload photo to R2 and return public URL
async function uploadPhotoToR2(base64Data, fileName) {
  const R2_KEY = process.env.R2_ACCESS_KEY_ID;
  const R2_SECRET = process.env.R2_SECRET_ACCESS_KEY;
  const R2_ENDPOINT = process.env.R2_ENDPOINT || 'https://771920261d26e18a3cda9f616a3c6508.r2.cloudflarestorage.com';
  const R2_BUCKET = process.env.R2_BUCKET || 'aipowered';
  const R2_PUBLIC = process.env.R2_PUBLIC_URL || 'https://pub-557b5f7935344f8e91f1d0f115f8ec73.r2.dev';

  if (!R2_KEY || !R2_SECRET) {
    console.error('R2 credentials not set');
    return null;
  }

  try {
    // Strip data URL prefix if present
    const base64Clean = base64Data.replace(/^data:image\/\w+;base64,/, '');
    const buffer = Buffer.from(base64Clean, 'base64');

    const s3 = new S3Client({
      region: 'auto',
      endpoint: R2_ENDPOINT,
      credentials: {
        accessKeyId: R2_KEY,
        secretAccessKey: R2_SECRET,
      },
    });

    const key = `member-photos/${fileName}`;

    await s3.send(new PutObjectCommand({
      Bucket: R2_BUCKET,
      Key: key,
      Body: buffer,
      ContentType: 'image/jpeg',
      CacheControl: 'public, max-age=31536000',
    }));

    return `${R2_PUBLIC}/${key}`;
  } catch (err) {
    console.error('R2 upload error:', err);
    return null;
  }
}

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

    // Upload photo to R2 if provided
    let photoUrl = null;
    if (data.photo) {
      const slug = (data.name || 'anon').toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-');
      const fileName = `${Date.now()}-${slug}.jpg`;
      photoUrl = await uploadPhotoToR2(data.photo, fileName);
    }
    // Build Notion page properties
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
    // Industry (select or rich_text for "other")
    const industryVal = data.industry || '';
    if (industryVal.startsWith('other: ')) {
      properties['Industry'] = {
        select: { name: 'Other' },
      };
      properties['Industry Other'] = {
        rich_text: [{ text: { content: industryVal.replace('other: ', '') } }],
      };
    } else if (INDUSTRY_MAP[industryVal]) {
      properties['Industry'] = {
        select: { name: INDUSTRY_MAP[industryVal] },
      };
    }

    // Communication preference
    if (data.comm_preference) {
      properties['Comm Preference'] = {
        select: { name: data.comm_preference === 'whatsapp' ? 'WhatsApp' : 'Slack' },
      };
    }

    // Social links
    if (data.social_linkedin) {
      properties['LinkedIn'] = { url: data.social_linkedin };
    }
    if (data.social_instagram) {
      properties['Instagram'] = {
        rich_text: [{ text: { content: data.social_instagram } }],
      };
    }
    if (data.social_x) {
      properties['X'] = {
        rich_text: [{ text: { content: data.social_x } }],
      };
    }
    if (data.social_website) {
      properties['Website'] = { url: data.social_website };
    }

    // Add photo URL if uploaded successfully
    if (photoUrl) {
      properties['Profile Photo'] = {
        url: photoUrl,
      };
    }

    // Remove null selects
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

    return res.status(200).json({ success: true, photoUrl });
  } catch (err) {
    console.error('Handler error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
