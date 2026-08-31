const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_ANON_KEY
);

module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') return res.status(200).end();

    const action = req.query.action || 'list';
    const productId = req.query.product_id;

    try {
        // GET RECIPE FOR PRODUCT
        if (action === 'get' && productId) {
            const { data, error } = await supabase
                .from('recipes')
                .select('*, ingredient:ingredients(*)')
                .eq('product_id', productId);
            
            if (error) throw error;
            return res.json({ success: true, data });
        }

        // SAVE RECIPE (înlocuiește rețeta existentă)
        if (action === 'save' && req.method === 'POST') {
            let body = req.body;
            if (typeof body === 'string') body = JSON.parse(body);

            const { product_id, ingredients } = body;

            // Șterge rețeta veche
            await supabase
                .from('recipes')
                .delete()
                .eq('product_id', product_id);

            // Inserează noua rețetă
            if (ingredients && ingredients.length > 0) {
                const recipeItems = ingredients.map(ing => ({
                    product_id: product_id,
                    ingredient_id: ing.ingredient_id,
                    quantity: ing.quantity
                }));

                const { error } = await supabase
                    .from('recipes')
                    .insert(recipeItems);
                
                if (error) throw error;
            }

            // Marchează produsul ca fiind complex
            await supabase
                .from('products')
                .update({ product_type: 'complex' })
                .eq('id', product_id);

            return res.json({ success: true });
        }

        // CHECK AVAILABILITY - verifică dacă se poate prepara produsul
        if (action === 'check' && productId) {
            const quantity = parseInt(req.query.quantity) || 1;

            const { data: recipe, error } = await supabase
                .from('recipes')
                .select('*, ingredient:ingredients(*)')
                .eq('product_id', productId);
            
            if (error) throw error;

            if (!recipe || recipe.length === 0) {
                return res.json({ success: true, available: true, missing: [] });
            }

            const missing = [];
            for (const item of recipe) {
                const needed = item.quantity * quantity;
                const available = parseFloat(item.ingredient.stock);
                
                if (available < needed) {
                    missing.push({
                        ingredient: item.ingredient.name,
                        needed: needed,
                        available: available,
                        unit: item.ingredient.unit
                    });
                }
            }

            return res.json({
                success: true,
                available: missing.length === 0,
                missing
            });
        }

        return res.status(400).json({ success: false, error: 'Invalid action' });

    } catch (e) {
        return res.status(500).json({ success: false, error: e.message });
    }
};
