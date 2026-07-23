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
        // LIST - Get all products with inventory info
        if (action === 'list' || req.method === 'GET') {
            let query = supabase
                .from('products')
                .select('*')
                .eq('active', true)
                .order('name', { ascending: true });
            
            // Filter by category
            if (req.query.category_id && req.query.category_id !== '') {
                query = query.eq('category_id', parseInt(req.query.category_id));
            }
            
            // Filter by status
            const status = req.query.status || 'all';
            
            const { data: products, error } = await query;
            
            if (error) throw error;
            
            let filteredProducts = products || [];
            
            // Apply status filter
            if (status === 'ok') {
                filteredProducts = filteredProducts.filter(p => p.stock > (p.min_stock || 5));
            } else if (status === 'low') {
                filteredProducts = filteredProducts.filter(p => p.stock > 0 && p.stock <= (p.min_stock || 5));
            } else if (status === 'out') {
                filteredProducts = filteredProducts.filter(p => p.stock <= 0);
            }
            
            // Calculate stats
            const stats = {
                total: products?.length || 0,
                ok: (products || []).filter(p => p.stock > (p.min_stock || 5)).length,
                low: (products || []).filter(p => p.stock > 0 && p.stock <= (p.min_stock || 5)).length,
                out: (products || []).filter(p => p.stock <= 0).length,
                value: (products || []).reduce((sum, p) => sum + (p.stock || 0) * parseFloat(p.price || 0), 0)
            };
            
            return res.json({ 
                success: true, 
                data: filteredProducts,
                stats: stats
            });
        }

        // ADJUST STOCK
        if (action === 'adjust' && req.method === 'POST') {
            let body = req.body;
            if (typeof body === 'string') body = JSON.parse(body);
            
            const { product_id, type, quantity, reason } = body;
            
            // Get current stock
            const { data: product, error: fetchError } = await supabase
                .from('products')
                .select('stock, name')
                .eq('id', product_id)
                .single();
            
            if (fetchError) throw fetchError;
            
            let newStock = product.stock;
            if (type === 'set') newStock = quantity;
            else if (type === 'add') newStock += quantity;
            else if (type === 'remove') newStock -= quantity;
            
            newStock = Math.max(0, newStock);
            
            // Update stock
            const { data, error } = await supabase
                .from('products')
                .update({ stock: newStock })
                .eq('id', product_id)
                .select()
                .single();
            
            if (error) throw error;
            
            return res.json({ success: true, data });
        }

        return res.status(400).json({ success: false, error: 'Invalid action' });

    } catch (error) {
        console.error('Inventory Error:', error);
        return res.status(500).json({ success: false, error: error.message });
    }
}
