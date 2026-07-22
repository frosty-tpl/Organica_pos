const { supabase, verifyToken, today } = require('../lib/db.js');

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

        switch (req.method) {
            case 'GET':
                return await getProducts(req, res);
            case 'POST':
                return await createProduct(req, res, user);
            case 'PUT':
                return await updateProduct(req, res, user);
            case 'DELETE':
                return await deleteProduct(req, res, user);
            default:
                return res.status(405).json({ success: false, error: 'Method not allowed' });
        }
    } catch (err) {
        console.error('Products error:', err);
        return res.status(500).json({ success: false, error: err.message });
    }
};

async function getProducts(req, res) {
    const categoryId = req.query.category_id;

    let query = supabase
        .from('products')
        .select(`
            *,
            categories (
                id,
                name,
                icon
            )
        `)
        .eq('active', true);

    if (categoryId) {
        query = query.eq('category_id', categoryId);
    }

    const { data, error } = await query.order('name');

    if (error) throw error;

    // Flatten the response
    const products = data.map(p => ({
        ...p,
        category_name: p.categories?.name,
        category_icon: p.categories?.icon,
        categories: undefined
    }));

    return res.status(200).json({ success: true, data: products });
}

async function createProduct(req, res, user) {
    if (user.role !== 'admin') {
        return res.status(403).json({ success: false, error: 'Admin required' });
    }

    const { name, category_id, price, stock, min_stock } = req.body;

    if (!name || !category_id || price === undefined) {
        return res.status(400).json({ success: false, error: 'Missing required fields' });
    }

    const { data, error } = await supabase
        .from('products')
        .insert({
            name,
            category_id,
            price,
            stock: stock || 0,
            min_stock: min_stock || 10
        })
        .select()
        .single();

    if (error) throw error;

    // Log initial stock
    if (stock > 0) {
        await supabase.from('stock_adjustments').insert({
            product_id: data.id,
            user_id: user.user_id,
            type: 'set',
            quantity_before: 0,
            quantity_change: stock,
            quantity_after: stock,
            reason: 'Stoc inițial la creare produs'
        });
    }

    return res.status(200).json({ success: true, data: { id: data.id }, message: 'Product created' });
}

async function updateProduct(req, res, user) {
    if (user.role !== 'admin') {
        return res.status(403).json({ success: false, error: 'Admin required' });
    }

    const { id, name, category_id, price, stock, min_stock } = req.body;

    if (!id) {
        return res.status(400).json({ success: false, error: 'Product ID required' });
    }

    // Get current product
    const { data: current } = await supabase
        .from('products')
        .select('*')
        .eq('id', id)
        .single();

    if (!current) {
        return res.status(404).json({ success: false, error: 'Product not found' });
    }

    // Update product
    const { error } = await supabase
        .from('products')
        .update({
            name,
            category_id,
            price,
            min_stock: min_stock || 10,
            updated_at: new Date().toISOString()
        })
        .eq('id', id);

    if (error) throw error;

    // Handle stock change
    if (stock !== undefined && stock !== current.stock) {
        const change = stock - current.stock;
        
        await supabase.from('products').update({ stock }).eq('id', id);
        
        await supabase.from('stock_adjustments').insert({
            product_id: id,
            user_id: user.user_id,
            type: 'set',
            quantity_before: current.stock,
            quantity_change: change,
            quantity_after: stock,
            reason: 'Actualizare din editare produs'
        });
    }

    return res.status(200).json({ success: true, message: 'Product updated' });
}

async function deleteProduct(req, res, user) {
    if (user.role !== 'admin') {
        return res.status(403).json({ success: false, error: 'Admin required' });
    }

    const id = req.query.id;
    if (!id) {
        return res.status(400).json({ success: false, error: 'Product ID required' });
    }

    // Check if has sales
    const { count } = await supabase
        .from('sale_items')
        .select('*', { count: 'exact', head: true })
        .eq('product_id', id);

    if (count > 0) {
        // Soft delete
        await supabase.from('products').update({ active: false }).eq('id', id);
        return res.status(200).json({ success: true, message: 'Product deactivated' });
    } else {
        await supabase.from('stock_adjustments').delete().eq('product_id', id);
        await supabase.from('products').delete().eq('id', id);
        return res.status(200).json({ success: true, message: 'Product deleted' });
    }
}
