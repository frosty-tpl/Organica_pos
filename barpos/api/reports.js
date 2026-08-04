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
    const fromDate = req.query.from;
    const toDate = req.query.to;
    const userId = req.query.user_id;

    try {
        // SALES REPORT
        if (action === 'sales') {
            let query = supabase
                .from('sales')
                .select('*, sale_items(*)');
            
            //if (fromDate) query = query.gte('created_at', fromDate + 'T00:00:00');
            //if (toDate) query = query.lte('created_at', toDate + 'T23:59:59');
            if (userId && userId !== 'all') query = query.eq('user_id', parseInt(userId));
            
            const { data: sales, error } = await query;
            if (error) throw error;
            
            const total = sales.reduce((sum, s) => sum + parseFloat(s.total), 0);
            const cash = sales.filter(s => s.payment_method === 'cash').reduce((sum, s) => sum + parseFloat(s.total), 0);
            const card = sales.filter(s => s.payment_method === 'card').reduce((sum, s) => sum + parseFloat(s.total), 0);
            
            // Top products
            const productStats = {};
            for (const sale of sales) {
                for (const item of (sale.sale_items || [])) {
                    const key = item.product_id;
                    if (!productStats[key]) {
                        productStats[key] = { name: item.product_name, quantity: 0, revenue: 0 };
                    }
                    productStats[key].quantity += item.quantity;
                    productStats[key].revenue += item.quantity * parseFloat(item.unit_price || item.price || 0);

                }
            }
            
            const topProducts = Object.values(productStats)
                .sort((a, b) => b.revenue - a.revenue)
                .slice(0, 10);
            
           // Sales by user
        const userStats = {};
        for (const sale of sales) {
        const uName = sale.user_name || 'Necunoscut';
        if (!userStats[uName]) {
            userStats[uName] = { user_id: sale.user_id || 0, user_name: uName, total: 0, transactions: 0 };
            }
        userStats[uName].total += parseFloat(sale.total);
        userStats[uName].transactions += 1;
            }

            
            return res.json({
                success: true,
                data: {
                    total,
                    cash,
                    card,
                    transactions: sales.length,
                    top_products: topProducts,
                    sales_by_user: Object.values(userStats).sort((a, b) => b.total - a.total)
                }
            });
        }

        // X REPORT
        if (action === 'x') {
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            const todayStr = today.toISOString();
            
            const { data: sales } = await supabase
                .from('sales')
                .select('*')
                .gte('created_at', todayStr);
            
            const { data: ops } = await supabase
                .from('cash_operations')
                .select('*')
                .gte('created_at', todayStr);
            
            const { data: setting } = await supabase
                .from('settings')
                .select('value')
                .eq('key', 'cash_opening')
                .single();
            
            const opening = parseFloat(setting?.value || 0);
            const cashSales = (sales || []).filter(s => s.payment_method === 'cash').reduce((sum, s) => sum + parseFloat(s.total), 0);
            const cardSales = (sales || []).filter(s => s.payment_method === 'card').reduce((sum, s) => sum + parseFloat(s.total), 0);
            const deposits = (ops || []).filter(o => o.type === 'deposit').reduce((sum, o) => sum + parseFloat(o.amount), 0);
            const withdrawals = (ops || []).filter(o => o.type === 'withdraw').reduce((sum, o) => sum + Math.abs(parseFloat(o.amount)), 0);
            
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
                    closing: opening + cashSales + deposits - withdrawals,
                    transactions: (sales || []).length
                }
            });
        }

        // Z REPORT
        if (action === 'z' && req.method === 'POST') {
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            const todayStr = today.toISOString();
            
            const { data: sales } = await supabase
                .from('sales')
                .select('*')
                .gte('created_at', todayStr);
            
            const { data: ops } = await supabase
                .from('cash_operations')
                .select('*')
                .gte('created_at', todayStr);
            
            const { data: setting } = await supabase
                .from('settings')
                .select('value')
                .eq('key', 'cash_opening')
                .single();
            
            const opening = parseFloat(setting?.value || 0);
            const cashSales = (sales || []).filter(s => s.payment_method === 'cash').reduce((sum, s) => sum + parseFloat(s.total), 0);
            const cardSales = (sales || []).filter(s => s.payment_method === 'card').reduce((sum, s) => sum + parseFloat(s.total), 0);
            const deposits = (ops || []).filter(o => o.type === 'deposit').reduce((sum, o) => sum + parseFloat(o.amount), 0);
            const withdrawals = (ops || []).filter(o => o.type === 'withdraw').reduce((sum, o) => sum + Math.abs(parseFloat(o.amount)), 0);
            const closing = opening + cashSales + deposits - withdrawals;
            
            // Reset opening for next day
            await supabase
                .from('settings')
                .upsert({ key: 'cash_opening', value: '0', updated_at: new Date().toISOString() });
            
            // Sales by user
            const userStats = {};
            for (const sale of (sales || [])) {
                const uName = sale.user_name || 'Necunoscut';
                if (!userStats[uName]) {
                    userStats[uName] = { user_name: uName, total: 0, transactions: 0 };
                }
                userStats[uName].total += parseFloat(sale.total);
                userStats[uName].transactions += 1;
            }
            
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
                    transactions: (sales || []).length,
                    sales_by_user: Object.values(userStats)
                }
            });
        }

        return res.status(400).json({ success: false, error: 'Invalid action' });

    } catch (error) {
        console.error('Reports Error:', error);
        return res.status(500).json({ success: false, error: error.message });
    }
}
