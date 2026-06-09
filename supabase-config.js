// Конфигурация Supabase - замени на свои данные!
const SUPABASE_URL = 'https://sqzmtrweyzbtbuezanbd.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNxem10cndleXpidGJ1ZXphbmJkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODEwMTU3MzUsImV4cCI6MjA5NjU5MTczNX0.4Ucz1geyk1TyphfMzrmhkMwnDVIL7vODyPO8fayP-ZU';

// Создаем клиент без объявления переменной supabase
window.supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
