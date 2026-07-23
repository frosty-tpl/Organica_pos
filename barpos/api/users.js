import { kv } from '@vercel/kv';

// Default users
const DEFAULT_USERS = [
    { id: 1, name: 'admin', password: 'admin123', role: 'admin', active: true },
    { id: 2, name: 'operator', password: 'op123', role: 'operator', active: true }
];

async function getUsers() {
    try {
        const users = await kv.get('pos_users');
        return users || DEFAULT_USERS;
    } catch (e) {
        console.error('KV Error:', e);
        return DEFAULT_USERS;
    }
}

async function saveUsers(users) {
    try {
        await kv.set('pos_users', users);
    } catch (e) {
        console.error('KV Save Error:', e);
    }
}

export default async function handler(req, res) {
    // CORS
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
            const users = await getUsers();
            
            if (userId) {
                const user = users.find(u => u.id === parseInt(userId));
                if (!user) {
                    return res.status(404).json({ success: false, error: 'User not found' });
                }
                return res.json({ success: true, data: user });
            }
            
            // Return all users WITH passwords (for admin view)
            return res.json({ success: true, data: users });
        }

        // POST - Create, Update, Delete
        if (req.method === 'POST') {
            let body = req.body;
            if (typeof body === 'string') {
                body = JSON.parse(body);
            }
            
            let users = await getUsers();

            // CREATE
            if (action === 'create') {
                // Check if username already exists
                if (users.find(u => u.name.toLowerCase() === body.name.toLowerCase())) {
                    return res.status(400).json({ success: false, error: 'Utilizatorul există deja' });
                }
                
                const newUser = {
                    id: Date.now(),
                    name: body.name,
                    password: body.password,
                    role: body.role || 'operator',
                    active: true
                };
                users.push(newUser);
                await saveUsers(users);
                return res.json({ success: true, data: newUser });
            }

            // UPDATE
            if (action === 'update') {
                const index = users.findIndex(u => u.id === parseInt(body.id));
                if (index === -1) {
                    return res.status(404).json({ success: false, error: 'User not found' });
                }
                
                users[index] = {
                    ...users[index],
                    name: body.name !== undefined ? body.name : users[index].name,
                    password: body.password !== undefined ? body.password : users[index].password,
                    role: body.role !== undefined ? body.role : users[index].role,
                    active: body.active !== undefined ? body.active : users[index].active
                };
                
                await saveUsers(users);
                return res.json({ success: true, data: users[index] });
            }

            // DELETE
            if (action === 'delete') {
                const userToDelete = users.find(u => u.id === parseInt(body.id));
                if (!userToDelete) {
                    return res.status(404).json({ success: false, error: 'User not found' });
                }
                
                // Prevent deleting the last admin
                const admins = users.filter(u => u.role === 'admin');
                if (userToDelete.role === 'admin' && admins.length <= 1) {
                    return res.status(400).json({ success: false, error: 'Nu poți șterge ultimul admin' });
                }
                
                users = users.filter(u => u.id !== parseInt(body.id));
                await saveUsers(users);
                return res.json({ success: true });
            }

            return res.status(400).json({ success: false, error: 'Invalid action' });
        }

        return res.status(405).json({ success: false, error: 'Method not allowed' });

    } catch (error) {
        console.error('Users API Error:', error);
        return res.status(500).json({ success: false, error: error.message });
    }
}
