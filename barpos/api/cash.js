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

    try {
        // Get today's date range
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const todayStr = today.toISOString();

        // SUMMARY
        if (action === 'summary') {
            // Get today's cash sales
            const { data: sales } = await supabase
                .from('sales')
                .select('total, payment_method')
                .gte('created_at', todayStr)
                .eq('payment_method', 'cash');
            
            const salesTotal = (sales || []).reduce((sum, s) => sum + parseFloat(s.total), 0);
            
            // Get today's cash operations
            const { data: ops } = await supabase
                .from('cash_operations')
                .select('*')
                .gte('created_at', todayStr);
            
            const deposits = (ops || []).filter(o => o.type === 'deposit').reduce((sum, o) => sum + parseFloat(o.amount), 0);
            const withdrawals = (ops || []).filter(o => o.type === 'withdraw').reduce((sum, o) => sum + parseFloat(o.amount), 0);
            
            // Get opening balance from settings
            const { data: setting } = await supabase
                .from('settings')
                .select('value')
                .eq('key', 'cash_opening')
                .single();
            
            const opening = parseFloat(setting?.value || 0);
            const current = opening + salesTotal + deposits - withdrawals;
            
            return res.json({
                success: true,
                data: {
                    opening,
                    sales: salesTotal,
                    deposits,
                    withdrawals,
                    current
                }
            });
        }

        // TRANSACTIONS
        if (action === 'transactions') {
            const { data, error } = await supabase
                .from('cash_operations')
                .select('*')
                .gte('created_at', todayStr)
                .order('created_at', { ascending: false });
            
            if (error) throw error;
            return res.json({ success: true, data });
        }

        // OPERATION (deposit/withdraw)
        if (action === 'operation' && req.method === 'POST') {
            let body = req.body;
            if (typeof body === 'string') body = JSON.parse(body);
            
            // Get current balance
            const { data: summary } = await supabase
                .from('cash_operations')
                .select('balance')
                .order('created_at', { ascending: false })
                .limit(1)
                .single();
            
            const currentBalance = parseFloat(summary?.balance || 0);
            const amount = parseFloat(body.amount);
            const newBalance = body.type === 'deposit' 
                ? currentBalance + amount 
                : currentBalance - amount;
            
            const { data, error } = await supabase
                .from('cash_operations')
                .insert({
                    type: body.type,
                    amount: body.type === 'withdraw' ? -amount : amount,
                    description: body.description,
                    balance: newBalance,
                    user_id: body.user_id,
                    user_name: body.user_name
                })
                .select()
                .single();
            
            if (error) throw error;
            return res.json({ success: true, data });
        }

        return res.status(400).json({ success: false, error: 'Invalid action' });

    } catch (error) {
        console.error('Cash Error:', error);
        return res.status(500).json({ success: false, error: error.message });
    }
}
