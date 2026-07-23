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
        // GET - List products
        if (req.method === 'GET') {
            const { data, error } = await supabase
                .from('products')
                .select('*')
                .order('name', { ascending: true });
            
            if (error) throw error;
            return res.json({ success: true, data });
        }

        // POST
        if (req.method === 'POST') {
            let body = req.body;
            if (typeof body === 'string') body = JSON.parse(body);

            // CREATE
            if (action === 'create') {
                const { data, error } = await supabase
                    .from('products')
                    .insert({
                        name: body.name,
                        category_id: body.category_id,
                        price: body.price,
                        stock: body.stock || 0,
                        min_stock: body.min_stock || 5,
                        active: true
                    })
                    .select()
                    .single();
                
                if (error) throw error;
                return res.json({ success: true, data });
            }

            // UPDATE
            if (action === 'update') {
                const { data, error } = await supabase
                    .from('products')
                    .update({
                        name: body.name,
                        category_id: body.category_id,
                        price: body.price,
                        stock: body.stock,
                        min_stock: body.min_stock
                    })
                    .eq('id', parseInt(body.id))
                    .select()
                    .single();
                
                if (error) throw error;
                return res.json({ success: true, data });
            }

            // STOCK ADJUSTMENT
            if (action === 'stock') {
                const { data: product } = await supabase
                    .from('products')
                    .select('stock')
                    .eq('id', body.product_id)
                    .single();
                
                let newStock = product.stock;
                if (body.type === 'set') newStock = body.quantity;
                else if (body.type === 'add') newStock += body.quantity;
                else if (body.type === 'remove') newStock -= body.quantity;
                
                const { data, error } = await supabase
                    .from('products')
                    .update({ stock: Math.max(0, newStock) })
                    .eq('id', body.product_id)
                    .select()
                    .single();
                
                if (error) throw error;
                return res.json({ success: true, data });
            }

            // DELETE
            if (action === 'delete') {
                const { error } = await supabase
                    .from('products')
                    .delete()
                    .eq('id', parseInt(body.id));
                
                if (error) throw error;
                return res.json({ success: true });
            }
        }

        return res.status(400).json({ success: false, error: 'Invalid action' });

    } catch (error) {
        console.error('Products Error:', error);
        return res.status(500).json({ success: false, error: error.message });
    }
}
