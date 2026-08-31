import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_ANON_KEY
);

// Funcție pentru scăderea ingredientelor din stoc
async function decrementIngredients(productId, quantity) {
    // Verifică dacă produsul e complex
    const { data: product } = await supabase
        .from('products')
        .select('product_type')
        .eq('id', productId)
        .single();
    
    if (product?.product_type !== 'complex') {
        return; // Produs simplu, nu are rețetă
    }

    // Ia rețeta
    const { data: recipe } = await supabase
        .from('recipes')
        .select('ingredient_id, quantity')
        .eq('product_id', productId);
    
    if (!recipe || recipe.length === 0) return;

    // Scade fiecare ingredient
    for (const item of recipe) {
        const { data: ingredient } = await supabase
            .from('ingredients')
            .select('stock')
            .eq('id', item.ingredient_id)
            .single();
        
        if (ingredient) {
            const newStock = parseFloat(ingredient.stock) - (item.quantity * quantity);
            await supabase
                .from('ingredients')
                .update({ stock: Math.max(0, newStock) })
                .eq('id', item.ingredient_id);
        }
    }
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
                unit_price: item.price,
                total: item.price * item.quantity
            }));
            
            const { error: itemsError } = await supabase
                .from('sale_items')
                .insert(saleItems);
            
            if (itemsError) throw itemsError;
            
// Update stock for each item
for (const item of body.items) {
    const { data: product } = await supabase
        .from('products')
        .select('stock, product_type')
        .eq('id', item.product_id)
        .single();
    
    if (product) {
        if (product.product_type === 'complex') {
            // Produs complex - scade ingredientele
            await decrementIngredients(item.product_id, item.quantity);
        } else {
            // Produs simplu - scade stocul produsului
            await supabase
                .from('products')
                .update({ stock: product.stock - item.quantity })
                .eq('id', item.product_id);
        }
    }
}

            
            return res.json({ success: true, data: sale });
        }

        return res.status(400).json({ success: false, error: 'Invalid action' });

    } catch (error) {
        console.error('Sales Error:', error);
        return res.status(500).json({ success: false, error: error.message });
    }
}
