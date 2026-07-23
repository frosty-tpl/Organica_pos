import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_ANON_KEY
);

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

        const action = req.query.action;

        switch (action) {
            case 'list':
                return await getInventoryList(req, res);
            case 'adjust':
                return await adjustStock(req, res, user);
            case 'report':
                return await getInventoryReport(req, res);
            default:
                return res.status(400).json({ success: false, error: 'Invalid action' });
        }
    } catch (err) {
        console.error('Inventory error:', err);
        return res.status(500).json({ success: false, error: err.message });
    }
};

async function getInventoryList(req, res) {
    const categoryId = req.query.category_id;
    const status = req.query.status || 'all';

    let query = supabase
        .from('products')
        .select('*, categories(id, name, icon)')
        .eq('active', true);

    if (categoryId) {
        query = query.eq('category_id', categoryId);
    }

    const { data: products } = await query.order('name');

    // Process products
    let items = products?.map(p => {
        const stockStatus = p.stock <= 0 ? 'out' : p.stock <= 5 ? 'critical' : p.stock <= p.min_stock ? 'low' : 'ok';
        return {
            ...p,
            category_name: p.categories?.name,
            category_icon: p.categories?.icon,
            stock_status: stockStatus,
            stock_value: p.stock * parseFloat(p.price),
            categories: undefined
        };
    }) || [];

    // Filter by status
    if (status !== 'all') {
        items = items.filter(p => p.stock_status === status);
    }

    // Counts
    const allProducts = products || [];
    const counts = {
        total: allProducts.length,
        ok: allProducts.filter(p => p.stock > p.min_stock).length,
        low: allProducts.filter(p => p.stock > 5 && p.stock <= p.min_stock).length,
        critical: allProducts.filter(p => p.stock > 0 && p.stock <= 5).length,
        out: allProducts.filter(p => p.stock <= 0).length
    };

    return res.status(200).json({ success: true, data: { products: items, counts } });
}

async function adjustStock(req, res, user) {
    const { product_id, type, quantity, reason } = req.body;

    if (!product_id) {
        return res.status(400).json({ success: false, error: 'Product ID required' });
    }

    const { data: product } = await supabase
        .from('products')
        .select('*')
        .eq('id', product_id)
        .single();

    if (!product) {
        return res.status(404).json({ success: false, error: 'Product not found' });
    }

    const oldStock = product.stock;
    let newStock = oldStock;
    let change = 0;

    switch (type) {
        case 'set':
            newStock = quantity;
            change = quantity - oldStock;
            break;
        case 'add':
            newStock = oldStock + quantity;
            change = quantity;
            break;
        case 'remove':
            newStock = Math.max(0, oldStock - quantity);
            change = -Math.min(oldStock, quantity);
            break;
        default:
            return res.status(400).json({ success: false, error: 'Invalid adjustment type' });
    }

    await supabase.from('products').update({ stock: newStock, updated_at: new Date().toISOString() }).eq('id', product_id);

    await supabase.from('stock_adjustments').insert({
        product_id,
        user_id: user.user_id,
        type,
        quantity_before: oldStock,
        quantity_change: change,
        quantity_after: newStock,
        reason: reason || 'Ajustare manuală'
    });

    return res.status(200).json({
        success: true,
        data: { product_id, old_stock: oldStock, new_stock: newStock, change },
        message: 'Stock adjusted'
    });
}

async function getInventoryReport(req, res) {
    const { data: products } = await supabase
        .from('products')
        .select('*, categories(name, icon)')
        .eq('active', true)
        .order('name');

    const summary = {
        total_products: products?.length || 0,
        in_stock: products?.filter(p => p.stock > p.min_stock).length || 0,
        low_stock: products?.filter(p => p.stock > 0 && p.stock <= p.min_stock).length || 0,
        out_of_stock: products?.filter(p => p.stock <= 0).length || 0,
        total_value: products?.reduce((s, p) => s + (p.stock * parseFloat(p.price)), 0) || 0
    };

    const stock_problems = products?.filter(p => p.stock <= p.min_stock).map(p => ({
        id: p.id,
        name: p.name,
        stock: p.stock,
        min_stock: p.min_stock,
        problem: p.stock <= 0 ? 'Epuizat' : p.stock <= 5 ? 'Critic' : 'Scăzut'
    })) || [];

    return res.status(200).json({
        success: true,
        data: {
            generated_at: new Date().toISOString(),
            summary,
            stock_problems
        }
    });
}
