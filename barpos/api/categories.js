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

        const { data, error } = await supabase
            .from('categories')
            .select('*')
            .eq('active', true)
            .order('sort_order')
            .order('name');

        if (error) throw error;

        return res.status(200).json({ success: true, data });
    } catch (err) {
        console.error('Categories error:', err);
        return res.status(500).json({ success: false, error: err.message });
    }
};
