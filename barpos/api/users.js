import { supabase } from './lib/supabase.js';

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    const action = req.query.action;
    const userId = req.query.id;

    try {
        // GET - List all users or single user
        if (req.method === 'GET') {
            if (userId) {
                const { data, error } = await supabase
                    .from('users')
                    .select('*')
                    .eq('id', parseInt(userId))
                    .single();
                
                if (error) throw error;
                return res.json({ success: true, data });
            }
            
            const { data, error } = await supabase
                .from('users')
                .select('*')
                .order('id', { ascending: true });
            
            if (error) throw error;
            return res.json({ success: true, data });
        }

        // POST - Create, Update, Delete
        if (req.method === 'POST') {
            let body = req.body;
            if (typeof body === 'string') body = JSON.parse(body);

            // CREATE
            if (action === 'create') {
                const { data, error } = await supabase
                    .from('users')
                    .insert({
                        name: body.name,
                        password: body.password,
                        role: body.role || 'operator',
                        active: true
                    })
                    .select()
                    .single();
                
                if (error) {
                    if (error.code === '23505') {
                        return res.status(400).json({ success: false, error: 'Utilizatorul există deja' });
                    }
                    throw error;
                }
                return res.json({ success: true, data });
            }

            // UPDATE
            if (action === 'update') {
                const { data, error } = await supabase
                    .from('users')
                    .update({
                        name: body.name,
                        password: body.password,
                        role: body.role,
                        active: body.active
                    })
                    .eq('id', parseInt(body.id))
                    .select()
                    .single();
                
                if (error) throw error;
                return res.json({ success: true, data });
            }

            // DELETE
            if (action === 'delete') {
                // Check if last admin
                const { data: admins } = await supabase
                    .from('users')
                    .select('id')
                    .eq('role', 'admin');
                
                const { data: userToDelete } = await supabase
                    .from('users')
                    .select('role')
                    .eq('id', parseInt(body.id))
                    .single();
                
                if (userToDelete?.role === 'admin' && admins?.length <= 1) {
                    return res.status(400).json({ success: false, error: 'Nu poți șterge ultimul admin' });
                }
                
                const { error } = await supabase
                    .from('users')
                    .delete()
                    .eq('id', parseInt(body.id));
                
                if (error) throw error;
                return res.json({ success: true });
            }
        }

        return res.status(400).json({ success: false, error: 'Invalid action' });

    } catch (error) {
        console.error('Users Error:', error);
        return res.status(500).json({ success: false, error: error.message });
    }
}
