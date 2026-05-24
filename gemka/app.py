import os
import sqlite3
from flask import Flask, render_template, request, redirect, url_for, session, jsonify
from werkzeug.security import generate_password_hash, check_password_hash

app = Flask(__name__)
app.secret_key = os.urandom(24) # Безопасный случайный ключ для сессий

DATABASE = 'messenger.db'

def get_db():
    conn = sqlite3.connect(DATABASE)
    conn.row_factory = sqlite3.Row
    return conn

# Инициализация БД
def init_db():
    with get_db() as conn:
        # Таблица пользователей
        conn.execute('''CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            nickname TEXT NOT NULL,
            password TEXT NOT NULL,
            theme TEXT DEFAULT 'light',
            privacy_search INTEGER DEFAULT 1
        )''')
        # Таблица чатов (группы, каналы, ЛС)
        conn.execute('''CREATE TABLE IF NOT EXISTS chats (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            type TEXT NOT NULL, -- 'public_group', 'private_group', 'public_channel', 'private_channel'
            owner_id INTEGER,
            FOREIGN KEY(owner_id) REFERENCES users(id)
        )''')
        # Сообщения
        conn.execute('''CREATE TABLE IF NOT EXISTS messages (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            chat_id INTEGER,
            sender_id INTEGER,
            text TEXT NOT NULL,
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(chat_id) REFERENCES chats(id),
            FOREIGN KEY(sender_id) REFERENCES users(id)
        )''')
        conn.commit()

@app.route('/')
def index():
    if 'user_id' not in session:
        return redirect(url_for('login'))
    
    with get_db() as conn:
        user = conn.execute('SELECT * FROM users WHERE id = ?', (session['user_id'],)).fetchone()
        # Доступные публичные чаты для поиска
        public_chats = conn.execute("SELECT * FROM chats WHERE type LIKE 'public_%'").fetchall()
    return render_template('index.html', user=user, public_chats=public_chats)

@app.route('/register', methods=['GET', 'POST'])
def register():
    if request.method == 'POST':
        username = request.form['username'].strip().lower()
        nickname = request.form['nickname'].strip()
        password = request.form['password']
        
        if not username or not nickname or not password:
            return "Заполните все поля", 400
            
        hashed_pw = generate_password_hash(password) # Безопасное хэширование
        
        try:
            with get_db() as conn:
                conn.execute('INSERT INTO users (username, nickname, password) VALUES (?, ?, ?)',
                             (username, nickname, hashed_pw))
                conn.commit()
            return redirect(url_for('login'))
        except sqlite3.IntegrityError:
            return "Такой юзернейм уже занят!", 400
            
    return render_template('register.html')

@app.route('/login', methods=['GET', 'POST'])
def login():
    if request.method == 'POST':
        username = request.form['username'].strip().lower()
        password = request.form['password']
        
        with get_db() as conn:
            user = conn.execute('SELECT * FROM users WHERE username = ?', (username,)).fetchone()
            
        if user and check_password_hash(user['password'], password):
            session['user_id'] = user['id']
            session['username'] = user['username']
            return redirect(url_for('index'))
        else:
            return "Неверное имя пользователя или пароль", 401
            
    return render_template('login.html')

@app.route('/logout')
def logout():
    session.clear()
    return redirect(url_for('login'))

# API: Поиск пользователей
@app.route('/api/search_users', methods=['GET'])
def search_users():
    query = request.args.get('q', '').strip().lower()
    if 'user_id' not in session or not query:
        return jsonify([])
    
    with get_db() as conn:
        # Ищем только тех, у кого конфиденциальность позволяет поиск (privacy_search = 1)
        users = conn.execute("SELECT username, nickname FROM users WHERE privacy_search = 1 AND (username LIKE ? OR nickname LIKE ?)", 
                             (f"%{query}%", f"%{query}%")).fetchall()
    return jsonify([dict(u) for u in users])

# API: Создание чата/канала
@app.route('/api/create_chat', methods=['POST'])
def create_chat():
    if 'user_id' not in session: return "Unauthorized", 401
    data = request.json
    name = data.get('name')
    chat_type = data.get('type') # public_group, private_group, etc.
    
    with get_db() as conn:
        cursor = conn.execute('INSERT INTO chats (name, type, owner_id) VALUES (?, ?, ?)', 
                             (name, chat_type, session['user_id']))
        conn.commit()
    return jsonify({"success": True, "chat_id": cursor.lastrowid})

# API: Обновление профиля и настроек
@app.route('/api/update_profile', methods=['POST'])
def update_profile():
    if 'user_id' not in session: return "Unauthorized", 401
    data = request.json
    nickname = data.get('nickname')
    theme = data.get('theme')
    privacy = data.get('privacy_search')
    
    with get_db() as conn:
        conn.execute('UPDATE users SET nickname = ?, theme = ?, privacy_search = ? WHERE id = ?',
                     (nickname, theme, privacy, session['user_id']))
        conn.commit()
    return jsonify({"success": True})

if __name__ == '__main__':
    init_db()
    app.run(debug=True, port=5000)
