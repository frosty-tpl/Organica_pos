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
        const userId = req.query.id;

        // GET - List all users or single user
        if (req.method === 'GET') {
            const users = await kv.get('pos_users') || [
                { id: 1, name: 'admin', password: 'admin123', role: 'admin', active: true },
                { id: 2, name: 'operator', password: 'op123', role: 'operator', active: true }
            ];
            
            if (userId) {
                const user = users.find(u => u.id === parseInt(userId));
                return res.json({ success: true, data: user });
            }
            
            // Return all users WITH passwords visible for admin
            return res.json({ success: true, data: users });
        }

        // POST - Create, Update, Delete
        if (req.method === 'POST') {
            const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
            let users = await kv.get('pos_users') || [
                { id: 1, name: 'admin', password: 'admin123', role: 'admin', active: true },
                { id: 2, name: 'operator', password: 'op123', role: 'operator', active: true }
            ];

            if (action === 'create') {
                const newUser = {
                    id: Date.now(),
                    name: body.name,
                    password: body.password,
                    role: body.role || 'operator',
                    active: true
                };
                users.push(newUser);
                await kv.set('pos_users', users);
                return res.json({ success: true, data: newUser });
            }

            if (action === 'update') {
                const index = users.findIndex(u => u.id === parseInt(body.id));
                if (index === -1) {
                    return res.status(404).json({ success: false, error: 'User not found' });
                }
                users[index] = {
                    ...users[index],
                    name: body.name || users[index].name,
                    password: body.password || users[index].password,
                    role: body.role || users[index].role,
                    active: body.active !== undefined ? body.active : users[index].active
                };
                await kv.set('pos_users', users);
                return res.json({ success: true, data: users[index] });
            }

            if (action === 'delete') {
                users = users.filter(u => u.id !== parseInt(body.id));
                await kv.set('pos_users', users);
                return res.json({ success: true });
            }
        }

        return res.status(400).json({ success: false, error: 'Invalid action' });

    } catch (error) {
        console.error('Users API Error:', error);
        return res.status(500).json({ success: false, error: error.message });
    }
}
