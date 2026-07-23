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
    const catId = req.query.id;

    try {
        // GET - List or single category
        if (req.method === 'GET') {
            if (catId) {
                const { data, error } = await supabase
                    .from('categories')
                    .select('*')
                    .eq('id', parseInt(catId))
                    .single();
                
                if (error) throw error;
                return res.json({ success: true, data });
            }
            
            const { data, error } = await supabase
                .from('categories')
                .select('*')
                .order('sort_order', { ascending: true });
            
            if (error) throw error;
            return res.json({ success: true, data: data || [] });
        }

        // POST - Create, Update, Delete
        if (req.method === 'POST') {
            let body = req.body;
            if (typeof body === 'string') body = JSON.parse(body);

            // CREATE
            if (action === 'create') {
                const { data, error } = await supabase
                    .from('categories')
                    .insert({
                        name: body.name,
                        icon: body.icon || ':box:',
                        sort_order: body.sort_order || 0
                    })
                    .select()
                    .single();
                
                if (error) throw error;
                return res.json({ success: true, data });
            }

            // UPDATE
            if (action === 'update') {
                const { data, error } = await supabase
                    .from('categories')
                    .update({
                        name: body.name,
                        icon: body.icon,
                        sort_order: body.sort_order
                    })
                    .eq('id', parseInt(body.id))
                    .select()
                    .single();
                
                if (error) throw error;
                return res.json({ success: true, data });
            }

            // DELETE
            if (action === 'delete') {
                const { error } = await supabase
                    .from('categories')
                    .delete()
                    .eq('id', parseInt(body.id));
                
                if (error) throw error;
                return res.json({ success: true });
            }
        }

        return res.status(400).json({ success: false, error: 'Invalid action' });

    } catch (error) {
        console.error('Categories Error:', error);
        return res.status(500).json({ success: false, error: error.message });
    }
}
