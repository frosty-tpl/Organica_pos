const { supabase, verifyToken } = require('../lib/db.js');

module.exports = async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    try {
        const user = await verifyToken({ headers: { get: (h) => req.headers[h.toLowerCase()] } });
        if (!user) {
            return res.status(401).json({ success: false, error: 'Unauthorized' });
        }

        const action = req.query.action;

        switch (action) {
            case 'get':
                return await getSettings(req, res);
            case 'save':
                return await saveSettings(req, res, user);
            default:
                return res.status(400).json({ success: false, error: 'Invalid action' });
        }
    } catch (err) {
        console.error('Settings error:', err);
        return res.status(500).json({ success: false, error: err.message });
    }
};

async function getSettings(req, res) {
    const { data, error } = await supabase
        .from('settings')
        .select('key, value');

    if (error) throw error;

    // Convert array to object
    const settings = {};
    data?.forEach(row => {
        settings[row.key] = row.value;
    });

    return res.status(200).json({ success: true, data: settings });
}

async function saveSettings(req, res, user) {
    // Doar admin poate modifica setările
    if (user.role !== 'admin') {
        return res.status(403).json({ success: false, error: 'Admin required' });
    }

    const settings = req.body;

    if (!settings || typeof settings !== 'object') {
        return res.status(400).json({ success: false, error: 'Invalid settings data' });
    }

    // Update each setting
    for (const [key, value] of Object.entries(settings)) {
        const { error } = await supabase
            .from('settings')
            .upsert({ 
                key, 
                value: String(value),
                updated_at: new Date().toISOString()
            }, { 
                onConflict: 'key' 
            });

        if (error) throw error;
    }

    return res.status(200).json({ success: true, message: 'Setări salvate' });
}
