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
            const { data: users, error } = await supabase
                .from('users')
                .select('*')
                .eq('name', username)
                .eq('active', true);
            
            if (error) {
                console.error('Login error:', error);
                return res.status(500).json({ success: false, error: 'Database error' });
            }
            
            const user = users?.find(u => u.password === password);
            
            if (!user) {
                return res.status(401).json({ success: false, error: 'Credențiale invalide' });
            }
            
            // Create session token
            const token = generateToken();
            const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours
            
            // Delete old sessions for this user
            await supabase.from('sessions').delete().eq('user_id', user.id);
            
            // Create new session
            const { error: sessionError } = await supabase.from('sessions').insert({
                token,
                user_id: user.id,
                expires_at: expiresAt.toISOString()
            });
            
            if (sessionError) {
                console.error('Session create error:', sessionError);
            }
            
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
            const { data: sessions, error: sessionError } = await supabase
                .from('sessions')
                .select('*')
                .eq('token', token)
                .gt('expires_at', new Date().toISOString());
            
            if (sessionError || !sessions || sessions.length === 0) {
                return res.status(401).json({ success: false, error: 'Invalid session' });
            }
            
            const session = sessions[0];
            
            // Get user
            const { data: users, error: userError } = await supabase
                .from('users')
                .select('*')
                .eq('id', session.user_id);
            
            if (userError || !users || users.length === 0) {
                return res.status(401).json({ success: false, error: 'User not found' });
            }
            
            const user = users[0];
            
            return res.json({
                success: true,
                data: {
                    user: { 
                        id: user.id, 
                        name: user.name, 
                        role: user.role 
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
