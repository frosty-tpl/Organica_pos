// Simple in-memory storage with file fallback
// For production, connect to a real database

const DEFAULT_USERS = [
    { id: 1, name: 'admin', password: 'admin123', role: 'admin', active: true },
    { id: 2, name: 'operator', password: 'op123', role: 'operator', active: true }
];

// In serverless, we use a simple approach
// Users will reset on cold start - for permanent storage, use a database
let usersCache = null;

export default async function handler(req, res) {
    // CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    // Initialize cache
    if (!usersCache) {
        usersCache = [...DEFAULT_USERS];
    }

    const action = req.query.action;
    const userId = req.query.id;

    // GET - List all users or single user
    if (req.method === 'GET') {
        if (userId) {
            const user = usersCache.find(u => u.id === parseInt(userId));
            if (!user) {
                return res.status(404).json({ success: false, error: 'User not found' });
            }
            return res.json({ success: true, data: user });
        }
        
        // Return all users WITH passwords (for admin view)
        return res.json({ success: true, data: usersCache });
    }

    // POST - Create, Update, Delete
    if (req.method === 'POST') {
        let body = req.body;
        if (typeof body === 'string') {
            try {
                body = JSON.parse(body);
            } catch (e) {
                return res.status(400).json({ success: false, error: 'Invalid JSON' });
            }
        }

        // CREATE
        if (action === 'create') {
            if (!body.name || !body.password) {
                return res.status(400).json({ success: false, error: 'Name and password required' });
            }
            
            // Check if username already exists
            if (usersCache.find(u => u.name.toLowerCase() === body.name.toLowerCase())) {
                return res.status(400).json({ success: false, error: 'Utilizatorul există deja' });
            }
            
            const newUser = {
                id: Date.now(),
                name: body.name,
                password: body.password,
                role: body.role || 'operator',
                active: true
            };
            usersCache.push(newUser);
            return res.json({ success: true, data: newUser });
        }

        // UPDATE
        if (action === 'update') {
            const index = usersCache.findIndex(u => u.id === parseInt(body.id));
            if (index === -1) {
                return res.status(404).json({ success: false, error: 'User not found' });
            }
            
            usersCache[index] = {
                ...usersCache[index],
                name: body.name !== undefined ? body.name : usersCache[index].name,
                password: body.password !== undefined ? body.password : usersCache[index].password,
                role: body.role !== undefined ? body.role : usersCache[index].role,
                active: body.active !== undefined ? body.active : usersCache[index].active
            };
            
            return res.json({ success: true, data: usersCache[index] });
        }

        // DELETE
        if (action === 'delete') {
            const userToDelete = usersCache.find(u => u.id === parseInt(body.id));
            if (!userToDelete) {
                return res.status(404).json({ success: false, error: 'User not found' });
            }
            
            // Prevent deleting the last admin
            const admins = usersCache.filter(u => u.role === 'admin');
            if (userToDelete.role === 'admin' && admins.length <= 1) {
                return res.status(400).json({ success: false, error: 'Nu poți șterge ultimul admin' });
            }
            
            usersCache = usersCache.filter(u => u.id !== parseInt(body.id));
            return res.json({ success: true });
        }

        return res.status(400).json({ success: false, error: 'Invalid action' });
    }

    return res.status(405).json({ success: false, error: 'Method not allowed' });
}
