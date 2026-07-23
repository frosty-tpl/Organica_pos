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
        const fromDate = req.query.from;
        const toDate = req.query.to;
        const userId = req.query.user_id; // Filter by specific user
        
        // Get sales
        let sales = [];
        try {
            sales = await kv.get('pos_sales') || [];
        } catch (e) {
            sales = [];
        }
        
        // Filter by date
        let filteredSales = [...sales];
        
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
        
        // Filter by user if specified
        if (userId && userId !== 'all') {
            filteredSales = filteredSales.filter(s => s.user_id === parseInt(userId));
        }

        // Sales report
        if (action === 'sales') {
            const total = filteredSales.reduce((sum, s) => sum + (s.total || 0), 0);
            const cash = filteredSales.filter(s => s.payment_method === 'cash').reduce((sum, s) => sum + (s.total || 0), 0);
            const card = filteredSales.filter(s => s.payment_method === 'card').reduce((sum, s) => sum + (s.total || 0), 0);
            
            // Top products
            const productStats = {};
            for (const sale of filteredSales) {
                for (const item of (sale.items || [])) {
                    const key = item.product_id;
                    if (!productStats[key]) {
                        productStats[key] = { name: item.name || `Product ${key}`, quantity: 0, revenue: 0 };
                    }
                    productStats[key].quantity += item.quantity;
                    productStats[key].revenue += item.quantity * item.price;
                }
            }
            
            const topProducts = Object.values(productStats)
                .sort((a, b) => b.revenue - a.revenue)
                .slice(0, 10);
            
            // Sales by user (for admin)
            const userStats = {};
            for (const sale of filteredSales) {
                const uId = sale.user_id || 0;
                const uName = sale.user_name || 'Necunoscut';
                if (!userStats[uId]) {
                    userStats[uId] = { user_id: uId, user_name: uName, total: 0, transactions: 0 };
                }
                userStats[uId].total += sale.total || 0;
                userStats[uId].transactions += 1;
            }
            
            const salesByUser = Object.values(userStats).sort((a, b) => b.total - a.total);
            
            return res.json({
                success: true,
                data: {
                    total,
                    cash,
                    card,
                    transactions: filteredSales.length,
                    top_products: topProducts,
                    sales_by_user: salesByUser,
                    sales: filteredSales
                }
            });
        }

        // X Report (without closing)
        if (action === 'x') {
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            
            const todaySales = sales.filter(s => new Date(s.created_at) >= today);
            
            // Filter by user if specified
            let userSales = todaySales;
            if (userId && userId !== 'all') {
                userSales = todaySales.filter(s => s.user_id === parseInt(userId));
            }
            
            const cashSales = userSales.filter(s => s.payment_method === 'cash').reduce((sum, s) => sum + (s.total || 0), 0);
            const cardSales = userSales.filter(s => s.payment_method === 'card').reduce((sum, s) => sum + (s.total || 0), 0);
            
            // Get cash operations
            let cashOps = [];
            try {
                cashOps = await kv.get('pos_cash_ops') || [];
            } catch (e) {}
            
            const todayOps = cashOps.filter(op => new Date(op.created_at) >= today);
            const deposits = todayOps.filter(op => op.type === 'deposit').reduce((sum, op) => sum + op.amount, 0);
            const withdrawals = todayOps.filter(op => op.type === 'withdraw').reduce((sum, op) => sum + op.amount, 0);
            
            // Get opening balance
            let cashStatus = {};
            try {
                cashStatus = await kv.get('pos_cash_status') || { opening: 0 };
            } catch (e) {}
            
            const opening = cashStatus.opening || 0;
            const closing = opening + cashSales + deposits - withdrawals;
            
            return res.json({
                success: true,
                data: {
                    title: 'RAPORT X',
                    date: new Date().toLocaleString('ro-RO'),
                    opening,
                    cash_sales: cashSales,
                    card_sales: cardSales,
                    total_sales: cashSales + cardSales,
                    deposits,
                    withdrawals,
                    closing,
                    transactions: userSales.length
                }
            });
        }

        // Z Report (with closing - admin only)
        if (action === 'z' && req.method === 'POST') {
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            
            const todaySales = sales.filter(s => new Date(s.created_at) >= today);
            const cashSales = todaySales.filter(s => s.payment_method === 'cash').reduce((sum, s) => sum + (s.total || 0), 0);
            const cardSales = todaySales.filter(s => s.payment_method === 'card').reduce((sum, s) => sum + (s.total || 0), 0);
            
            // Get cash operations
            let cashOps = [];
            try {
                cashOps = await kv.get('pos_cash_ops') || [];
            } catch (e) {}
            
            const todayOps = cashOps.filter(op => new Date(op.created_at) >= today);
            const deposits = todayOps.filter(op => op.type === 'deposit').reduce((sum, op) => sum + op.amount, 0);
            const withdrawals = todayOps.filter(op => op.type === 'withdraw').reduce((sum, op) => sum + op.amount, 0);
            
            // Get opening balance
            let cashStatus = {};
            try {
                cashStatus = await kv.get('pos_cash_status') || { opening: 0 };
            } catch (e) {}
            
            const opening = cashStatus.opening || 0;
            const closing = opening + cashSales + deposits - withdrawals;
            
            // Sales by user
            const userStats = {};
            for (const sale of todaySales) {
                const uId = sale.user_id || 0;
                const uName = sale.user_name || 'Necunoscut';
                if (!userStats[uId]) {
                    userStats[uId] = { user_name: uName, total: 0, transactions: 0 };
                }
                userStats[uId].total += sale.total || 0;
                userStats[uId].transactions += 1;
            }
            
            // Reset for next day
            try {
                await kv.set('pos_cash_status', { opening: 0, last_z: new Date().toISOString() });
                // Clear today's cash operations
                const remainingOps = cashOps.filter(op => new Date(op.created_at) < today);
                await kv.set('pos_cash_ops', remainingOps);
            } catch (e) {}
            
            return res.json({
                success: true,
                data: {
                    title: 'RAPORT Z - ÎNCHIDERE ZI',
                    date: new Date().toLocaleString('ro-RO'),
                    opening,
                    cash_sales: cashSales,
                    card_sales: cardSales,
                    total_sales: cashSales + cardSales,
                    deposits,
                    withdrawals,
                    closing,
                    transactions: todaySales.length,
                    sales_by_user: Object.values(userStats)
                }
            });
        }

        return res.status(400).json({ success: false, error: 'Invalid action' });

    } catch (error) {
        console.error('Reports API Error:', error);
        return res.status(500).json({ success: false, error: error.message });
    }
}
