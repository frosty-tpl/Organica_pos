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
        // GET - List sales
        if (req.method === 'GET') {
            let query = supabase
                .from('sales')
                .select('*, sale_items(*)')
                .order('created_at', { ascending: false });
            
            // Filter by user
            if (req.query.user_id && req.query.user_id !== 'all') {
                query = query.eq('user_id', parseInt(req.query.user_id));
            }
            
            // Filter by date
            if (req.query.from) {
                query = query.gte('created_at', req.query.from + 'T00:00:00');
            }
            if (req.query.to) {
                query = query.lte('created_at', req.query.to + 'T23:59:59');
            }
            
            const { data, error } = await query;
            if (error) throw error;
            
            return res.json({ success: true, data });
        }

        // POST - Create sale
        if (req.method === 'POST' && action === 'create') {
            let body = req.body;
            if (typeof body === 'string') body = JSON.parse(body);
            
            // Create sale
            const { data: sale, error: saleError } = await supabase
                .from('sales')
                .insert({
                    total: body.total,
                    payment_method: body.payment_method,
                    cash_received: body.cash_received || 0,
                    user_id: body.user_id,
                    user_name: body.user_name
                })
                .select()
                .single();
            
            if (saleError) throw saleError;
            
            // Create sale items
            const saleItems = body.items.map(item => ({
                sale_id: sale.id,
                product_id: item.product_id,
                product_name: item.name,
                quantity: item.quantity,
                unit_price: item.price
            }));
            
            const { error: itemsError } = await supabase
                .from('sale_items')
                .insert(saleItems);
            
            if (itemsError) throw itemsError;
            
            // Update stock
            for (const item of body.items) {
                await supabase.rpc('decrement_stock', {
                    prod_id: item.product_id,
                    qty: item.quantity
                }).catch(() => {
                    // Fallback if RPC doesn't exist
                    supabase
                        .from('products')
                        .select('stock')
                        .eq('id', item.product_id)
                        .single()
                        .then(({ data }) => {
                            if (data) {
                                supabase
                                    .from('products')
                                    .update({ stock: Math.max(0, data.stock - item.quantity) })
                                    .eq('id', item.product_id);
                            }
                        });
                });
            }
            
            return res.json({ success: true, data: sale });
        }

        return res.status(400).json({ success: false, error: 'Invalid action' });

    } catch (error) {
        console.error('Sales Error:', error);
        return res.status(500).json({ success: false, error: error.message });
    }
}
