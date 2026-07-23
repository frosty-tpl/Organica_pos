import { kv } from '@vercel/kv';

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    try {
        const action = req.query.action;
        
        // Get sales from KV or use empty array
        let sales = [];
        try {
            sales = await kv.get('pos_sales') || [];
        } catch (e) {
            console.error('KV read error:', e);
            sales = [];
        }

        // GET - List sales
        if (req.method === 'GET') {
            const userId = req.query.user_id;
            const fromDate = req.query.from;
            const toDate = req.query.to;
            
            let filteredSales = [...sales];
            
            // Filter by user if specified (for non-admin)
            if (userId) {
                filteredSales = filteredSales.filter(s => s.user_id === parseInt(userId));
            }
            
            // Filter by date range
            if (fromDate) {
                const from = new Date(fromDate);
                from.setHours(0, 0, 0, 0);
                filteredSales = filteredSales.filter(s => new Date(s.created_at) >= from);
            }
            
            if (toDate) {
                const to = new Date(toDate);
                to.setHours(23, 59, 59, 999);
                filteredSales = filteredSales.filter(s => new Date(s.created_at) <= to);
            }
            
            // Sort by date descending
            filteredSales.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
            
            return res.json({ success: true, data: filteredSales });
        }

        // POST - Create sale
        if (req.method === 'POST' && action === 'create') {
            let body = req.body;
            if (typeof body === 'string') {
                body = JSON.parse(body);
            }
            
            const newSale = {
                id: Date.now(),
                items: body.items,
                total: body.total,
                payment_method: body.payment_method,
                cash_received: body.cash_received || 0,
                user_id: body.user_id,
                user_name: body.user_name,
                created_at: new Date().toISOString()
            };
            
            sales.push(newSale);
            
            // Save to KV
            try {
                await kv.set('pos_sales', sales);
            } catch (e) {
                console.error('KV write error:', e);
            }
            
            // Update product stock
            try {
                let products = await kv.get('pos_products') || [];
                for (const item of body.items) {
                    const prodIndex = products.findIndex(p => p.id === item.product_id);
                    if (prodIndex !== -1) {
                        products[prodIndex].stock -= item.quantity;
                    }
                }
                await kv.set('pos_products', products);
            } catch (e) {
                console.error('Stock update error:', e);
            }
            
            return res.json({ success: true, data: newSale });
        }

        return res.status(400).json({ success: false, error: 'Invalid action' });

    } catch (error) {
        console.error('Sales API Error:', error);
        return res.status(500).json({ success: false, error: error.message });
    }
}
