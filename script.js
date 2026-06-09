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
        console.log('🚀 Запуск мессенджера...');
        
        try {
            const { data: { session }, error } = await supabase.auth.getSession();
            console.log('📡 Сессия:', session);
            
            if (error) {
                console.error('Ошибка получения сессии:', error);
            }
            
            if (session) {
                this.currentUser = session.user;
                console.log('👤 Пользователь авторизован:', session.user.email);
                await this.loadProfile();
                this.showChatScreen();
            } else {
                console.log('🔒 Пользователь не авторизован');
                this.showAuthScreen();
            }
        } catch (error) {
            console.error('Критическая ошибка:', error);
            this.showAuthScreen();
        }

        this.setupEventListeners();
        this.setupAuthListener();
    }

    setupEventListeners() {
        console.log('🎯 Настройка обработчиков событий');
        
        // Переключение между авторизацией и регистрацией
        const showRegister = document.getElementById('show-register');
        const showAuth = document.getElementById('show-auth');
        
        if (showRegister) {
            showRegister.addEventListener('click', (e) => {
                e.preventDefault();
                console.log('📝 Переход на регистрацию');
                this.showRegisterScreen();
            });
        }
        
        if (showAuth) {
            showAuth.addEventListener('click', (e) => {
                e.preventDefault();
                console.log('🔑 Переход на авторизацию');
                this.showAuthScreen();
            });
        }

        // Форма авторизации
        const authForm = document.getElementById('auth-form');
        if (authForm) {
            authForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                console.log('🔐 Попытка входа...');
                await this.login();
            });
        } else {
            console.error('❌ Форма auth-form не найдена!');
        }

        // Форма регистрации
        const registerForm = document.getElementById('register-form');
        if (registerForm) {
            registerForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                console.log('📋 Попытка регистрации...');
                await this.register();
            });
        } else {
            console.error('❌ Форма register-form не найдена!');
        }

        // Выход
        const logoutBtn = document.getElementById('logout-btn');
        if (logoutBtn) {
            logoutBtn.addEventListener('click', async () => {
                console.log('👋 Выход из системы');
                await this.logout();
            });
        }

        // Отправка сообщения
        const sendMessage = document.getElementById('send-message');
        if (sendMessage) {
            sendMessage.addEventListener('click', () => {
                this.sendMessage();
            });
        }

        const messageInput = document.getElementById('message-input');
        if (messageInput) {
            messageInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    this.sendMessage();
                }
            });
        }

        // Поиск пользователей
        const userSearch = document.getElementById('user-search');
        if (userSearch) {
            userSearch.addEventListener('input', (e) => {
                this.searchUsers(e.target.value);
            });
        }
    }

    setupAuthListener() {
        supabase.auth.onAuthStateChange(async (event, session) => {
            console.log('🔄 Изменение состояния аутентификации:', event);
            
            if (event === 'SIGNED_IN') {
                this.currentUser = session.user;
                console.log('✅ Успешный вход:', session.user.email);
                await this.loadProfile();
                this.showChatScreen();
            } else if (event === 'SIGNED_OUT') {
                console.log('🚪 Пользователь вышел');
                this.currentUser = null;
                this.selectedContact = null;
                if (this.subscription) {
                    supabase.removeChannel(this.subscription);
                    this.subscription = null;
                }
                this.showAuthScreen();
            }
        });
    }

    async login() {
        const email = document.getElementById('email').value.trim();
        const password = document.getElementById('password').value;

        console.log('🔑 Пытаемся войти:', email);

        if (!email || !password) {
            alert('Заполните все поля!');
            return;
        }

        try {
            const { data, error } = await supabase.auth.signInWithPassword({
                email,
                password
            });

            if (error) {
                console.error('❌ Ошибка входа:', error);
                alert('Ошибка входа: ' + error.message);
            } else {
                console.log('✅ Вход выполнен успешно');
            }
        } catch (error) {
            console.error('❌ Критическая ошибка входа:', error);
            alert('Произошла ошибка при входе');
        }
    }

    async register() {
        const username = document.getElementById('reg-username').value.trim();
        const email = document.getElementById('reg-email').value.trim();
        const password = document.getElementById('reg-password').value;

        console.log('📝 Регистрация пользователя:', { username, email });

        // Валидация
        if (!username || !email || !password) {
            alert('Заполните все поля!');
            return;
        }

        if (password.length < 6) {
            alert('Пароль должен быть не менее 6 символов!');
            return;
        }

        if (!email.includes('@')) {
            alert('Введите корректный email!');
            return;
        }

        // Блокируем кнопку
        const registerBtn = document.querySelector('#register-form button');
        const originalText = registerBtn.textContent;
        registerBtn.disabled = true;
        registerBtn.textContent = 'Регистрация...';

        try {
            // Регистрируем пользователя
            const { data, error } = await supabase.auth.signUp({
                email: email,
                password: password,
                options: {
                    data: {
                        username: username
                    }
                }
            });

            if (error) {
                console.error('❌ Ошибка регистрации:', error);
                alert('Ошибка регистрации: ' + error.message);
                return;
            }

            console.log('✅ Пользователь создан:', data);

            if (data.user) {
                // Пытаемся создать профиль несколько раз
                let profileCreated = false;
                for (let i = 0; i < 3; i++) {
                    console.log(`🔄 Попытка создания профиля #${i + 1}`);
                    
                    const { error: profileError } = await supabase
                        .from('profiles')
                        .upsert({
                            id: data.user.id,
                            username: username,
                            email: email
                        }, {
                            onConflict: 'id'
                        });

                    if (!profileError) {
                        profileCreated = true;
                        console.log('✅ Профиль создан успешно');
                        break;
                    }
                    
                    console.log(`⏳ Ожидание перед повторной попыткой...`);
                    await new Promise(resolve => setTimeout(resolve, 1000));
                }

                if (profileCreated) {
                    alert('Регистрация успешна! Теперь вы можете войти.');
                    this.showAuthScreen();
                    
                    // Очищаем поля
                    document.getElementById('reg-username').value = '';
                    document.getElementById('reg-email').value = '';
                    document.getElementById('reg-password').value = '';
                } else {
                    alert('Регистрация прошла успешно, но возникла проблема с профилем. Попробуйте войти.');
                    this.showAuthScreen();
                }
            }
        } catch (error) {
            console.error('❌ Критическая ошибка регистрации:', error);
            alert('Произошла ошибка при регистрации: ' + error.message);
        } finally {
            registerBtn.disabled = false;
            registerBtn.textContent = originalText;
        }
    }

    async loadProfile() {
        if (!this.currentUser) return;

        console.log('👤 Загрузка профиля...');

        try {
            const { data: profile, error } = await supabase
                .from('profiles')
                .select('*')
                .eq('id', this.currentUser.id)
                .single();

            if (error) {
                console.error('❌ Ошибка загрузки профиля:', error);
                
                // Если профиль не найден, создаем его
                if (error.code === 'PGRST116') {
                    console.log('🔄 Профиль не найден, создаем новый...');
                    const { error: insertError } = await supabase
                        .from('profiles')
                        .insert({
                            id: this.currentUser.id,
                            username: this.currentUser.email.split('@')[0],
                            email: this.currentUser.email
                        });

                    if (!insertError) {
                        console.log('✅ Профиль создан');
                        await this.loadProfile();
                    }
                }
                return;
            }

            if (profile) {
                console.log('✅ Профиль загружен:', profile);
                const currentUserElement = document.getElementById('current-user');
                if (currentUserElement) {
                    currentUserElement.textContent = profile.username || 'Пользователь';
                }
                this.currentUserProfile = profile;
                await this.loadContacts();
            }
        } catch (error) {
            console.error('❌ Критическая ошибка загрузки профиля:', error);
        }
    }

    async loadContacts() {
        if (!this.currentUser) return;

        console.log('📇 Загрузка контактов...');

        try {
            const { data: profiles, error } = await supabase
                .from('profiles')
                .select('*')
                .neq('id', this.currentUser.id);

            if (error) {
                console.error('❌ Ошибка загрузки контактов:', error);
                return;
            }

            this.contacts = profiles || [];
            console.log(`✅ Загружено контактов: ${this.contacts.length}`);
            this.renderContacts();
        } catch (error) {
            console.error('❌ Критическая ошибка загрузки контактов:', error);
        }
    }

    async searchUsers(query) {
        console.log('🔍 Поиск пользователей:', query);
        
        if (!query.trim()) {
            await this.loadContacts();
            return;
        }

        try {
            const { data: profiles, error } = await supabase
                .from('profiles')
                .select('*')
                .neq('id', this.currentUser.id)
                .ilike('username', `%${query}%`);

            if (error) {
                console.error('❌ Ошибка поиска:', error);
                return;
            }

            this.contacts = profiles || [];
            this.renderContacts();
        } catch (error) {
            console.error('❌ Критическая ошибка поиска:', error);
        }
    }

    renderContacts() {
        const contactsList = document.getElementById('contacts-list');
        if (!contactsList) {
            console.error('❌ Элемент contacts-list не найден!');
            return;
        }

        contactsList.innerHTML = '';

        if (this.contacts.length === 0) {
            contactsList.innerHTML = '<div class="no-chat-selected">Пользователи не найдены</div>';
            return;
        }

        this.contacts.forEach(contact => {
            const contactElement = document.createElement('div');
            contactElement.className = 'contact-item';
            if (this.selectedContact && this.selectedContact.id === contact.id) {
                contactElement.classList.add('active');
            }

            const firstLetter = (contact.username || 'П')[0].toUpperCase();

            contactElement.innerHTML = `
                <div class="contact-avatar">
                    ${firstLetter}
                </div>
                <div class="contact-info">
                    <div class="contact-name">${contact.username || 'Без имени'}</div>
                    <div class="contact-last-message">Нажмите для начала чата</div>
                </div>
            `;

            contactElement.addEventListener('click', () => {
                console.log('💬 Выбран контакт:', contact.username);
                this.selectContact(contact);
            });

            contactsList.appendChild(contactElement);
        });
    }

    async selectContact(contact) {
        this.selectedContact = contact;
        
        // Обновляем заголовок чата
        const chatHeader = document.getElementById('chat-header');
        if (chatHeader) {
            chatHeader.innerHTML = `<p>${contact.username || 'Без имени'}</p>`;
        }
        
        // Активируем поле ввода
        const messageInput = document.getElementById('message-input');
        const sendMessage = document.getElementById('send-message');
        
        if (messageInput) messageInput.disabled = false;
        if (sendMessage) sendMessage.disabled = false;
        
        // Обновляем активный контакт в списке
        this.renderContacts();
        
        // Загружаем сообщения
        await this.loadMessages();
        
        // Подписываемся на новые сообщения
        this.subscribeToMessages();
    }

    async loadMessages() {
        if (!this.currentUser || !this.selectedContact) return;

        console.log('💬 Загрузка сообщений...');

        try {
            const { data: messages, error } = await supabase
                .from('messages')
                .select('*')
                .or(`and(sender_id.eq.${this.currentUser.id},receiver_id.eq.${this.selectedContact.id}),and(sender_id.eq.${this.selectedContact.id},receiver_id.eq.${this.currentUser.id})`)
                .order('created_at', { ascending: true });

            if (error) {
                console.error('❌ Ошибка загрузки сообщений:', error);
                return;
            }

            this.messages = messages || [];
            console.log(`✅ Загружено сообщений: ${this.messages.length}`);
            this.renderMessages();
        } catch (error) {
            console.error('❌ Критическая ошибка загрузки сообщений:', error);
        }
    }

    renderMessages() {
        const messagesContainer = document.getElementById('messages-container');
        if (!messagesContainer) {
            console.error('❌ Элемент messages-container не найден!');
            return;
        }

        messagesContainer.innerHTML = '';

        if (!this.selectedContact) {
            messagesContainer.innerHTML = '<div class="no-chat-selected">Выберите контакт для начала общения</div>';
            return;
        }

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
                ${this.escapeHtml(message.content)}
                <div class="message-time">${time}</div>
            `;

            messagesContainer.appendChild(messageElement);
        });

        // Прокручиваем вниз
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    async sendMessage() {
        const messageInput = document.getElementById('message-input');
        if (!messageInput) return;

        const content = messageInput.value.trim();

        if (!content || !this.selectedContact) {
            console.log('⚠️ Нет текста или не выбран контакт');
            return;
        }

        console.log('📤 Отправка сообщения:', content);

        try {
            const { data, error } = await supabase
                .from('messages')
                .insert([
                    {
                        sender_id: this.currentUser.id,
                        receiver_id: this.selectedContact.id,
                        content: content
                    }
                ]);

            if (error) {
                console.error('❌ Ошибка отправки:', error);
                alert('Ошибка отправки сообщения: ' + error.message);
                return;
            }

            console.log('✅ Сообщение отправлено');
            messageInput.value = '';
            await this.loadMessages();
        } catch (error) {
            console.error('❌ Критическая ошибка отправки:', error);
            alert('Произошла ошибка при отправке сообщения');
        }
    }

    subscribeToMessages() {
        // Отписываемся от предыдущей подписки
        if (this.subscription) {
            console.log('🔌 Отключение от предыдущего канала');
            supabase.removeChannel(this.subscription);
        }

        if (!this.selectedContact) return;

        console.log('📡 Подписка на real-time сообщения');

        // Подписываемся на новые сообщения в реальном времени
        this.subscription = supabase
            .channel('messages-channel')
            .on(
                'postgres_changes',
                {
                    event: 'INSERT',
                    schema: 'public',
                    table: 'messages',
                    filter: `receiver_id=eq.${this.currentUser.id}`
                },
                (payload) => {
                    console.log('📨 Новое сообщение:', payload);
                    this.loadMessages();
                }
            )
            .subscribe((status) => {
                console.log('📡 Статус подписки:', status);
            });
    }

    async logout() {
        console.log('👋 Выход из системы...');
        
        try {
            const { error } = await supabase.auth.signOut();
            
            if (error) {
                console.error('❌ Ошибка выхода:', error);
                alert('Ошибка при выходе: ' + error.message);
            } else {
                console.log('✅ Выход выполнен успешно');
            }
        } catch (error) {
            console.error('❌ Критическая ошибка выхода:', error);
        }
    }

    showAuthScreen() {
        console.log('📱 Показываем экран авторизации');
        
        const authScreen = document.getElementById('auth-screen');
        const registerScreen = document.getElementById('register-screen');
        const chatScreen = document.getElementById('chat-screen');
        
        if (authScreen) authScreen.style.display = 'flex';
        if (registerScreen) registerScreen.style.display = 'none';
        if (chatScreen) chatScreen.style.display = 'none';
    }

    showRegisterScreen() {
        console.log('📱 Показываем экран регистрации');
        
        const authScreen = document.getElementById('auth-screen');
        const registerScreen = document.getElementById('register-screen');
        const chatScreen = document.getElementById('chat-screen');
        
        if (authScreen) authScreen.style.display = 'none';
        if (registerScreen) registerScreen.style.display = 'flex';
        if (chatScreen) chatScreen.style.display = 'none';
    }

    showChatScreen() {
        console.log('📱 Показываем экран чата');
        
        const authScreen = document.getElementById('auth-screen');
        const registerScreen = document.getElementById('register-screen');
        const chatScreen = document.getElementById('chat-screen');
        
        if (authScreen) authScreen.style.display = 'none';
        if (registerScreen) registerScreen.style.display = 'none';
        if (chatScreen) chatScreen.style.display = 'block';
    }
}

// Ждем загрузки DOM и инициализируем приложение
document.addEventListener('DOMContentLoaded', () => {
    console.log('🌟 DOM загружен, запускаем мессенджер');
    window.messenger = new Messenger();
});

// Для отладки - глобальный доступ к экземпляру
console.log('🔧 Для отладки используй window.messenger');
