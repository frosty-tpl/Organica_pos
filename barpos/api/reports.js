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
            case 'sales':
                return await getSalesReport(req, res);
            case 'top-products':
                return await getTopProducts(req, res);
            case 'x-report':
                return await generateXReport(req, res, user);
            case 'z-report':
                return await generateZReport(req, res, user);
            default:
                return res.status(400).json({ success: false, error: 'Invalid action' });
        }
    } catch (err) {
        console.error('Reports error:', err);
        return res.status(500).json({ success: false, error: err.message });
    }
};

async function getSalesReport(req, res) {
    const dateFrom = req.query.date_from || today();
    const dateTo = req.query.date_to || today();

    const { data: sales } = await supabase
        .from('sales')
        .select('*')
        .gte('created_at', `${dateFrom}T00:00:00`)
        .lte('created_at', `${dateTo}T23:59:59`)
        .eq('status', 'completed');

    const summary = {
        total_transactions: sales?.length || 0,
        total_sales: sales?.reduce((s, sale) => s + parseFloat(sale.total), 0) || 0,
        cash_sales: sales?.filter(s => s.payment_method === 'cash').reduce((s, sale) => s + parseFloat(sale.total), 0) || 0,
        card_sales: sales?.filter(s => s.payment_method === 'card').reduce((s, sale) => s + parseFloat(sale.total), 0) || 0
    };

    return res.status(200).json({
        success: true,
        data: { period: { from: dateFrom, to: dateTo }, summary }
    });
}

async function getTopProducts(req, res) {
    const dateFrom = req.query.date_from || today();
    const dateTo = req.query.date_to || today();

    // Get sales in period
    const { data: sales } = await supabase
        .from('sales')
        .select('id')
        .gte('created_at', `${dateFrom}T00:00:00`)
        .lte('created_at', `${dateTo}T23:59:59`)
        .eq('status', 'completed');

    const saleIds = sales?.map(s => s.id) || [];

    if (saleIds.length === 0) {
        return res.status(200).json({ success: true, data: [] });
    }

    // Get sale items
    const { data: items } = await supabase
        .from('sale_items')
        .select('product_id, product_name, quantity, total')
        .in('sale_id', saleIds);

    // Aggregate
    const productMap = {};
    items?.forEach(item => {
        if (!productMap[item.product_id]) {
            productMap[item.product_id] = {
                name: item.product_name,
                quantity: 0,
                revenue: 0
            };
        }
        productMap[item.product_id].quantity += item.quantity;
        productMap[item.product_id].revenue += parseFloat(item.total);
    });

    // Get categories
    const productIds = Object.keys(productMap);
    const { data: products } = await supabase
        .from('products')
        .select('id, categories(name, icon)')
        .in('id', productIds);

    const result = Object.entries(productMap)
        .map(([id, data]) => {
            const prod = products?.find(p => p.id == id);
            return {
                id: parseInt(id),
                name: data.name,
                category: prod?.categories?.name || '',
                category_icon: prod?.categories?.icon || '📦',
                quantity: data.quantity,
                revenue: data.revenue
            };
        })
        .sort((a, b) => b.quantity - a.quantity)
        .slice(0, 20);

    return res.status(200).json({ success: true, data: result });
}

