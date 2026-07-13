module.exports = async function handler(req, res) {
  // Handle CORS preflight
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { observation, category, severity } = req.body;

  if (!observation || !category || !severity) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'API key not configured' });
  }

  const systemPrompt = `You are an expert home inspection report writer with 20+ years of experience. Write professional, legally appropriate home inspection report language that:
- Uses industry-standard terminology
- Describes the condition specifically and clearly
- Recommends appropriate follow-up action (e.g. licensed roofing contractor, licensed electrician, licensed plumber, licensed HVAC technician)
- Uses third-person passive voice, standard in the home inspection industry
- Is 2-4 sentences, concise but thorough
- For Safety Hazards: clearly states the safety risk and urgency
- For Informational Notes: uses neutral, non-alarmist language
- Output ONLY the report text — no preamble, no labels, no formatting marks`;

  try {
    const anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 1000,
        stream: true,
        system: systemPrompt,
        messages: [{
          role: 'user',
          content: `Category: ${category}\nSeverity: ${severity}\nInspector's field notes: ${observation}\n\nWrite the professional report language:`
        }]
      })
    });

    if (!anthropicRes.ok) {
      const err = await anthropicRes.text();
      console.error('Anthropic error:', err);
      return res.status(500).json({ error: 'AI generation failed' });
    }

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    const reader = anthropicRes.body.getReader();
    const decoder = new TextDecoder();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      res.write(decoder.decode(value, { stream: true }));
    }

    res.end();
  } catch (error) {
    console.error('Handler error:', error);
    res.status(500).json({ error: 'Server error' });
  }
};
