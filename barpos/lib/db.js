const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

// Helper functions
async function query(table) {
    return supabase.from(table);
}

async function fetchOne(table, conditions = {}) {
    let q = supabase.from(table).select('*');
    for (const [key, value] of Object.entries(conditions)) {
        q = q.eq(key, value);
    }
    const { data, error } = await q.single();
    if (error && error.code !== 'PGRST116') throw error;
    return data;
}

async function fetchAll(table, conditions = {}, orderBy = null) {
    let q = supabase.from(table).select('*');
    for (const [key, value] of Object.entries(conditions)) {
        q = q.eq(key, value);
    }
    if (orderBy) {
        q = q.order(orderBy.column, { ascending: orderBy.asc ?? true });
    }
    const { data, error } = await q;
    if (error) throw error;
    return data || [];
}

async function insert(table, data) {
    const { data: result, error } = await supabase.from(table).insert(data).select();
    if (error) throw error;
    return result?.[0];
}

async function update(table, conditions, data) {
    let q = supabase.from(table).update(data);
    for (const [key, value] of Object.entries(conditions)) {
        q = q.eq(key, value);
    }
    const { data: result, error } = await q.select();
    if (error) throw error;
    return result?.[0];
}

async function remove(table, conditions) {
    let q = supabase.from(table).delete();
    for (const [key, value] of Object.entries(conditions)) {
        q = q.eq(key, value);
    }
    const { error } = await q;
    if (error) throw error;
    return true;
}

async function rawQuery(sql) {
    const { data, error } = await supabase.rpc('raw_sql', { query: sql });
    if (error) throw error;
    return data;
}

// Response helpers
function jsonResponse(data, status = 200) {
    return new Response(JSON.stringify(data), {
        status,
        headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization'
        }
    });
}

function success(data = {}, message = 'Success') {
    return jsonResponse({ success: true, message, data });
}

function error(message, status = 400) {
    return jsonResponse({ success: false, error: message }, status);
}

// Auth helpers
async function verifyToken(request) {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader) return null;

    const token = authHeader.replace('Bearer ', '');
    
    const { data: session, error: err } = await supabase
        .from('sessions')
        .select('*, users(*)')
        .eq('token', token)
        .gt('expires_at', new Date().toISOString())
        .single();

    if (err || !session) return null;
    if (!session.users?.active) return null;

    return {
        user_id: session.users.id,
        name: session.users.name,
        role: session.users.role
    };
}

async function requireAuth(request) {
    const user = await verifyToken(request);
    if (!user) {
        throw { status: 401, message: 'Unauthorized' };
    }
    return user;
}

function generateToken() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let token = '';
    for (let i = 0; i < 64; i++) {
        token += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return token;
}

function today() {
    return new Date().toISOString().split('T')[0];
}

module.exports = {
    supabase,
    query,
    fetchOne,
    fetchAll,
    insert,
    update,
    remove,
    jsonResponse,
    success,
    error,
    verifyToken,
    requireAuth,
    generateToken,
    today
};