async function generateXReport(req, res, user) {
    const todayDate = today();
    const startOfDay = `${todayDate}T00:00:00`;
    const endOfDay = `${todayDate}T23:59:59`;

    // Sales
    const { data: sales } = await supabase
        .from('sales')
        .select('*')
        .gte('created_at', startOfDay)
        .lte('created_at', endOfDay)
        .eq('status', 'completed');

    const salesData = {
        transactions: sales?.length || 0,
        total: sales?.reduce((s, sale) => s + parseFloat(sale.total), 0) || 0,
        cash: sales?.filter(s => s.payment_method === 'cash').reduce((s, sale) => s + parseFloat(sale.total), 0) || 0,
        card: sales?.filter(s => s.payment_method === 'card').reduce((s, sale) => s + parseFloat(sale.total), 0) || 0
    };

    // Cash
    const { data: transactions } = await supabase
        .from('cash_transactions')
        .select('*')
        .gte('created_at', startOfDay)
        .lte('created_at', endOfDay);

    const { data: lastTx } = await supabase
        .from('cash_transactions')
        .select('balance_after')
        .order('id', { ascending: false })
        .limit(1)
        .single();

    const cashData = {
        opening: transactions?.find(t => t.type === 'day_start')?.balance_after || 0,
        deposits: transactions?.filter(t => t.type === 'deposit').reduce((s, t) => s + parseFloat(t.amount), 0) || 0,
        withdrawals: transactions?.filter(t => t.type === 'withdraw').reduce((s, t) => s + parseFloat(t.amount), 0) || 0,
        current: parseFloat(lastTx?.balance_after) || 0
    };

    // Log X report
    await supabase.from('cash_transactions').insert({
        user_id: user.user_id,
        type: 'report_x',
        amount: 0,
        balance_after: cashData.current,
        description: `Raport X - ${new Date().toLocaleTimeString('ro-RO')}`
    });

    return res.status(200).json({
        success: true,
        data: {
            report_type: 'X',
            date: todayDate,
            time: new Date().toLocaleTimeString('ro-RO'),
            operator: user.name,
            sales: salesData,
            cash: cashData
        }
    });
}

async function generateZReport(req, res, user) {
    if (user.role !== 'admin') {
        return res.status(403).json({ success: false, error: 'Admin required' });
    }

    const todayDate = today();
    const startOfDay = `${todayDate}T00:00:00`;
    const endOfDay = `${todayDate}T23:59:59`;

    // Check if already generated
    const { data: existing } = await supabase
        .from('daily_reports')
        .select('*')
        .eq('report_date', todayDate)
        .eq('status', 'closed')
        .single();

    if (existing) {
        return res.status(400).json({ success: false, error: 'Raportul Z a fost deja generat pentru azi' });
    }

    // Sales
    const { data: sales } = await supabase
        .from('sales')
        .select('*')
        .gte('created_at', startOfDay)
        .lte('created_at', endOfDay)
        .eq('status', 'completed');

    // Products sold
    const saleIds = sales?.map(s => s.id) || [];
    let totalProductsSold = 0;
    if (saleIds.length > 0) {
        const { data: items } = await supabase
            .from('sale_items')
            .select('quantity')
            .in('sale_id', saleIds);
        totalProductsSold = items?.reduce((s, i) => s + i.quantity, 0) || 0;
    }

    // Cash
    const { data: transactions } = await supabase
        .from('cash_transactions')
        .select('*')
        .gte('created_at', startOfDay)
        .lte('created_at', endOfDay);

    const { data: lastTx } = await supabase
        .from('cash_transactions')
        .select('balance_after')
        .order('id', { ascending: false })
        .limit(1)
        .single();

    const report = {
        report_date: todayDate,
        user_id: user.user_id,
        opening_cash: transactions?.find(t => t.type === 'day_start')?.balance_after || 0,
        closing_cash: parseFloat(lastTx?.balance_after) || 0,
        total_sales: sales?.reduce((s, sale) => s + parseFloat(sale.total), 0) || 0,
        total_cash_sales: sales?.filter(s => s.payment_method === 'cash').reduce((s, sale) => s + parseFloat(sale.total), 0) || 0,
        total_card_sales: sales?.filter(s => s.payment_method === 'card').reduce((s, sale) => s + parseFloat(sale.total), 0) || 0,
        total_transactions: sales?.length || 0,
        total_products_sold: totalProductsSold,
        total_deposits: transactions?.filter(t => t.type === 'deposit').reduce((s, t) => s + parseFloat(t.amount), 0) || 0,
        total_withdrawals: transactions?.filter(t => t.type === 'withdraw').reduce((s, t) => s + parseFloat(t.amount), 0) || 0,
        status: 'closed',
        closed_at: new Date().toISOString()
    };

    // Upsert daily report
    await supabase.from('daily_reports').upsert(report, { onConflict: 'report_date' });

    // Log Z report
    await supabase.from('cash_transactions').insert({
        user_id: user.user_id,
        type: 'report_z',
        amount: 0,
        balance_after: report.closing_cash,
        description: `Raport Z - ${todayDate}`
    });

    return res.status(200).json({
        success: true,
        message: 'Z Report generated',
        data: { report_type: 'Z', report }
    });
}
