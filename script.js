class Messenger {
    constructor() {
        this.currentUser = null;
        this.selectedContact = null;
        this.contacts = [];
        this.messages = [];
        this.subscription = null;
        
        this.init();
    }

    async init() {
        // Проверяем текущую сессию
        const { data: { session } } = await supabase.auth.getSession();
        
        if (session) {
            this.currentUser = session.user;
            await this.loadProfile();
            this.showChatScreen();
        } else {
            this.showAuthScreen();
        }

        this.setupEventListeners();
        this.setupAuthListener();
    }

    setupEventListeners() {
        // Переключение между авторизацией и регистрацией
        document.getElementById('show-register').addEventListener('click', (e) => {
            e.preventDefault();
            this.showRegisterScreen();
        });

        document.getElementById('show-auth').addEventListener('click', (e) => {
            e.preventDefault();
            this.showAuthScreen();
        });

        // Форма авторизации
        document.getElementById('auth-form').addEventListener('submit', async (e) => {
            e.preventDefault();
            await this.login();
        });

        // Форма регистрации
        document.getElementById('register-form').addEventListener('submit', async (e) => {
            e.preventDefault();
            await this.register();
        });

        // Выход
        document.getElementById('logout-btn').addEventListener('click', async () => {
            await this.logout();
        });

        // Отправка сообщения
        document.getElementById('send-message').addEventListener('click', () => {
            this.sendMessage();
        });

        document.getElementById('message-input').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.sendMessage();
            }
        });

        // Поиск пользователей
        document.getElementById('user-search').addEventListener('input', (e) => {
            this.searchUsers(e.target.value);
        });
    }

    setupAuthListener() {
        supabase.auth.onAuthStateChange(async (event, session) => {
            if (event === 'SIGNED_IN') {
                this.currentUser = session.user;
                await this.loadProfile();
                this.showChatScreen();
            } else if (event === 'SIGNED_OUT') {
                this.currentUser = null;
                this.selectedContact = null;
                this.showAuthScreen();
            }
        });
    }

    async login() {
        const email = document.getElementById('email').value;
        const password = document.getElementById('password').value;

        const { data, error } = await supabase.auth.signInWithPassword({
            email,
            password
        });

        if (error) {
            alert('Ошибка входа: ' + error.message);
        }
    }

    async register() {
        const username = document.getElementById('reg-username').value;
        const email = document.getElementById('reg-email').value;
        const password = document.getElementById('reg-password').value;

        const { data: { user }, error } = await supabase.auth.signUp({
            email,
            password
        });

        if (error) {
            alert('Ошибка регистрации: ' + error.message);
            return;
        }

        if (user) {
            // Создаем профиль пользователя
            const { error: profileError } = await supabase
                .from('profiles')
                .insert([
                    {
                        id: user.id,
                        username: username,
                        email: email
                    }
                ]);

            if (profileError) {
                alert('Ошибка создания профиля: ' + profileError.message);
            } else {
                alert('Регистрация успешна! Проверьте email для подтверждения.');
            }
        }
    }

    async loadProfile() {
        if (!this.currentUser) return;

        const { data: profile, error } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', this.currentUser.id)
            .single();

        if (!error && profile) {
            document.getElementById('current-user').textContent = profile.username;
            this.currentUserProfile = profile;
        }

        await this.loadContacts();
    }

    async loadContacts() {
        if (!this.currentUser) return;

        const { data: profiles, error } = await supabase
            .from('profiles')
            .select('*')
            .neq('id', this.currentUser.id);

        if (!error) {
            this.contacts = profiles;
            this.renderContacts();
        }
    }

    async searchUsers(query) {
        if (!query.trim()) {
            await this.loadContacts();
            return;
        }

        const { data: profiles, error } = await supabase
            .from('profiles')
            .select('*')
            .neq('id', this.currentUser.id)
            .ilike('username', `%${query}%`);

        if (!error) {
            this.contacts = profiles;
            this.renderContacts();
        }
    }

    renderContacts() {
        const contactsList = document.getElementById('contacts-list');
        contactsList.innerHTML = '';

        this.contacts.forEach(contact => {
            const contactElement = document.createElement('div');
            contactElement.className = 'contact-item';
            if (this.selectedContact && this.selectedContact.id === contact.id) {
                contactElement.classList.add('active');
            }

            contactElement.innerHTML = `
                <div class="contact-avatar">
                    ${contact.username.charAt(0).toUpperCase()}
                </div>
                <div class="contact-info">
                    <div class="contact-name">${contact.username}</div>
                    <div class="contact-last-message">Нажмите для начала чата</div>
                </div>
            `;

            contactElement.addEventListener('click', () => {
                this.selectContact(contact);
            });

            contactsList.appendChild(contactElement);
        });
    }

    async selectContact(contact) {
        this.selectedContact = contact;
        
        // Обновляем заголовок чата
        document.getElementById('chat-header').innerHTML = `<p>${contact.username}</p>`;
        
        // Активируем поле ввода
        document.getElementById('message-input').disabled = false;
        document.getElementById('send-message').disabled = false;
        
        // Обновляем активный контакт в списке
        this.renderContacts();
        
        // Загружаем сообщения
        await this.loadMessages();
        
        // Подписываемся на новые сообщения
        this.subscribeToMessages();
    }

    async loadMessages() {
        if (!this.currentUser || !this.selectedContact) return;

        const { data: messages, error } = await supabase
            .from('messages')
            .select('*')
            .or(`and(sender_id.eq.${this.currentUser.id},receiver_id.eq.${this.selectedContact.id}),and(sender_id.eq.${this.selectedContact.id},receiver_id.eq.${this.currentUser.id})`)
            .order('created_at', { ascending: true });

        if (!error) {
            this.messages = messages;
            this.renderMessages();
        }
    }

    renderMessages() {
        const messagesContainer = document.getElementById('messages-container');
        messagesContainer.innerHTML = '';

        if (this.messages.length === 0) {
            messagesContainer.innerHTML = '<div class="no-chat-selected">Нет сообщений. Начните общение!</div>';
            return;
        }

        this.messages.forEach(message => {
            const messageElement = document.createElement('div');
            const isSent = message.sender_id === this.currentUser.id;
            messageElement.className = `message ${isSent ? 'sent' : 'received'}`;
            
            const time = new Date(message.created_at).toLocaleTimeString('ru-RU', {
                hour: '2-digit',
                minute: '2-digit'
            });

            messageElement.innerHTML = `
                ${message.content}
                <div class="message-time">${time}</div>
            `;

            messagesContainer.appendChild(messageElement);
        });

        // Прокручиваем вниз
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }

    async sendMessage() {
        const messageInput = document.getElementById('message-input');
        const content = messageInput.value.trim();

        if (!content || !this.selectedContact) return;

        const { data, error } = await supabase
            .from('messages')
            .insert([
                {
                    sender_id: this.currentUser.id,
                    receiver_id: this.selectedContact.id,
                    content: content
                }
            ]);

        if (!error) {
            messageInput.value = '';
            await this.loadMessages();
        } else {
            alert('Ошибка отправки сообщения: ' + error.message);
        }
    }

    subscribeToMessages() {
        // Отписываемся от предыдущей подписки
        if (this.subscription) {
            supabase.removeChannel(this.subscription);
        }

        // Подписываемся на новые сообщения в реальном времени
        this.subscription = supabase
            .channel('messages-channel')
            .on(
                'postgres_changes',
                {
                    event: 'INSERT',
                    schema: 'public',
                    table: 'messages',
                    filter: `sender_id=eq.${this.currentUser.id},receiver_id=eq.${this.selectedContact.id}`
                },
                (payload) => {
                    this.loadMessages();
                }
            )
            .subscribe();
    }

    async logout() {
        const { error } = await supabase.auth.signOut();
        if (!error) {
            this.currentUser = null;
            this.selectedContact = null;
            this.showAuthScreen();
        }
    }

    showAuthScreen() {
        document.getElementById('auth-screen').style.display = 'flex';
        document.getElementById('register-screen').style.display = 'none';
        document.getElementById('chat-screen').style.display = 'none';
    }

    showRegisterScreen() {
        document.getElementById('auth-screen').style.display = 'none';
        document.getElementById('register-screen').style.display = 'flex';
        document.getElementById('chat-screen').style.display = 'none';
    }

    showChatScreen() {
        document.getElementById('auth-screen').style.display = 'none';
        document.getElementById('register-screen').style.display = 'none';
        document.getElementById('chat-screen').style.display = 'block';
    }
}

// Инициализация приложения
const messenger = new Messenger();
