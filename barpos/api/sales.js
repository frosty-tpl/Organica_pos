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

        const action = req.query.action;

        switch (action) {
            case 'create':
                return await createSale(req, res, user);
            case 'today':
                return await getTodaySales(req, res);
            default:
                return res.status(400).json({ success: false, error: 'Invalid action' });
        }
    } catch (err) {
        console.error('Sales error:', err);
        return res.status(500).json({ success: false, error: err.message });
    }
};

async function createSale(req, res, user) {
    const { items, payment_method, cash_received, card_received } = req.body;

    if (!items || items.length === 0) {
        return res.status(400).json({ success: false, error: 'No items in sale' });
    }

    // Generate sale number
    const { count } = await supabase
        .from('sales')
        .select('*', { count: 'exact', head: true });

    const saleNumber = `V${today().replace(/-/g, '')}-${String((count || 0) + 1).padStart(6, '0')}`;

    // Calculate total and validate stock
    let total = 0;
    const productDetails = [];

    for (const item of items) {
        const { data: product } = await supabase
            .from('products')
            .select('id, name, price, stock')
            .eq('id', item.product_id)
            .single();

        if (!product) {
            return res.status(400).json({ success: false, error: `Product ${item.product_id} not found` });
        }

        if (product.stock < item.quantity) {
            return res.status(400).json({ success: false, error: `Stoc insuficient pentru ${product.name}` });
        }

        const itemTotal = parseFloat(product.price) * item.quantity;
        total += itemTotal;

        productDetails.push({
            ...item,
            name: product.name,
            price: parseFloat(product.price),
            total: itemTotal,
            currentStock: product.stock
        });
    }

    // Calculate change
    const cashAmount = parseFloat(cash_received) || 0;
    const change = payment_method === 'cash' ? Math.max(0, cashAmount - total) : 0;

    // Create sale
    const { data: sale, error: saleError } = await supabase
        .from('sales')
        .insert({
            sale_number: saleNumber,
            user_id: user.user_id,
            total,
            payment_method,
            cash_received: cashAmount,
            card_received: card_received || 0,
            change_given: change
        })
        .select()
        .single();

    if (saleError) throw saleError;

    // Add items and update stock
    for (const item of productDetails) {
        // Add sale item
        await supabase.from('sale_items').insert({
            sale_id: sale.id,
            product_id: item.product_id,
            product_name: item.name,
            quantity: item.quantity,
            unit_price: item.price,
            total: item.total
        });

        // Update stock
        const newStock = item.currentStock - item.quantity;
        await supabase.from('products').update({ stock: newStock }).eq('id', item.product_id);

        // Log stock adjustment
        await supabase.from('stock_adjustments').insert({
            product_id: item.product_id,
            user_id: user.user_id,
            type: 'sale',
            quantity_before: item.currentStock,
            quantity_change: -item.quantity,
            quantity_after: newStock,
            reason: `Vânzare ${saleNumber}`,
            reference_type: 'sale',
            reference_id: sale.id
        });
    }

    // Update cash for cash payments
    if (payment_method === 'cash' || payment_method === 'mixed') {
        const cashIn = cashAmount - change;

        const { data: lastTx } = await supabase
            .from('cash_transactions')
            .select('balance_after')
            .order('id', { ascending: false })
            .limit(1)
            .single();

        const currentBalance = parseFloat(lastTx?.balance_after) || 0;
        const newBalance = currentBalance + cashIn;

        await supabase.from('cash_transactions').insert({
            user_id: user.user_id,
            type: 'sale',
            amount: cashIn,
            balance_after: newBalance,
            reference_id: sale.id,
            description: `Vânzare ${saleNumber}`
        });
    }

    return res.status(200).json({
        success: true,
        message: 'Sale completed',
        data: { sale, items: productDetails }
    });
}

async function getTodaySales(req, res) {
    const todayDate = today();
    const startOfDay = `${todayDate}T00:00:00`;
    const endOfDay = `${todayDate}T23:59:59`;

    const { data: sales } = await supabase
        .from('sales')
        .select('*')
        .gte('created_at', startOfDay)
        .lte('created_at', endOfDay)
        .eq('status', 'completed');

    const summary = {
        count: sales?.length || 0,
        total: sales?.reduce((s, sale) => s + parseFloat(sale.total), 0) || 0,
        cash: sales?.filter(s => s.payment_method === 'cash').reduce((s, sale) => s + parseFloat(sale.total), 0) || 0,
        card: sales?.filter(s => s.payment_method === 'card').reduce((s, sale) => s + parseFloat(sale.total), 0) || 0
    };

    return res.status(200).json({ success: true, data: { date: todayDate, summary, recent: sales?.slice(0, 10) || [] } });
}
