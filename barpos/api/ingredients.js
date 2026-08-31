const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_ANON_KEY
);

module.exports = async (req, res) => {
    // CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') return res.status(200).end();

    const action = req.query.action || 'list';

    try {
        // LIST
        if (action === 'list') {
            const { data, error } = await supabase
                .from('ingredients')
                .select('*')
                .order('name');
            if (error) throw error;
            return res.json({ success: true, data });
        }

        // CREATE
        if (action === 'create' && req.method === 'POST') {
            let body = req.body;
            if (typeof body === 'string') body = JSON.parse(body);

            const { data, error } = await supabase
                .from('ingredients')
                .insert({
                    name: body.name,
                    unit: body.unit || 'ml',
                    stock: body.stock || 0,
                    min_stock: body.min_stock || 0,
                    cost_per_unit: body.cost_per_unit || 0
                })
                .select()
                .single();
            
            if (error) throw error;
            return res.json({ success: true, data });
        }

        // UPDATE
        if (action === 'update' && req.method === 'POST') {
            let body = req.body;
            if (typeof body === 'string') body = JSON.parse(body);

            const { data, error } = await supabase
                .from('ingredients')
                .update({
                    name: body.name,
                    unit: body.unit,
                    stock: body.stock,
                    min_stock: body.min_stock,
                    cost_per_unit: body.cost_per_unit
                })
                .eq('id', body.id)
                .select()
                .single();
            
            if (error) throw error;
            return res.json({ success: true, data });
        }

        // UPDATE STOCK (pentru aprovizionare)
        if (action === 'update_stock' && req.method === 'POST') {
            let body = req.body;
            if (typeof body === 'string') body = JSON.parse(body);

            const { data: ingredient } = await supabase
                .from('ingredients')
                .select('stock')
                .eq('id', body.id)
                .single();

            const newStock = parseFloat(ingredient.stock) + parseFloat(body.quantity);

            const { data, error } = await supabase
                .from('ingredients')
                .update({ stock: newStock })
                .eq('id', body.id)
                .select()
                .single();
            
            if (error) throw error;
            return res.json({ success: true, data });
        }

        // DELETE
        if (action === 'delete' && req.method === 'POST') {
            let body = req.body;
            if (typeof body === 'string') body = JSON.parse(body);

            const { error } = await supabase
                .from('ingredients')
                .delete()
                .eq('id', body.id);
            
            if (error) throw error;
            return res.json({ success: true });
        }

        // LOW STOCK - ingrediente cu stoc scăzut
        if (action === 'low_stock') {
            const { data, error } = await supabase
                .from('ingredients')
                .select('*')
                .filter('stock', 'lte', supabase.rpc('get_min_stock'))
                .order('name');
            
            // Fallback - ia toate și filtrează manual
            const { data: all, error: allError } = await supabase
                .from('ingredients')
                .select('*')
                .order('name');
            
            if (allError) throw allError;
            
            const lowStock = all.filter(i => parseFloat(i.stock) <= parseFloat(i.min_stock));
            return res.json({ success: true, data: lowStock });
        }

        return res.status(400).json({ success: false, error: 'Invalid action' });

    } catch (e) {
        return res.status(500).json({ success: false, error: e.message });
    }
};
