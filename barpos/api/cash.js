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
            case 'today-summary':
                return await getTodaySummary(req, res);
            case 'transactions':
                return await getTransactions(req, res);
            case 'deposit':
                return await deposit(req, res, user);
            case 'withdraw':
                return await withdraw(req, res, user);
            default:
                return res.status(400).json({ success: false, error: 'Invalid action' });
        }
    } catch (err) {
        console.error('Cash error:', err);
        return res.status(500).json({ success: false, error: err.message });
    }
};

async function getTodaySummary(req, res) {
    const todayDate = today();
    const startOfDay = `${todayDate}T00:00:00`;
    const endOfDay = `${todayDate}T23:59:59`;

    // Get today's transactions
    const { data: transactions } = await supabase
        .from('cash_transactions')
        .select('*')
        .gte('created_at', startOfDay)
        .lte('created_at', endOfDay);

    // Get current balance
    const { data: lastTx } = await supabase
        .from('cash_transactions')
        .select('balance_after')
        .order('id', { ascending: false })
        .limit(1)
        .single();

    const opening = transactions?.find(t => t.type === 'day_start')?.balance_after || 0;
    const sales = transactions?.filter(t => t.type === 'sale').reduce((s, t) => s + parseFloat(t.amount), 0) || 0;
    const deposits = transactions?.filter(t => t.type === 'deposit').reduce((s, t) => s + parseFloat(t.amount), 0) || 0;
    const withdrawals = transactions?.filter(t => t.type === 'withdraw').reduce((s, t) => s + parseFloat(t.amount), 0) || 0;

    return res.status(200).json({
        success: true,
        data: {
            date: todayDate,
            opening: parseFloat(opening),
            sales,
            deposits,
            withdrawals,
            current: parseFloat(lastTx?.balance_after) || 0
        }
    });
}

async function getTransactions(req, res) {
    const todayDate = today();
    const startOfDay = `${todayDate}T00:00:00`;
    const endOfDay = `${todayDate}T23:59:59`;

    const { data } = await supabase
        .from('cash_transactions')
        .select('*, users(name)')
        .gte('created_at', startOfDay)
        .lte('created_at', endOfDay)
        .order('created_at', { ascending: false });

    const transactions = data?.map(t => ({
        ...t,
        user_name: t.users?.name,
        users: undefined
    })) || [];

    return res.status(200).json({ success: true, data: transactions });
}

async function deposit(req, res, user) {
    const { amount, description } = req.body;

    if (!amount || amount <= 0) {
        return res.status(400).json({ success: false, error: 'Amount must be positive' });
    }

    const { data: lastTx } = await supabase
        .from('cash_transactions')
        .select('balance_after')
        .order('id', { ascending: false })
        .limit(1)
        .single();

    const currentBalance = parseFloat(lastTx?.balance_after) || 0;
    const newBalance = currentBalance + parseFloat(amount);

    await supabase.from('cash_transactions').insert({
        user_id: user.user_id,
        type: 'deposit',
        amount: parseFloat(amount),
        balance_after: newBalance,
        description: description || 'Depunere numerar'
    });

    return res.status(200).json({ success: true, data: { balance: newBalance }, message: 'Deposit successful' });
}

async function withdraw(req, res, user) {
    const { amount, description } = req.body;

    if (!amount || amount <= 0) {
        return res.status(400).json({ success: false, error: 'Amount must be positive' });
    }

    const { data: lastTx } = await supabase
        .from('cash_transactions')
        .select('balance_after')
        .order('id', { ascending: false })
        .limit(1)
        .single();

    const currentBalance = parseFloat(lastTx?.balance_after) || 0;

    if (amount > currentBalance) {
        return res.status(400).json({ success: false, error: 'Fonduri insuficiente' });
    }

    const newBalance = currentBalance - parseFloat(amount);

    await supabase.from('cash_transactions').insert({
        user_id: user.user_id,
        type: 'withdraw',
        amount: parseFloat(amount),
        balance_after: newBalance,
        description: description || 'Retragere numerar'
    });

    return res.status(200).json({ success: true, data: { balance: newBalance }, message: 'Withdrawal successful' });
}
