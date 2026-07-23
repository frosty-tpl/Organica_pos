import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_ANON_KEY
);


function generateToken() {
    return 'tok_' + Math.random().toString(36).substr(2) + Date.now().toString(36);
}

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    const action = req.query.action;

    try {
        // LOGIN
        if (action === 'login' && req.method === 'POST') {
            let body = req.body;
            if (typeof body === 'string') body = JSON.parse(body);
            
            const { username, password } = body;
            
            // Find user
            const { data: user, error } = await supabase
                .from('users')
                .select('*')
                .eq('name', username)
                .eq('password', password)
                .eq('active', true)
                .single();
            
            if (error || !user) {
                return res.status(401).json({ success: false, error: 'Credențiale invalide' });
            }
            
            // Create session token
            const token = generateToken();
            const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours
            
            await supabase.from('sessions').insert({
                token,
                user_id: user.id,
                expires_at: expiresAt.toISOString()
            });
            
            return res.json({
                success: true,
                data: {
                    token,
                    user: { id: user.id, name: user.name, role: user.role }
                }
            });
        }

        // CHECK AUTH
        if (action === 'check') {
            const authHeader = req.headers.authorization;
            if (!authHeader || !authHeader.startsWith('Bearer ')) {
                return res.status(401).json({ success: false, error: 'No token' });
            }
            
            const token = authHeader.split(' ')[1];
            
            // Find session
            const { data: session, error } = await supabase
                .from('sessions')
                .select('*, users(*)')
                .eq('token', token)
                .gt('expires_at', new Date().toISOString())
                .single();
            
            if (error || !session) {
                return res.status(401).json({ success: false, error: 'Invalid session' });
            }
            
            return res.json({
                success: true,
                data: {
                    user: { 
                        id: session.users.id, 
                        name: session.users.name, 
                        role: session.users.role 
                    }
                }
            });
        }

        // LOGOUT
        if (action === 'logout' && req.method === 'POST') {
            const authHeader = req.headers.authorization;
            if (authHeader && authHeader.startsWith('Bearer ')) {
                const token = authHeader.split(' ')[1];
                await supabase.from('sessions').delete().eq('token', token);
            }
            return res.json({ success: true });
        }

        return res.status(400).json({ success: false, error: 'Invalid action' });

    } catch (error) {
        console.error('Auth Error:', error);
        return res.status(500).json({ success: false, error: error.message });
    }
}
