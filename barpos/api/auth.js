const { supabase, generateToken, verifyToken } = require('../lib/db.js');

module.exports = async function handler(req, res) {
    // CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    const action = req.query.action;

    try {
        switch (action) {
            case 'login':
                return await login(req, res);
            case 'logout':
                return await logout(req, res);
            case 'check':
                return await checkAuth(req, res);
            case 'users':
                return await getUsers(req, res);
            case 'user-create':
                return await createUser(req, res);
            case 'user-update':
                return await updateUser(req, res);
            case 'user-delete':
                return await deleteUser(req, res);
            default:
                return res.status(400).json({ success: false, error: 'Invalid action' });
        }
    } catch (err) {
        console.error('Auth error:', err);
        return res.status(err.status || 500).json({ success: false, error: err.message || 'Server error' });
    }
};

async function login(req, res) {
    const { username, password } = req.body;

    if (!username || !password) {
        return res.status(400).json({ success: false, error: 'Username and password required' });
    }

    const { data: user, error: err } = await supabase
        .from('users')
        .select('*')
        .eq('name', username)
        .eq('active', true)
        .single();

    if (err || !user) {
        return res.status(401).json({ success: false, error: 'Invalid credentials' });
    }

    if (password !== user.password) {
        return res.status(401).json({ success: false, error: 'Invalid credentials' });
    }

    // Șterge sesiunile vechi
    await supabase
        .from('sessions')
        .delete()
        .eq('user_id', user.id);

    const token = generateToken();
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

    await supabase.from('sessions').insert({
        user_id: user.id,
        token: token,
        expires_at: expiresAt
    });

    return res.status(200).json({
        success: true,
        message: 'Login successful',
        data: {
            token,
            user: {
                id: user.id,
                name: user.name,
                role: user.role
            },
            expires_at: expiresAt
        }
    });
}

async function logout(req, res) {
    const authHeader = req.headers.authorization;
    if (authHeader) {
        const token = authHeader.replace('Bearer ', '');
        await supabase.from('sessions').delete().eq('token', token);
    }
    return res.status(200).json({ success: true, message: 'Logged out' });
}

async function checkAuth(req, res) {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
        return res.status(401).json({ success: false, error: 'No token' });
    }

    const token = authHeader.replace('Bearer ', '');

    const { data: session, error: err } = await supabase
        .from('sessions')
        .select('*, users(*)')
        .eq('token', token)
        .gt('expires_at', new Date().toISOString())
        .single();

    if (err || !session || !session.users?.active) {
        return res.status(401).json({ success: false, error: 'Invalid token' });
    }

    return res.status(200).json({
        success: true,
        data: {
            user: {
                id: session.users.id,
                name: session.users.name,
                role: session.users.role
            }
        }
    });
}

async function getUsers(req, res) {
    const user = await verifyToken({ headers: { get: (h) => req.headers[h.toLowerCase()] } });
    if (!user || user.role !== 'admin') {
        return res.status(403).json({ success: false, error: 'Admin required' });
    }

    // Admin poate vedea parolele
    const { data, error: err } = await supabase
        .from('users')
        .select('id, name, password, role, active, created_at')
        .order('name');

    if (err) throw err;

    return res.status(200).json({ success: true, data });
}

async function createUser(req, res) {
    const user = await verifyToken({ headers: { get: (h) => req.headers[h.toLowerCase()] } });
    if (!user || user.role !== 'admin') {
        return res.status(403).json({ success: false, error: 'Admin required' });
    }

    const { name, password, role } = req.body;

    if (!name || !password) {
        return res.status(400).json({ success: false, error: 'Nume și parolă sunt obligatorii' });
    }

    // Verifică dacă există deja
    const { data: existing } = await supabase
        .from('users')
        .select('id')
        .eq('name', name)
        .single();

    if (existing) {
        return res.status(400).json({ success: false, error: 'Utilizatorul există deja' });
    }

    const { data, error: err } = await supabase
        .from('users')
        .insert({
            name,
            password,
            role: role || 'operator',
            active: true
        })
        .select()
        .single();

    if (err) throw err;

    return res.status(200).json({ success: true, data, message: 'Utilizator creat' });
}

async function updateUser(req, res) {
    const user = await verifyToken({ headers: { get: (h) => req.headers[h.toLowerCase()] } });
    if (!user || user.role !== 'admin') {
        return res.status(403).json({ success: false, error: 'Admin required' });
    }

    const { id, name, password, role, active } = req.body;

    if (!id) {
        return res.status(400).json({ success: false, error: 'ID utilizator lipsă' });
    }

    const updateData = {};
    if (name) updateData.name = name;
    if (password) updateData.password = password;
    if (role) updateData.role = role;
    if (active !== undefined) updateData.active = active;
    updateData.updated_at = new Date().toISOString();

    const { error: err } = await supabase
        .from('users')
        .update(updateData)
        .eq('id', id);

    if (err) throw err;

    // Dacă userul a fost dezactivat, șterge sesiunile
    if (active === false) {
        await supabase.from('sessions').delete().eq('user_id', id);
    }

    return res.status(200).json({ success: true, message: 'Utilizator actualizat' });
}

async function deleteUser(req, res) {
    const user = await verifyToken({ headers: { get: (h) => req.headers[h.toLowerCase()] } });
    if (!user || user.role !== 'admin') {
        return res.status(403).json({ success: false, error: 'Admin required' });
    }

    const id = req.query.id;

    if (!id) {
        return res.status(400).json({ success: false, error: 'ID utilizator lipsă' });
    }

    // Nu permite ștergerea propriului cont
    if (parseInt(id) === user.user_id) {
        return res.status(400).json({ success: false, error: 'Nu poți șterge propriul cont' });
    }

    // Șterge sesiunile
    await supabase.from('sessions').delete().eq('user_id', id);

    // Dezactivează utilizatorul (soft delete)
    const { error: err } = await supabase
        .from('users')
        .update({ active: false })
        .eq('id', id);

    if (err) throw err;

    return res.status(200).json({ success: true, message: 'Utilizator șters' });
}
