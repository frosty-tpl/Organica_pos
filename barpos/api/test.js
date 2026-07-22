const { supabase } = require('../lib/db.js');

module.exports = async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Content-Type', 'application/json');
    
    try {
        // Test conexiune Supabase
        const { data, error } = await supabase
            .from('users')
            .select('id, name, role, active')
            .eq('name', 'admin')
            .single();
        
        if (error) {
            return res.status(500).json({ 
                success: false, 
                error: error.message,
                details: error 
            });
        }
        
        return res.status(200).json({ 
            success: true, 
            message: 'Conexiune OK!',
            user_found: data
        });
        
    } catch (err) {
        return res.status(500).json({ 
            success: false, 
            error: err.message 
        });
    }
};
