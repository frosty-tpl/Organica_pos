import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_ANON_KEY
);


export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    const action = req.query.action;

    try {
        // GET settings
        if (req.method === 'GET') {
            const { data, error } = await supabase
                .from('settings')
                .select('*');
            
            if (error) throw error;
            
            // Convert to object
            const settings = {};
            for (const row of (data || [])) {
                settings[row.key] = row.value;
            }
            
            return res.json({ success: true, data: settings });
        }

        // SAVE settings
        if (action === 'save' && req.method === 'POST') {
            let body = req.body;
            if (typeof body === 'string') body = JSON.parse(body);
            
            const updates = Object.entries(body).map(([key, value]) => ({
                key,
                value: String(value),
                updated_at: new Date().toISOString()
            }));
            
            const { error } = await supabase
                .from('settings')
                .upsert(updates, { onConflict: 'key' });
            
            if (error) throw error;
            return res.json({ success: true });
        }

        return res.status(400).json({ success: false, error: 'Invalid action' });

    } catch (error) {
        console.error('Settings Error:', error);
        return res.status(500).json({ success: false, error: error.message });
    }
}
